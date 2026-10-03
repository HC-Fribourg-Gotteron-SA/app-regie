// Base commune à toutes les pages : client Supabase, contrôle d'accès, menu, petits outils.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, BASE, EN_LOCAL, SITE_TEST, BASE_TEST_PRETE } from './config.js';

// Bandeau en local / sur le site de test : sur quelle base on travaille (test = données fictives ; vraie base = attention)
if ((EN_LOCAL || SITE_TEST) && BASE_TEST_PRETE) {
  const bandeau = document.createElement('div');
  bandeau.className = `bandeau-base bandeau-${BASE}`;
  bandeau.textContent = BASE === 'test'
    ? 'BASE DE TEST — données fictives, tu peux tout essayer'
    : 'VRAIE BASE (en local) — attention, les modifications sont réelles';
  document.body.prepend(bandeau);
}
// Changer de base en local (lien en bas du menu)
export function changerDeBase() {
  try { localStorage.setItem('base-choisie', BASE === 'test' ? 'prod' : 'test'); } catch { /* stockage indisponible */ }
  location.href = 'index.html';
}

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Date de la version, affichée en bas du menu : à changer à chaque mise en ligne (pour vérifier que Netlify a publié)
const VERSION = '03.10.2026 h';

// ---------------------------------------------------------------------
// Libellés affichés
// ---------------------------------------------------------------------
export const LIBELLES = {
  role: { sponsoring: 'Sponsoring', regie: 'Régie', admin: 'Admin', animation: 'Chrono & animation' },
  type_demande: {
    nouveau_sponsor: 'Nouveau sponsor',
    ajout_produit: 'Ajout de produit',
    changement_visuel: 'Changement de visuel / logo',
    suppression: 'Suppression',
    autre: 'Autre',
  },
  statut_demande: {
    nouvelle: 'Nouvelle',
    en_cours: 'En cours',
    question: 'Question au Sponsoring',
    traitee: 'Traitée',
  },
  type_match: { saison: 'Saison', playoffs: 'Playoffs', amical: 'Amical' },
};

const MOMENTS = {
  avant_match: 'avant le match', echauffement: 'pendant le warm-up', apres_echauffement: 'après le warm-up',
  pendant_jeu: 'pendant le match', pause_tiers: 'pendant les pauses', arret_de_jeu: 'aux arrêts de jeu',
  fin_de_match: 'en fin de match', continu: 'en continu',
};

// Petite phrase qui dit ce qu'est le produit (ex. anneau LED ≠ anneau LED 3M / 6M)
export function descriptionProduit(p) {
  const moment = MOMENTS[p.moment_defaut] ? ` · passe ${MOMENTS[p.moment_defaut]}` : '';
  switch (p.famille) {
    case 'emplacement':
      return p.emplacements_requis > 1
        ? `Anneau LED ${p.nom.replace(/^LED /, '')} · compte pour ${p.emplacements_requis} emplacements 3M`
        : `Anneau LED ${p.nom.replace(/^LED /, '')} · 1 emplacement`;
    case 'slide': {
      const slides = /^slides /i.test(p.categorie || '') ? p.categorie : `slides ${p.categorie}`;
      return `Logo sur les ${slides} (vidéotron, pause tiers) · seul le logo est nécessaire`;
    }
    case 'exclusif':
      if (p.categorie === 'Action scenes') {
        return 'Action scene · s’affiche au moment de l’action du match (goal, pénalité, temps mort…) · un seul sponsor par scène';
      }
      return `${p.support || ''}${moment} · un seul sponsor${p.mode_vente === 'match' ? ' par match' : ''}`;
    default: return `${p.support || ''}${moment}`;
  }
}

// Format attendu des fichiers : « 1920 × 1080 px · mp4, mov »
// Formats de fichier lisibles : {png,jpg,jpeg,mp4} -> « PNG, JPEG, MP4 »
const NOMS_FORMATS = { jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', mp4: 'MP4', mov: 'MOV' };
export const formatsLisibles = (formats) =>
  [...new Set((formats || []).map(f => NOMS_FORMATS[String(f).toLowerCase()] || String(f).toUpperCase()))].join(', ');

// Format attendu d'un produit (media kit, migration 32) : « 1920 × 1080 px · PNG, JPEG, MP4, MOV »
export function specsProduit(p) {
  if (!p) return '';
  const att = dimensionsAttendues(p);
  const dims = att ? `${att.l} × ${att.h} px` : p.hauteur_px ? `${p.hauteur_px} px de haut` : '';
  return [dims, formatsLisibles(p.formats), p.duree_max_s ? `max ${p.duree_max_s} s` : ''].filter(Boolean).join(' · ');
}

// Alertes sur un fichier par rapport au format du produit (jamais bloquant) : [] = conforme (ou rien à vérifier)
// f = { nom, largeur, hauteur, duree }
export function alertesFichier(p, f) {
  const alertes = [];
  if (!p || !f) return alertes;
  const ext = (f.nom || '').includes('.') ? f.nom.split('.').pop().toLowerCase() : '';
  const formats = (p.formats || []).map(x => String(x).toLowerCase());
  if (ext && formats.length && !formats.includes(ext)) alertes.push(`fichier .${ext} : attendu ${formatsLisibles(p.formats)}`);
  const att = dimensionsAttendues(p);
  if (att && f.largeur && (f.largeur !== att.l || f.hauteur !== att.h)) alertes.push(`${f.largeur} × ${f.hauteur} px : attendu ${att.l} × ${att.h} px`);
  if (p.duree_max_s && f.duree && f.duree > p.duree_max_s + 0.5) alertes.push(`${Math.round(f.duree)} s : maximum ${p.duree_max_s} s`);
  return alertes;
}

// Dimensions (et durée d'une vidéo) d'un fichier choisi sur l'ordinateur, lues dans le navigateur
export function lireDimensions(fichier) {
  return new Promise((ok) => {
    const video = /^video\//.test(fichier.type) || /\.(mp4|mov|m4v|webm)$/i.test(fichier.name);
    const image = /^image\//.test(fichier.type) || /\.(png|jpe?g|gif|webp)$/i.test(fichier.name);
    if (!video && !image) return ok(null);
    const url = URL.createObjectURL(fichier);
    const fini = (v) => { clearTimeout(delai); URL.revokeObjectURL(url); ok(v); };
    const delai = setTimeout(() => fini(null), 12000);
    if (image) {
      const img = new Image();
      img.onload = () => fini({ largeur: img.naturalWidth, hauteur: img.naturalHeight });
      img.onerror = () => fini(null);
      img.src = url;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => fini({ largeur: v.videoWidth, hauteur: v.videoHeight, duree: isFinite(v.duration) ? v.duration : null });
      v.onerror = () => fini(null);
      v.src = url;
    }
  });
}

// Dimensions attendues (null si pas de contrainte)
export function dimensionsAttendues(p) {
  if (!p) return null;
  if (p.largeur_px && p.hauteur_px) return { l: p.largeur_px, h: p.hauteur_px };
  return p.famille === 'emplacement' ? { l: 300 * (p.emplacements_requis || 1), h: 80 } : null;
}

// Version d'un visuel devinée d'après le nom du fichier (spot_FR.mp4, Logo-d.png…) ; '' si rien de reconnu
export function devinerVersion(nom) {
  const base = (nom || '').replace(/\.[^.]+$/, '');
  const mots = base.split(/[^A-Za-zÀ-ÿ]+/).map(m => m.toLowerCase());
  const LANGUES = { fr: 'FR', f: 'FR', vf: 'FR', vd: 'DE', francais: 'FR', français: 'FR', french: 'FR',
                    de: 'DE', d: 'DE', dt: 'DE', deutsch: 'DE', allemand: 'DE', german: 'DE',
                    it: 'IT', en: 'EN', eng: 'EN', english: 'EN' };
  for (let i = mots.length - 1; i >= 0; i--) if (LANGUES[mots[i]]) return LANGUES[mots[i]];
  return '';
}

// Nom du fichier attendu pour un produit (role = 'visuel' ou 'anneau')
export function libelleFichier(p, role) {
  if (role === 'anneau') return 'Visuel anneau LED';
  if (!p) return 'Fichier';
  if (p.famille === 'slide') return 'Logo';
  if (p.famille === 'temps' && p.support === 'Vidéotron') return 'Vidéo vidéotron';
  if (p.famille === 'exclusif') return 'Visuel ou vidéo';
  return 'Visuel';
}

// ---------------------------------------------------------------------
// Contrôle d'accès : renvoie { session, profil } ou redirige
// ---------------------------------------------------------------------
export async function exigerConnexion({ roles } = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.replace('index.html');
    return new Promise(() => {}); // la page s'arrête là
  }

  const { data: profil, error } = await sb
    .from('profiles').select('id, email, nom, role').eq('id', session.user.id).single();

  if (error || !profil) {
    afficherBlocage('Profil introuvable', "Votre compte n'a pas de profil. Contactez un admin.");
    return new Promise(() => {});
  }
  if (!profil.role) {
    afficherBlocage('Compte en attente',
      `Votre compte (${echapper(profil.email)}) est créé, mais aucun rôle ne lui a encore été attribué. ` +
      'Un admin doit vous donner le rôle Sponsoring ou Régie.');
    return new Promise(() => {});
  }
  if (roles && !roles.includes(profil.role)) {
    afficherBlocage('Accès réservé', "Cette page n'est pas accessible avec votre rôle.");
    return new Promise(() => {});
  }

  construireMenu(profil);
  return { session, profil };
}

function afficherBlocage(titre, texte) {
  document.body.innerHTML = `
    <main class="centre">
      <div class="carte etroite">
        <h1>${echapper(titre)}</h1>
        <p>${texte}</p>
        <button class="btn" id="btn-deconnexion">Se déconnecter</button>
      </div>
    </main>`;
  document.getElementById('btn-deconnexion').onclick = deconnecter;
}

// ---------------------------------------------------------------------
// Menu latéral (à gauche ; tiroir derrière ☰ sur téléphone)
// ---------------------------------------------------------------------
// Logo du club : app/img/logo.jpg (fond blanc) ; s'il manque, le monogramme « HCFG » s'affiche.
export const LOGO = `<span class="marque-logo">HCFG<img src="img/logo.jpg" alt="HC Fribourg-Gottéron" onerror="this.remove()"></span>`;

const ICONES = {
  demandes:   '<path d="M4 4h16v12h-5l-3 3-3-3H4z"/>',
  nouvelle:   '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  calendrier: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  match:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  onglets:    '<path d="M3.5 19.5h17M3.5 19.5V8a1.5 1.5 0 0 1 1.5-1.5h4l1.5 2h9a1.5 1.5 0 0 1 1.5 1.5v9.5"/><path d="M13 6.5h3.5"/>',
  sponsors:   '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  horaire:    '<path d="M5 4h14M5 9h14M5 14h9M5 19h9"/><circle cx="18" cy="17" r="3.2"/><path d="M18 15.6V17l1 .8"/>',
  produits:   '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
};
const icone = (nom) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg>`;

// Rubriques du menu : un titre, puis les onglets dessous
const MENU = [
  { titre: 'Jour de match', liens: [
    { href: 'match-du-jour.html', texte: 'Match du jour', icone: 'match', roles: ['regie', 'admin'] },
    { href: 'run-of-show.html', texte: 'Run of show', icone: 'horaire', roles: ['regie', 'admin', 'sponsoring', 'animation'] },
  ] },
  { titre: 'Demandes', liens: [
    { href: 'demandes.html', texte: 'Toutes les demandes', icone: 'demandes', compteur: 'demandes' },
    { href: 'demande.html', texte: 'Nouvelle demande', icone: 'nouvelle' },
  ] },
  { titre: 'Produits', id: 'menu-produits', liens: [
    // « Vue d'ensemble » remplacée par les fiches en onglets (Léa, 01.10.2026 : « c'est la même chose »)
    { href: 'produit.html', texte: 'Fiches produit', icone: 'produits', compteur: 'a_ajouter', aussi: ['categorie.html', 'produits.html', 'matchs.html'] },
  ] },
  { titre: 'Sponsors', liens: [
    { href: 'sponsors.html', texte: 'Dossiers sponsors', icone: 'sponsors', aussi: ['sponsor.html'] },
    { href: 'import-dossiers.html', texte: 'Importer des dossiers', icone: 'onglets', roles: ['regie', 'admin'] },
  ] },
  { titre: 'Saison', liens: [
    { href: 'calendrier.html', texte: 'Calendrier des matchs', icone: 'calendrier', roles: ['regie', 'admin'] },
  ] },
];

function construireMenu(profil) {
  const page = pageCourante();
  const accueil = pageAccueil(profil.role);
  // Chrono & animation : seulement les liens qui le nomment (run of show)
  const visible = (l) => profil.role === 'animation' ? l.roles?.includes('animation') : !l.roles || l.roles.includes(profil.role);

  const menu = document.createElement('aside');
  menu.className = 'menu-lateral';
  menu.id = 'menu-lateral';
  menu.innerHTML = `
    <a class="marque" href="${accueil}">${LOGO}
      <span class="marque-texte"><strong>Fribourg-Gottéron</strong><small>Sponsoring ↔ Régie</small></span>
    </a>
    <nav>${MENU.map(r => ({ ...r, liens: r.liens.filter(visible) }))
      .filter(r => r.liens.length).map(r => `
      <div class="menu-rubrique"${r.id ? ` id="${r.id}"` : ''}>
        <div class="menu-titre">${r.titre}</div>
        ${r.liens.map(l => `
          <a href="${l.href}" class="${page === l.href || l.aussi?.includes(page) ? 'actif' : ''}">${icone(l.icone)}<span>${l.texte}</span>
            ${l.compteur ? `<span class="menu-compteur" data-compteur="${l.compteur}" hidden></span>` : ''}</a>`).join('')}
      </div>`).join('')}
    </nav>
    <div class="menu-compte">
      <div class="menu-utilisateur">
        <span class="avatar avatar-clair">${echapper(initiales(profil.nom || profil.email))}</span>
        <span><strong>${echapper(profil.nom || profil.email.split('@')[0])}</strong>
          <small>${LIBELLES.role[profil.role]}</small></span>
      </div>
      <a href="mot-de-passe.html">Mot de passe</a>
      <button type="button" class="lien-menu" id="btn-deconnexion">Déconnexion</button>
      ${EN_LOCAL && BASE_TEST_PRETE ? `<button type="button" class="lien-menu" id="btn-base">${BASE === 'test'
        ? 'Passer sur la vraie base' : 'Revenir sur la base de test'}</button>` : ''}
      <small class="menu-version" title="Version de l'outil en ligne">Version du ${VERSION}${BASE === 'test' ? ' · base de test' : ''}</small>
    </div>`;

  // barre du haut sur téléphone : ☰ + nom de l'outil
  const barre = document.createElement('div');
  barre.className = 'barre-mobile';
  barre.innerHTML = `
    <button type="button" class="btn-menu" id="btn-menu" aria-label="Ouvrir le menu" aria-controls="menu-lateral">☰</button>
    <a class="marque" href="${accueil}">${LOGO}<span class="marque-texte"><strong>Fribourg-Gottéron</strong></span></a>`;
  const voile = document.createElement('div');
  voile.className = 'voile-menu';
  voile.hidden = true;

  document.body.prepend(menu, barre, voile);
  document.getElementById('btn-base')?.addEventListener('click', () => {
    if (BASE === 'test' && !confirm('Passer sur la VRAIE base ? Tout ce que tu feras sera réel (demandes, diffusions, fichiers).')) return;
    changerDeBase();
  });
  document.body.classList.add('avec-menu');

  const basculer = (ouvert) => {
    document.body.classList.toggle('menu-ouvert', ouvert);
    voile.hidden = !ouvert;
  };
  document.getElementById('btn-menu').onclick = () => basculer(true);
  voile.onclick = () => basculer(false);
  document.getElementById('btn-deconnexion').onclick = deconnecter;
  if (profil.role === 'animation') return;
  compterDemandes(profil);
  menuProduits(profil);
}

// Nom de la page ouverte, toujours avec « .html » (Cloudflare Pages sert /run-of-show au lieu de /run-of-show.html)
export function pageCourante() {
  const nom = decodeURIComponent(location.pathname.split('/').pop() || 'index');
  return nom.endsWith('.html') ? nom : `${nom}.html`;
}

// Page d'arrivée selon le rôle
export const pageAccueil = (role) => ['regie', 'admin'].includes(role) ? 'match-du-jour.html'
  : role === 'animation' ? 'run-of-show.html' : 'demandes.html';

// Catégories trop longues pour une entrée par produit : une seule page (categorie.html?c=…)
export const CATEGORIES_UNE_PAGE = new Set(['Action scenes']);
export const lienCategorie = (cat) => `categorie.html?c=${encodeURIComponent(cat)}`;

// Onglets des fiches produit, comme les feuilles d'un classeur Excel (variante à tester, 28.09.2026).
// Un onglet par produit, dans l'ordre d'importance ; Action scenes = un seul onglet.
// zone : élément où afficher la barre ; actif : { produit: id } ou { categorie: nom }
export async function ongletsProduits(zone, actif = {}) {
  if (!zone) return;
  const { data: { session } } = await sb.auth.getSession();
  const { data: profil } = await sb.from('profiles').select('role').eq('id', session?.user?.id).maybeSingle();
  const regie = ['regie', 'admin'].includes(profil?.role);
  const [{ data: produits }, attente] = await Promise.all([
    sb.from('produits').select('id, nom, categorie').eq('actif', true).order('ordre').order('categorie').order('nom'),
    regie ? sb.from('demandes_produits').select('produit_id, demande:demandes!inner(statut)')
              .is('traite_le', null).neq('demande.statut', 'traitee') : Promise.resolve({ data: [] }),
  ]);
  const aAjouter = new Map();
  for (const a of attente.data || []) aAjouter.set(a.produit_id, (aAjouter.get(a.produit_id) || 0) + 1);
  const compteur = (n) => n ? `<span class="menu-compteur">${n}</span>` : '';

  // « Par match » : un onglet comme les fiches (Léa, 02.10.2026 : plus besoin d'une entrée à part dans le menu)
  const onglets = regie ? [`<a href="matchs.html" class="onglet-produit${actif.page === 'matchs' ? ' actif' : ''}"
    title="Ce qui est pris seulement pour certains matchs">📅 Par match</a>`] : [];
  let categoriePrecedente = null;
  for (const p of produits || []) {
    const cat = p.categorie || 'Autres';
    const nouvelleCat = cat !== categoriePrecedente;
    categoriePrecedente = cat;
    if (CATEGORIES_UNE_PAGE.has(cat)) {
      if (!nouvelleCat) continue;
      const n = (produits || []).filter(x => x.categorie === cat).reduce((t, x) => t + (aAjouter.get(x.id) || 0), 0);
      onglets.push(`<a href="${lienCategorie(cat)}" class="onglet-produit${nouvelleCat ? ' debut-categorie' : ''}${
        actif.categorie === cat ? ' actif' : ''}">${echapper(cat)}${compteur(n)}</a>`);
      continue;
    }
    onglets.push(`<a href="produit.html?id=${p.id}" class="onglet-produit${nouvelleCat ? ' debut-categorie' : ''}${
      actif.produit === p.id ? ' actif' : ''}" title="${echapper(cat)}">${echapper(p.nom)}${compteur(aAjouter.get(p.id))}</a>`);
  }
  zone.innerHTML = onglets.join('');
  zone.hidden = false;
  zone.querySelector('.actif')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// Une page par produit dans le menu, rangée par catégorie (sous-menus dépliables)
async function menuProduits(profil) {
  const regie = ['regie', 'admin'].includes(profil.role);
  const [{ data: produits, error }, attente] = await Promise.all([
    sb.from('produits').select('id, nom, categorie').eq('actif', true).order('ordre').order('categorie').order('nom'),
    regie ? sb.from('demandes_produits').select('produit_id, demande:demandes!inner(statut)')
              .is('traite_le', null).neq('demande.statut', 'traitee') : Promise.resolve({ data: [] }),
  ]);
  const zone = document.getElementById('menu-produits');
  if (error || !zone) return;

  const aAjouter = new Map();
  for (const a of attente.data || []) aAjouter.set(a.produit_id, (aAjouter.get(a.produit_id) || 0) + 1);
  const courant = pageCourante() === 'produit.html' ? new URLSearchParams(location.search).get('id') : null;
  const compteur = (n) => n ? `<span class="menu-compteur">${n}</span>` : '';
  const court = (nom) => nom.replace(/^Action scene – /, '');

  const groupes = new Map();
  for (const p of produits) {
    const cat = p.categorie || 'Autres';
    if (!groupes.has(cat)) groupes.set(cat, []);
    groupes.get(cat).push(p);
  }
  // Liste repliable « Tous les produits » : ouverte sur les pages produit, sinon selon le dernier choix
  const surPageProduit = ['produit.html', 'produits.html', 'categorie.html'].includes(pageCourante());
  let ouverte = surPageProduit;
  try { if (!surPageProduit) ouverte = localStorage.getItem('menu-produits-ouvert') === '1'; } catch { /* stockage indisponible */ }
  const totalAttente = [...aAjouter.values()].reduce((t, n) => t + n, 0);

  zone.insertAdjacentHTML('beforeend', `
    <details class="menu-tous-produits"${ouverte ? ' open' : ''}>
      <summary><span>Tous les produits</span><span class="menu-nb">${produits.length}</span>${compteur(totalAttente)}</summary>
      <div class="menu-liste-produits"></div>
    </details>`);
  const tous = zone.querySelector('.menu-tous-produits');
  tous.addEventListener('toggle', () => {
    try { localStorage.setItem('menu-produits-ouvert', tous.open ? '1' : '0'); } catch { /* stockage indisponible */ }
  });

  const categorieCourante = pageCourante() === 'categorie.html' ? new URLSearchParams(location.search).get('c') : null;
  zone.querySelector('.menu-liste-produits').innerHTML = [...groupes].map(([cat, liste]) => {
    const total = liste.reduce((t, p) => t + (aAjouter.get(p.id) || 0), 0);
    if (CATEGORIES_UNE_PAGE.has(cat)) {
      const actif = categorieCourante === cat || liste.some(p => p.id === courant);
      return `<a href="${lienCategorie(cat)}" class="menu-produit${actif ? ' actif' : ''}">
        <span>${echapper(cat)}</span><span class="menu-nb">${liste.length}</span>${compteur(total)}</a>`;
    }
    if (liste.length === 1) {
      const p = liste[0];
      return `<a href="produit.html?id=${p.id}" class="menu-produit${p.id === courant ? ' actif' : ''}">
        <span>${echapper(court(p.nom))}</span>${compteur(aAjouter.get(p.id))}</a>`;
    }
    const ouvert = liste.some(p => p.id === courant);
    const titre = cat.replace(/\s*\(.*\)$/, '');           // « Vidéotron pub (warm-up, …) » -> « Vidéotron pub »
    return `
      <details class="menu-groupe"${ouvert ? ' open' : ''}>
        <summary><span>${echapper(titre)}</span><span class="menu-nb">${liste.length}</span>${compteur(total)}</summary>
        ${liste.map(p => `<a href="produit.html?id=${p.id}" class="menu-produit${p.id === courant ? ' actif' : ''}">
          <span>${echapper(court(p.nom))}</span>${compteur(aAjouter.get(p.id))}</a>`).join('')}
      </details>`;
  }).join('');
  if (courant || categorieCourante) zone.querySelector('.menu-produit.actif')?.scrollIntoView({ block: 'nearest' });
}

// Compteurs du menu :
//  « Toutes les demandes » = à traiter (Régie) ou questions en attente (Sponsoring)
//  « Fiches produit »      = produits de demandes à ajouter (Régie)
async function compterDemandes(profil) {
  const regie = ['regie', 'admin'].includes(profil.role);
  let q = sb.from('demandes').select('id', { count: 'exact', head: true });
  q = regie ? q.in('statut', ['nouvelle', 'en_cours']) : q.eq('statut', 'question').eq('cree_par', profil.id);
  const requetes = [q];
  if (regie) {
    requetes.push(sb.from('demandes_produits').select('demande_id, demande:demandes!inner(statut)', { count: 'exact', head: true })
      .is('traite_le', null).neq('demande.statut', 'traitee'));
  }
  const [demandes, aAjouter] = await Promise.all(requetes);
  afficherCompteur('demandes', demandes, regie ? 'Demandes à traiter' : 'Questions de la Régie en attente');
  if (aAjouter) afficherCompteur('a_ajouter', aAjouter, 'Produits de demandes à ajouter');
}

function afficherCompteur(cle, { count, error }, titre) {
  const el = document.querySelector(`[data-compteur="${cle}"]`);
  if (error || !el) return;
  el.textContent = count;
  el.hidden = !count;
  el.title = titre;
}

export async function deconnecter() {
  await sb.auth.signOut();
  location.replace('index.html');
}

// ---------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------
export function echapper(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Sponsor vendu « au match » : comme dans Colosseo, il n'entre dans la playlist que le jour de son match
// (décidé avec Léa le 01.10.2026). Libellé à afficher à la place de « À l'écran » ; null pour une vente à la saison.
// l.matchs = [{ match: { date_heure } }]
export function etatAuMatch(l) {
  if (l.type_vente !== 'match') return null;
  const dates = (l.matchs || []).map(m => m.match?.date_heure).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b);
  if (dates.some(d => d.toDateString() === new Date().toDateString())) {
    return '<span class="etat etat-ecran">À l’écran ce soir</span>';
  }
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  const prochain = dates.find(d => d >= debut);
  if (!prochain) return '<span class="etat etat-non">Match passé</span>';
  const ensuite = dates.filter(d => d > prochain).length;
  return `<span class="etat etat-prevu" title="Pas encore dans la playlist : à ajouter dans Colosseo le jour du match">📅 Prévu le ${
    prochain.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })}</span>${ensuite ? ` <span class="doux petit">+${ensuite} match${ensuite > 1 ? 's' : ''}</span>` : ''}`;
}

export function dateCourte(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dateHeure(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// « il y a 5 min », « il y a 3 h », « il y a 2 j »
export function depuis(d) {
  const min = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

// « Léa Talon » -> « LT » ; « marc.dupont » -> « MD »
export function initiales(nom = '') {
  const mots = String(nom).split(/[\s.\-_@]+/).filter(Boolean);
  return ((mots[0]?.[0] || '') + (mots[1]?.[0] || '')).toUpperCase() || '?';
}

export function notifier(message, type = 'ok') {
  let zone = document.getElementById('notifications');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'notifications';
    document.body.append(zone);
  }
  const el = document.createElement('div');
  el.className = `notification notification-${type}`;
  el.textContent = message;
  zone.append(el);
  setTimeout(() => el.remove(), type === 'erreur' ? 8000 : 4000);
}

// Toutes les lignes d'une requête, par paquets de 1000 (limite de Supabase par réponse)
// requete = (de, a) => sb.from(…).select(…).range(de, a)
export async function toutesLesLignes(requete) {
  const lignes = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await requete(de, de + 999);
    if (error) throw error;
    lignes.push(...(data || []));
    if (!data || data.length < 1000) return lignes;
  }
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Nom de fichier sûr pour le stockage (accents et espaces retirés)
export function nomFichierSur(nom) {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_');
}

export function taille(octets = 0) {
  return octets < 1048576 ? `${Math.max(1, Math.round(octets / 1024))} Ko` : `${(octets / 1048576).toFixed(1)} Mo`;
}
