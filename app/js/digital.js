// Espace Digital (16.10.2026, migration 55) : Programme de match, Bannière app, Parrainage joueur.
// Léa gère le digital, toujours reçu du Sponsoring par la même demande. Pas de diffusion Colosseo :
// des « éléments » (digital_elements) avec des cases « c'est mis » (programme, app, site, vidéotron).
import { sb, exigerConnexion, echapper, dateCourte, notifier, vueDigital } from './app.js';
import { carteTraitement, CHAMPS_A_TRAITER } from './traitement.js';
import { ouvrirAjoutDigital } from './ajout-digital.js';

const { profil } = await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });
const estRegie = ['regie', 'admin'].includes(profil.role);
const qui = profil.nom || (profil.email || '').split('@')[0];

const $ = (id) => document.getElementById(id);
const VUES = {
  programme: { titre: 'Programme de match', onglet: 'Programme de match' },
  app: { titre: 'Bannières app', onglet: 'Bannières app' },
  parrainage: { titre: 'Parrainages joueurs', onglet: 'Parrainages joueurs' },
  reseaux: { titre: 'Réseaux sociaux', onglet: 'Réseaux sociaux' },
};
// accès « reseaux » (migration 65) : la personne qui publie voit la page Réseaux sociaux et coche « Publié »
const espaces = profil.espaces || [];
const accesDigital = espaces.includes('digital');
const peutPublier = estRegie || espaces.includes('reseaux');
const MAX_PUBS_PROGRAMME = 3;       // Léa : « plus que 3 c'est chiant », quelle que soit la taille
// cases « c'est mis » par vue
const CASES = {
  programme: [['programme', 'Mis dans le programme']],
  app: [['app', 'Mise dans l’app']],
  parrainage: [['videotron', 'Vidéotron'], ['app', 'App'], ['site', 'Site'], ['programme', 'Programme']],
};

const vueDemandee = new URLSearchParams(location.search).get('vue');
const vue = !accesDigital ? 'reseaux' : VUES[vueDemandee] ? vueDemandee : 'programme';
if (!accesDigital) Object.keys(VUES).forEach(v => { if (v !== 'reseaux') delete VUES[v]; });
const etat = { produit: null, elements: [], attente: [], joueurs: [], matchs: [], types: [] };
const jour = (d) => d ? dateCourte(d + 'T12:00') : '?';
const aujourdhui = () => new Date().toISOString().slice(0, 10);

document.title = `${VUES[vue].titre} — Sponsoring ↔ Régie`;
$('titre').textContent = VUES[vue].titre;
$('onglets').innerHTML = Object.entries(VUES).map(([v, x]) =>
  `<button type="button" data-vue="${v}" class="${v === vue ? 'actif' : ''}">${x.onglet}</button>`).join('');
$('onglets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vue]');
  if (b && b.dataset.vue !== vue) location.href = `digital.html?vue=${b.dataset.vue}`;
});

function erreur(texte) { $('erreur').textContent = texte; $('erreur').hidden = !texte; }

async function charger() {
  if (!accesDigital && !espaces.includes('reseaux')) {
    $('resume').textContent = '';
    return erreur('Accès réservé à l’espace Digital : demandez à un admin.');
  }
  const { data: produits, error } = await sb.from('produits').select('*').eq('espace', 'digital');
  if (error) return erreur(/espace/.test(error.message) ? 'Exécutez d’abord la migration 55 dans Supabase.' : error.message);
  etat.produit = (produits || []).find(p => vueDigital(p) === vue);
  if (!etat.produit) return erreur(`Produit introuvable : exécutez la migration ${vue === 'reseaux' ? 65 : 55} dans Supabase.`);
  $('btn-ajouter').hidden = !estRegie;      // ajouter sans demande (Léa, 16.10.2026 : « pour aller plus vite »)

  const [{ data: elements, error: e1 }, { data: attente }, { data: joueurs }, { data: matchs }] = await Promise.all([
    sb.from('digital_elements')
      .select('*, sponsor:sponsors(id, nom), match:matchs(id, numero, date_heure, adversaire), demande:demandes(id)')
      .eq('produit_id', etat.produit.id).order('created_at'),
    sb.from('demandes_produits').select(CHAMPS_A_TRAITER)
      .eq('produit_id', etat.produit.id).is('traite_le', null).neq('demande.statut', 'traitee'),
    sb.from('joueurs').select('*').eq('actif', true).order('numero'),
    ['programme', 'reseaux'].includes(vue) ? sb.from('matchs').select('id, numero, date_heure, adversaire, type').neq('type', 'ladies').order('date_heure')
                        : Promise.resolve({ data: [] }),
  ]);
  if (e1) return erreur(e1.message);
  etat.elements = elements || [];
  etat.attente = attente || [];
  etat.joueurs = joueurs || [];
  etat.matchs = matchs || [];
  if (vue === 'reseaux') {
    const { data: types } = await sb.from('types_posts').select('nom, ordre').eq('actif', true).order('ordre');
    etat.types = (types || []).map(t => t.nom);
  }
  afficherAttente();
  afficher();
}

// À ajouter : la même carte que partout (traitement.js) ; « Ajouter ✓ » crée les éléments
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
// Morceaux communs
// ---------------------------------------------------------------------
const fichiers = (el) => (el.fichiers || []).length
  ? el.fichiers.map(f => `<button type="button" class="btn btn-discret petit" data-fichier="${echapper(f.chemin)}"
      title="Télécharger">⬇ ${echapper(f.nom || f.chemin.split('/').pop())}</button>`).join(' ')
  : '<span class="badge badge-a-venir">fichier à venir</span>';

function cases(el) {
  if (el.statut === 'retire') {
    const f = el.fait?.retiree;
    return `<label class="petit" style="margin:0;color:var(--erreur)" title="${f ? `par ${echapper(f.par)} le ${dateCourte(f.le)}` : ''}">
      <input type="checkbox" data-fait="retiree" data-id="${el.id}" ${f ? 'checked' : ''} ${estRegie ? '' : 'disabled'}>
      ${vue === 'parrainage' ? 'Enlevé partout' : 'Enlevé'}</label>`;
  }
  return CASES[vue].map(([cle, texte]) => {
    const f = el.fait?.[cle];
    return `<label class="petit" style="margin:0 .6rem 0 0;white-space:nowrap" title="${f ? `par ${echapper(f.par)} le ${dateCourte(f.le)}` : ''}">
      <input type="checkbox" data-fait="${cle}" data-id="${el.id}" ${f ? 'checked' : ''} ${estRegie ? '' : 'disabled'}> ${texte}</label>`;
  }).join('');
}

// Commentaire libre de Léa / la Régie (migration 56), modifiable sur place ; la remarque du Sponsoring reste à part
const commentaire = (el) => estRegie
  ? `<textarea class="petit" data-commentaire="${el.id}" rows="1" placeholder="Commentaire…"
       style="min-height:0;min-width:12rem;field-sizing:content">${echapper(el.commentaire || '')}</textarea>`
  : `<span class="petit" style="white-space:pre-line">${echapper(el.commentaire || '')}</span>`;
const remarque = (el) => el.remarque ?`<div class="doux petit" style="white-space:pre-line">${echapper(el.remarque)}</div>` : '';
const sponsor = (el) => `<strong>${echapper(el.sponsor?.nom || '—')}</strong>${
  el.statut === 'retire' ? ' <span class="badge badge-suppression">retiré : à enlever</span>' : ''}${
  el.demande?.id ? ` <a class="petit" href="demandes.html?id=${el.demande.id}">demande →</a>` : ''}`;

// ---------------------------------------------------------------------
// Programme de match : par match, alerte au-delà de 3 pubs
// ---------------------------------------------------------------------
function vueProgramme() {
  const parMatch = new Map();
  for (const el of etat.elements) {
    if (!el.match_id) continue;
    if (!parMatch.has(el.match_id)) parMatch.set(el.match_id, []);
    parMatch.get(el.match_id).push(el);
  }
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  const aVenir = etat.matchs.filter(m => new Date(m.date_heure) >= debut);
  const passes = etat.matchs.filter(m => new Date(m.date_heure) < debut && parMatch.has(m.id)).reverse();
  // une carte par match (choix de Léa, 16.10.2026) : ses pubs dessous, compteur « N / 3 » bien visible
  // À enlever (20.10.2026, option A de Léa) : le programme est refait à partir de celui du match précédent →
  // ses pubs qui ne sont plus dans ce match, en rouge, case « Enlevé » (gardée sur la pub du match précédent)
  const aEnlever = (m) => {
    const i = etat.matchs.findIndex(x => x.id === m.id);
    const precedent = i > 0 ? etat.matchs[i - 1] : null;
    if (!precedent) return [];
    const ici = new Set((parMatch.get(m.id) || []).filter(el => el.statut === 'actif').map(el => el.sponsor_id));
    return (parMatch.get(precedent.id) || []).filter(el => el.statut === 'actif' && !ici.has(el.sponsor_id));
  };
  const carteMatch = (m) => {
    const liste = parMatch.get(m.id) || [];
    const actifs = liste.filter(el => el.statut === 'actif');
    const trop = actifs.length > MAX_PUBS_PROGRAMME;
    const enlever = aEnlever(m);
    const restent = actifs.filter(el => !el.fait?.programme).length + enlever.filter(el => !el.fait?.enleve).length;
    return `
      <section class="carte carte-programme${trop ? ' trop' : ''}">
        <div class="programme-entete">
          <strong>${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}</strong>
          ${restent ? `<span class="doux petit">${restent} à faire</span>` : actifs.length || enlever.length ? '<span class="petit" style="color:var(--ok)">✓ tout est fait</span>' : ''}
          <span class="espace"></span>
          <span class="badge ${trop ? 'badge-suppression' : actifs.length === MAX_PUBS_PROGRAMME ? 'badge-a-venir' : ''}">
            ${trop ? '⚠ ' : ''}${actifs.length} / ${MAX_PUBS_PROGRAMME} pubs</span>
        </div>
        ${liste.length ? liste.map(el => `
          <div class="programme-pub${el.statut === 'retire' && el.fait?.retiree ? ' passe' : ''}">
            <div class="programme-sponsor">${sponsor(el)}${remarque(el)}</div>
            <span class="badge">${el.format === 'pleine' ? 'Page pleine' : el.format === 'demi' ? 'Demi-page' : 'format ?'}</span>
            <div>${fichiers(el)}</div>
            <div>${cases(el)}</div>
            <div class="programme-commentaire">${commentaire(el)}</div>
          </div>`).join('') : '<p class="doux petit" style="margin:.4rem 0 0">Aucune pub</p>'}
        ${enlever.map(el => {
          const f = el.fait?.enleve;
          return `
          <div class="programme-pub programme-enlever${f ? ' passe' : ''}">
            <div class="programme-sponsor">🗑️ <strong>${echapper(el.sponsor?.nom || '—')}</strong>
              <span class="badge badge-suppression">à enlever</span>
              <div class="doux petit">était au match précédent</div></div>
            <span class="badge">${el.format === 'pleine' ? 'Page pleine' : el.format === 'demi' ? 'Demi-page' : 'format ?'}</span>
            <div></div>
            <div><label class="petit" style="margin:0;color:var(--erreur)" title="${f ? `par ${echapper(f.par)} le ${dateCourte(f.le)}` : ''}">
              <input type="checkbox" data-fait="enleve" data-id="${el.id}" ${f ? 'checked' : ''} ${estRegie ? '' : 'disabled'}> Enlevé</label></div>
            <div></div>
          </div>`;
        }).join('')}
      </section>`;
  };
  const nbAlertes = aVenir.filter(m => (parMatch.get(m.id) || []).filter(el => el.statut === 'actif').length > MAX_PUBS_PROGRAMME).length;
  $('resume').textContent = `${aVenir.length} match${aVenir.length > 1 ? 's' : ''} à venir`
    + (nbAlertes ? ` · ⚠ ${nbAlertes} avec plus de ${MAX_PUBS_PROGRAMME} pubs` : '');
  return `
    ${aVenir.map(carteMatch).join('') || '<p class="vide">Aucun match à venir.</p>'}
    ${passes.length ? `
      <details style="margin-top:1rem"><summary><strong>Matchs passés</strong> <span class="doux">· ${passes.length}</span></summary>
        ${passes.map(carteMatch).join('')}
      </details>` : ''}`;
}

// ---------------------------------------------------------------------
// Bannières app : du … au …
// ---------------------------------------------------------------------
function vueApp() {
  const auj = aujourdhui();
  const quand = (el) => el.au && el.au < auj ? 'terminee' : el.du && el.du > auj ? 'a_venir' : 'en_ligne';
  const LIB = { en_ligne: 'En ligne', a_venir: 'À venir', terminee: 'Terminée' };
  const ordre = { en_ligne: 0, a_venir: 1, terminee: 2 };
  const liste = [...etat.elements].sort((a, b) =>
    (a.statut === 'retire') - (b.statut === 'retire') || ordre[quand(a)] - ordre[quand(b)] || (a.du || '').localeCompare(b.du || ''));
  const enLigne = liste.filter(el => el.statut === 'actif' && quand(el) === 'en_ligne').length;
  $('resume').textContent = `${enLigne} bannière${enLigne > 1 ? 's' : ''} en ligne aujourd'hui`;
  const ligne = (el) => `
    <tr class="${quand(el) === 'terminee' || (el.statut === 'retire' && el.fait?.retiree) ? 'passe' : ''}">
      <td>${sponsor(el)}${remarque(el)}</td>
      <td style="white-space:nowrap">du ${jour(el.du)}<br>au ${jour(el.au)}</td>
      <td><span class="badge${quand(el) === 'en_ligne' ? ' statut-traitee' : ''}">${LIB[quand(el)]}</span></td>
      <td>${fichiers(el)}</td>
      <td>${cases(el)}${el.statut === 'actif' && quand(el) === 'terminee' && el.fait?.app ? '<div class="doux petit">à enlever de l’app</div>' : ''}</td>
      <td>${commentaire(el)}</td>
    </tr>`;
  return `
    <div class="carte" style="padding:0;overflow:hidden"><div class="tableau-conteneur">
      <table class="tableau non-cliquable">
        <thead><tr><th>Sponsor</th><th>Dates</th><th>État</th><th>Fichier</th><th>C'est mis</th><th>Commentaire</th></tr></thead>
        <tbody>${liste.map(ligne).join('') || '<tr><td colspan="6" class="vide">Aucune bannière.</td></tr>'}</tbody>
      </table>
    </div></div>`;
}

// ---------------------------------------------------------------------
// Parrainages joueurs : un joueur par rangée (parrain ou « libre »)
// ---------------------------------------------------------------------
function vueParrainage() {
  const parJoueur = new Map();
  for (const el of etat.elements) {
    if (el.statut === 'retire' && el.fait?.retiree) continue;     // enlevé partout : plus rien à faire
    if (!parJoueur.has(el.joueur_id)) parJoueur.set(el.joueur_id, []);
    parJoueur.get(el.joueur_id).push(el);
  }
  const avec = etat.joueurs.filter(j => (parJoueur.get(j.id) || []).some(el => el.statut === 'actif')).length;
  $('resume').textContent = `${avec} joueur${avec > 1 ? 's' : ''} parrainé${avec > 1 ? 's' : ''} sur ${etat.joueurs.length}`;
  const POS = { gardien: 'Gardiens', 'défenseur': 'Défenseurs', attaquant: 'Attaquants' };
  const groupes = Object.keys(POS).map(pos => [pos, etat.joueurs.filter(j => j.position === pos)])
    .concat([['autre', etat.joueurs.filter(j => !POS[j.position])]]).filter(([, l]) => l.length);
  const rangees = (j) => {
    const liste = parJoueur.get(j.id) || [];
    const nomJ = `<strong>${j.numero ?? ''}</strong> ${echapper(`${j.prenom} ${j.nom}`)}`;
    if (!liste.length) return `<tr><td>${nomJ}</td><td colspan="4" class="doux petit">libre</td></tr>`;
    return liste.map(el => `
      <tr><td>${nomJ}</td><td>${sponsor(el)}${remarque(el)}</td><td>${fichiers(el)}</td><td>${cases(el)}</td>
        <td>${commentaire(el)}</td></tr>`).join('');
  };
  return `
    <div class="carte" style="padding:0;overflow:hidden"><div class="tableau-conteneur">
      <table class="tableau non-cliquable">
        <thead><tr><th>Joueur</th><th>Parrain</th><th>Logo</th><th>C'est mis</th><th>Commentaire</th></tr></thead>
        <tbody>${groupes.map(([pos, liste]) => `
          <tr class="rangee-titre"><td colspan="5">${POS[pos] || 'Autres'}</td></tr>
          ${liste.map(rangees).join('')}`).join('')
          || '<tr><td colspan="5" class="vide">Aucun joueur : exécutez la migration 55.</td></tr>'}</tbody>
      </table>
    </div></div>`;
}

// ---------------------------------------------------------------------
// Réseaux sociaux (22.10.2026, migration 65) : une carte par match, chaque type de post avec son sponsor (vendu à la
// saison = tous les matchs de saison / playoffs, ou pour ce match) ou « libre » ; case « Publié » + lien, par match.
// ---------------------------------------------------------------------
function vueReseaux() {
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  const actifs = etat.elements.filter(el => el.statut === 'actif' && el.type_post);
  const surMatch = (m) => actifs.filter(el => el.match_id ? el.match_id === m.id : ['saison', 'playoffs'].includes(m.type));
  const aVenir = etat.matchs.filter(m => new Date(m.date_heure) >= debut);
  const passes = etat.matchs.filter(m => new Date(m.date_heure) < debut && surMatch(m).length).reverse();
  const types = [...new Set([...etat.types, ...actifs.map(el => el.type_post)])];
  const carte = (m) => {
    const posts = surMatch(m);
    const aFaire = posts.filter(el => !el.fait?.[m.id]).length;
    return `
      <section class="carte carte-programme">
        <div class="programme-entete">
          <strong>${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}</strong>
          ${posts.length ? (aFaire ? `<span class="doux petit">${aFaire} à publier</span>` : '<span class="petit" style="color:var(--ok)">✓ tout est publié</span>') : ''}
          <span class="espace"></span>
          <span class="badge">${posts.length} / ${types.length} posts sponsorisés</span>
        </div>
        ${types.map(t => {
          const liste = posts.filter(el => el.type_post === t);
          if (!liste.length) return `<div class="programme-pub"><div class="programme-sponsor"><strong>${echapper(t)}</strong></div>
            <span class="doux petit">libre</span><div></div><div></div><div></div></div>`;
          return liste.map(el => {
            const f = el.fait?.[m.id];
            return `<div class="programme-pub">
              <div class="programme-sponsor"><strong>${echapper(t)}</strong> · ${echapper(el.sponsor?.nom || '—')}
                <span class="doux petit">${el.match_id ? 'ce match' : 'saison'}</span>
                ${liste.length > 1 ? ' <span class="badge badge-suppression">⚠ 2 sponsors</span>' : ''}${remarque(el)}</div>
              <div>${fichiers(el)}</div>
              <div><label class="petit" style="margin:0;white-space:nowrap" title="${f ? `par ${echapper(f.par || '')} le ${dateCourte(f.le)}` : ''}">
                <input type="checkbox" data-publie="${el.id}" data-match="${m.id}" ${f ? 'checked' : ''} ${peutPublier ? '' : 'disabled'}> Publié</label></div>
              <div>${peutPublier ? `<input type="url" class="petit" data-lien="${el.id}" data-match="${m.id}" value="${echapper(f?.lien || '')}"
                  placeholder="Lien du post (facultatif)" style="min-height:0;padding:.25rem .45rem">`
                : f?.lien ? `<a class="petit" href="${echapper(f.lien)}" target="_blank" rel="noopener">Voir le post</a>` : ''}</div>
              <div class="programme-commentaire">${commentaire(el)}</div>
            </div>`;
          }).join('');
        }).join('')}
      </section>`;
  };
  $('resume').textContent = `${aVenir.length} match${aVenir.length > 1 ? 's' : ''} à venir · ${types.length} types de posts`;
  return `
    ${aVenir.map(carte).join('') || '<p class="vide">Aucun match à venir.</p>'}
    ${passes.length ? `
      <details style="margin-top:1rem"><summary><strong>Matchs passés</strong> <span class="doux">· ${passes.length}</span></summary>
        ${passes.map(carte).join('')}
      </details>` : ''}`;
}

function afficher() {
  $('contenu').innerHTML = vue === 'programme' ? vueProgramme() : vue === 'app' ? vueApp()
    : vue === 'reseaux' ? vueReseaux() : vueParrainage();
}

// « Publié » / lien du post (RPC publier_post : Régie, admin, accès « reseaux »)
async function publier(id, match, publie, lien) {
  const { data, error } = await sb.rpc('publier_post', { p_element: id, p_match: match, p_publie: publie, p_lien: lien || null });
  if (error) { notifier(/publier_post/.test(error.message) ? 'Exécutez d’abord la migration 65 dans Supabase.' : `Pas enregistré : ${error.message}`, 'erreur'); return false; }
  const el = etat.elements.find(x => x.id === id);
  if (el) el.fait = data || {};
  return true;
}

// ---------------------------------------------------------------------
// Cases « c'est mis » et téléchargement
// ---------------------------------------------------------------------
$('contenu').addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.publie) {
    t.disabled = true;
    const lien = t.closest('.programme-pub')?.querySelector('[data-lien]')?.value;
    if (await publier(t.dataset.publie, t.dataset.match, t.checked, lien)) afficher(); else { t.checked = !t.checked; t.disabled = false; }
    return;
  }
  if (t.dataset.lien) {
    // un lien collé = publié
    if (await publier(t.dataset.lien, t.dataset.match, !!t.value.trim() || !!etat.elements.find(x => x.id === t.dataset.lien)?.fait?.[t.dataset.match], t.value)) {
      notifier('Lien enregistré');
      afficher();
    }
    return;
  }
  if (t.dataset.commentaire) {
    const el = etat.elements.find(x => x.id === t.dataset.commentaire);
    const texte = t.value.trim() || null;
    const { error } = await sb.from('digital_elements').update({ commentaire: texte }).eq('id', t.dataset.commentaire);
    if (error) {
      return notifier(/commentaire/.test(error.message) ? 'Exécutez d’abord la migration 56 dans Supabase.' : `Pas enregistré : ${error.message}`, 'erreur');
    }
    if (el) el.commentaire = texte;
    return notifier('Commentaire enregistré');
  }
  if (!t.dataset.fait) return;
  const el = etat.elements.find(x => x.id === t.dataset.id);
  if (!el) return;
  const fait = { ...(el.fait || {}) };
  if (t.checked) fait[t.dataset.fait] = { le: new Date().toISOString(), par: qui };
  else delete fait[t.dataset.fait];
  t.disabled = true;
  const { error } = await sb.from('digital_elements').update({ fait }).eq('id', el.id);
  t.disabled = false;
  if (error) { t.checked = !t.checked; return notifier(`Pas enregistré : ${error.message}`, 'erreur'); }
  el.fait = fait;
  afficher();
});

$('btn-ajouter').addEventListener('click', () => ouvrirAjoutDigital(etat.produit, charger));

$('contenu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-fichier]');
  if (!b) return;
  const { data, error } = await sb.storage.from('assets').createSignedUrl(b.dataset.fichier, 600, { download: true });
  if (error) return notifier(error.message, 'erreur');
  location.href = data.signedUrl;
});

await charger();
