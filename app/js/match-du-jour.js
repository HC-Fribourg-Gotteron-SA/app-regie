// Match du jour : ce que la Régie doit changer dans Colosseo (depuis le match précédent),
// puis toute la playlist pour vérifier. Les playlists Colosseo restent d'un match à l'autre.
import { sb, exigerConnexion, echapper, dateCourte, notifier, toutesLesLignes, libelleFichier, taille } from './app.js';
import { calculerChangements, consigne, PASSE } from './changements.js';

const { profil } = await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });
const estRegie = ['regie', 'admin'].includes(profil.role);

const $ = (id) => document.getElementById(id);
const court = (nom) => (nom || '').replace(/^Action scene – /, 'Action scene · ');
const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const heure = (d) => new Date(d).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
const jour = (d) => new Date(d).toLocaleDateString('fr-CH', { weekday: 'long', day: '2-digit', month: '2-digit' });
const ICONES = { ajouter: '➕', enlever: '➖', visuel: '🔄' };
// Bouton de chaque changement : ouvre la diffusion (fichier, son, remarques…) sur sa fiche
const BOUTON_ACTION = { ajouter: 'Ajouter', visuel: 'Remplacer', enlever: 'Voir' };
const ORDRE_ACTIONS = { demande: -1, enlever: 0, ajouter: 1, visuel: 2 };
// Ordre des produits dans la page : le Sponsor du match (produit et action scene) en premier (demandé par Léa),
// puis l'ordre d'importance habituel
const ordreProduit = (p) => /sponsor du match/i.test(p?.nom || '') ? -1 : (p?.ordre ?? 100);

const etat = {
  matchs: [], match: null, precedent: null,
  lignes: new Map(),        // id -> diffusion
  pubDeAnneau: new Map(),   // id ligne anneau (pause tiers) -> ligne Pub pause tiers
  assets: new Map(),        // id -> visuel
  personnes: new Map(),
  fait: new Map(),          // `${ligne}|${action}` -> { fait_par, fait_le }
  changements: [], passagesCe: [],
  notes: [], tableNotes: true,  // « Pour ce soir » : infos et tâches du match (hors sponsors)
  attente: [], demandesMatch: [], // produits de demandes pas encore ajoutés (tous / ceux de ce match)
  dossiers: new Map(),      // sponsor -> fichiers de son dossier (les plus récents d'abord)
  traitees: new Map(),      // ligne -> produit de demande traité depuis le dernier match (info ; « Fait » reste à cocher)
  tableFait: true,          // false si la migration 22 n'est pas encore exécutée
};

// ---------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------
async function charger() {
  try {
    const [matchs, lignes, assets, { data: personnes }] = await Promise.all([
      toutesLesLignes((de, a) => sb.from('matchs').select('id, saison_id, numero, date_heure, adversaire, type')
        .order('date_heure').range(de, a)),
      toutesLesLignes((de, a) => sb.from('lignes_vendues')
        .select(`id, produit_id, type_vente, avec_son, duree_s, consignes, suspendue, motif_suspension, validee, statut,
                 date_fin, priorite, created_at, ligne_couplee_id,
                 produit:produits(id, nom, categorie, ordre, famille, support, actif),
                 contrat:contrats(sponsor_id, sponsor:sponsors(nom)), demande_id,
                 matchs:lignes_matchs(match:matchs(date_heure, adversaire)),
                 emplacements:lignes_emplacements(emplacement:emplacements(anneau, zone, position))`).range(de, a)),
      toutesLesLignes((de, a) => sb.from('assets').select('id, nom_visuel, variante, storage_path').range(de, a)),
      sb.from('profiles').select('id, nom, email'),
    ]);
    // dossiers sponsors (fichiers reçus) : proposés quand une diffusion n'a pas de fichier à elle
    try {
      const docs = await toutesLesLignes((de, a) => sb.from('documents_sponsors')
        .select('sponsor_id, produit_id, nom, storage_path, taille_octets, depose_le').not('sponsor_id', 'is', null).range(de, a));
      etat.dossiers = new Map();
      for (const d of docs.sort((x, y) => new Date(y.depose_le) - new Date(x.depose_le))) {
        if (!etat.dossiers.has(d.sponsor_id)) etat.dossiers.set(d.sponsor_id, []);
        etat.dossiers.get(d.sponsor_id).push(d);
      }
    } catch { etat.dossiers = new Map(); }       // table pas encore créée (migration 19)
    etat.matchs = matchs;
    etat.lignes = new Map(lignes.map(l => [l.id, l]));
    // l'anneau LED de la Pub pause tiers fait partie de la Pub pause tiers (ligne couplée, produit technique inactif)
    etat.pubDeAnneau = new Map(lignes.filter(l => l.ligne_couplee_id && l.produit && !l.produit.actif)
      .map(l => [l.id, etat.lignes.get(l.ligne_couplee_id)]).filter(([, pub]) => pub));
    etat.assets = new Map(assets.map(a => [a.id, a]));
    etat.personnes = new Map((personnes || []).map(x => [x.id, x.nom || x.email.split('@')[0]]));
  } catch (err) {
    $('m-titre').textContent = 'Chargement impossible';
    notifier(err.message, 'erreur');
    return;
  }
  if (!etat.matchs.length) {
    $('m-titre').textContent = 'Aucun match au calendrier';
    $('m-sous-titre').innerHTML = 'Importez le calendrier dans <a href="calendrier.html">Calendrier des matchs</a>.';
    return;
  }
  remplirChoix();
  await chargerMatch();
}

function remplirChoix() {
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const demande = new URLSearchParams(location.search).get('match');
  etat.match = etat.matchs.find(m => m.id === demande)
    || etat.matchs.find(m => new Date(m.date_heure) >= debutJour)
    || etat.matchs[etat.matchs.length - 1];
  $('choix-match').innerHTML = etat.matchs.map(m => `<option value="${m.id}" ${m.id === etat.match.id ? 'selected' : ''}>
    ${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}</option>`).join('');
}

async function chargerMatch() {
  const m = etat.match;
  // match précédent = le dernier joué avant celui-ci, même s'il est de la saison d'avant
  // (premier match de la saison : on compare avec la fin de la saison précédente)
  const avant = etat.matchs.filter(x => new Date(x.date_heure) < new Date(m.date_heure));
  etat.precedent = avant[avant.length - 1] || null;

  const aujourdhui = new Date().toDateString() === new Date(m.date_heure).toDateString();
  const passe = new Date(m.date_heure) < new Date() && !aujourdhui;
  $('m-surtitre').textContent = aujourdhui ? 'Match du jour' : passe ? 'Match passé' : 'Prochain match';
  $('m-titre').textContent = `${aujourdhui ? 'Ce soir' : jour(m.date_heure)} · contre ${m.adversaire}`;
  $('m-sous-titre').textContent = `${aujourdhui ? jour(m.date_heure) + ' · ' : ''}${heure(m.date_heure)} · match n° ${m.numero}`
    + (etat.precedent ? ` · comparé au match du ${dateCourte(etat.precedent.date_heure)} contre ${etat.precedent.adversaire}`
      + (etat.precedent.saison_id !== m.saison_id ? ' (dernier match de la saison précédente)' : '') : '');
  $('quand-playlist').textContent = aujourdhui ? 'ce soir' : `le ${dateCourte(m.date_heure)}`;
  document.title = `${aujourdhui ? 'Match du jour' : 'Match'} — ${m.adversaire}`;

  const ids = [m.id, etat.precedent?.id].filter(Boolean);
  let passages;
  try {
    passages = await toutesLesLignes((de, a) => sb.from('passages').select('ligne_id, match_id, statut, asset_id')
      .in('match_id', ids).range(de, a));
  } catch (err) { notifier(`Chargement impossible : ${err.message}`, 'erreur'); return; }
  etat.passagesCe = passages.filter(p => p.match_id === m.id);
  const passagesAvant = passages.filter(p => p.match_id === etat.precedent?.id);

  etat.changements = etat.precedent
    ? calculerChangements({ passagesAvant, passagesCe: etat.passagesCe, lignes: etat.lignes }) : [];

  const [{ data: fait, error }, { data: notes, error: eNotes }, { data: attente }, { data: traitees }] = await Promise.all([
    sb.from('colosseo_fait').select('ligne_id, action, fait_par, fait_le').eq('match_id', m.id),
    sb.from('notes_match').select('id, type, texte, fait, fait_par, fait_le, cree_par, cree_le')
      .eq('match_id', m.id).order('cree_le'),
    // produits de demandes pas encore ajoutés sur leur fiche
    sb.from('demandes_produits')
      .select(`demande_id, produit_id, type_vente, dates_matchs, avec_son, avec_anneau, duree_s, remarque_sponsoring,
               produit:produits(id, nom, ordre, famille, support),
               demande:demandes!inner(id, type, statut, created_at, sponsor_nom_saisi, sponsor:sponsors(nom))`)
      .is('traite_le', null).neq('demande.statut', 'traitee'),
    // demandes ajoutées depuis le match précédent : le changement a été fait dans Colosseo en même temps
    etat.precedent
      ? sb.from('demandes_produits').select('ligne_id, traite_le, traite_par')
          .not('ligne_id', 'is', null).gte('traite_le', etat.precedent.date_heure)
      : Promise.resolve({ data: [] }),
  ]);
  etat.traitees = new Map((traitees || []).map(t => [t.ligne_id, t]));
  etat.tableFait = !error;
  etat.fait = new Map((fait || []).map(f => [`${f.ligne_id}|${f.action}`, f]));
  etat.tableNotes = !eNotes;          // false si la migration 26 n'est pas encore exécutée
  etat.notes = notes || [];
  // celles qui concernent ce match : pour la saison, ou vendues pour ce jour de match
  const jourMatch = jourLocal(m.date_heure);
  etat.attente = attente || [];
  etat.demandesMatch = etat.attente.filter(a => a.type_vente !== 'match' || (a.dates_matchs || []).includes(jourMatch));
  await chargerFichiersDemandes(etat.demandesMatch);

  afficher();
  if (estRegie) compterDemandes();
}

// Fichiers joints à chaque produit de demande (vidéo, visuel anneau LED, logo…) : à télécharger ici,
// pour les mettre dans Colosseo et dans l'outil sans changer de page
async function chargerFichiersDemandes(liste) {
  await Promise.all(liste.map(async (a) => {
    const dossier = `demandes/${a.demande_id}/${a.produit_id}`;
    const { data } = await sb.storage.from('assets').list(dossier, { sortBy: { column: 'name', order: 'asc' } });
    a.fichiers = (data || []).filter(f => f.id).map(f => {
      const i = f.name.indexOf('__');
      return { role: i > 0 ? f.name.slice(0, i) : 'visuel', nom: i > 0 ? f.name.slice(i + 2) : f.name,
               storage_path: `${dossier}/${f.name}`, taille: f.metadata?.size || 0 };
    });
  }));
}

// Les autres demandes en cours (pas pour ce match, questions, sans produit…) : un simple lien
async function compterDemandes() {
  const { data } = await sb.from('demandes').select('id').in('statut', ['nouvelle', 'en_cours', 'question']);
  const ici = new Set(etat.demandesMatch.map(a => a.demande_id));
  const autres = (data || []).filter(d => !ici.has(d.id)).length;
  const lien = $('demandes-attente');
  lien.hidden = !autres;
  if (autres) lien.innerHTML = `📨 <strong>${autres} autre${autres > 1 ? 's' : ''} demande${autres > 1 ? 's' : ''} en cours</strong>
    <span class="doux">— pas pour ce match (ou en attente d’une réponse) →</span>`;
}

// ---------------------------------------------------------------------
// Une diffusion : produit, sponsor, visuel. L'anneau LED de la Pub pause tiers n'est pas un produit :
// il est rangé dans la Pub pause tiers (« avec anneau LED »).
// ---------------------------------------------------------------------
function infos(ligneId) {
  const anneauDe = etat.pubDeAnneau.get(ligneId);   // cette ligne est l'anneau d'une Pub pause tiers
  const l = anneauDe || etat.lignes.get(ligneId);
  return {
    l,
    anneau: !!anneauDe,
    pubId: anneauDe?.id,
    produit: l?.produit ? court(l.produit.nom) : 'Produit inconnu',
    ordre: ordreProduit(l?.produit),
    famille: l?.produit?.famille,
    categorie: l?.produit?.categorie,
    sponsor: l?.contrat?.sponsor?.nom || '—',
    priorite: l?.priorite ?? 1e9,
    empl: (l?.emplacements || []).map(e => e.emplacement).filter(Boolean).map(e => `${e.anneau}-${e.zone}-${e.position}`),
    video: l?.produit?.support === 'Vidéotron' && !anneauDe,
  };
}
// Visuel de l'anneau LED d'une Pub pause tiers pour ce match
const assetAnneau = (l) => l?.ligne_couplee_id && etat.passagesCe.find(p => p.ligne_id === l.ligne_couplee_id)?.asset_id;
const consigneAnneau = (action) => ({ ajouter: 'Ajouter l’anneau LED', enlever: 'Enlever l’anneau LED',
  visuel: 'Remplacer le visuel de l’anneau LED' })[action];
const nomVisuel = (id) => { const a = etat.assets.get(id); return a ? a.nom_visuel + (a.variante ? ` (${a.variante})` : '') : ''; };
const trier = (a, b) => a.ordre - b.ordre || a.produit.localeCompare(b.produit) || a.priorite - b.priorite;

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------
function afficher() {
  // « traitée » (demande ajoutée dans l'outil) ≠ « fait » (mis dans Colosseo) : on indique seulement la demande
  const tous = etat.changements.map(c => {
    const inf = infos(c.ligne_id);
    return { ...c, ...inf, fait: etat.fait.get(`${c.ligne_id}|${c.action}`),
             traitee: etat.traitees.get(inf.pubId || c.ligne_id) };
  });
  // anneau ajouté / enlevé en même temps que sa Pub pause tiers : une seule ligne (« avec anneau LED »)
  const pubs = new Set(tous.filter(i => !i.anneau).map(i => `${i.ligne_id}|${i.action}`));
  // demandes pas encore ajoutées sur leur fiche : à traiter d'abord, elles changeront la playlist
  const demandes = etat.demandesMatch.map(a => ({
    action: 'demande', dp: a, ligne_id: `${a.demande_id}|${a.produit_id}`,
    produit: court(a.produit?.nom), ordre: ordreProduit(a.produit), famille: a.produit?.famille,
    sponsor: a.demande?.sponsor?.nom || a.demande?.sponsor_nom_saisi || '—', priorite: -1,
  }));
  const items = tous.filter(i => !(i.anneau && i.action !== 'visuel' && pubs.has(`${i.pubId}|${i.action}`)))
    .concat(demandes)
    .sort((a, b) => trier(a, b) || (a.anneau - b.anneau) || ORDRE_ACTIONS[a.action] - ORDRE_ACTIONS[b.action]);
  etat.items = items;
  const reste = items.filter(i => !i.fait).length;
  const taches = etat.notes.filter(n => n.type === 'tache' && !n.fait).length;
  const plusTaches = taches ? ` <span class="doux">· ${taches} tâche${taches > 1 ? 's' : ''} pour ce soir</span>` : '';

  // bilan en une ligne
  const bilan = $('bilan');
  bilan.hidden = false;
  if (!etat.precedent) {
    bilan.className = 'carte bilan-match';
    bilan.innerHTML = '<strong>Premier match enregistré dans l’outil</strong> <span class="doux">— pas de match précédent pour comparer : vérifiez toute la playlist ci-dessous.</span>' + plusTaches;
  } else if (!items.length) {
    bilan.className = `carte bilan-match ${taches ? 'bilan-a-faire' : 'bilan-pret'}`;
    bilan.innerHTML = '<strong>✓ Rien à changer dans Colosseo</strong> <span class="doux">— la playlist est la même qu’au match précédent.</span>' + plusTaches;
  } else if (!reste) {
    bilan.className = `carte bilan-match ${taches ? 'bilan-a-faire' : 'bilan-pret'}`;
    bilan.innerHTML = `<strong>✓ Colosseo est prêt</strong> <span class="doux">— les ${items.length} changements sont faits.</span>` + plusTaches;
  } else {
    bilan.className = 'carte bilan-match bilan-a-faire';
    bilan.innerHTML = `<strong>${reste} chose${reste > 1 ? 's' : ''} à faire dans Colosseo</strong>
      <span class="doux">${demandes.length ? `· dont ${demandes.length} demande${demandes.length > 1 ? 's' : ''} à ajouter` : ''}
      ${items.length - reste ? `· ${items.length - reste} déjà faite${items.length - reste > 1 ? 's' : ''}` : ''}</span>` + plusTaches;
  }
  afficherNotes();
  if (!etat.tableFait && estRegie && items.length) {
    bilan.innerHTML += '<p class="message message-erreur petit" style="margin:.6rem 0 0">Les cases « Fait » ne s’enregistrent pas encore : exécutez la migration 22 dans Supabase.</p>';
  }

  // à faire, groupé par produit
  $('bloc-a-faire').hidden = !items.length;
  $('nb-a-faire').textContent = items.length ? `· ${reste} / ${items.length}` : '';
  const groupes = grouper(items);
  $('a-faire').innerHTML = [...groupes].map(([produit, liste]) => `
    <div class="carte groupe-colosseo">
      <div class="groupe-titre">${echapper(produit)}</div>
      ${liste.map(carteChangement).join('')}
    </div>`).join('');

  afficherPlaylist();
}

// « Pour ce soir » : infos d'abord, puis tâches à faire, puis tâches faites
function afficherNotes() {
  const bloc = $('bloc-notes');
  bloc.hidden = !etat.tableNotes || (!estRegie && !etat.notes.length);
  if (bloc.hidden) return;
  const rang = (n) => n.type === 'info' ? 0 : n.fait ? 2 : 1;
  const notes = etat.notes.slice().sort((a, b) => rang(a) - rang(b) || new Date(a.cree_le) - new Date(b.cree_le));
  const qui = (id) => echapper(etat.personnes.get(id) || '—');
  $('notes').innerHTML = notes.map(n => `
    <li class="note note-${n.type}${n.fait ? ' est-fait' : ''}">
      ${n.type === 'tache'
        ? `<input type="checkbox" data-note-fait="${n.id}" ${n.fait ? 'checked' : ''} ${estRegie ? '' : 'disabled'} aria-label="Fait">`
        : '<span class="note-icone" aria-hidden="true">📝</span>'}
      <span class="note-texte">${echapper(n.texte)}
        <span class="doux petit">· ${n.fait ? `fait par ${qui(n.fait_par)} à ${heure(n.fait_le)}` : `${qui(n.cree_par)}, ${dateCourte(n.cree_le)} ${heure(n.cree_le)}`}</span></span>
      ${estRegie ? `<button type="button" class="btn btn-discret petit" data-suppr-note="${n.id}" aria-label="Supprimer">✕</button>` : ''}
    </li>`).join('');
  $('notes-vide').hidden = notes.length > 0;
  $('form-note').hidden = !estRegie;
}

function grouper(items) {
  const groupes = new Map();
  for (const i of items) {
    if (!groupes.has(i.produit)) groupes.set(i.produit, []);
    groupes.get(i.produit).push(i);
  }
  return groupes;
}

// Demande pas encore ajoutée sur sa fiche produit : la traiter (elle deviendra « Ajouter », « Remplacer »…)
const VERBE_DEMANDE = { suppression: 'Retrait demandé', changement_visuel: 'Nouveau visuel demandé' };
function carteDemande(i) {
  const a = i.dp, d = a.demande || {};
  const details = [
    a.type_vente === 'match' ? '<strong>vendu pour ce match</strong>' : 'toute la saison',
    a.avec_son === true ? '<strong>avec son</strong>' : a.avec_son === false ? 'sans son' : '',
    a.avec_anneau === true ? '<strong>avec anneau LED</strong>' : a.avec_anneau === false ? 'sans anneau LED' : '',
    a.duree_s ? `${a.duree_s} s` : '',
  ].filter(Boolean);
  return `
    <div class="changement changement-demande">
      <div class="changement-icone" aria-hidden="true">📨</div>
      <div class="changement-texte">
        <div><span class="changement-verbe">${VERBE_DEMANDE[d.type] || 'Demande à ajouter'}</span> · <strong>${echapper(i.sponsor)}</strong>
          <span class="doux petit">(reçue le ${dateCourte(d.created_at)} · pas encore traitée)</span></div>
        <div class="petit">${details.join(' · ')}</div>
        ${a.remarque_sponsoring ? `<div class="petit doux">Sponsoring : ${echapper(a.remarque_sponsoring)}</div>` : ''}
        ${d.type === 'suppression' ? '' : (a.fichiers || []).length ? `
          <ul class="liste-fichiers liste-documents">${a.fichiers.map(f => `
            <li><span><strong>${echapper(libelleFichier(a.produit, f.role))}</strong> : ${echapper(f.nom)}
                ${f.taille ? `<span class="doux petit">${taille(f.taille)}</span>` : ''}</span>
              <button type="button" class="btn" data-telecharger="${echapper(f.storage_path)}">Télécharger</button></li>`).join('')}
          </ul>`
          : '<div class="petit" style="margin-top:.3rem">⏳ <strong>Fichier à venir</strong> <span class="doux">(pas encore envoyé par le Sponsoring)</span></div>'}
      </div>
      <div class="changement-actions">
        ${estRegie ? `<a class="btn btn-principal" title="Ouvrir la demande (comme dans Demandes)"
            href="demandes.html?id=${a.demande_id}&retour=${encodeURIComponent(`match-du-jour.html?match=${etat.match.id}`)}">Ajouter</a>`
                   : '<span class="doux petit">en attente de la Régie</span>'}
      </div>
    </div>`;
}

function carteChangement(i) {
  if (i.action === 'demande') return carteDemande(i);
  const a = etat.assets.get(i.asset_id);
  const details = [];
  if (i.empl.length) {
    details.push(i.action === 'enlever' ? `emplacement ${i.empl.join(', ')}`
      : `sur ${i.empl.join(', ')}${i.action === 'ajouter' ? ' (à la place du Banner HCFG)' : ''}`);
  }
  if (i.video && i.action !== 'enlever') {
    details.push(i.l?.avec_son ? '<strong>avec son</strong> (à mettre avant les spots sans son)' : 'sans son');
    if (i.l?.duree_s) details.push(`${i.l.duree_s} s`);
  }
  // Pub pause tiers : l'anneau LED en fait partie (ou non)
  if (!i.anneau && i.l?.produit?.id && etat.lignes.get(i.l.ligne_couplee_id)?.produit?.actif === false) {
    const na = nomVisuel(assetAnneau(i.l));
    details.push(`<strong>avec anneau LED</strong>${na && i.action !== 'enlever' ? ` (${echapper(na)})` : ''}`);
  } else if (i.video && /pause/i.test(i.produit) && i.action !== 'enlever') {
    details.push('sans anneau LED');
  }
  const visuel = i.action === 'visuel'
    ? `Nouveau : <strong>${echapper(nomVisuel(i.asset_id) || '—')}</strong>${i.ancien_asset_id ? ` <span class="doux">· à la place de « ${echapper(nomVisuel(i.ancien_asset_id))} »</span>` : ''}`
    : nomVisuel(i.asset_id) ? `Visuel : ${echapper(nomVisuel(i.asset_id))}` : '';
  // visuel connu seulement par son nom (import Airtable, démo) : pas de fichier à télécharger
  // pas de fichier sur la diffusion : on propose les fichiers du dossier du sponsor (ceux de ce produit d'abord)
  const sponsorId = i.l?.contrat?.sponsor_id;
  const dossier = i.action !== 'enlever' && !a?.storage_path && sponsorId ? (etat.dossiers.get(sponsorId) || [])
    .slice().sort((x, y) => (y.produit_id === i.l?.produit_id) - (x.produit_id === i.l?.produit_id)) : [];
  const sansFichier = i.action !== 'enlever' && i.asset_id && !a?.storage_path && !dossier.length
    ? ' <span class="doux petit">· fichier pas dans l’outil</span>' : '';
  const fichiersDossier = dossier.length ? `
    <div class="petit" style="margin-top:.3rem">Dans le dossier du sponsor :</div>
    <ul class="liste-fichiers liste-documents">${dossier.slice(0, 6).map(d => `
      <li><span>${echapper(d.nom)}${d.taille_octets ? ` <span class="doux petit">${taille(d.taille_octets)}</span>` : ''}</span>
        <button type="button" class="btn" data-telecharger="${echapper(d.storage_path)}">Télécharger</button></li>`).join('')}
    </ul>
    ${dossier.length > 6 ? `<a class="petit" href="sponsor.html?id=${sponsorId}">+ ${dossier.length - 6} autres dans le dossier →</a>` : ''}` : '';
  const fait = i.fait;
  return `
    <div class="changement changement-${i.action}${fait ? ' est-fait' : ''}">
      <div class="changement-icone" aria-hidden="true">${ICONES[i.action]}</div>
      <div class="changement-texte">
        <div><span class="changement-verbe">${i.anneau ? consigneAnneau(i.action) : consigne(i.action, i.famille, i.categorie)}</span> · <strong>${echapper(i.sponsor)}</strong>
          <span class="doux petit">(${echapper(i.raison)})</span></div>
        ${details.length ? `<div class="petit">${details.join(' · ')}</div>` : ''}
        ${visuel ? `<div class="petit">${visuel}${sansFichier}</div>` : ''}
        ${fichiersDossier}
        ${i.l?.consignes && i.action !== 'enlever' ? `<div class="petit doux">Remarque : ${echapper(i.l.consignes)}</div>` : ''}
        ${i.traitee ? `<div class="petit doux">Demande traitée par ${echapper(etat.personnes.get(i.traitee.traite_par) || '—')}
          le ${dateCourte(i.traitee.traite_le)}</div>` : ''}
        ${fait ? `<div class="petit doux">Fait dans Colosseo par ${echapper(etat.personnes.get(fait.fait_par) || '—')} à ${heure(fait.fait_le)}</div>` : ''}
      </div>
      <div class="changement-actions">
        ${a?.storage_path && i.action !== 'enlever' ? `<button type="button" class="btn btn-discret" data-telecharger="${echapper(a.storage_path)}">Télécharger</button>` : ''}
        ${i.l ? `<button type="button" class="btn${i.action === 'enlever' ? '' : ' btn-principal'}" data-ouvrir="${i.ligne_id}|${i.action}"
          title="Ouvrir le détail : fichiers, matchs, remarques…">${BOUTON_ACTION[i.action]}</button>` : ''}
        ${estRegie ? `<label class="case-fait"><input type="checkbox" data-fait="${i.ligne_id}|${i.action}" ${fait ? 'checked' : ''}
          ${etat.tableFait ? '' : 'disabled'}> Fait</label>` : ''}
      </div>
    </div>`;
}

function afficherPlaylist() {
  // l'anneau de la pause tiers n'a pas de rangée à lui : il est indiqué sur la Pub pause tiers
  const items = etat.passagesCe.filter(p => PASSE.has(p.statut) && !etat.pubDeAnneau.has(p.ligne_id))
    .map(p => ({ ...infos(p.ligne_id), asset_id: p.asset_id, ligne_id: p.ligne_id })).sort(trier);
  const anneauPasse = new Set(etat.passagesCe.filter(p => PASSE.has(p.statut) && etat.pubDeAnneau.has(p.ligne_id))
    .map(p => etat.pubDeAnneau.get(p.ligne_id).id));
  $('bloc-playlist').hidden = !items.length;
  const changes = new Set(etat.changements.filter(c => c.action !== 'enlever')
    .map(c => etat.pubDeAnneau.get(c.ligne_id)?.id || c.ligne_id));
  $('playlist').innerHTML = [...grouper(items)].map(([produit, liste]) => `
    <details class="carte groupe-playlist">
      <summary><strong>${echapper(produit)}</strong> <span class="doux">· ${liste.length}</span>
        ${liste.some(i => changes.has(i.ligne_id)) ? '<span class="etat etat-attente">changements</span>' : ''}</summary>
      <ol class="playlist">${liste.map(i => `
        <li class="${changes.has(i.ligne_id) ? 'nouveau' : ''}"><strong>${echapper(i.sponsor)}</strong>
          ${i.empl.length ? `<span class="doux petit">${i.empl.join(', ')}</span>` : ''}
          ${nomVisuel(i.asset_id) ? `<span class="petit">· ${echapper(nomVisuel(i.asset_id))}</span>` : ''}
          ${i.video && i.l?.avec_son ? '<span class="badge badge-son">son</span>' : ''}
          ${anneauPasse.has(i.ligne_id) ? '<span class="badge">+ anneau LED</span>' : ''}</li>`).join('')}
      </ol>
    </details>`).join('');
}

// ---------------------------------------------------------------------
// Détail d'un changement : même présentation qu'une demande (produit, matchs, fichiers, remarques, suivi)
// ---------------------------------------------------------------------
const TITRE_ACTION = { ajouter: 'À ajouter dans Colosseo', enlever: 'À enlever de Colosseo', visuel: 'Nouveau visuel à mettre dans Colosseo' };

function ligneFichier(libelle, nom, chemin, octets) {
  return `<li><span><strong>${echapper(libelle)}</strong> : ${echapper(nom || '—')}
      ${octets ? `<span class="doux petit">${taille(octets)}</span>` : ''}
      ${chemin ? '' : '<span class="doux petit">· fichier pas dans l’outil</span>'}</span>
    ${chemin ? `<button type="button" class="btn" data-telecharger="${echapper(chemin)}">Télécharger</button>` : ''}</li>`;
}

function ouvrirChangement(cleItem) {
  const i = (etat.items || []).find(x => `${x.ligne_id}|${x.action}` === cleItem);
  if (!i?.l) return;
  etat.ouvert = cleItem;
  const l = i.l;
  const a = etat.assets.get(i.asset_id);
  const anneau = !i.anneau && etat.lignes.get(l.ligne_couplee_id)?.produit?.actif === false;
  const aAnneau = anneau ? etat.assets.get(assetAnneau(l)) : null;
  const dates = (l.matchs || []).map(m => m.match).filter(Boolean).sort((x, y) => new Date(x.date_heure) - new Date(y.date_heure));
  const dossier = (etat.dossiers.get(l.contrat?.sponsor_id) || []).slice()
    .sort((x, y) => (y.produit_id === l.produit_id) - (x.produit_id === l.produit_id));
  const fait = i.fait;

  $('d-surtitre').textContent = i.anneau ? consigneAnneau(i.action) : TITRE_ACTION[i.action];
  $('d-titre').textContent = i.sponsor;
  // état POUR CE MATCH (et pas la case « À l'écran » de la fiche, qui prêtait à confusion pour un retrait)
  const passeCeMatch = etat.passagesCe.some(p => p.ligne_id === (i.anneau ? l.ligne_couplee_id : l.id) && PASSE.has(p.statut));
  $('d-sous-titre').innerHTML = (l.suspendue ? '<span class="etat etat-desactive">⏸ Désactivé</span>'
      : passeCeMatch ? '<span class="etat etat-ecran">Passe à ce match</span>'
      : '<span class="etat etat-non">Ne passe pas à ce match</span>')
    + (fait ? ' <span class="etat etat-ecran">✓ Fait dans Colosseo</span>' : ' <span class="etat etat-attente">à faire dans Colosseo</span>')
    + ` &nbsp;<span class="doux">${echapper(i.raison || '')}</span>`;

  $('d-corps').innerHTML = `
    <div class="detail-grille">
      <div>
        <section class="detail-section">
          <h3>Produit</h3>
          <div class="details-produits">
            <div class="detail-produit">
              <div class="suivi-produit ${fait ? 'fait' : ''}">
                ${fait ? `✓ Fait dans Colosseo par ${echapper(etat.personnes.get(fait.fait_par) || '—')} à ${heure(fait.fait_le)}`
                       : (i.anneau ? consigneAnneau(i.action) : consigne(i.action, i.famille, i.categorie))}
                <a href="produit.html?id=${l.produit?.id}&ligne=${l.id}&retour=${encodeURIComponent(`match-du-jour.html?match=${etat.match.id}`)}">Ouvrir la fiche →</a>
              </div>
              <div class="detail-entete">
                <strong>${echapper(l.produit?.nom || '?')}</strong>
                ${l.type_vente === 'match' ? '<span class="badge badge-match">Seulement certains matchs</span>' : '<span class="badge">Toute la saison</span>'}
                ${i.video ? (l.avec_son ? '<span class="badge badge-son">Avec son</span>' : '<span class="badge">Sans son</span>') : ''}
                ${anneau ? '<span class="badge badge-son">+ Anneau LED</span>' : i.video && /pause/i.test(i.produit) ? '<span class="badge">Sans anneau LED</span>' : ''}
              </div>
              ${l.type_vente === 'match' && dates.length ? `
                <div style="margin-bottom:.75rem">
                  <div class="titre-bloc">Matchs</div>
                  <div class="petit">${dates.map(m => `${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}`).join('<br>')}</div>
                </div>` : ''}
              ${i.empl.length ? `<div class="petit" style="margin-bottom:.75rem"><span class="titre-bloc">Emplacement</span> <strong>${i.empl.join(', ')}</strong></div>` : ''}
              ${l.duree_s ? `<div class="petit" style="margin-bottom:.75rem"><span class="titre-bloc">Durée du spot</span> <strong>${l.duree_s} s</strong></div>` : ''}
              <div style="margin-bottom:.9rem">
                <div class="titre-bloc">Fichiers</div>
                <ul class="liste-fichiers liste-documents" style="margin-top:.3rem">
                  ${a ? ligneFichier(i.action === 'visuel' ? 'Nouveau visuel' : 'Visuel', nomVisuel(i.asset_id), a.storage_path) : ''}
                  ${i.action === 'visuel' && i.ancien_asset_id ? ligneFichier('Ancien visuel', nomVisuel(i.ancien_asset_id), etat.assets.get(i.ancien_asset_id)?.storage_path) : ''}
                  ${aAnneau ? ligneFichier('Visuel anneau LED', nomVisuel(aAnneau.id), aAnneau.storage_path) : ''}
                  ${dossier.slice(0, 10).map(d => ligneFichier('Dossier du sponsor', d.nom, d.storage_path, d.taille_octets)).join('')}
                  ${!a && !aAnneau && !dossier.length ? '<li class="doux">Aucun fichier dans l’outil pour ce sponsor.</li>' : ''}
                </ul>
                ${dossier.length > 10 ? `<a class="petit" href="sponsor.html?id=${l.contrat?.sponsor_id}">Voir tout le dossier (${dossier.length}) →</a>` : ''}
              </div>
              <div class="grille-remarques">
                <div>
                  <div class="titre-bloc">Remarques</div>
                  <div class="bloc-texte petit">${echapper(l.consignes || '—')}</div>
                </div>
                <div>
                  <div class="titre-bloc">Pourquoi ce changement</div>
                  <div class="bloc-texte petit">${echapper(i.raison || '—')}${l.suspendue && l.motif_suspension ? `<br>${echapper(l.motif_suspension)}` : ''}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="detail-cote">
        <div class="encart">
          <h3>Suivi</h3>
          <dl>
            <dt>Origine</dt><dd>${l.demande_id
              ? `<a href="demandes.html?id=${l.demande_id}&retour=${encodeURIComponent(`match-du-jour.html?match=${etat.match.id}`)}">Demande du Sponsoring →</a>`
              : 'Import Airtable'}</dd>
            ${i.traitee ? `<dt>Demande traitée par</dt><dd>${echapper(etat.personnes.get(i.traitee.traite_par) || '—')}
              <div class="doux petit">${dateCourte(i.traitee.traite_le)}</div></dd>` : ''}
            <dt>Dans Colosseo</dt><dd>${fait ? `✓ Fait par ${echapper(etat.personnes.get(fait.fait_par) || '—')}
              <div class="doux petit">à ${heure(fait.fait_le)}</div>` : '<span class="doux">Pas encore fait</span>'}</dd>
          </dl>
        </div>
      </aside>
    </div>`;

  $('d-pied').innerHTML = `
    <span class="indication">Match du ${dateCourte(etat.match.date_heure)} · contre ${echapper(etat.match.adversaire)}</span>
    ${estRegie && etat.tableFait ? `<button type="button" class="btn btn-principal" data-basculer-fait="${i.ligne_id}|${i.action}">
      ${fait ? 'Marquer « pas encore fait »' : '✓ Fait dans Colosseo'}</button>` : ''}`;
  $('d-pied').hidden = false;
  $('fenetre').hidden = $('voile').hidden = false;
  document.body.classList.add('fenetre-ouverte');
}

function fermerChangement() {
  $('fenetre').hidden = $('voile').hidden = true;
  document.body.classList.remove('fenetre-ouverte');
  etat.ouvert = null;
}
$('btn-fermer').addEventListener('click', fermerChangement);
$('voile').addEventListener('click', fermerChangement);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fenetre').hidden) fermerChangement(); });

// ---------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------
// « Fait dans Colosseo » : case sur la carte ou bouton dans le détail
async function basculerFait(cleItem, coche) {
  const [ligne_id, action] = cleItem.split('|');
  const cle = { match_id: etat.match.id, ligne_id, action };
  const { error } = coche
    ? await sb.from('colosseo_fait').insert(cle)
    : await sb.from('colosseo_fait').delete().match(cle);
  if (error) { notifier(`Enregistrement impossible : ${error.message}`, 'erreur'); return false; }
  if (coche) etat.fait.set(cleItem, { fait_par: profil.id, fait_le: new Date().toISOString() });
  else etat.fait.delete(cleItem);
  afficher();
  if (etat.ouvert === cleItem) ouvrirChangement(cleItem);
  return true;
}

document.addEventListener('change', async (e) => {
  const c = e.target.closest('[data-fait]');
  if (!c) return;
  if (!(await basculerFait(c.dataset.fait, c.checked))) c.checked = !c.checked;
});

document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-ouvrir]');
  if (o) { ouvrirChangement(o.dataset.ouvrir); return; }
  const f = e.target.closest('[data-basculer-fait]');
  if (f) basculerFait(f.dataset.basculerFait, !etat.fait.has(f.dataset.basculerFait));
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-telecharger]');
  if (!b) return;
  const { data, error } = await sb.storage.from('assets').createSignedUrl(b.dataset.telecharger, 600, { download: true });
  if (error) return notifier(`Téléchargement impossible : ${error.message}`, 'erreur');
  location.href = data.signedUrl;
});

// « Pour ce soir » : ajouter, cocher, supprimer
$('form-note').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texte = $('note-texte').value.trim();
  if (!texte) { $('note-texte').focus(); return; }
  const { data, error } = await sb.from('notes_match')
    .insert({ match_id: etat.match.id, type: $('note-type').value, texte })
    .select('id, type, texte, fait, fait_par, fait_le, cree_par, cree_le').single();
  if (error) return notifier(`Ajout impossible : ${error.message}`, 'erreur');
  etat.notes.push(data);
  $('note-texte').value = '';
  afficher();
  $('note-texte').focus();
});

document.addEventListener('change', async (e) => {
  const c = e.target.closest('[data-note-fait]');
  if (!c) return;
  const { data, error } = await sb.from('notes_match').update({ fait: c.checked }).eq('id', c.dataset.noteFait)
    .select('id, type, texte, fait, fait_par, fait_le, cree_par, cree_le').single();
  if (error) { c.checked = !c.checked; return notifier(`Enregistrement impossible : ${error.message}`, 'erreur'); }
  etat.notes = etat.notes.map(n => n.id === data.id ? data : n);
  afficher();
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-suppr-note]');
  if (!b) return;
  const n = etat.notes.find(x => x.id === b.dataset.supprNote);
  if (!n || !confirm(`Supprimer « ${n.texte} » ?`)) return;
  const { error } = await sb.from('notes_match').delete().eq('id', n.id);
  if (error) return notifier(`Suppression impossible : ${error.message}`, 'erreur');
  etat.notes = etat.notes.filter(x => x.id !== n.id);
  afficher();
});

$('choix-match').addEventListener('change', async (e) => {
  etat.match = etat.matchs.find(m => m.id === e.target.value);
  history.replaceState(null, '', `?match=${etat.match.id}`);
  await chargerMatch();
});

await charger();
