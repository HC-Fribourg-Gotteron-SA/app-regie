// Match du jour : ce que la Régie doit changer dans Colosseo (depuis le match précédent),
// puis toute la playlist pour vérifier. Les playlists Colosseo restent d'un match à l'autre.
import { sb, exigerConnexion, echapper, dateCourte, notifier, toutesLesLignes, libelleFichier, taille, devinerVersion } from './app.js';
import { calculerChangements, consigne, PASSE, changementDeVersion } from './changements.js';
import { confirmerSuppressionProduit, boutonSupprimerFichier, confirmerSuppressionFichier } from './traitement.js';

const { profil } = await exigerConnexion({ roles: ['regie', 'admin'] });
const estRegie = ['regie', 'admin'].includes(profil.role);

const $ = (id) => document.getElementById(id);
const court = (nom) => (nom || '').replace(/^Action scene – /, 'Action scene · ');
const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const heure = (d) => new Date(d).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
const jour = (d) => new Date(d).toLocaleDateString('fr-CH', { weekday: 'long', day: '2-digit', month: '2-digit' });
const ICONES = { ajouter: '➕', enlever: '➖', visuel: '🔄' };
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
                 produit:produits(id, nom, categorie, ordre, famille, support, actif, lie_a_produit_id),
                 contrat:contrats(sponsor_id, sponsor:sponsors(nom)), demande_id,
                 matchs:lignes_matchs(match:matchs(date_heure, adversaire)),
                 emplacements:lignes_emplacements(emplacement:emplacements(anneau, zone, position))`).range(de, a)),
      toutesLesLignes((de, a) => sb.from('assets').select('id, nom_visuel, variante, match_id, storage_path').range(de, a)),
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
    // produits de demandes pas encore ajoutés sur leur fiche (« * » : aussi les versions FR / DE des migrations 34 / 36)
    sb.from('demandes_produits')
      .select(`*,
               produit:produits(id, nom, ordre, famille, support),
               demande:demandes!inner(id, type, statut, created_at, sponsor_nom_saisi, sponsor:sponsors(nom))`)
      .is('traite_le', null).neq('demande.statut', 'traitee'),
    // demandes traitées : restent affichées, grisées (demandé par Léa). Celles traitées depuis le match précédent
    // (jusqu'au lendemain de ce match), ET celles vendues pour CE match même traitées plus tôt (corrigé le 03.10.2026 :
    // une demande pour le 7.10 traitée avant le match du 3.10 disparaissait au lieu d'être grisée)
    sb.from('demandes_produits')
      .select(`demande_id, produit_id, type_vente, dates_matchs, avec_son, avec_anneau, duree_s, remarque_sponsoring,
               ligne_id, suite, traite_le, traite_par,
               produit:produits(id, nom, ordre, famille, support),
               demande:demandes!inner(id, type, statut, created_at, sponsor_nom_saisi, sponsor:sponsors(nom))`)
      .not('traite_le', 'is', null)
      .or(`and(traite_le.gte."${(etat.precedent ? new Date(etat.precedent.date_heure) : new Date(new Date(m.date_heure) - 7 * 864e5)).toISOString()}",`
        + `traite_le.lte."${new Date(new Date(m.date_heure).getTime() + 864e5).toISOString()}"),dates_matchs.cs.{${jourLocal(m.date_heure)}}`),
  ]);
  etat.traitees = new Map((traitees || []).filter(t => t.ligne_id).map(t => [t.ligne_id, t]));
  etat.tableFait = !error;
  etat.fait = new Map((fait || []).map(f => [`${f.ligne_id}|${f.action}`, f]));
  etat.tableNotes = !eNotes;          // false si la migration 26 n'est pas encore exécutée
  etat.notes = notes || [];
  // celles qui concernent ce match : pour la saison, ou vendues pour ce jour de match
  const jourMatch = jourLocal(m.date_heure);
  etat.attente = attente || [];
  const pourCeMatch = (a) => a.type_vente !== 'match' || (a.dates_matchs || []).includes(jourMatch);
  etat.demandesMatch = etat.attente.filter(pourCeMatch);
  // déjà traitées pour ce match : affichées grisées sous les demandes à traiter (demandé par Léa)
  etat.demandesFaites = (traitees || []).filter(pourCeMatch);
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
    // Pub pause tiers : avec son + anneau, avec son, sans son + anneau, sans son sans anneau (décidé par Léa)
    groupe: l?.produit?.lie_a_produit_id && /pause tiers/i.test(l.produit.nom)
      ? (l.avec_son ? 0 : 2) + (etat.lignes.get(l.ligne_couplee_id)?.produit?.actif === false ? 0 : 1) : 0,
    empl: (l?.emplacements || []).map(e => e.emplacement).filter(Boolean).map(e => `${e.anneau}-${e.zone}-${e.position}`),
    video: l?.produit?.support === 'Vidéotron' && !anneauDe,
  };
}
// Visuel de l'anneau LED d'une Pub pause tiers pour ce match
const assetAnneau = (l) => l?.ligne_couplee_id && etat.passagesCe.find(p => p.ligne_id === l.ligne_couplee_id)?.asset_id;
const consigneAnneau = (action) => ({ ajouter: 'Ajouter l’anneau LED', enlever: 'Enlever l’anneau LED',
  visuel: 'Remplacer le visuel de l’anneau LED' })[action];
// Ce que la Régie fait dans Colosseo (langue du soir : « Activer DE · désactiver FR », ou pour l'anneau LED seul
// — ex. la Mobilière — « Anneau LED : activer DE · désactiver FR »)
const texteConsigne = (i) => i.version
  ? (i.anneau ? `Anneau LED : ${i.version.charAt(0).toLowerCase()}${i.version.slice(1)}` : i.version)
  : (i.anneau ? consigneAnneau(i.action) : consigne(i.action, i.famille, i.categorie, i.produit));
const nomVisuel = (id) => { const a = etat.assets.get(id); return a ? a.nom_visuel + (a.variante ? ` (${a.variante})` : '') : ''; };
const trier = (a, b) => a.ordre - b.ordre || a.produit.localeCompare(b.produit)
  || (a.groupe ?? 0) - (b.groupe ?? 0) || a.priorite - b.priorite;

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------
// Comment la Régie travaille le jour du match (expliqué par Léa le 01.10.2026) :
//   1. Demandes à traiter : on ajoute le sponsor dans l'outil ET dans Colosseo en même temps
//      (nouveau sponsor à la saison, nouveau logo / vidéo, retrait…). Traitée = disparaît d'ici.
//   2. Ventes au match (anciennement « Spécial de ce match », nom refusé par Léa) : ce qui est vendu pour un match précis (Sponsor du match, action scene…) est déjà
//      dans l'outil ; il reste à l'ajouter dans Colosseo ce soir, et à enlever le spécial du match précédent → « Fait ».
//   Les changements à la saison faits sur une fiche (retrait, case À l'écran) ne sont pas listés : on fait
//   Colosseo au moment où on les fait dans l'outil.
function afficher() {
  // spécial = diffusions vendues « au match » (l'anneau de la pause tiers suit sa Pub pause tiers)
  const auMatch = (inf) => inf.l?.type_vente === 'match';
  let changements = etat.changements;
  if (!etat.precedent) {        // pas de match précédent : tout le spécial de ce soir est à ajouter
    changements = etat.passagesCe.filter(p => PASSE.has(p.statut))
      .map(p => ({ action: 'ajouter', ligne_id: p.ligne_id, asset_id: p.asset_id, raison: 'vendu pour ce match' }));
  }
  // + langue du soir (FR / DE un match sur deux), même pour une diffusion à la saison
  const version = (c) => c.action === 'visuel'
    ? changementDeVersion(etat.assets.get(c.asset_id), etat.assets.get(c.ancien_asset_id)) : null;
  const tous = changements.map(c => ({ ...c, ...infos(c.ligne_id), fait: etat.fait.get(`${c.ligne_id}|${c.action}`),
                                       ...(version(c) ? { raison: version(c).raison, version: version(c).consigne } : {}) }))
    .filter(i => auMatch(i) || i.version);
  // anneau ajouté / enlevé en même temps que sa Pub pause tiers : une seule ligne (« avec anneau LED »)
  const pubs = new Set(tous.filter(i => !i.anneau).map(i => `${i.ligne_id}|${i.action}`));
  const items = tous.filter(i => !(i.anneau && i.action !== 'visuel' && pubs.has(`${i.pubId}|${i.action}`)))
    .sort((a, b) => trier(a, b) || (a.anneau - b.anneau) || ORDRE_ACTIONS[a.action] - ORDRE_ACTIONS[b.action]);
  etat.items = items;
  // à traiter, puis déjà traitées (grisées, restent visibles pour le suivi)
  const versItem = (faite) => (a) => ({
    action: 'demande', dp: a, faite, ligne_id: `${a.demande_id}|${a.produit_id}`,
    produit: court(a.produit?.nom), ordre: ordreProduit(a.produit), famille: a.produit?.famille,
    sponsor: a.demande?.sponsor?.nom || a.demande?.sponsor_nom_saisi || '—', priorite: faite ? 1 : 0,
  });
  const demandes = etat.demandesMatch.map(versItem(false)).sort(trier);
  const toutesDemandes = demandes.concat((etat.demandesFaites || []).map(versItem(true))).sort(trier);
  const reste = items.filter(i => !i.fait).length;
  const taches = etat.notes.filter(n => n.type === 'tache' && !n.fait).length;

  // bilan en une ligne : demandes et tâches seulement (la phrase sur le bloc 2 a été retirée, demandé par Léa)
  const morceaux = [
    demandes.length ? `${demandes.length} demande${demandes.length > 1 ? 's' : ''} à traiter` : '',
    taches ? `${taches} tâche${taches > 1 ? 's' : ''} pour ce soir` : '',
  ].filter(Boolean);
  const bilan = $('bilan');
  bilan.hidden = !morceaux.length && reste > 0;      // il reste du travail dans le bloc 2 : pas de « Tout est prêt »
  bilan.className = `carte bilan-match ${morceaux.length ? 'bilan-a-faire' : 'bilan-pret'}`;
  bilan.innerHTML = morceaux.length
    ? `<strong>${morceaux.join(' · ')}</strong>`
    : '<strong>✓ Tout est prêt</strong> <span class="doux">— rien à faire dans Colosseo pour ce match.</span>';
  afficherNotes();
  if (!etat.tableFait && estRegie && items.length) {
    bilan.innerHTML += '<p class="message message-erreur petit" style="margin:.6rem 0 0">Les cases « Fait » ne s’enregistrent pas encore : exécutez la migration 22 dans Supabase.</p>';
  }

  // 1. demandes à traiter, groupées par produit
  $('bloc-demandes').hidden = !toutesDemandes.length;
  $('nb-demandes').textContent = toutesDemandes.length ? `· ${demandes.length} / ${toutesDemandes.length} à traiter` : '';
  $('demandes').innerHTML = [...grouper(toutesDemandes)].map(([produit, liste]) => `
    <div class="carte groupe-colosseo">
      <div class="groupe-titre">${echapper(produit)}</div>
      ${liste.map(carteDemande).join('')}
    </div>`).join('');

  // 2. ventes au match, groupées par produit
  $('bloc-a-faire').hidden = !items.length;
  $('nb-a-faire').textContent = items.length ? `· ${reste} / ${items.length} à faire` : '';
  $('a-faire').innerHTML = [...grouper(items)].map(([produit, liste]) => `
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

// Demande à traiter : dans l'outil (même fenêtre que dans Demandes) et dans Colosseo en même temps
const VERBE_DEMANDE = { suppression: 'Retrait demandé', changement_visuel: 'Nouveau visuel reçu' };
const BOUTON_DEMANDE = { suppression: 'Retirer', changement_visuel: 'Changer le visuel' };
const SUITE_FAITE = { ajoute: 'Ajouté', visuel: 'Nouveau visuel mis', retire: 'Retiré', ignore: 'Ignoré' };
// FR / DE un match sur deux (migrations 34 / 36) : version de chaque fichier de la demande, et langue à activer.
// La demande se traite le jour du match : l'alternance commence au prochain match (ce soir si c'est ce match).
// (fichier ajouté après la demande : pas de version enregistrée, on la devine d'après son nom)
const versionFichier = (a, f) => a.versions?.[`${f.role}__${f.nom}`] || (f.role === 'visuel' ? a.versions?.[f.nom] : '')
  || ((f.role === 'anneau' ? a.rotation_anneau : a.rotation) === 'alterner' ? devinerVersion(f.nom) : '');
function texteAlternance(a) {
  const prochain = etat.matchs.find(m => new Date(m.date_heure).toDateString() === new Date().toDateString()
    || new Date(m.date_heure) >= new Date());
  const ceSoir = prochain?.id === etat.match.id;
  return [['Vidéo', a.rotation, a.ordre_versions], ['Anneau LED', a.rotation_anneau, a.ordre_versions_anneau]]
    .filter(([, rotation, ordre]) => rotation === 'alterner' && ordre?.length >= 2)
    .map(([quoi, , ordre]) => `<div class="petit" style="margin-top:.2rem">🔁 <strong>${quoi} : ${ceSoir
      ? `activer ${echapper(ordre[0])} ce soir` : `${echapper(ordre[0])} au premier match`}</strong>
      <span class="doux">· puis ${ordre.slice(1).map(echapper).join(' / ')} au match suivant, un match sur deux (mettre les ${ordre.length} versions dans Colosseo)</span></div>`)
    .join('');
}

function carteDemande(i) {
  const a = i.dp, d = a.demande || {};
  if (i.faite) {                 // déjà traitée : grisée, reste visible
    return `
    <div class="changement changement-demande est-fait">
      <div class="changement-icone" aria-hidden="true">📨</div>
      <div class="changement-texte">
        <div><span class="changement-verbe">${VERBE_DEMANDE[d.type] || 'Nouveau'}</span> · <strong>${echapper(i.sponsor)}</strong></div>
        <div class="petit doux">✓ ${SUITE_FAITE[a.suite] || 'Traité'} par ${echapper(etat.personnes.get(a.traite_par) || '—')}
          le ${dateCourte(a.traite_le)} à ${heure(a.traite_le)}</div>
      </div>
      <div class="changement-actions">
        <a class="btn btn-discret" href="demandes.html?id=${a.demande_id}&retour=${encodeURIComponent(`match-du-jour.html?match=${etat.match.id}`)}">Voir</a>
      </div>
    </div>`;
  }
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
        <div><span class="changement-verbe">${VERBE_DEMANDE[d.type] || 'Nouveau'}</span> · <strong>${echapper(i.sponsor)}</strong>
          <span class="doux petit">(demande reçue le ${dateCourte(d.created_at)})</span></div>
        <div class="petit">${details.join(' · ')}</div>
        ${a.remarque_sponsoring ? `<div class="petit doux">Sponsoring : ${echapper(a.remarque_sponsoring)}</div>` : ''}
        ${d.type === 'suppression' ? '' : texteAlternance(a)}
        ${d.type === 'suppression' ? '' : (a.fichiers || []).length ? `
          <ul class="liste-fichiers liste-documents">${a.fichiers.map(f => `
            <li><span><strong>${echapper(libelleFichier(a.produit, f.role))}</strong> : ${echapper(f.nom)}
                ${versionFichier(a, f) ? ` <span class="badge">${echapper(versionFichier(a, f))}</span>` : ''}
                ${f.taille ? `<span class="doux petit">${taille(f.taille)}</span>` : ''}</span>
              <span><button type="button" class="btn" data-telecharger="${echapper(f.storage_path)}">Télécharger</button>
                ${estRegie ? boutonSupprimerFichier(f.storage_path) : ''}</span></li>`).join('')}
          </ul>`
          : '<div class="petit" style="margin-top:.3rem">⏳ <strong>Fichier à venir</strong> <span class="doux">(pas encore envoyé par le Sponsoring)</span></div>'}
      </div>
      <div class="changement-actions">
        ${estRegie ? `<a class="btn btn-principal" title="Ouvrir la demande pour la traiter (comme dans Demandes)"
            href="demandes.html?id=${a.demande_id}&retour=${encodeURIComponent(`match-du-jour.html?match=${etat.match.id}`)}">${BOUTON_DEMANDE[d.type] || 'Ajouter'}</a>
            <button type="button" class="btn btn-discret btn-danger" data-supprimer-demande="${a.demande_id}|${a.produit_id}"
              title="Erreur ou demande qui ne se fera pas">Supprimer</button>`
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
      <div class="changement-icone" aria-hidden="true">${i.version ? '🔁' : ICONES[i.action]}</div>
      <div class="changement-texte">
        <div><span class="changement-verbe">${texteConsigne(i)}</span> · <strong>${echapper(i.sponsor)}</strong>
          <span class="doux petit">(${echapper(i.raison)})</span></div>
        ${details.length ? `<div class="petit">${details.join(' · ')}</div>` : ''}
        ${visuel ? `<div class="petit">${visuel}${sansFichier}</div>` : ''}
        ${fichiersDossier}
        ${i.action === 'enlever' ? '<div class="petit">Dans l’outil : enlevé automatiquement · <strong>Dans Colosseo : à enlever à la main</strong>, puis cocher « Fait »</div>' : ''}
        ${i.l?.consignes && i.action !== 'enlever' ? `<div class="petit doux">Remarque : ${echapper(i.l.consignes)}</div>` : ''}
        ${fait ? `<div class="petit doux">Fait dans Colosseo par ${echapper(etat.personnes.get(fait.fait_par) || '—')} à ${heure(fait.fait_le)}</div>` : ''}
      </div>
      <div class="changement-actions">
        ${a?.storage_path && i.action !== 'enlever' ? `<button type="button" class="btn btn-discret" data-telecharger="${echapper(a.storage_path)}">Télécharger</button>` : ''}
        ${i.l ? `<button type="button" class="btn btn-discret" data-ouvrir="${i.ligne_id}|${i.action}"
          title="Fichiers, matchs, remarques…">Détails</button>` : ''}
        ${estRegie && i.l && i.action !== 'enlever' && !fait ? `<button type="button" class="btn btn-discret btn-danger"
          data-supprimer-ligne="${i.anneau ? i.pubId : i.ligne_id}" title="Erreur, ne se fera pas : supprimer cette diffusion">Supprimer</button>` : ''}
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
    ${chemin ? `<span><button type="button" class="btn" data-telecharger="${echapper(chemin)}">Télécharger</button>
      ${estRegie ? boutonSupprimerFichier(chemin) : ''}</span>` : ''}</li>`;
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

  $('d-surtitre').textContent = i.version ? texteConsigne(i) : i.anneau ? consigneAnneau(i.action) : TITRE_ACTION[i.action];
  $('d-titre').textContent = i.sponsor;
  // état POUR CE MATCH (et pas la case « À l'écran » de la fiche, qui prêtait à confusion pour un retrait)
  const passeCeMatch = etat.passagesCe.some(p => p.ligne_id === (i.anneau ? l.ligne_couplee_id : l.id) && PASSE.has(p.statut));
  $('d-sous-titre').innerHTML = (passeCeMatch ? '<span class="etat etat-ecran">Passe à ce match</span>'
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
                  : texteConsigne(i)}
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
                  <div class="bloc-texte petit">${echapper(i.raison || '—')}${l.motif_suspension ? `<br>${echapper(l.motif_suspension)}` : ''}${i.action === 'enlever'
                    ? '<br>Dans l’outil : enlevé automatiquement. Dans Colosseo : à enlever à la main.' : ''}</div>
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

// Supprimer un fichier qui n'est pas le bon (carte d'une demande ou fenêtre « Détails ») : pas la demande
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-supprimer-fichier]');
  if (!b) return;
  const ouvert = etat.ouvert;
  b.disabled = true;
  if (await confirmerSuppressionFichier(b.dataset.supprimerFichier)) {
    await chargerMatch();
    if (ouvert && (etat.items || []).some(x => `${x.ligne_id}|${x.action}` === ouvert)) ouvrirChangement(ouvert);
  }
  b.disabled = false;
});

// Supprimer (erreur, ne se fera pas) — demandé par Léa le 02.10.2026 : ni « traité » ni « fait »
document.addEventListener('click', async (e) => {
  const bd = e.target.closest('[data-supprimer-demande]');
  if (bd) {
    const [demandeId, produitId] = bd.dataset.supprimerDemande.split('|');
    const a = etat.demandesMatch.find(x => x.demande_id === demandeId && x.produit_id === produitId);
    bd.disabled = true;
    const fait = await confirmerSuppressionProduit({ demandeId, produitId, produitNom: a?.produit?.nom || 'ce produit',
      sponsorNom: a?.demande?.sponsor?.nom || a?.demande?.sponsor_nom_saisi || 'ce sponsor' });
    bd.disabled = false;
    if (fait) await chargerMatch();
    return;
  }
  // diffusion « au match » créée par erreur : annulée (disparaît des fiches et du match, reste dans l'historique)
  const bl = e.target.closest('[data-supprimer-ligne]');
  if (!bl) return;
  const l = etat.lignes.get(bl.dataset.supprimerLigne);
  if (!l) return;
  if (!confirm(`Supprimer ${l.contrat?.sponsor?.nom || 'ce sponsor'} de « ${l.produit?.nom || 'ce produit'} » ?\n\n`
    + 'À utiliser pour une erreur ou quelque chose qui ne se fera pas : la diffusion est annulée'
    + `${l.ligne_couplee_id ? ' (anneau LED compris)' : ''} et disparaît de l’outil, pour ce match et les suivants.`)) return;
  bl.disabled = true;
  const { error } = await sb.from('lignes_vendues').update({ statut: 'annule' }).in('id', [l.id, l.ligne_couplee_id].filter(Boolean));
  bl.disabled = false;
  if (error) return notifier(`Suppression impossible : ${error.message}`, 'erreur');
  notifier('Diffusion supprimée');
  await charger();
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
