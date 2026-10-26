// Visuels manquants (26.10.2026, option B de Léa) : diffusions en cours qui n'ont jamais reçu de visuel (ex. importées
// d'Airtable sans fichier ni nom, comme Garage Klaus · Sponsor du match) ou dont la Régie attend un nouveau visuel.
// Affiché en haut de la page Demandes : le Sponsoring (et la Régie) y dépose le fichier sans faire de demande
// → RPC deposer_visuel_manquant (migration 67) : visuel validé, dossier du sponsor, tâche « Pour ce soir » si besoin.
import { sb, echapper, dateCourte, notifier, nomFichierSur, lireDimensions, toutesLesLignes } from './app.js';
import { analyserSon } from './son-video.js';

const court = (nom) => (nom || '').replace(/^Action scene – /, 'Action scene · ');

export async function chargerVisuelsManquants() {
  let lignes;
  try {
    lignes = await toutesLesLignes((de, a) => sb.from('lignes_vendues')
      .select(`id, type_vente, date_fin, visuel_attendu, regle_rotation, statut,
               produit:produits(nom, actif, espace, support, ordre),
               contrat:contrats(sponsor:sponsors(nom, origine)),
               matchs:lignes_matchs(match:matchs(date_heure, adversaire)),
               assets(statut)`)
      .not('statut', 'in', '(annule,termine)').range(de, a));
  } catch { return []; }
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const jour = aujourdhui.toISOString().slice(0, 10);
  return lignes.map(l => {
    const prochain = (l.matchs || []).map(x => x.match).filter(m => m && new Date(m.date_heure) >= aujourdhui)
      .sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure))[0] || null;
    return { ...l, prochain };
  }).filter(l => {
    if (!l.produit?.actif || l.produit.espace === 'digital') return false;     // anneau couplé, Digital : à part
    if (['club', 'ligue'].includes(l.contrat?.sponsor?.origine)) return false;
    if (l.regle_rotation === 'par_match') return false;                        // Spot chef : sa propre carte
    if (l.date_fin && l.date_fin < jour) return false;
    if (l.type_vente === 'match' && !l.prochain) return false;                 // ses matchs sont passés
    const aUnVisuel = (l.assets || []).some(a => ['valide', 'a_valider'].includes(a.statut));
    return l.visuel_attendu || !aUnVisuel;
  }).sort((a, b) => (a.prochain ? 0 : 1) - (b.prochain ? 0 : 1)
    || (a.prochain && b.prochain ? new Date(a.prochain.date_heure) - new Date(b.prochain.date_heure) : 0)
    || (a.produit.ordre ?? 100) - (b.produit.ordre ?? 100)
    || (a.contrat?.sponsor?.nom || '').localeCompare(b.contrat?.sponsor?.nom || ''));
}

// Bloc replié « ⏳ N visuels manquants » ; vide s'il n'y en a pas
export function blocVisuelsManquants(lignes) {
  if (!lignes.length) return '';
  const rangees = lignes.map(l => {
    const video = l.produit.support === 'Vidéotron';
    const quand = l.prochain ? `match du ${dateCourte(l.prochain.date_heure)} contre ${echapper(l.prochain.adversaire || '')}` : 'à la saison';
    return `
      <li class="visuel-manquant" data-ligne="${l.id}">
        <div><strong>${echapper(l.contrat?.sponsor?.nom || '—')}</strong> · ${echapper(court(l.produit.nom))}
          <span class="doux petit">· ${quand}${l.visuel_attendu ? ' · nouveau visuel attendu par la Régie' : ''}</span></div>
        <div class="zone-depot zone-compacte" data-depot-manquant>
          Glissez ${video ? 'la vidéo' : 'le visuel'} ici ou <u>cliquez pour choisir</u>
          <input type="file" ${video ? 'accept="video/*"' : ''} hidden data-fichier-manquant></div>
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
  const deposer = async (rangee, fichier) => {
    if (!fichier) return;
    const depot = rangee.querySelector('[data-depot-manquant]');
    if (depot) depot.textContent = `Envoi de ${fichier.name}…`;
    try {
      const chemin = `diffusions/${rangee.dataset.ligne}/visuel__${Date.now().toString(36)}-${nomFichierSur(fichier.name)}`;
      const [dims, son] = await Promise.all([lireDimensions(fichier), analyserSon(fichier).catch(() => null)]);
      const { error: e1 } = await sb.storage.from('assets').upload(chemin, fichier, { upsert: false, contentType: fichier.type || undefined });
      if (e1) throw new Error(`Envoi impossible : ${e1.message}`);
      const { error: e2 } = await sb.rpc('deposer_visuel_manquant', {
        p_ligne: rangee.dataset.ligne, p_chemin: chemin, p_nom: fichier.name,
        p_mime: fichier.type || null, p_taille: fichier.size,
        p_largeur: dims?.largeur || null, p_hauteur: dims?.hauteur || null, p_duree: dims?.duree || null,
        p_son: son === 'oui' ? true : son ? false : null,
      });
      if (e2) {
        await sb.storage.from('assets').remove([chemin]);
        throw new Error(/deposer_visuel_manquant/.test(e2.message) ? 'Exécutez d’abord la migration 67 dans Supabase.' : e2.message);
      }
      notifier('Visuel déposé : la Régie le voit sur la fiche du produit et dans Match du jour.');
      await apres?.(true);
    } catch (err) {
      notifier(err.message, 'erreur');
      await apres?.(true);
    }
  };
  zone.addEventListener('click', (e) => {
    const d = e.target.closest('[data-depot-manquant]');
    if (d && e.target.tagName !== 'INPUT') d.querySelector('input[type=file]').click();
  });
  zone.addEventListener('change', (e) => {
    if (e.target.dataset.fichierManquant !== undefined) deposer(e.target.closest('.visuel-manquant'), e.target.files[0]);
  });
  zone.addEventListener('dragover', (e) => { const d = e.target.closest('[data-depot-manquant]'); if (d) { e.preventDefault(); d.classList.add('survol'); } });
  zone.addEventListener('dragleave', (e) => e.target.closest('[data-depot-manquant]')?.classList.remove('survol'));
  zone.addEventListener('drop', (e) => {
    const d = e.target.closest('[data-depot-manquant]');
    if (!d) return;
    e.preventDefault();
    deposer(d.closest('.visuel-manquant'), e.dataTransfer.files[0]);
  });
}
