// Base commune à toutes les pages : client Supabase, contrôle d'accès, menu, petits outils.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Date de la version, affichée en bas du menu : à changer à chaque mise en ligne (pour vérifier que Netlify a publié)
const VERSION = '29.09.2026';

// ---------------------------------------------------------------------
// Libellés affichés
// ---------------------------------------------------------------------
export const LIBELLES = {
  role: { sponsoring: 'Sponsoring', regie: 'Régie', admin: 'Admin' },
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
export function specsProduit(p) {
  if (!p) return '';
  const dims = p.famille === 'emplacement' ? `${300 * (p.emplacements_requis || 1)} × 80 px`
    : p.largeur_px && p.hauteur_px ? `${p.largeur_px} × ${p.hauteur_px} px`
    : p.hauteur_px ? `${p.hauteur_px} px de haut` : '';
  return [dims, p.formats?.join(', ')].filter(Boolean).join(' · ');
}

// Dimensions attendues (null si pas de contrainte)
export function dimensionsAttendues(p) {
  if (!p) return null;
  if (p.famille === 'emplacement') return { l: 300 * (p.emplacements_requis || 1), h: 80 };
  return p.largeur_px && p.hauteur_px ? { l: p.largeur_px, h: p.hauteur_px } : null;
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
  produits:   '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
};
const icone = (nom) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg>`;

// Rubriques du menu : un titre, puis les onglets dessous
const MENU = [
  { titre: 'Jour de match', liens: [
    { href: 'match-du-jour.html', texte: 'Match du jour', icone: 'match' },
  ] },
  { titre: 'Demandes', liens: [
    { href: 'demandes.html', texte: 'Toutes les demandes', icone: 'demandes', compteur: 'demandes' },
    { href: 'demande.html', texte: 'Nouvelle demande', icone: 'nouvelle' },
  ] },
  { titre: 'Produits', id: 'menu-produits', liens: [
    { href: 'produits.html', texte: 'Vue d’ensemble', icone: 'produits', compteur: 'a_ajouter' },
    { href: 'produit.html', texte: 'Fiches en onglets', icone: 'onglets', aussi: ['categorie.html'] },
  ] },
  { titre: 'Sponsors', liens: [
    { href: 'sponsors.html', texte: 'Dossiers sponsors', icone: 'sponsors', aussi: ['sponsor.html'] },
  ] },
  { titre: 'Saison', liens: [
    { href: 'matchs.html', texte: 'Par match', icone: 'match' },
    { href: 'calendrier.html', texte: 'Calendrier des matchs', icone: 'calendrier' },
  ] },
];

function construireMenu(profil) {
  const page = location.pathname.split('/').pop() || 'index.html';
  const accueil = ['regie', 'admin'].includes(profil.role) ? 'match-du-jour.html' : 'demandes.html';

  const menu = document.createElement('aside');
  menu.className = 'menu-lateral';
  menu.id = 'menu-lateral';
  menu.innerHTML = `
    <a class="marque" href="${accueil}">${LOGO}
      <span class="marque-texte"><strong>Fribourg-Gottéron</strong><small>Sponsoring ↔ Régie</small></span>
    </a>
    <nav>${MENU.map(r => `
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
      <small class="menu-version" title="Version de l'outil en ligne">Version du ${VERSION}</small>
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
  document.body.classList.add('avec-menu');

  const basculer = (ouvert) => {
    document.body.classList.toggle('menu-ouvert', ouvert);
    voile.hidden = !ouvert;
  };
  document.getElementById('btn-menu').onclick = () => basculer(true);
  voile.onclick = () => basculer(false);
  document.getElementById('btn-deconnexion').onclick = deconnecter;
  compterDemandes(profil);
  menuProduits(profil);
}

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

  const onglets = [];
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
  const courant = location.pathname.endsWith('produit.html') ? new URLSearchParams(location.search).get('id') : null;
  const compteur = (n) => n ? `<span class="menu-compteur">${n}</span>` : '';
  const court = (nom) => nom.replace(/^Action scene – /, '');

  const groupes = new Map();
  for (const p of produits) {
    const cat = p.categorie || 'Autres';
    if (!groupes.has(cat)) groupes.set(cat, []);
    groupes.get(cat).push(p);
  }
  // Liste repliable « Tous les produits » : ouverte sur les pages produit, sinon selon le dernier choix
  const surPageProduit = /(produits?|categorie)\.html$/.test(location.pathname);
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

  const categorieCourante = location.pathname.endsWith('categorie.html') ? new URLSearchParams(location.search).get('c') : null;
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
