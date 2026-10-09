import { sb, exigerConnexion, echapper, dateCourte, notifier, taille, debounce,
         descriptionProduit, specsProduit, CATEGORIES_UNE_PAGE, lienCategorie, ongletsProduits, etatAuMatch } from './app.js';
import { carteTraitement, CHAMPS_A_TRAITER, boutonSupprimerFichier, confirmerSuppressionFichier } from './traitement.js';

const { profil } = await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });
const estRegie = ['regie', 'admin'].includes(profil.role);

const $ = (id) => document.getElementById(id);
const idProduit = new URLSearchParams(location.search).get('id');

// « Fiches en onglets » (produit.html sans id) : on rouvre le dernier onglet, sinon le premier produit
if (!idProduit) {
  let dernier = null;
  try { dernier = localStorage.getItem('dernier-onglet'); } catch { /* stockage indisponible */ }
  if (!dernier) {
    const { data } = await sb.from('produits').select('id, categorie').eq('actif', true)
      .order('ordre').order('categorie').order('nom').limit(1).maybeSingle();
    dernier = data ? (CATEGORIES_UNE_PAGE.has(data.categorie) ? lienCategorie(data.categorie) : `produit.html?id=${data.id}`) : 'produits.html';
  }
  location.replace(dernier);
  await new Promise(() => {});          // la page s'arrête là
}
ongletsProduits($('onglets-produits'), { produit: idProduit });
try { localStorage.setItem('dernier-onglet', `produit.html?id=${idProduit}`); } catch { /* stockage indisponible */ }

const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

const STATUT_ASSET = { a_valider: ['à valider', 'statut-en_cours'], valide: ['validé', 'statut-traitee'], refuse: ['refusé', 'statut-question'] };

const etat = {
  p: null,                 // le produit
  anneau: null,            // produit Anneau LED couplé (Pub pause tiers)
  attente: [],             // demandes à ajouter (demandes_produits + demande)
  lignes: [],              // diffusions en cours sur ce produit
  adversaires: new Map(),
  emplacements: [],        // plan LED (produits 3M / 6M)
  personnes: new Map(),    // id -> nom
  autres: [],              // diffusions d'un autre produit sur la bande de ce produit (LED 3M sur la bande 6M)
  passees: [],             // sponsors au match dont tous les matchs sont passés (section « Matchs passés »)
  couplees: new Map(),     // id ligne couplée (anneau de la pause tiers) -> { assets }
  slides: [],              // vidéos des slides diffusées dans ce produit (Pub pause tiers), calculées
  ouverte: null,           // diffusion affichée dans la fenêtre de détail
};

// ---------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------
const CHAMPS_LIGNE = `id, produit_id, type_vente, statut, avec_son, duree_s, occurrences, consignes, date_fin, created_at, ligne_couplee_id, regle_rotation,
  priorite, validee, validee_le, validee_par, suspendue, motif_suspension, visuel_attendu, demande_id, created_by,
  produit:produits(nom), contrat:contrats(sponsor:sponsors(id, nom)),
  matchs:lignes_matchs(match:matchs(date_heure, adversaire)),
  emplacements:lignes_emplacements(emplacement:emplacements(anneau, zone, position)),
  assets(id, nom_visuel, statut, version, variante, depose_le, valide_le, motif_refus, storage_path, mime)`;

// Diffusion de ce produit, ou d'un autre produit affichée ici (LED 3M sur la bande 6M)
const trouverLigne = (id) => etat.lignes.find(x => x.id === id) || etat.autres.find(x => x.id === id)
  || etat.passees.find(x => x.id === id);

// Pub pause tiers : 1 avec son + anneau LED, 2 avec son sans anneau, 3 sans son + anneau, 4 sans son sans anneau
const groupePauseTiers = (l) => (l.avec_son ? 0 : 2) + (l.ligne_couplee_id ? 0 : 1);
// groupe d'une diffusion dans la liste du produit (Pub pause tiers : les 4 groupes ; autres produits : un seul)
const groupeDe = (l) => etat.p?.lie_a_produit_id && /pause tiers/i.test(etat.p.nom) ? groupePauseTiers(l) : 0;

// Vendu « au match » et tous ses matchs sont passés (avant aujourd'hui)
function matchsTousPasses(l) {
  if (l.type_vente !== 'match') return false;
  const dates = (l.matchs || []).map(m => m.match?.date_heure).filter(Boolean);
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  return dates.length > 0 && dates.every(d => new Date(d) < debutJour);
}

async function charger() {
  const [{ data: p, error }, { data: attente }, { data: lignes }, { data: matchs }] = await Promise.all([
    sb.from('produits').select('*').eq('id', idProduit).maybeSingle(),
    sb.from('demandes_produits').select(CHAMPS_A_TRAITER)
      .eq('produit_id', idProduit).is('traite_le', null).neq('demande.statut', 'traitee'),
    sb.from('lignes_vendues').select(CHAMPS_LIGNE).eq('produit_id', idProduit).not('statut', 'in', '(annule,termine)'),
    sb.from('matchs').select('date_heure, adversaire'),
  ]);
  if (!etat.personnes.size) {
    const { data: personnes } = await sb.from('profiles').select('id, nom, email');
    etat.personnes = new Map((personnes || []).map(x => [x.id, x.nom || x.email.split('@')[0]]));
  }
  if (error || !p) { $('p-nom').textContent = 'Produit introuvable'; if (error) notifier(error.message, 'erreur'); return; }

  etat.p = p;
  etat.attente = (attente || []).sort((a, b) => new Date(a.demande.created_at) - new Date(b.demande.created_at));
  // ordre de diffusion (priorite) ; sans rang : à la fin, dans l'ordre de création
  // Pub pause tiers : d'abord par groupe (décidé par Léa le 01.10.2026). Les autres produits avec anneau
  // (migration 35 : tout le vidéotron) gardent simplement l'ordre de diffusion.
  const groupe = groupeDe;
  const triees = (lignes || []).sort((a, b) => groupe(a) - groupe(b)
    || (a.priorite ?? 1e9) - (b.priorite ?? 1e9) || new Date(a.created_at) - new Date(b.created_at));
  // sponsors « au match » dont tous les matchs sont passés : rangés dans « Matchs passés » (historique)
  etat.passees = triees.filter(matchsTousPasses);
  etat.lignes = triees.filter(l => !matchsTousPasses(l));
  etat.adversaires = new Map((matchs || []).map(m => [jourLocal(m.date_heure), m.adversaire]));
  if (p.lie_a_produit_id) {
    const { data } = await sb.from('produits').select('*').eq('id', p.lie_a_produit_id).maybeSingle();
    etat.anneau = data;
  }
  // Anneau LED compris dans la Pub pause tiers : ses visuels sont sur la ligne couplée
  const couplees = etat.lignes.map(l => l.ligne_couplee_id).filter(Boolean);
  etat.couplees = new Map();
  if (couplees.length) {
    const { data } = await sb.from('lignes_vendues')
      .select('id, regle_rotation, assets(id, nom_visuel, statut, version, variante, depose_le, storage_path, mime)').in('id', couplees);
    etat.couplees = new Map((data || []).map(c => [c.id, c]));
  }
  await chargerSlides(p);
  if (p.famille === 'emplacement') {          // plan : placer les logos (Régie) et liste par emplacement (tous)
    const { data } = await sb.from('v_plan_emplacements').select('*').order('anneau').order('position');
    // une rangée par emplacement (on garde celle qui a un sponsor)
    const parEmpl = new Map();
    for (const e of data || []) if (!parEmpl.get(e.emplacement_id)?.ligne_id) parEmpl.set(e.emplacement_id, e);
    etat.emplacements = [...parEmpl.values()];
    // sponsors d'un autre produit sur cette bande (LED 3M sur la bande 6M) : vraies diffusions, cliquables
    const ici = new Set(etat.lignes.map(l => l.id));
    const autres = [...new Set(etat.emplacements.map(e => e.ligne_id).filter(id => id && !ici.has(id)))];
    etat.autres = [];
    if (autres.length) {
      const { data: lignesAutres } = await sb.from('lignes_vendues').select(CHAMPS_LIGNE).in('id', autres);
      etat.autres = lignesAutres || [];
    }
  }

  document.title = `${p.nom} — Sponsoring ↔ Régie`;
  $('p-categorie').textContent = p.categorie || '';
  // catégorie sur une seule page (Action scenes) : le retour ramène à cette page
  if (CATEGORIES_UNE_PAGE.has(p.categorie)) {
    const retour = document.querySelector('.lien-retour');
    if (retour) { retour.href = lienCategorie(p.categorie); retour.textContent = `← ${p.categorie}`; retour.hidden = false; }
  }
  $('p-nom').textContent = p.nom;
  $('p-description').textContent = [descriptionProduit(p),
    p.capacite_s ? `max ${Math.round(p.capacite_s / 60)} min par match` : ''].filter(Boolean).join(' · ');
  afficherFormat();
  if (estRegie) {
    $('modifier-produit').hidden = false;
    $('modifier-produit').onclick = async () => (await import('./produit-edition.js')).ouvrirEditionProduit(etat.p);
    // sans demande (migration 42) ; pas pour les bandes LED, placées sur le plan des emplacements
    $('ajouter-sponsor').hidden = p.famille === 'emplacement';
    $('ajouter-sponsor').onclick = async () => (await import('./ajout-diffusion.js')).ouvrirAjoutDiffusion(etat.p, charger);
    // PSD des LED / Canva des slides (migration 44)
    if (['emplacement', 'slide'].includes(p.famille)) {
      import('./fichiers-travail.js').then(m => m.afficherFichiersTravail($('bloc-travail'), p));
    }
  }

  afficherAttente();
  afficherLignes();
}

// ---------------------------------------------------------------------
// Format attendu des fichiers (media kit, migration 32) : affiché à tous, modifiable par la Régie
// ---------------------------------------------------------------------
function afficherFormat(edition = false) {
  const p = etat.p;
  const zone = $('p-format');
  const spec = specsProduit(p);
  const specAnneau = etat.anneau ? specsProduit(etat.anneau) : '';
  if (!edition) {
    zone.hidden = !spec && !estRegie;
    zone.innerHTML = `
      <span><strong>Format attendu :</strong> ${spec ? echapper(spec) : '<span class="doux">pas encore renseigné</span>'}</span>
      ${p.remarque_format ? `<span class="doux">· ${echapper(p.remarque_format)}</span>` : ''}
      ${specAnneau ? `<span class="doux">· anneau LED : ${echapper(specAnneau)}</span>` : ''}
      ${estRegie ? '<button type="button" class="btn btn-discret petit" id="modifier-format">✏️ Format</button>' : ''}`;
    $('modifier-format')?.addEventListener('click', () => afficherFormat(true));
    return;
  }
  zone.hidden = false;
  zone.innerHTML = `
    <form class="form-format" id="form-format">
      <label>Largeur (px)<input type="number" min="1" name="largeur_px" value="${p.largeur_px ?? ''}"></label>
      <label>Hauteur (px)<input type="number" min="1" name="hauteur_px" value="${p.hauteur_px ?? ''}"></label>
      <label>Formats<input type="text" name="formats" value="${echapper((p.formats || []).join(', '))}" placeholder="png, jpg, mp4"></label>
      <label>Durée max (s)<input type="number" min="1" name="duree_max_s" value="${p.duree_max_s ?? ''}"></label>
      <label class="format-remarque">Remarque<input type="text" name="remarque_format" value="${echapper(p.remarque_format || '')}"></label>
      <div class="format-actions">
        <button type="submit" class="btn">Enregistrer</button>
        <button type="button" class="btn btn-discret" id="annuler-format">Annuler</button>
      </div>
    </form>`;
  $('annuler-format').addEventListener('click', () => afficherFormat());
  $('form-format').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nombre = (n) => { const v = parseInt(f.get(n), 10); return Number.isFinite(v) && v > 0 ? v : null; };
    const formats = String(f.get('formats') || '').toLowerCase().split(/[\s,;]+/).map(x => x.replace(/^\./, '')).filter(Boolean);
    const maj = { largeur_px: nombre('largeur_px'), hauteur_px: nombre('hauteur_px'), duree_max_s: nombre('duree_max_s'),
      formats: formats.length ? [...new Set(formats)] : null, remarque_format: String(f.get('remarque_format') || '').trim() || null };
    const { error } = await sb.from('produits').update(maj).eq('id', p.id);
    if (error) {
      notifier(/remarque_format/.test(error.message) ? 'Exécutez d’abord la migration 32 dans Supabase.' : error.message, 'erreur');
      return;
    }
    Object.assign(etat.p, maj);
    notifier('Format enregistré.');
    afficherFormat();
  });
}

// ---------------------------------------------------------------------
// À ajouter : la même carte que dans le détail d'une demande (traitement.js)
// ---------------------------------------------------------------------
function afficherAttente() {
  $('bloc-a-ajouter').hidden = !etat.attente.length;
  $('nb-a-ajouter').textContent = etat.attente.length;
  $('a-ajouter').innerHTML = etat.attente.map(a => `<div data-demande="${a.demande_id}"></div>`).join('');
  for (const a of etat.attente) {
    carteTraitement(document.querySelector(`#a-ajouter [data-demande="${a.demande_id}"]`), a,
      { estRegie, mode: 'produit', apres: charger });
  }
}

// ---------------------------------------------------------------------
// Sur ce produit : les sponsors et leurs diffusions
// ---------------------------------------------------------------------
function afficherLignes() {
  const p = etat.p;
  const video = p.famille === 'temps' && p.support === 'Vidéotron';
  const cols = [
    ['N°', true], ['État', true], ['Sponsor', true], ['Quand', true], ['Son', video],
    ['Emplacement', p.famille === 'emplacement'], [p.lie_a_produit_id ? 'Visuel écran' : 'Visuel', true],
    ['Anneau LED', !!p.lie_a_produit_id], ['Remarques', true],
  ].filter(([, v]) => v).map(([t]) => t);
  $('entete-lignes').innerHTML = `<tr>${cols.map(t => `<th${t === 'Remarques' ? ' class="col-optionnelle"' : ''}>${t}</th>`).join('')}</tr>`;

  const sponsors = new Set(etat.lignes.map(l => l.contrat?.sponsor?.id));
  $('nb-sponsors').textContent = `· ${sponsors.size} sponsor${sponsors.size > 1 ? 's' : ''}`;
  $('vide').hidden = etat.lignes.length > 0 || etat.slides.length > 0 || etat.emplacements.length > 0;

  // Matchs passés (repliés en bas)
  $('bloc-passes').hidden = !etat.passees.length;
  $('nb-passes').textContent = `(${etat.passees.length})`;
  $('entete-passes').innerHTML = $('entete-lignes').innerHTML;
  $('lignes-passes').innerHTML = etat.passees.map((l, rang) => rangeeLigne(l, rang, cols)).join('');

  if (p.famille === 'emplacement' && etat.emplacements.length) {
    $('lignes').innerHTML = rangeesEmplacements(cols);
    return;
  }
  $('lignes').innerHTML = etat.lignes.map((l, rang) => rangeeLigne(l, rang, cols)).join('') + rangeesSlides(cols, etat.lignes.length);
  filtrer();
}

// ---------------------------------------------------------------------
// Recherche d'un sponsor : filtre la liste de ce produit (Banner HCFG libres compris : « banner »)
// et montre les autres produits où il se trouve
// ---------------------------------------------------------------------
function normaliser(t) { return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

function filtrer() {
  const q = normaliser($('recherche').value.trim());
  let trouves = 0;
  for (const tr of document.querySelectorAll('#lignes tr, #lignes-passes tr')) {
    const ok = !q || (tr.dataset.sponsor ?? normaliser(tr.textContent)).includes(q);
    tr.hidden = q && (!ok || tr.classList.contains('rangee-titre'));
    if (q && ok && tr.dataset.sponsor) trouves++;
  }
  // un sponsor trouvé dans « Matchs passés » : on déplie
  if (q && document.querySelector('#lignes-passes tr[data-ligne]:not([hidden])')) $('bloc-passes').open = true;
  $('nb-trouves').textContent = q ? (trouves ? `${trouves} trouvé${trouves > 1 ? 's' : ''} sur ce produit` : 'pas sur ce produit') : '';
}

async function chercherAilleurs() {
  const q = $('recherche').value.trim();
  const zone = $('aussi-sur');
  if (q.length < 2) { zone.hidden = true; return; }
  const { data: sponsors } = await sb.rpc('rechercher_sponsors', { q, nb: 5 });
  const ids = (sponsors || []).map(s => s.id);
  if (!ids.length) { if (q === $('recherche').value.trim()) zone.hidden = true; return; }
  const { data: lignes } = await sb.from('lignes_vendues')
    .select('produit_id, produit:produits(nom, categorie, actif, ordre), contrat:contrats!inner(sponsor_id)')
    .in('contrat.sponsor_id', ids).not('statut', 'in', '(annule,termine)');
  if (q !== $('recherche').value.trim()) return;           // on a tapé autre chose entre-temps
  // par sponsor : ses autres produits (actifs ; l'anneau de la pause tiers fait partie de la Pub pause tiers)
  const parSponsor = sponsors.map(s => {
    const produits = new Map();
    for (const l of lignes || []) {
      if (l.contrat.sponsor_id !== s.id || !l.produit?.actif || l.produit_id === idProduit) continue;
      produits.set(l.produit_id, l.produit);
    }
    return { s, produits: [...produits].sort(([, a], [, b]) => (a.ordre ?? 100) - (b.ordre ?? 100) || a.nom.localeCompare(b.nom)) };
  }).filter(x => x.produits.length);
  zone.hidden = !parSponsor.length;
  zone.innerHTML = parSponsor.map(({ s, produits }) => `
    <div><strong>${echapper(s.nom)}</strong> <span class="doux">est aussi sur :</span>
      ${produits.map(([id, p]) => `<a class="badge" href="produit.html?id=${id}&q=${encodeURIComponent(s.nom)}">${echapper(p.nom)}</a>`).join(' ')}
      <a class="petit" href="sponsor.html?id=${s.id}">dossier →</a></div>`).join('');
}

const chercherAilleursPlusTard = debounce(chercherAilleurs, 300);
$('recherche').addEventListener('input', () => { filtrer(); chercherAilleursPlusTard(); });
// arrivé depuis « est aussi sur » : recherche déjà remplie
const qDepart = new URLSearchParams(location.search).get('q');
if (qDepart) { $('recherche').value = qDepart; chercherAilleursPlusTard(); }

// Une diffusion (rang = position dans la liste ; empl = un seul emplacement à afficher, pour les LED 6M)
function rangeeLigne(l, rang, cols, emplUnique = null) {
  const dates = (l.matchs || []).map(m => m.match).filter(Boolean).sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure));
  const quand = l.type_vente === 'saison' ? 'Saison'
    : `<span title="${echapper(dates.map(m => `${dateCourte(m.date_heure)} ${m.adversaire}`).join('\n'))}">${dates.length} match${dates.length > 1 ? 's' : ''}</span>`;
  const empl = emplUnique || (l.emplacements || []).map(e => e.emplacement).filter(Boolean)
    .map(e => `${e.anneau}-${e.zone}-${e.position}`).join(', ');
  const visuelEcran = celluleVisuel(l.assets, l);
  // flèches ↑ ↓ (Régie, 09.10.2026) : seulement dans la liste principale, pas sur les LED (ordre = emplacements)
  const fleches = estRegie && etat.p.famille !== 'emplacement' && etat.lignes[rang]?.id === l.id;
  const voisin = (pas) => {
    const v = etat.lignes[rang + pas];
    return v && groupeDe(v) === groupeDe(l);
  };
  const cellules = {
    'N°': `<span class="ordre-cellule"><span class="doux" title="Ordre de diffusion">${rang + 1}</span>${fleches ? `
      <button type="button" class="btn btn-discret petit" data-deplacer="${l.id}" data-pas="-1" aria-label="Monter" title="Monter" ${voisin(-1) ? '' : 'disabled'}>↑</button><button
        type="button" class="btn btn-discret petit" data-deplacer="${l.id}" data-pas="1" aria-label="Descendre" title="Descendre" ${voisin(1) ? '' : 'disabled'}>↓</button>` : ''}</span>`,
    'État': celluleEtat(l),
    'Sponsor': `<strong>${echapper(l.contrat?.sponsor?.nom || '—')}</strong>${l.produit_id !== etat.p.id
      ? ` <a class="badge" href="produit.html?id=${l.produit_id}" title="Vendu comme ${echapper(l.produit?.nom || '')}">${echapper(l.produit?.nom || '')}</a>` : ''}`,
    'Quand': `${quand}${l.date_fin ? `<div class="doux petit">jusqu'au ${dateCourte(l.date_fin + 'T12:00')}</div>` : ''}`,
    'Son': l.avec_son ? 'avec son' : '<span class="doux">sans</span>',
    'Emplacement': empl || '<span class="badge badge-a-venir">à placer</span>',
    'Visuel': visuelEcran,
    'Visuel écran': visuelEcran,
    'Anneau LED': l.ligne_couplee_id ? `oui${versionsAnneau(etat.couplees.get(l.ligne_couplee_id))}` : '<span class="doux">non</span>',
    'Remarques': estRegie
      ? `<textarea class="remarque-ligne petit" data-remarque-ligne="${l.id}" rows="1"
           placeholder="Ajouter une remarque…">${echapper(l.consignes || '')}</textarea>`
      : `<span class="petit doux">${echapper((l.consignes || '').slice(0, 120))}${(l.consignes || '').length > 120 ? '…' : ''}</span>`,
  };
  return `<tr data-ligne="${l.id}" class="${classeEtat(l)}" data-sponsor="${echapper(normaliser(l.contrat?.sponsor?.nom))}">
    ${cols.map(t => `<td${t === 'Remarques' ? ' class="col-optionnelle"' : ''}>${cellules[t]}</td>`).join('')}</tr>`;
}

// ---------------------------------------------------------------------
// LED 3M / 6M : la liste suit les emplacements, dans l'ordre (comme Airtable).
// Emplacement sans sponsor = Banner HCFG (libre, à vendre). Fiche 3M = bande 3M (A/B),
// fiche 6M = bande 6M (C/D) ; les LED 3M placées sur la bande 6M sont listées à la fin de la fiche 3M.
// ---------------------------------------------------------------------
const bandeDe = (e) => e.bande || (['A', 'B'].includes(e.anneau) ? '3M' : '6M');
const codeEmpl = (e) => `${e.anneau}-${e.zone}-${e.position}`;

function rangeesEmplacements(cols) {
  const bande = /6M/.test(etat.p.nom) ? '6M' : '3M';
  const cases = etat.emplacements.filter(e => bandeDe(e) === bande)
    .sort((a, b) => a.anneau.localeCompare(b.anneau) || a.position - b.position);
  const parId = new Map([...etat.lignes, ...etat.autres].map(l => [l.id, l]));
  const montrees = new Set();
  const cellule = (t) => `<td${t === 'Remarques' ? ' class="col-optionnelle"' : ''}>`;
  const vide = (contenu) => cols.map(t => `${cellule(t)}${contenu[t] ?? ''}</td>`).join('');
  let rang = 0, libres = 0;

  const rangees = cases.map(e => {
    const l = e.ligne_id && parId.get(e.ligne_id);
    if (l) {                                   // sponsor : une rangée par emplacement (LED 6M = 2 rangées au même nom)
      montrees.add(l.id);
      return rangeeLigne(l, rang++, cols, codeEmpl(e));
    }
    if (e.ligne_id) {                          // occupé par un autre produit (ex. LED 3M sur la bande 6M)
      return `<tr class="rangee-libre" data-sponsor="${echapper(normaliser(e.sponsor))}">${vide({ 'N°': `<span class="doux">${++rang}</span>`,
        'Sponsor': `<strong>${echapper(e.sponsor || '—')}</strong> <span class="badge">${echapper(e.produit || '')}</span>`,
        'Emplacement': codeEmpl(e) })}</tr>`;
    }
    if (e.reserve_club) {
      return `<tr class="rangee-libre">${vide({ 'N°': `<span class="doux">${++rang}</span>`,
        'Sponsor': '<span class="doux">Banner HCFG · réservé club</span>', 'Emplacement': codeEmpl(e) })}</tr>`;
    }
    libres++;
    return `<tr class="rangee-libre" title="Emplacement libre : disponible à la vente">${vide({ 'N°': `<span class="doux">${++rang}</span>`,
      'État': '<span class="etat etat-non">libre</span>',
      'Sponsor': '<span class="doux">Banner HCFG</span>', 'Emplacement': codeEmpl(e) })}</tr>`;
  }).join('');

  // lignes de ce produit ailleurs (LED 3M sur la bande 6M) ou pas encore placées
  const autres = etat.lignes.filter(l => !montrees.has(l.id));
  const titre = (texte) => `<tr class="rangee-titre"><td colspan="${cols.length}">${texte}</td></tr>`;
  const surAutreBande = autres.filter(l => (l.emplacements || []).length);
  const aPlacer = autres.filter(l => !(l.emplacements || []).length);
  $('nb-sponsors').textContent += ` · ${libres} Banner HCFG libre${libres > 1 ? 's' : ''}`;
  return rangees
    + (surAutreBande.length ? titre(`${etat.p.nom} placées sur la bande ${bande === '3M' ? '6M' : '3M'}`)
        + surAutreBande.map(l => rangeeLigne(l, rang++, cols)).join('') : '')
    + (aPlacer.length ? titre('À placer') + aPlacer.map(l => rangeeLigne(l, rang++, cols)).join('') : '');
}

// ---------------------------------------------------------------------
// Vidéos des slides (Young Dragons, Ladies) diffusées dans la Pub pause tiers :
// calculées depuis les fiches Slides (logos à l'écran), dans l'ordre d'Airtable, en lecture seule.
// ---------------------------------------------------------------------
const ORDRE_SLIDES = ['Young Dragons Golden', 'Young Dragons Active', 'Young Dragons Club de soutien',
  'Young Dragons Honorary', 'Ladies Legend Members', 'Ladies Ailes du Dragon', 'Ladies Founder Members'];

async function chargerSlides(p) {
  etat.slides = [];
  const { data: produitsSlides } = await sb.from('produits')
    .select('id, nom, categorie, logos_par_slide, duree_par_slide_s').eq('diffuse_dans_produit_id', p.id).eq('actif', true);
  if (!produitsSlides?.length) return;
  const { data: logos } = await sb.from('lignes_vendues').select('produit_id, validee, suspendue')
    .in('produit_id', produitsSlides.map(s => s.id)).not('statut', 'in', '(annule,termine)');
  const rang = (nom) => { const i = ORDRE_SLIDES.indexOf(nom); return i < 0 ? 99 : i; };
  etat.slides = produitsSlides.map(s => {
    const n = (logos || []).filter(l => l.produit_id === s.id && l.validee && !l.suspendue).length;
    const nbSlides = Math.ceil(n / (s.logos_par_slide || 1));
    return { ...s, logos: n, nbSlides, duree: nbSlides * (s.duree_par_slide_s || 0) };
  }).sort((a, b) => rang(a.nom) - rang(b.nom));
}

function rangeesSlides(cols, depart) {
  const duree = (s) => s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
  return etat.slides.map((s, i) => {
    const cellules = {
      'N°': `<span class="doux">${depart + i + 1}</span>`,
      'État': s.logos ? '<span class="etat etat-ecran">À l’écran</span>' : '<span class="etat etat-non">Aucun logo</span>',
      'Sponsor': `<strong>Slides ${echapper(s.nom.replace(/ Members$/, ''))}</strong>`,
      'Quand': 'Saison',
      'Son': '<span class="doux">sans</span>',
      'Visuel': '', 'Visuel écran': `<span class="petit">${s.logos} logo${s.logos > 1 ? 's' : ''} · ${s.nbSlides} slide${s.nbSlides > 1 ? 's' : ''} · ${duree(s.duree)}</span>`,
      'Anneau LED': '<span class="doux">non</span>',
      'Emplacement': '',
      'Remarques': '<span class="petit doux">Calculé depuis la fiche des slides</span>',
    };
    return `<tr class="rangee-slides" data-slide="${s.id}" data-sponsor="${echapper(normaliser(`slides ${s.nom}`))}" title="Ouvrir la fiche ${echapper(s.nom)}">
      ${cols.map(t => `<td${t === 'Remarques' ? ' class="col-optionnelle"' : ''}>${cellules[t] ?? ''}</td>`).join('')}</tr>`;
  }).join('');
}

// ---------------------------------------------------------------------
// État d'une diffusion : UNE seule case « À l'écran » (décidé par Léa le 01.10.2026 : « à l'écran » et
// « désactivé » c'est la même chose). Décocher demande une raison facultative (météo, trop de pub…),
// gardée dans motif_suspension. Les anciennes lignes « désactivées » s'affichent « Pas à l'écran ».
// + « nouveau visuel attendu »
// ---------------------------------------------------------------------
const aLEcran = (l) => l.validee && !l.suspendue;
const classeEtat = (l) => aLEcran(l) ? '' : 'non-validee';
const libelleEtat = (l) => aLEcran(l) ? (etatAuMatch(l) || '<span class="etat etat-ecran">À l’écran</span>')
  : `<span class="etat etat-non">Pas à l’écran</span>${l.motif_suspension ? ` <span class="doux petit">· ${echapper(l.motif_suspension)}</span>` : ''}`;

// Dans le tableau : la raison « pas à l'écran » sous l'état, en petit (09.10.2026, Léa : la colonne État prenait
// toute la place quand la raison était longue) ; texte complet au survol
function celluleEtat(l) {
  const motif = !aLEcran(l) && l.motif_suspension;
  return `<label class="cellule-etat">
      <input type="checkbox" class="case-validee" data-validee="${l.id}" ${aLEcran(l) ? 'checked' : ''}
             ${estRegie ? '' : 'disabled'} aria-label="À l’écran">
      ${aLEcran(l) ? libelleEtat(l) : '<span class="etat etat-non">Pas à l’écran</span>'}</label>
    ${motif ? `<span class="motif-etat" title="${echapper(motif)}">${echapper(motif)}</span>` : ''}
    ${l.visuel_attendu ? '<span class="etat etat-attente" title="Nouveau visuel attendu (l’ancien passe en attendant)">⏳ visuel attendu</span>' : ''}`;
}

const visuelActuel = (assets) => (assets || []).filter(a => a.statut !== 'archive')
  .sort((a, b) => new Date(b.depose_le) - new Date(a.depose_le))[0];
// Nom du visuel qui passe ; « à valider » seulement s'il faut agir (FR / DE un match sur deux : badge des versions)
function celluleVisuel(assets, ligne) {
  const a = visuelActuel(assets);
  if (!a) return '<span class="doux">—</span>';
  const versions = [...new Set((assets || []).filter(x => x.statut === 'valide' && x.variante).map(x => x.variante))];
  const alterne = ligne?.regle_rotation === 'alterner' && versions.length >= 2;
  return `<span class="petit">${echapper(a.nom_visuel)}</span>${alterne
    ? ` <span class="badge">${versions.map(echapper).join(' / ')} · 1 match sur 2</span>` : ''}${a.statut === 'a_valider'
    ? ` <span class="etat etat-attente">à valider</span>${estRegie ? ` <button type="button" class="btn btn-discret petit" data-valider="${a.id}">Valider</button>` : ''}` : ''}`;
}

// Anneau LED qui alterne FR / DE un match sur deux (ex. la Mobilière : seulement l'anneau change)
function versionsAnneau(couplee) {
  const versions = [...new Set((couplee?.assets || []).filter(x => x.statut === 'valide' && x.variante).map(x => x.variante))];
  return couplee?.regle_rotation === 'alterner' && versions.length >= 2
    ? ` <span class="badge">${versions.map(echapper).join(' / ')} · 1 match sur 2</span>` : '';
}

// Liste des visuels (dernier d'abord, anciennes versions grisées)
function listeVisuels(assets) {
  const visuels = (assets || []).slice().sort((a, b) => new Date(b.depose_le) - new Date(a.depose_le));
  return visuels.length ? `<ul class="liste-fichiers" style="margin:0">${visuels.map(a => `
    <li><span>${echapper(a.nom_visuel)}${a.variante ? ` <span class="doux petit">(${echapper(a.variante)})</span>` : ''}        <span class="doux petit"> · déposé le ${dateCourte(a.depose_le)}</span></span>
      ${a.statut === 'archive' ? '<span class="badge">ancien</span>'
        : STATUT_ASSET[a.statut] ? `<span class="badge ${STATUT_ASSET[a.statut][1]}">${STATUT_ASSET[a.statut][0]}</span>` : ''}
      ${a.storage_path ? `<button type="button" class="btn btn-discret" data-telecharger-visuel="${echapper(a.storage_path)}">Télécharger</button>` : ''}
      ${a.storage_path && estRegie ? boutonSupprimerFichier(a.storage_path) : ''}
    </li>`).join('')}</ul>`
    : '<p class="doux petit" style="margin:0">Aucun visuel pour l’instant.</p>';
}

// ---------------------------------------------------------------------
// Modifier directement (Régie / admin) : Validé, Remarques, visuel à valider
// ---------------------------------------------------------------------
async function modifierLigne(id, champs, succes) {
  const { error } = await sb.from('lignes_vendues').update(champs).eq('id', id);
  if (error) { notifier(`Modification impossible : ${error.message}`, 'erreur'); return false; }
  const l = trouverLigne(id);
  if (l) Object.assign(l, champs);
  notifier(succes);
  return true;
}

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.validee) {
    // une seule case : cocher = à l'écran ; décocher = pas à l'écran, avec une raison facultative
    const id = t.dataset.validee;
    let champs;
    if (t.checked) champs = { validee: true, suspendue: false, motif_suspension: null };
    else {
      const raison = prompt('Pas à l’écran : pourquoi ? (facultatif, ex. météo, trop de pub)', '');
      if (raison === null) { t.checked = true; return; }
      champs = { validee: false, suspendue: false, motif_suspension: raison.trim() || null };
    }
    if (!(await modifierLigne(id, champs, t.checked ? 'À l’écran' : 'Plus à l’écran'))) { t.checked = !t.checked; return; }
    rafraichirLigne(id);
  } else if (t.dataset.attendu) {
    const id = t.dataset.attendu;
    if (!(await modifierLigne(id, { visuel_attendu: t.checked }, t.checked ? 'Nouveau visuel attendu' : 'Plus de visuel attendu'))) {
      t.checked = !t.checked; return;
    }
    rafraichirLigne(id);
  } else if (t.dataset.remarqueLigne) {
    const texte = t.value.trim() || null;
    if (await modifierLigne(t.dataset.remarqueLigne, { consignes: texte }, 'Remarque enregistrée')) {
      document.querySelectorAll(`[data-remarque-ligne="${t.dataset.remarqueLigne}"]`).forEach(x => { if (x !== t) x.value = texte || ''; });
    }
  } else if (t.dataset.sonLigne) {
    // son corrigé à la main (09.10.2026, Léa : vidéo trop lourde pour la demande, son pas détecté)
    const id = t.dataset.sonLigne;
    // tableau rechargé : colonne Son et ordre de la Pub pause tiers (son d'abord) changent
    if (await modifierLigne(id, { avec_son: t.value === 'oui' }, t.value === 'oui' ? 'Avec son' : 'Sans son')) { await charger(); ouvrirDetail(id); }
  } else if (t.dataset.dureeLigne) {
    const id = t.dataset.dureeLigne;
    const n = parseInt(t.value, 10);
    const duree = Number.isFinite(n) && n > 0 ? n : null;
    const l = trouverLigne(id);
    if (await modifierLigne(id, { duree_s: duree }, 'Durée enregistrée')) {
      // l'anneau couplé dure comme sa vidéo
      if (l?.ligne_couplee_id) await sb.from('lignes_vendues').update({ duree_s: duree }).eq('id', l.ligne_couplee_id);
      await charger();
      ouvrirDetail(id);
    }
  }
});

$('lignes').addEventListener('click', async (e) => {
  // valider un visuel resté « à valider » (ex. arrivé plus tard)
  const b = e.target.closest('[data-valider]');
  if (b) {
    b.disabled = true;
    const { error } = await sb.from('assets').update({ statut: 'valide' }).eq('id', b.dataset.valider);
    if (error) { b.disabled = false; return notifier(`Validation impossible : ${error.message}`, 'erreur'); }
    notifier('Visuel validé');
    await charger();
    return;
  }
  // ▲ ▼ : échange avec la voisine, puis toute la liste est renumérotée (10, 20, 30…) pour un ordre net
  const f = e.target.closest('[data-deplacer]');
  if (f) {
    const i = etat.lignes.findIndex(x => x.id === f.dataset.deplacer);
    const j = i + Number(f.dataset.pas);
    if (i < 0 || !etat.lignes[j]) return;
    document.querySelectorAll('[data-deplacer]').forEach(x => { x.disabled = true; });
    const ordre = etat.lignes.slice();
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
    const maj = ordre.map((l, k) => ({ l, priorite: (k + 1) * 10 })).filter(x => x.l.priorite !== x.priorite);
    const resultats = await Promise.all(maj.map(x => sb.from('lignes_vendues').update({ priorite: x.priorite }).eq('id', x.l.id)));
    const erreur = resultats.find(r => r.error)?.error;
    if (erreur) notifier(`Ordre non enregistré : ${erreur.message}`, 'erreur');
    await charger();
    document.querySelector(`tr[data-ligne="${f.dataset.deplacer}"]`)?.scrollIntoView({ block: 'nearest' });
    return;
  }
  // clic sur la ligne (hors champs modifiables) : détail
  if (e.target.closest('input, textarea, button, a, select, label')) return;
  const slide = e.target.closest('tr[data-slide]');
  if (slide) { location.href = `produit.html?id=${slide.dataset.slide}`; return; }
  const tr = e.target.closest('tr[data-ligne]');
  if (tr) ouvrirDetail(tr.dataset.ligne);
});
// Matchs passés : clic sur une ligne = même détail
$('lignes-passes').addEventListener('click', (e) => {
  if (e.target.closest('input, textarea, button, a, select, label')) return;
  const tr = e.target.closest('tr[data-ligne]');
  if (tr) ouvrirDetail(tr.dataset.ligne);
});

// Après une modification : met à jour l'état dans le tableau (et dans le détail s'il est ouvert)
function rafraichirLigne(id) {
  const l = trouverLigne(id);
  // une LED 6M a deux rangées (une par emplacement)
  for (const tr of l ? document.querySelectorAll(`tr[data-ligne="${id}"]`) : []) {
    tr.className = classeEtat(l);
    const cellule = tr.querySelector('.cellule-etat')?.closest('td');
    if (cellule) cellule.innerHTML = celluleEtat(l);
  }
  if (etat.ouverte === id) ouvrirDetail(id);
}

// Retirer un sponsor du produit (sans demande « Suppression ») : la diffusion est terminée aujourd'hui,
// elle disparaît de la liste mais reste dans l'historique (avec son anneau LED couplé)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-retirer-ligne]');
  if (!b) return;
  const l = trouverLigne(b.dataset.retirerLigne);
  if (!l) return;
  const nom = l.contrat?.sponsor?.nom || 'ce sponsor';
  const produit = l.produit?.nom || etat.p.nom;
  const empl = (l.emplacements || []).map(x => x.emplacement).filter(Boolean).map(x => `${x.anneau}-${x.zone}-${x.position}`);
  if (!confirm(`Retirer ${nom} de « ${produit} » ?\n\n`
    + `La diffusion s'arrête dès le prochain match (même ce soir) et disparaît de la liste${l.ligne_couplee_id ? ' (anneau LED compris)' : ''}.\n`
    + (empl.length ? `${empl.length > 1 ? 'Les emplacements' : 'L’emplacement'} ${empl.join(', ')} redevien${empl.length > 1 ? 'nent' : 't'} libre${empl.length > 1 ? 's' : ''} (Banner HCFG) et disponible${empl.length > 1 ? 's' : ''} à la vente.\n` : '')
    + 'Elle reste dans l’historique et dans le dossier du sponsor.')) return;
  b.disabled = true;
  // dernier jour = hier : il ne passe plus dès le prochain match, même si c'est ce soir
  const hier = jourLocal(new Date(Date.now() - 86400000));
  const { error } = await sb.from('lignes_vendues').update({ statut: 'termine', date_fin: hier })
    .in('id', [l.id, l.ligne_couplee_id].filter(Boolean));
  b.disabled = false;
  if (error) return notifier(`Retrait impossible : ${error.message}`, 'erreur');
  notifier(`${nom} retiré de ${produit}`);
  // venu d'une vue d'ensemble (Action scenes) : on y retourne
  if (CATEGORIES_UNE_PAGE.has(etat.p.categorie)) { location.href = lienCategorie(etat.p.categorie); return; }
  fermerDetail();
  await charger();
});

// ---------------------------------------------------------------------
// Détail d'une diffusion
// ---------------------------------------------------------------------
function ouvrirDetail(id) {
  const l = trouverLigne(id);
  if (!l) return;
  etat.ouverte = id;
  const p = etat.p;
  const dates = (l.matchs || []).map(m => m.match).filter(Boolean).sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure));
  const empl = (l.emplacements || []).map(e => e.emplacement).filter(Boolean).map(e => `${e.anneau}-${e.zone}-${e.position}`);
  const visuels = (l.assets || []).slice().sort((a, b) => new Date(b.depose_le) - new Date(a.depose_le));
  const rang = etat.lignes.indexOf(l) + 1;

  $('d-surtitre').textContent = rang ? `${p.nom} · n° ${rang} dans l'ordre de diffusion`
    : `${l.produit?.nom || p.nom} · placé sur la bande de ${p.nom}`;
  $('d-titre').textContent = l.contrat?.sponsor?.nom || '—';
  $('d-sous-titre').innerHTML = libelleEtat(l)
    + (l.visuel_attendu ? ' <span class="etat etat-attente">⏳ visuel attendu</span>' : '');

  const info = (titre, valeur) => valeur ? `<dt>${titre}</dt><dd>${valeur}</dd>` : '';
  $('d-corps').innerHTML = `
    <div class="detail-grille">
      <div>
        <section class="detail-section encart">
          <h3>État</h3>
          <label class="case-grande">
            <input type="checkbox" data-validee="${l.id}" ${aLEcran(l) ? 'checked' : ''} ${estRegie ? '' : 'disabled'}>
            <span><strong>À l’écran</strong> — la diffusion passe ; décocher = elle ne passe plus (raison facultative)
              ${l.validee_le ? `<span class="doux petit">(${aLEcran(l) ? 'coché' : 'décoché'} le ${dateCourte(l.validee_le)}
                par ${echapper(etat.personnes.get(l.validee_par) || '—')})</span>` : ''}
              ${!aLEcran(l) && l.motif_suspension ? `<span class="petit">Raison : <strong>${echapper(l.motif_suspension)}</strong></span>` : ''}</span>
          </label>
          <label class="case-grande" style="margin-top:.6rem">
            <input type="checkbox" data-attendu="${l.id}" ${l.visuel_attendu ? 'checked' : ''} ${estRegie ? '' : 'disabled'}>
            <span><strong>Nouveau visuel attendu</strong> — l’ancien passe en attendant
              <span class="doux petit">(s’enlève tout seul quand le nouveau visuel est validé)</span></span>
          </label>
          <div class="ligne-desactivation">
            ${estRegie ? `<button type="button" class="btn btn-discret btn-danger" data-retirer-ligne="${l.id}">Retirer de ce produit…</button>` : ''}
          </div>
        </section>

        <section class="detail-section">
          ${l.ligne_couplee_id ? `
            <h3>Visuels · vidéo écran</h3>
            ${listeVisuels(visuels)}
            <h3 style="margin-top:1rem">Visuels · anneau LED</h3>
            ${listeVisuels(etat.couplees.get(l.ligne_couplee_id)?.assets)}`
          : `<h3>Visuels</h3>${listeVisuels(visuels)}`}
        </section>

        <section class="detail-section" id="d-dossier" hidden></section>

        <section class="detail-section">
          <h3>Remarques</h3>
          ${estRegie
            ? `<textarea data-remarque-ligne="${l.id}" placeholder="Ajouter une remarque…">${echapper(l.consignes || '')}</textarea>
               <p class="aide">Enregistré dès que vous cliquez ailleurs.</p>`
            : `<div class="bloc-texte">${echapper(l.consignes || '—')}</div>`}
        </section>
      </div>

      <aside class="detail-cote">
        <div class="encart">
          <h3>Diffusion</h3>
          <dl>
            ${info('Quand', l.type_vente === 'saison' ? 'Toute la saison'
              : `${dates.length} match${dates.length > 1 ? 's' : ''}<div class="petit">${dates.map(m => `${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}`).join('<br>')}</div>`)}
            ${info('Jusqu’au', l.date_fin ? dateCourte(l.date_fin + 'T12:00') : '')}
            ${estRegie && p.famille === 'temps'
              ? info('Durée', `<input type="number" min="1" class="champ-court" data-duree-ligne="${l.id}" value="${l.duree_s ?? ''}" placeholder="—"> s`)
              : info('Durée', l.duree_s ? `${l.duree_s} s` : '')}
            ${info('Passages par match', l.occurrences > 1 ? l.occurrences : '')}
            ${p.famille === 'temps' && p.support === 'Vidéotron' ? info('Son', estRegie
              ? `<select class="champ-court" data-son-ligne="${l.id}">
                   <option value="oui" ${l.avec_son ? 'selected' : ''}>avec son</option>
                   <option value="non" ${l.avec_son ? '' : 'selected'}>sans son</option></select>`
              : l.avec_son ? 'avec son' : 'sans son') : ''}
            ${p.lie_a_produit_id ? info('Anneau LED', l.ligne_couplee_id ? 'oui (couplé)' : 'non') : ''}
            ${p.famille === 'emplacement' ? info('Emplacement', empl.length ? empl.join(', ') : '<span class="badge badge-a-venir">à placer</span>') : ''}
            ${info('Origine', l.demande_id ? `<a href="demandes.html?id=${l.demande_id}">voir la demande</a>` : l.created_by ? `ajouté par ${echapper(etat.personnes.get(l.created_by) || 'la Régie')}, sans demande` : 'import Airtable')}
            ${info('Créée le', dateCourte(l.created_at))}
          </dl>
        </div>
      </aside>
    </div>`;
  $('fenetre').hidden = $('voile').hidden = false;
  document.body.classList.add('fenetre-ouverte');
  afficherDossierSponsor(l);
}

// Fichiers reçus pour ce sponsor (dossier sponsor), à télécharger : utile quand la diffusion n'a pas de fichier
// (ex. Sponsor du match importé d'Airtable sans nom de visuel). Ceux de ce produit d'abord.
async function afficherDossierSponsor(l) {
  const zone = $('d-dossier');
  const sponsorId = l.contrat?.sponsor?.id;
  if (!zone || !sponsorId) return;
  const { data, error } = await sb.from('documents_sponsors')
    .select('nom, storage_path, taille_octets, produit_id, depose_le').eq('sponsor_id', sponsorId)
    .order('depose_le', { ascending: false });
  if (error || !data?.length || etat.ouverte !== l.id) return;
  const docs = data.slice().sort((x, y) => (y.produit_id === l.produit_id) - (x.produit_id === l.produit_id));
  zone.hidden = false;
  zone.innerHTML = `
    <h3>Dossier du sponsor <span class="doux petit">· ${docs.length} fichier${docs.length > 1 ? 's' : ''}</span></h3>
    <ul class="liste-fichiers liste-documents" style="margin:0">${docs.slice(0, 10).map(d => `
      <li><span>${echapper(d.nom)} <span class="doux petit">· reçu le ${dateCourte(d.depose_le)}${d.taille_octets ? ` · ${taille(d.taille_octets)}` : ''}</span></span>
        <span><button type="button" class="btn btn-discret" data-telecharger-visuel="${echapper(d.storage_path)}">Télécharger</button>
        ${estRegie ? boutonSupprimerFichier(d.storage_path) : ''}</span></li>`).join('')}
    </ul>
    ${docs.length > 10 ? `<a class="petit" href="sponsor.html?id=${sponsorId}">Voir tout le dossier →</a>` : ''}`;
}

function fermerDetail() {
  $('fenetre').hidden = $('voile').hidden = true;
  document.body.classList.remove('fenetre-ouverte');
  etat.ouverte = null;
}
// Fermer le détail ouvert depuis une vue d'ensemble (Action scenes) ramène à cette vue
function fermerParUtilisateur() {
  // ouvert depuis Match du jour : on y retourne
  const retour = new URLSearchParams(location.search).get('retour');
  if (retour && /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(retour)) { location.href = retour; return; }
  const depuisVue = new URLSearchParams(location.search).get('ligne');
  if (depuisVue && CATEGORIES_UNE_PAGE.has(etat.p?.categorie)) { location.href = lienCategorie(etat.p.categorie); return; }
  fermerDetail();
}
// Télécharger un visuel depuis le détail d'une diffusion
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-telecharger-visuel]');
  if (!b) return;
  const { data, error } = await sb.storage.from('assets').createSignedUrl(b.dataset.telechargerVisuel, 600, { download: true });
  if (error) return notifier(`Téléchargement impossible : ${error.message}`, 'erreur');
  location.href = data.signedUrl;
});

// Supprimer un fichier qui n'est pas le bon, depuis le détail d'une diffusion (les cartes « À ajouter » gèrent les leurs)
$('d-corps').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-supprimer-fichier]');
  if (!b) return;
  const ouverte = etat.ouverte;
  b.disabled = true;
  if (await confirmerSuppressionFichier(b.dataset.supprimerFichier)) {
    await charger();
    if (ouverte && trouverLigne(ouverte)) ouvrirDetail(ouverte);
  }
  b.disabled = false;
});

$('btn-fermer').addEventListener('click', fermerParUtilisateur);
$('voile').addEventListener('click', fermerParUtilisateur);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fenetre').hidden) fermerParUtilisateur(); });

if (!idProduit) $('p-nom').textContent = 'Produit introuvable';
else {
  await charger();
  // arrivée depuis une vue d'ensemble (ex. Action scenes) : détail de la diffusion cliquée déjà ouvert
  const ligne = new URLSearchParams(location.search).get('ligne');
  if (ligne && trouverLigne(ligne)) ouvrirDetail(ligne);
}
