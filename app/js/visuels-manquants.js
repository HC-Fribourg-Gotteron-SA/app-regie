// Visuels manquants (26.10.2026, option B de Léa) : diffusions en cours qui n'ont jamais reçu de visuel (ex. importées
// d'Airtable sans fichier ni nom, comme Garage Klaus · Sponsor du match) ou dont la Régie attend un nouveau visuel.
// Affiché en haut de la page Demandes : le Sponsoring (et la Régie) y dépose le fichier sans faire de demande
// → RPC deposer_visuel_manquant (migration 67) : visuel validé, dossier du sponsor, tâche « Pour ce soir » si besoin.
// Plusieurs fichiers d'un coup (27.10.2026, migration 69) : chacun reçoit sa version (FR / DE lue dans le nom, sinon V1…)
import { sb, echapper, dateCourte, notifier, nomFichierSur, lireDimensions, toutesLesLignes, devinerVersion } from './app.js';
import { analyserSon } from './son-video.js';

const court = (nom) => (nom || '').replace(/^Action scene – /, 'Action scene · ');

export async function chargerVisuelsManquants() {
  let lignes;
  try {
    lignes = await toutesLesLignes((de, a) => sb.from('lignes_vendues')
      .select(`id, type_vente, date_fin, visuel_attendu, regle_rotation, statut, ligne_couplee_id,
               produit:produits(nom, actif, espace, support, ordre),
               contrat:contrats(sponsor:sponsors(nom, origine)),
               matchs:lignes_matchs(match:matchs(date_heure, adversaire)),
               assets(statut)`)
      .not('statut', 'in', '(annule,termine)').range(de, a));
  } catch { return []; }
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const jour = aujourdhui.toISOString().slice(0, 10);
  const parId = new Map(lignes.map(l => [l.id, l]));
  const sansVisuel = (l) => !(l.assets || []).some(a => ['valide', 'a_valider'].includes(a.statut));
  return lignes.map(l => {
    const prochain = (l.matchs || []).map(x => x.match).filter(m => m && new Date(m.date_heure) >= aujourdhui)
      .sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure))[0] || null;
    // anneau LED couplé (Pub pause tiers, Sponsor du match… : produit technique inactif) : son visuel à part
    const anneau = parId.get(l.ligne_couplee_id);
    const anneauManquant = anneau && anneau.produit?.actif === false && (anneau.visuel_attendu || sansVisuel(anneau))
      ? anneau.id : null;
    return { ...l, prochain, anneauManquant, manque: l.visuel_attendu || sansVisuel(l) };
  }).filter(l => {
    if (!l.produit?.actif || l.produit.espace === 'digital') return false;     // anneau couplé, Digital : à part
    if (['club', 'ligue'].includes(l.contrat?.sponsor?.origine)) return false;
    if (l.regle_rotation === 'par_match') return false;                        // Spot chef : sa propre carte
    if (l.date_fin && l.date_fin < jour) return false;
    // seulement ce qui passe à certains matchs (Sponsor du match…) et dont un match arrive : les diffusions à la
    // saison sont déjà dans Colosseo (Léa, 26.10.2026)
    if (l.type_vente !== 'match' || !l.prochain) return false;
    return l.manque || l.anneauManquant;
  }).sort((a, b) => new Date(a.prochain.date_heure) - new Date(b.prochain.date_heure)
    || (a.produit.ordre ?? 100) - (b.produit.ordre ?? 100)
    || (a.contrat?.sponsor?.nom || '').localeCompare(b.contrat?.sponsor?.nom || ''));
}

// Bloc replié « ⏳ N visuels manquants » ; vide s'il n'y en a pas
export function blocVisuelsManquants(lignes) {
  if (!lignes.length) return '';
  const rangees = lignes.map(l => {
    const video = l.produit.support === 'Vidéotron';
    const quand = `match du ${dateCourte(l.prochain.date_heure)} contre ${echapper(l.prochain.adversaire || '')}`;
    return `
      <li class="visuel-manquant">
        <div><strong>${echapper(l.contrat?.sponsor?.nom || '—')}</strong> · ${echapper(court(l.produit.nom))}
          <span class="doux petit">· ${quand}${l.visuel_attendu ? ' · nouveau visuel attendu par la Régie' : ''}</span></div>
        <div class="zones-manquant">
          ${l.manque ? `<div class="zone-depot zone-compacte" data-depot-manquant="${l.id}">
            Glissez ${video ? 'la ou les vidéos' : 'le ou les visuels'} ici ou <u>cliquez pour choisir</u>
            <input type="file" multiple ${video ? 'accept="video/*"' : ''} hidden data-fichier-manquant></div>` : ''}
          ${l.anneauManquant ? `<div class="zone-depot zone-compacte" data-depot-manquant="${l.anneauManquant}">
            Glissez le ou les visuels de l’<strong>anneau LED</strong> ici ou <u>cliquez pour choisir</u>
            <input type="file" multiple hidden data-fichier-manquant></div>` : ''}
        </div>
      </li>`;
  }).join('');
  return `
    <details class="carte visuels-manquants">
      <summary>⏳ <strong>${lignes.length} visuel${lignes.length > 1 ? 's' : ''} manquant${lignes.length > 1 ? 's' : ''}</strong>
        <span class="doux petit">· diffusions sans visuel dans l’outil : déposez le fichier directement, sans demande</span></summary>
      <ul class="liste-visuels-manquants">${rangees}</ul>
    </details>`;
}

// Dépôt (glisser ou cliquer) ; apres() = recharger le bloc
export function brancherVisuelsManquants(zone, apres) {
  if (zone.dataset.manquantsBranche) return;
  zone.dataset.manquantsBranche = '1';
  // depot = la zone : vidéo / visuel de la diffusion, ou visuel de son anneau LED (data-depot-manquant = la ligne)
  const deposer = async (depot, fichiers) => {
    fichiers = [...(fichiers || [])];
    if (!fichiers.length || !depot) return;
    const ligne = depot.dataset.depotManquant;
    // plusieurs fichiers : une version chacun (FR / DE du nom, sinon V1, V2…), sinon ils se remplaceraient
    const deja = new Set();
    const versions = fichiers.map((f, i) => {
      if (fichiers.length === 1) return null;
      let v = devinerVersion(f.name) || `V${i + 1}`;
      while (deja.has(v)) v = `${v}-${i + 1}`;
      deja.add(v);
      return v;
    });
    let ok = 0;
    try {
      for (const [i, fichier] of fichiers.entries()) {
        depot.textContent = `Envoi de ${fichier.name}${fichiers.length > 1 ? ` (${i + 1}/${fichiers.length})` : ''}…`;
        const chemin = `diffusions/${ligne}/visuel__${Date.now().toString(36)}-${nomFichierSur(fichier.name)}`;
        const [dims, son] = await Promise.all([lireDimensions(fichier), analyserSon(fichier).catch(() => null)]);
        const { error: e1 } = await sb.storage.from('assets').upload(chemin, fichier, { upsert: false, contentType: fichier.type || undefined });
        if (e1) throw new Error(`Envoi de ${fichier.name} impossible : ${e1.message}`);
        const { error: e2 } = await sb.rpc('deposer_visuel_manquant', {
          p_ligne: ligne, p_chemin: chemin, p_nom: fichier.name,
          p_mime: fichier.type || null, p_taille: fichier.size,
          p_largeur: dims?.largeur || null, p_hauteur: dims?.hauteur || null, p_duree: dims?.duree || null,
          p_son: son === 'oui' ? true : son ? false : null,
          ...(versions[i] ? { p_variante: versions[i] } : {}),
        });
        if (e2) {
          await sb.storage.from('assets').remove([chemin]);
          throw new Error(/deposer_visuel_manquant|p_variante/.test(e2.message)
            ? `Exécutez d’abord la migration ${versions[i] ? 69 : 67} dans Supabase.` : e2.message);
        }
        ok++;
      }
      notifier(`${ok > 1 ? `${ok} fichiers déposés` : 'Visuel déposé'} : la Régie le voit sur la fiche du produit et dans Match du jour.`);
    } catch (err) {
      notifier(ok ? `${ok} fichier(s) déposé(s), puis : ${err.message}` : err.message, 'erreur');
    }
    await apres?.(true);
  };
  zone.addEventListener('click', (e) => {
    const d = e.target.closest('[data-depot-manquant]');
    if (d && e.target.tagName !== 'INPUT') d.querySelector('input[type=file]').click();
  });
  zone.addEventListener('change', (e) => {
    if (e.target.dataset.fichierManquant !== undefined) deposer(e.target.closest('[data-depot-manquant]'), e.target.files);
  });
  zone.addEventListener('dragover', (e) => { const d = e.target.closest('[data-depot-manquant]'); if (d) { e.preventDefault(); d.classList.add('survol'); } });
  zone.addEventListener('dragleave', (e) => e.target.closest('[data-depot-manquant]')?.classList.remove('survol'));
  zone.addEventListener('drop', (e) => {
    const d = e.target.closest('[data-depot-manquant]');
    if (!d) return;
    e.preventDefault();
    deposer(d, e.dataTransfer.files);
  });
}
