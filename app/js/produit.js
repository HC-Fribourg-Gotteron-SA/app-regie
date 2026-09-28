import { sb, exigerConnexion, LIBELLES, echapper, dateCourte, notifier, taille, libelleFichier, depuis,
         descriptionProduit, specsProduit, dimensionsAttendues, CATEGORIES_UNE_PAGE, lienCategorie,
         ongletsProduits } from './app.js';

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
const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const STATUT_LIGNE = {
  brouillon: ['brouillon', ''], vendu: ['vendu', ''], fichiers_attendus: ['fichier attendu', 'badge-a-venir'],
  a_valider: ['visuel à valider', 'statut-en_cours'], valide: ['validé', 'statut-traitee'],
  programme: ['programmé', 'statut-traitee'], termine: ['terminé', ''], annule: ['annulé', ''],
};
const STATUT_ASSET = { a_valider: ['à valider', 'statut-en_cours'], valide: ['validé', 'statut-traitee'], refuse: ['refusé', 'statut-question'] };

const etat = {
  p: null,                 // le produit
  anneau: null,            // produit Anneau LED couplé (Pub pause tiers)
  attente: [],             // demandes à ajouter (demandes_produits + demande)
  lignes: [],              // diffusions en cours sur ce produit
  adversaires: new Map(),
  emplacements: [],        // plan LED (produits 3M / 6M)
  choix: new Map(),        // demande_id -> { emplacements: Set, ligne_id, date_fin, fichiers: [], semblables: [] }
  personnes: new Map(),    // id -> nom
  autres: [],              // diffusions d'un autre produit sur la bande de ce produit (LED 3M sur la bande 6M)
  couplees: new Map(),     // id ligne couplée (anneau de la pause tiers) -> { assets }
  slides: [],              // vidéos des slides diffusées dans ce produit (Pub pause tiers), calculées
  ouverte: null,           // diffusion affichée dans la fenêtre de détail
};

// ---------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------
const CHAMPS_LIGNE = `id, produit_id, type_vente, statut, avec_son, duree_s, occurrences, consignes, date_fin, created_at, ligne_couplee_id,
  priorite, validee, validee_le, validee_par, suspendue, motif_suspension, visuel_attendu, demande_id, created_by,
  produit:produits(nom), contrat:contrats(sponsor:sponsors(id, nom)),
  matchs:lignes_matchs(match:matchs(date_heure, adversaire)),
  emplacements:lignes_emplacements(emplacement:emplacements(anneau, zone, position)),
  assets(id, nom_visuel, statut, version, variante, depose_le, valide_le, motif_refus, storage_path, mime)`;

// Diffusion de ce produit, ou d'un autre produit affichée ici (LED 3M sur la bande 6M)
const trouverLigne = (id) => etat.lignes.find(x => x.id === id) || etat.autres.find(x => x.id === id);

async function charger() {
  const [{ data: p, error }, { data: attente }, { data: lignes }, { data: matchs }] = await Promise.all([
    sb.from('produits').select('*').eq('id', idProduit).maybeSingle(),
    sb.from('demandes_produits')
      .select(`demande_id, type_vente, dates_matchs, duree_s, avec_son, avec_anneau, remarque_sponsoring, remarque_regie,
               demande:demandes!inner(id, type, statut, created_at, sponsor_id, sponsor_nom_saisi, remarque_sponsoring,
                                      sponsor:sponsors(id, nom))`)
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
  etat.lignes = (lignes || []).sort((a, b) => (a.priorite ?? 1e9) - (b.priorite ?? 1e9)
    || new Date(a.created_at) - new Date(b.created_at));
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
      .select('id, assets(id, nom_visuel, statut, version, variante, depose_le, storage_path, mime)').in('id', couplees);
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
    if (retour) { retour.href = lienCategorie(p.categorie); retour.textContent = `← ${p.categorie}`; }
  }
  $('p-nom').textContent = p.nom;
  $('p-description').textContent = [descriptionProduit(p), specsProduit(p),
    p.capacite_s ? `max ${Math.round(p.capacite_s / 60)} min par match` : ''].filter(Boolean).join(' · ');

  // état de travail de chaque demande à ajouter
  for (const a of etat.attente) {
    const existant = etat.choix.get(a.demande_id);
    etat.choix.set(a.demande_id, existant || {
      emplacements: new Set(), ligne_id: lignesDuSponsor(a.demande.sponsor_id)[0]?.id || '',
      date_fin: jourLocal(new Date()), fichiers: [], semblables: [],
    });
  }
  afficherAttente();
  afficherLignes();
  await Promise.all(etat.attente.map(a => Promise.all([chargerFichiers(a), chercherSemblables(a)])));
}

const lignesDuSponsor = (sponsorId) => sponsorId ? etat.lignes.filter(l => l.contrat?.sponsor?.id === sponsorId) : [];
const nomSponsor = (d) => d.sponsor?.nom || d.sponsor_nom_saisi || '—';
const matchsLisibles = (dates) => (dates || []).map(j =>
  `${dateCourte(j + 'T12:00')}${etat.adversaires.has(j) ? ` · ${echapper(etat.adversaires.get(j))}` : ''}`);

// Nouveau sponsor : même nom déjà dans l'outil (repris) ou noms qui ressemblent (avertissement)
async function chercherSemblables(a) {
  if (a.demande.sponsor_id || !a.demande.sponsor_nom_saisi) return;
  const { data } = await sb.rpc('rechercher_sponsors', { q: a.demande.sponsor_nom_saisi, nb: 4 });
  etat.choix.get(a.demande_id).semblables = data || [];
  afficherCarte(a.demande_id);
}

// ---------------------------------------------------------------------
// À ajouter
// ---------------------------------------------------------------------
function afficherAttente() {
  $('bloc-a-ajouter').hidden = !etat.attente.length;
  $('nb-a-ajouter').textContent = etat.attente.length;
  $('a-ajouter').innerHTML = etat.attente.map(a => `<div class="detail-produit carte-attente" data-demande="${a.demande_id}"></div>`).join('');
  etat.attente.forEach(a => afficherCarte(a.demande_id));
}

function afficherCarte(idDemande) {
  const el = document.querySelector(`[data-demande="${idDemande}"]`);
  const a = etat.attente.find(x => x.demande_id === idDemande);
  if (!el || !a) return;
  const d = a.demande, c = etat.choix.get(idDemande), p = etat.p;
  const existantes = lignesDuSponsor(d.sponsor_id);
  const identique = c.semblables.find(s => normaliser(s.nom) === normaliser(d.sponsor_nom_saisi));
  const proches = c.semblables.filter(s => s !== identique);

  el.innerHTML = `
    <div class="detail-entete">
      <strong>${echapper(nomSponsor(d))}</strong>
      ${d.sponsor ? '' : '<span class="badge badge-a-venir">nouveau sponsor</span>'}
      <span class="badge">${LIBELLES.type_demande[d.type]}</span>
      ${a.type_vente === 'match' ? '<span class="badge badge-match">Seulement certains matchs</span>' : '<span class="badge">Toute la saison</span>'}
      ${a.avec_son === true ? '<span class="badge badge-son">Avec son</span>' : a.avec_son === false ? '<span class="badge">Sans son</span>' : ''}
      ${a.avec_anneau === true ? '<span class="badge badge-son">+ Anneau LED</span>' : a.avec_anneau === false ? '<span class="badge">Sans anneau LED</span>' : ''}
      ${a.duree_s ? `<span class="badge">${a.duree_s} s</span>` : ''}
      <span class="doux petit description">Reçue ${depuis(d.created_at)}${d.statut === 'question' ? ' · <strong>question en cours au Sponsoring</strong>' : ''}</span>
    </div>
    ${!d.sponsor && identique ? `<p class="message message-info petit">« ${echapper(identique.nom)} » existe déjà dans l'outil : il sera repris.</p>` : ''}
    ${!d.sponsor && !identique && proches.length ? `<p class="message message-info petit">Sera créé comme nouveau sponsor. Noms proches déjà dans l'outil :
      ${proches.map(s => `<strong>${echapper(s.nom)}</strong>`).join(', ')}. Si c'est le même, corrigez la demande avant d'ajouter.</p>` : ''}
    ${a.type_vente === 'match' ? `<p class="petit"><span class="titre-bloc">Matchs</span><br>${matchsLisibles(a.dates_matchs).join('<br>')}</p>` : ''}
    ${a.remarque_sponsoring || d.remarque_sponsoring ? `<div class="titre-bloc">Remarque Sponsoring</div>
      <div class="bloc-texte petit" style="margin-bottom:.7rem">${echapper([a.remarque_sponsoring, d.remarque_sponsoring].filter(Boolean).join('\n'))}</div>` : ''}
    <div class="titre-bloc">Fichiers</div>
    <div style="margin-bottom:.7rem">${blocFichiers(a, c)}</div>
    ${estRegie && p.famille === 'emplacement' && !['suppression', 'changement_visuel'].includes(d.type) ? grilleEmplacements(idDemande, c) : ''}
    ${estRegie ? actions(a, c, existantes) : ''}`;
}

function actions(a, c, existantes) {
  const d = a.demande;
  const choixLigne = existantes.length > 1 ? `
    <select data-ligne style="width:auto">${existantes.map(l => `<option value="${l.id}" ${c.ligne_id === l.id ? 'selected' : ''}>
      ${l.type_vente === 'saison' ? 'Saison' : 'Au match'} · ${STATUT_LIGNE[l.statut]?.[0] || l.statut} · depuis le ${dateCourte(l.created_at)}</option>`).join('')}
    </select>` : '';
  let principal;
  if (d.type === 'suppression') {
    principal = existantes.length
      ? `${choixLigne}<label class="petit" style="margin:0">Dernier jour <input type="date" data-fin value="${c.date_fin}" style="width:auto"></label>
         <button type="button" class="btn btn-principal" data-suite="retire">Retirer</button>`
      : `<span class="petit doux">Pas de diffusion de ce sponsor sur ce produit dans l'outil.</span>
         <button type="button" class="btn btn-principal" data-suite="ignore">Marquer comme fait</button>`;
  } else if (d.type === 'changement_visuel' && existantes.length) {
    principal = `${choixLigne}
      <button type="button" class="btn" data-suite="ajoute">Ajouter comme nouvelle diffusion</button>
      <button type="button" class="btn btn-principal" data-suite="visuel">Mettre le nouveau visuel</button>`;
  } else {
    principal = `<button type="button" class="btn btn-principal" data-suite="ajoute">Ajouter ✓</button>`;
  }
  return `
    <div class="actions-attente">
      <a class="btn btn-discret" href="demandes.html?id=${d.id}">Voir la demande</a>
      ${d.type !== 'suppression' || existantes.length ? '<button type="button" class="btn btn-discret" data-suite="ignore" data-confirmer>Ignorer</button>' : ''}
      <span class="espace"></span>
      ${principal}
    </div>`;
}

// ---------------------------------------------------------------------
// Fichiers joints au produit dans la demande
// ---------------------------------------------------------------------
async function chargerFichiers(a) {
  const c = etat.choix.get(a.demande_id);
  const dossier = `demandes/${a.demande_id}/${idProduit}`;
  const { data } = await sb.storage.from('assets').list(dossier, { sortBy: { column: 'name', order: 'asc' } });
  c.fichiers = (data || []).filter(f => f.id).map(f => {
    const i = f.name.indexOf('__');
    const role = i > 0 ? f.name.slice(0, i) : 'visuel';
    const nomCourt = i > 0 ? f.name.slice(i + 2) : f.name;
    return { role, nomCourt, storage_path: `${dossier}/${f.name}`, nom_visuel: nomCourt.replace(/\.[^.]+$/, ''),
             mime: f.metadata?.mimetype || null, taille_octets: f.metadata?.size || null,
             largeur_px: null, hauteur_px: null, duree_s: null, sonde: 'analyse…' };
  });
  afficherCarte(a.demande_id);
  await Promise.all(c.fichiers.map(f => sonder(f)));
  afficherCarte(a.demande_id);
}

function blocFichiers(a, c) {
  const roles = ['visuel', ...(a.avec_anneau && etat.p.lie_a_produit_id ? ['anneau'] : [])];
  return roles.map(role => {
    const liste = c.fichiers.filter(f => f.role === role);
    const cible = role === 'anneau' ? etat.anneau : etat.p;
    return `
      <div class="fichier-attendu">
        <div class="petit"><strong>${libelleFichier(etat.p, role)}</strong>
          ${liste.length ? '' : ' <span class="badge badge-a-venir">à venir</span>'}</div>
        ${liste.map(f => `
          <div class="visuel-infos">
            <span class="petit">${echapper(f.nomCourt)}</span>
            <span class="doux petit">${taille(f.taille_octets || 0)} · ${echapper(f.sonde)}</span>
            ${controle(f, cible)}
            <button type="button" class="btn btn-discret petit" data-fichier="${echapper(f.storage_path)}">Télécharger</button>
          </div>`).join('')}
      </div>`;
  }).join('');
}

function controle(f, cible) {
  const att = dimensionsAttendues(cible);
  if (!att || !f.largeur_px) return '';
  return f.largeur_px === att.l && f.hauteur_px === att.h
    ? '<span class="badge statut-traitee">dimensions OK</span>'
    : `<span class="badge statut-question">attendu ${att.l} × ${att.h} px</span>`;
}

// Lit les dimensions / la durée du fichier dans le navigateur
async function sonder(f) {
  const { data } = await sb.storage.from('assets').createSignedUrl(f.storage_path, 600);
  const url = data?.signedUrl;
  const video = /^video\//.test(f.mime || '') || /\.(mp4|mov|m4v|webm)$/i.test(f.storage_path);
  const image = /^image\//.test(f.mime || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.storage_path);
  const r = await new Promise((ok) => {
    if (!url || (!video && !image)) return ok(null);
    const delai = setTimeout(() => ok(null), 12000);
    const fini = (v) => { clearTimeout(delai); ok(v); };
    if (image) {
      const img = new Image();
      img.onload = () => fini({ l: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => fini(null);
      img.src = url;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => fini({ l: v.videoWidth, h: v.videoHeight, duree: v.duration });
      v.onerror = () => fini(null);
      v.src = url;
    }
  });
  if (r?.l) {
    f.largeur_px = r.l; f.hauteur_px = r.h;
    if (r.duree && isFinite(r.duree)) f.duree_s = Math.round(r.duree * 100) / 100;
    f.sonde = `${r.l} × ${r.h} px${f.duree_s ? ` · ${f.duree_s.toFixed(1)} s` : ''}`;
  } else {
    f.sonde = video || image ? 'dimensions non lues' : 'format non lu';
  }
}

// ---------------------------------------------------------------------
// LED 3M / 6M : on place le logo là où il y a un Banner HCFG (emplacement libre)
// ---------------------------------------------------------------------
function grilleEmplacements(idDemande, c) {
  const requis = etat.p.emplacements_requis || 1;
  const prisAilleurs = new Set([...etat.choix.entries()].filter(([id]) => id !== idDemande).flatMap(([, x]) => [...x.emplacements]));
  // LED 6M : bande 6M seulement. LED 3M : bande 3M ; la bande 6M n'est proposée que s'il n'y a plus de place en 3M.
  const bande = (e) => e.bande || (['A', 'B'].includes(e.anneau) ? '3M' : '6M');
  const libre = (e) => !e.reserve_club && !e.ligne_id && !prisAilleurs.has(e.emplacement_id);
  const est6M = /6M/.test(etat.p.nom);
  const plein3M = !etat.emplacements.some(e => bande(e) === '3M' && libre(e));
  const dejaSur6M = etat.emplacements.some(e => bande(e) === '6M' && c.emplacements.has(e.emplacement_id));
  const bandes = est6M ? ['6M'] : plein3M || dejaSur6M ? ['3M', '6M'] : ['3M'];
  const anneaux = ['A', 'B', 'C', 'D']
    .map(a => [a, etat.emplacements.filter(e => e.anneau === a && bandes.includes(bande(e)))])
    .filter(([, l]) => l.length);
  return `
    ${!est6M && plein3M ? `<p class="message message-info petit">Plus de place sur la bande 3M : le logo peut aller sur la bande 6M.</p>` : ''}
    <div class="titre-bloc">Emplacement
      <span class="compte-empl ${c.emplacements.size === requis ? 'ok' : ''}">${c.emplacements.size} / ${requis}</span></div>
    <p class="aide" style="margin-top:0">Cliquez sur ${requis > 1 ? `${requis} cases « Banner HCFG »` : 'une case « Banner HCFG »'} pour y mettre le logo
      (facultatif : on peut placer plus tard).</p>
    <div class="legende-empl"><span class="case-empl libre"></span> Banner HCFG (libre) <span class="case-empl choisi"></span> choisi
      <span class="case-empl occupe"></span> sponsor <span class="case-empl reserve"></span> réservé club</div>
    <div class="plan-empl">${anneaux.map(([a, cases]) => `
      <div class="anneau">
        <div class="anneau-titre">Anneau ${a} <span class="doux">· bande ${cases[0].bande}</span></div>
        <div class="anneau-zones">${[...new Set(cases.map(e => e.zone))].map(z => `
          <div class="zone-empl"><div class="zone-nom">${echapper(z)}</div><div class="cases">
            ${cases.filter(e => e.zone === z).map(e => {
              const choisi = c.emplacements.has(e.emplacement_id);
              const occupe = !!e.ligne_id || prisAilleurs.has(e.emplacement_id);
              const cl = choisi ? 'choisi' : e.reserve_club ? 'reserve' : occupe ? 'occupe' : 'libre';
              const titre = `${a}-${z}-${e.position} · ${e.reserve_club ? 'réservé club' : e.sponsor ? e.sponsor : prisAilleurs.has(e.emplacement_id) ? 'choisi pour une autre demande' : 'Banner HCFG (libre)'}`;
              return `<button type="button" class="case-empl ${cl}" data-empl="${e.emplacement_id}" title="${echapper(titre)}"
                        ${cl === 'reserve' || cl === 'occupe' ? 'disabled' : ''}>${e.position}</button>`;
            }).join('')}</div></div>`).join('')}
        </div>
      </div>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------
$('a-ajouter').addEventListener('change', (e) => {
  const carte = e.target.closest('[data-demande]');
  if (!carte) return;
  const c = etat.choix.get(carte.dataset.demande);
  if (e.target.dataset.ligne !== undefined) c.ligne_id = e.target.value;
  if (e.target.dataset.fin !== undefined) c.date_fin = e.target.value;
});

$('a-ajouter').addEventListener('click', async (e) => {
  const carte = e.target.closest('[data-demande]');
  if (!carte) return;
  const idDemande = carte.dataset.demande, c = etat.choix.get(idDemande);

  const telecharger = e.target.closest('[data-fichier]');
  if (telecharger) {
    const { data, error } = await sb.storage.from('assets').createSignedUrl(telecharger.dataset.fichier, 600, { download: true });
    if (error) return notifier(error.message, 'erreur');
    location.href = data.signedUrl;
    return;
  }

  const empl = e.target.closest('[data-empl]');
  if (empl && !empl.disabled) {
    const requis = etat.p.emplacements_requis || 1, id = empl.dataset.empl;
    if (c.emplacements.has(id)) c.emplacements.delete(id);
    else {
      if (c.emplacements.size >= requis) c.emplacements.delete([...c.emplacements][0]);
      c.emplacements.add(id);
    }
    etat.attente.forEach(a => afficherCarte(a.demande_id));   // un emplacement choisi ici n'est plus libre ailleurs
    return;
  }

  const bouton = e.target.closest('[data-suite]');
  if (bouton) await traiter(idDemande, bouton.dataset.suite, bouton);
});

async function traiter(idDemande, suite, bouton) {
  const a = etat.attente.find(x => x.demande_id === idDemande), c = etat.choix.get(idDemande);
  const requis = etat.p.emplacements_requis || 1;
  if (suite === 'ignore' && bouton.hasAttribute('data-confirmer')
      && !confirm(`Ignorer la demande de ${nomSponsor(a.demande)} pour ${etat.p.nom} ?\nRien ne sera programmé pour ce produit.`)) return;
  if (suite === 'ajoute' && etat.p.famille === 'emplacement' && c.emplacements.size < requis
      && !confirm(`Aucun emplacement choisi (ou pas assez) : le logo sera « à placer ».\nAjouter quand même ?`)) return;
  if (suite === 'visuel' && !c.fichiers.length
      && !confirm('Aucun fichier joint à cette demande pour ce produit. Continuer quand même ?')) return;

  bouton.disabled = true;
  const { data, error } = await sb.rpc('traiter_produit', {
    p_demande: idDemande,
    p_produit: idProduit,
    p_suite: suite,
    p_options: {
      ligne_id: c.ligne_id || null,
      date_fin: c.date_fin || null,
      emplacements: suite === 'ajoute' ? [...c.emplacements] : [],
      fichiers: ['ajoute', 'visuel'].includes(suite)
        ? c.fichiers.filter(f => f.role !== 'anneau' || a.avec_anneau)
            .map(({ role, storage_path, nom_visuel, mime, taille_octets, largeur_px, hauteur_px, duree_s }) =>
              ({ role, storage_path, nom_visuel, mime, taille_octets, largeur_px, hauteur_px, duree_s }))
        : [],
    },
  });
  bouton.disabled = false;
  if (error) return notifier(`Impossible (rien n'a été modifié) : ${error.message}`, 'erreur');

  notifier({ ajoute: 'Ajouté au produit', visuel: 'Nouveau visuel envoyé en validation', retire: 'Diffusion arrêtée', ignore: 'Demande ignorée pour ce produit' }[suite]
    + (data?.demande_traitee ? ' · la demande est complète : marquée « Traitée »' : ''));
  etat.choix.delete(idDemande);
  await charger();
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

  if (p.famille === 'emplacement' && etat.emplacements.length) {
    $('lignes').innerHTML = rangeesEmplacements(cols);
    return;
  }
  $('lignes').innerHTML = etat.lignes.map((l, rang) => rangeeLigne(l, rang, cols)).join('') + rangeesSlides(cols, etat.lignes.length);
}

// Une diffusion (rang = position dans la liste ; empl = un seul emplacement à afficher, pour les LED 6M)
function rangeeLigne(l, rang, cols, emplUnique = null) {
  const dates = (l.matchs || []).map(m => m.match).filter(Boolean).sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure));
  const quand = l.type_vente === 'saison' ? 'Saison'
    : `<span title="${echapper(dates.map(m => `${dateCourte(m.date_heure)} ${m.adversaire}`).join('\n'))}">${dates.length} match${dates.length > 1 ? 's' : ''}</span>`;
  const empl = emplUnique || (l.emplacements || []).map(e => e.emplacement).filter(Boolean)
    .map(e => `${e.anneau}-${e.zone}-${e.position}`).join(', ');
  const visuelEcran = celluleVisuel(l.assets);
  const cellules = {
    'N°': `<span class="doux" title="Ordre de diffusion">${rang + 1}</span>`,
    'État': celluleEtat(l),
    'Sponsor': `<strong>${echapper(l.contrat?.sponsor?.nom || '—')}</strong>${l.produit_id !== etat.p.id
      ? ` <a class="badge" href="produit.html?id=${l.produit_id}" title="Vendu comme ${echapper(l.produit?.nom || '')}">${echapper(l.produit?.nom || '')}</a>` : ''}`,
    'Quand': `${quand}${l.date_fin ? `<div class="doux petit">jusqu'au ${dateCourte(l.date_fin + 'T12:00')}</div>` : ''}`,
    'Son': l.avec_son ? 'avec son' : '<span class="doux">sans</span>',
    'Emplacement': empl || '<span class="badge badge-a-venir">à placer</span>',
    'Visuel': visuelEcran,
    'Visuel écran': visuelEcran,
    'Anneau LED': l.ligne_couplee_id ? 'oui' : '<span class="doux">non</span>',
    'Remarques': estRegie
      ? `<textarea class="remarque-ligne petit" data-remarque-ligne="${l.id}" rows="1"
           placeholder="Ajouter une remarque…">${echapper(l.consignes || '')}</textarea>`
      : `<span class="petit doux">${echapper((l.consignes || '').slice(0, 120))}${(l.consignes || '').length > 120 ? '…' : ''}</span>`,
  };
  return `<tr data-ligne="${l.id}" class="${classeEtat(l)}">
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
      return `<tr class="rangee-libre">${vide({ 'N°': `<span class="doux">${++rang}</span>`,
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
    return `<tr class="rangee-slides" data-slide="${s.id}" title="Ouvrir la fiche ${echapper(s.nom)}">
      ${cols.map(t => `<td${t === 'Remarques' ? ' class="col-optionnelle"' : ''}>${cellules[t] ?? ''}</td>`).join('')}</tr>`;
  }).join('');
}

// ---------------------------------------------------------------------
// État d'une diffusion : ce qui compte pour la Régie
//   à l'écran / pas à l'écran (case) · désactivé (motif) · nouveau visuel attendu
// ---------------------------------------------------------------------
const classeEtat = (l) => l.suspendue ? 'desactivee' : l.validee ? '' : 'non-validee';

function celluleEtat(l) {
  const libelle = l.suspendue ? '<span class="etat etat-desactive">⏸ Désactivé</span>'
    : l.validee ? '<span class="etat etat-ecran">À l’écran</span>'
    : '<span class="etat etat-non">Pas à l’écran</span>';
  return `<label class="cellule-etat" title="${echapper(l.suspendue ? `Désactivé : ${l.motif_suspension || 'sans motif'}` : '')}">
      <input type="checkbox" class="case-validee" data-validee="${l.id}" ${l.validee ? 'checked' : ''}
             ${estRegie ? '' : 'disabled'} aria-label="À l’écran">
      ${libelle}</label>
    ${l.visuel_attendu ? '<span class="etat etat-attente" title="Nouveau visuel attendu (l’ancien passe en attendant)">⏳ visuel attendu</span>' : ''}`;
}

const visuelActuel = (assets) => (assets || []).filter(a => a.statut !== 'archive')
  .sort((a, b) => new Date(b.depose_le) - new Date(a.depose_le))[0];
// Nom du visuel qui passe ; « à valider » seulement s'il faut agir
function celluleVisuel(assets) {
  const a = visuelActuel(assets);
  if (!a) return '<span class="doux">—</span>';
  return `<span class="petit">${echapper(a.nom_visuel)}</span>${a.statut === 'a_valider'
    ? ` <span class="etat etat-attente">à valider</span>${estRegie ? ` <button type="button" class="btn btn-discret petit" data-valider="${a.id}">Valider</button>` : ''}` : ''}`;
}

// Liste des visuels (dernier d'abord, anciennes versions grisées)
function listeVisuels(assets) {
  const visuels = (assets || []).slice().sort((a, b) => new Date(b.depose_le) - new Date(a.depose_le));
  return visuels.length ? `<ul class="liste-fichiers" style="margin:0">${visuels.map(a => `
    <li><span>${echapper(a.nom_visuel)}${a.variante ? ` <span class="doux petit">(${echapper(a.variante)})</span>` : ''}
        <span class="doux petit"> · déposé le ${dateCourte(a.depose_le)}</span></span>
      ${a.statut === 'archive' ? '<span class="badge">ancien</span>'
        : STATUT_ASSET[a.statut] ? `<span class="badge ${STATUT_ASSET[a.statut][1]}">${STATUT_ASSET[a.statut][0]}</span>` : ''}
      ${a.storage_path ? `<button type="button" class="btn btn-discret" data-telecharger-visuel="${echapper(a.storage_path)}">Télécharger</button>` : ''}
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
  if (t.dataset.validee || t.dataset.attendu) {
    const id = t.dataset.validee || t.dataset.attendu;
    const champs = t.dataset.validee ? { validee: t.checked } : { visuel_attendu: t.checked };
    const message = t.dataset.validee ? (t.checked ? 'À l’écran' : 'Retiré de l’écran')
                                      : (t.checked ? 'Nouveau visuel attendu' : 'Plus de visuel attendu');
    if (!(await modifierLigne(id, champs, message))) { t.checked = !t.checked; return; }
    rafraichirLigne(id);
  } else if (t.dataset.remarqueLigne) {
    const texte = t.value.trim() || null;
    if (await modifierLigne(t.dataset.remarqueLigne, { consignes: texte }, 'Remarque enregistrée')) {
      document.querySelectorAll(`[data-remarque-ligne="${t.dataset.remarqueLigne}"]`).forEach(x => { if (x !== t) x.value = texte || ''; });
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
  // clic sur la ligne (hors champs modifiables) : détail
  if (e.target.closest('input, textarea, button, a, select, label')) return;
  const slide = e.target.closest('tr[data-slide]');
  if (slide) { location.href = `produit.html?id=${slide.dataset.slide}`; return; }
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

// Désactiver (avec motif) / réactiver — depuis le détail
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-desactiver], [data-reactiver]');
  if (!b) return;
  const id = b.dataset.desactiver || b.dataset.reactiver;
  let champs;
  if (b.dataset.desactiver) {
    const motif = prompt('Motif de la désactivation (ex. météo, trop de pub) :');
    if (motif === null) return;
    champs = { suspendue: true, motif_suspension: motif.trim() || null };
  } else {
    champs = { suspendue: false, motif_suspension: null };
  }
  if (await modifierLigne(id, champs, champs.suspendue ? 'Diffusion désactivée' : 'Diffusion réactivée')) rafraichirLigne(id);
});

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
  $('d-sous-titre').innerHTML = (l.suspendue ? '<span class="etat etat-desactive">⏸ Désactivé</span>'
      : l.validee ? '<span class="etat etat-ecran">À l’écran</span>' : '<span class="etat etat-non">Pas à l’écran</span>')
    + (l.visuel_attendu ? ' <span class="etat etat-attente">⏳ visuel attendu</span>' : '');

  const info = (titre, valeur) => valeur ? `<dt>${titre}</dt><dd>${valeur}</dd>` : '';
  $('d-corps').innerHTML = `
    <div class="detail-grille">
      <div>
        <section class="detail-section encart">
          <h3>État</h3>
          <label class="case-grande">
            <input type="checkbox" data-validee="${l.id}" ${l.validee ? 'checked' : ''} ${estRegie ? '' : 'disabled'}>
            <span><strong>À l’écran</strong> — la diffusion passe
              ${l.validee_le ? `<span class="doux petit">(${l.validee ? 'coché' : 'décoché'} le ${dateCourte(l.validee_le)}
                par ${echapper(etat.personnes.get(l.validee_par) || '—')})</span>` : ''}</span>
          </label>
          <label class="case-grande" style="margin-top:.6rem">
            <input type="checkbox" data-attendu="${l.id}" ${l.visuel_attendu ? 'checked' : ''} ${estRegie ? '' : 'disabled'}>
            <span><strong>Nouveau visuel attendu</strong> — l’ancien passe en attendant
              <span class="doux petit">(s’enlève tout seul quand le nouveau visuel est validé)</span></span>
          </label>
          <div class="ligne-desactivation">
            ${l.suspendue
              ? `<p class="message message-erreur petit" style="margin:0">⏸ Désactivé : ${echapper(l.motif_suspension || 'sans motif')}</p>
                 ${estRegie ? `<button type="button" class="btn" data-reactiver="${l.id}">Réactiver</button>` : ''}`
              : estRegie ? `<button type="button" class="btn btn-discret" data-desactiver="${l.id}">⏸ Désactiver temporairement…</button>` : ''}
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
            ${info('Durée', l.duree_s ? `${l.duree_s} s` : '')}
            ${info('Passages par match', l.occurrences > 1 ? l.occurrences : '')}
            ${p.famille === 'temps' && p.support === 'Vidéotron' ? info('Son', l.avec_son ? 'avec son' : 'sans son') : ''}
            ${p.lie_a_produit_id ? info('Anneau LED', l.ligne_couplee_id ? 'oui (couplé)' : 'non') : ''}
            ${p.famille === 'emplacement' ? info('Emplacement', empl.length ? empl.join(', ') : '<span class="badge badge-a-venir">à placer</span>') : ''}
            ${info('Origine', l.demande_id ? `<a href="demandes.html?id=${l.demande_id}">voir la demande</a>` : l.created_by ? '' : 'import Airtable')}
            ${info('Créée le', dateCourte(l.created_at))}
          </dl>
        </div>
      </aside>
    </div>`;
  $('fenetre').hidden = $('voile').hidden = false;
  document.body.classList.add('fenetre-ouverte');
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
