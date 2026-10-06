// Créer un nouveau produit ou modifier un produit existant (Régie / admin, demandé par Léa le 06.10.2026).
// Fenêtre ouverte depuis « + Nouveau produit » (barre des onglets) et « ✏️ Modifier le produit » (fiche produit).
// Pas de migration : la Régie écrit déjà dans `produits` (migration 25). Les bandes LED 3M / 6M ne se créent pas ici.
import { sb, echapper, notifier, MOMENTS } from './app.js';

const TYPES = {
  temps:    ['Passe un certain temps à chaque match', 'vidéo ou visuel : pub vidéotron, angles, anneau LED…'],
  exclusif: ['Un seul sponsor à la fois', 'action scene, sponsor du match…'],
  slide:    ['Logo sur des slides', 'slides passées dans la Pub pause tiers'],
};
const PREFIXE_SCENE = 'Action scene – ';
const FORMATS_VIDEOTRON = { largeur_px: 1920, hauteur_px: 1080, formats: 'png, jpg, jpeg, mp4, mov' };

// Noms dont l'outil se sert pour reconnaître un produit : ne pas les changer ici
const nomProtege = (p) => p && (p.famille === 'emplacement' || p.famille === 'slide'
  || /pause tiers|sponsor du match/i.test(p.nom));

// p = produit à modifier, ou null pour un nouveau produit
export async function ouvrirEditionProduit(p = null) {
  const [{ data: produits }, { data: couple }] = await Promise.all([
    sb.from('produits').select('id, nom, categorie, support, famille, ordre, actif'),
    sb.from('produits').select('id').eq('nom', 'Anneau LED couplé').maybeSingle(),
  ]);
  const actifs = (produits || []).filter(x => x.actif);
  const categories = [...new Set(actifs.map(x => x.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const supports = [...new Set(actifs.map(x => x.support).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const pauseTiers = actifs.find(x => x.famille === 'temps' && /pause tiers/i.test(x.nom));
  const nouveau = !p;
  const v = p || { famille: 'temps', mode_vente: 'saison', duree_par_slide_s: 5 };
  const protege = nomProtege(p);

  const voile = document.createElement('div');
  voile.className = 'voile';
  const fenetre = document.createElement('div');
  fenetre.className = 'fenetre fenetre-moyenne';
  fenetre.setAttribute('role', 'dialog');
  fenetre.setAttribute('aria-modal', 'true');
  fenetre.innerHTML = `
    <div class="fenetre-entete">
      <div>
        <div class="surtitre">${nouveau ? 'Produits' : echapper(p.categorie || 'Produit')}</div>
        <h2>${nouveau ? 'Nouveau produit' : `Modifier ${echapper(p.nom)}`}</h2>
      </div>
      <button type="button" class="btn btn-discret" data-fermer aria-label="Fermer">✕</button>
    </div>
    <form class="fenetre-corps form-produit" novalidate>
      <div class="champ">
        <label for="pe-nom">Nom du produit</label>
        <input type="text" id="pe-nom" name="nom" required value="${echapper(v.nom || '')}" ${protege ? 'readonly' : ''}
               placeholder="ex. Pub entrée des joueurs">
        ${protege ? '<div class="aide">Ce nom sert à l’outil pour reconnaître le produit : il ne peut pas être changé ici.</div>' : ''}
      </div>
      <div class="champ">
        <label for="pe-categorie">Catégorie</label>
        <input type="text" id="pe-categorie" name="categorie" required list="pe-categories" value="${echapper(v.categorie || '')}"
               placeholder="Choisir dans la liste ou écrire une nouvelle catégorie" autocomplete="off">
        <datalist id="pe-categories">${categories.map(c => `<option value="${echapper(c)}"></option>`).join('')}</datalist>
        <div class="aide">Regroupe les produits dans les onglets et dans la demande. Une nouvelle catégorie se met à la fin.</div>
      </div>

      <div class="champ">
        <label>Type de produit</label>
        ${nouveau ? `<div class="choix">${Object.entries(TYPES).map(([val, [titre]]) => `
          <label><input type="radio" name="famille" value="${val}" ${v.famille === val ? 'checked' : ''}> ${titre}</label>`).join('')}</div>
          <div class="aide" id="pe-aide-type"></div>
          <div class="aide">Les bandes LED 3M / 6M (emplacements) ne se créent pas ici.</div>`
        : `<div>${echapper(TYPES[v.famille]?.[0] || 'Bande LED (emplacements)')}</div>
           <div class="aide">Le type ne se change pas une fois le produit créé.</div>`}
      </div>

      <div class="grille-2" data-pour="temps exclusif">
        <div class="champ">
          <label for="pe-support">Où ça passe (écran)</label>
          <input type="text" id="pe-support" name="support" list="pe-supports" value="${echapper(v.support || '')}"
                 placeholder="ex. Vidéotron" autocomplete="off">
          <datalist id="pe-supports">${supports.map(s => `<option value="${echapper(s)}"></option>`).join('')}</datalist>
          <div class="aide">« Vidéotron » : la demande fait choisir avec ou sans son.</div>
        </div>
        <div class="champ">
          <label for="pe-moment">Quand ça passe</label>
          <select id="pe-moment" name="moment_defaut">
            <option value="">—</option>
            ${Object.entries(MOMENTS).map(([val, txt]) => `<option value="${val}" ${v.moment_defaut === val ? 'selected' : ''}>${txt}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="champ">
        <label>Dans la demande, proposé par défaut</label>
        <div class="choix">
          <label><input type="radio" name="mode_vente" value="saison" ${v.mode_vente !== 'match' ? 'checked' : ''}> Toute la saison</label>
          <label><input type="radio" name="mode_vente" value="match" ${v.mode_vente === 'match' ? 'checked' : ''}> Seulement certains matchs</label>
        </div>
        <div class="aide">Le Sponsoring peut toujours choisir l’autre.</div>
      </div>

      <div class="champ" data-pour="temps exclusif">
        <label class="case-grande"><input type="checkbox" name="anneau" ${v.lie_a_produit_id ? 'checked' : ''}
          ${!v.lie_a_produit_id && !couple ? 'disabled' : ''}> Avec ou sans anneau LED (choix du Sponsoring dans la demande)</label>
        ${!v.lie_a_produit_id && !couple ? '<div class="aide">Exécutez d’abord la migration 35 dans Supabase.</div>' : ''}
      </div>

      <div class="champ" data-pour="temps">
        <label for="pe-capacite">Temps maximum par match (minutes)</label>
        <input type="number" id="pe-capacite" name="capacite_min" min="1" step="0.5" style="max-width:10rem"
               value="${v.capacite_s ? Math.round(v.capacite_s / 30) / 2 : ''}">
        <div class="aide">Facultatif. Au-delà : une alerte, jamais de blocage.</div>
      </div>

      <div class="grille-2" data-pour="slide">
        <div class="champ">
          <label for="pe-logos">Logos par slide</label>
          <input type="number" id="pe-logos" name="logos_par_slide" min="1" value="${v.logos_par_slide ?? ''}">
        </div>
        <div class="champ">
          <label for="pe-duree-slide">Durée d’une slide (s)</label>
          <input type="number" id="pe-duree-slide" name="duree_par_slide_s" min="1" value="${v.duree_par_slide_s ?? ''}">
        </div>
      </div>

      <fieldset class="champ cadre-format">
        <legend>Format attendu des fichiers</legend>
        <div class="form-format">
          <label>Largeur (px)<input type="number" min="1" name="largeur_px" value="${v.largeur_px ?? ''}"></label>
          <label>Hauteur (px)<input type="number" min="1" name="hauteur_px" value="${v.hauteur_px ?? ''}"></label>
          <label>Formats<input type="text" name="formats" value="${echapper((v.formats || []).join(', '))}" placeholder="png, jpg, mp4"></label>
          <label>Durée max (s)<input type="number" min="1" name="duree_max_s" value="${v.duree_max_s ?? ''}"></label>
          <label class="format-remarque">Remarque<input type="text" name="remarque_format" value="${echapper(v.remarque_format || '')}"></label>
        </div>
        <div class="aide">Facultatif. Sert à avertir si un fichier n’a pas le bon format (jamais bloquant).</div>
      </fieldset>
      <p class="message message-erreur" data-erreur hidden></p>
    </form>
    <div class="fenetre-pied">
      <button type="button" class="btn btn-discret" data-fermer>Annuler</button>
      <button type="button" class="btn btn-principal" data-enregistrer>${nouveau ? 'Créer le produit' : 'Enregistrer'}</button>
    </div>`;
  document.body.append(voile, fenetre);
  document.body.classList.add('fenetre-ouverte');

  const form = fenetre.querySelector('form');
  const champ = (n) => form.elements[n];
  const famille = () => nouveau ? form.querySelector('input[name=famille]:checked')?.value : v.famille;

  // n'afficher que les champs du type choisi
  const majType = () => {
    const f = famille();
    form.querySelectorAll('[data-pour]').forEach(el => { el.hidden = !el.dataset.pour.split(' ').includes(f); });
    const aide = form.querySelector('#pe-aide-type');
    if (aide) aide.textContent = TYPES[f] ? `Par exemple : ${TYPES[f][1]}.` : '';
  };
  majType();
  form.addEventListener('change', (e) => { if (e.target.name === 'famille') majType(); });
  // Vidéotron : format du media kit proposé s'il n'y a encore rien
  champ('support').addEventListener('change', () => {
    if (!/^vid[ée]otron$/i.test(champ('support').value.trim())) return;
    for (const [n, val] of Object.entries(FORMATS_VIDEOTRON)) if (!champ(n).value) champ(n).value = val;
  });

  const fermer = () => {
    voile.remove(); fenetre.remove();
    document.removeEventListener('keydown', echap);
    if (!document.querySelector('.fenetre:not([hidden])')) document.body.classList.remove('fenetre-ouverte');
  };
  const echap = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } };
  document.addEventListener('keydown', echap);
  voile.addEventListener('click', fermer);
  fenetre.querySelectorAll('[data-fermer]').forEach(b => b.addEventListener('click', fermer));
  champ(nouveau ? 'nom' : 'categorie').focus();

  const erreur = fenetre.querySelector('[data-erreur]');
  const montrerErreur = (texte) => { erreur.textContent = texte; erreur.hidden = false; erreur.scrollIntoView({ block: 'nearest' }); };
  const bouton = fenetre.querySelector('[data-enregistrer]');
  form.addEventListener('submit', (e) => { e.preventDefault(); bouton.click(); });

  bouton.addEventListener('click', async () => {
    erreur.hidden = true;
    const f = famille();
    const texte = (n) => String(champ(n)?.value || '').trim();
    const nombre = (n) => { const x = parseFloat(texte(n)); return Number.isFinite(x) && x > 0 ? x : null; };
    const categorie = texte('categorie');
    let nom = texte('nom');
    // Action scenes : même forme de nom que les autres scènes (« Action scene – Goal »)
    if (categorie === 'Action scenes' && nom && !protege && !nom.startsWith(PREFIXE_SCENE)) nom = PREFIXE_SCENE + nom.replace(/^action scene\s*[–-]?\s*/i, '');
    if (!nom) return montrerErreur('Indiquez le nom du produit.');
    if (!categorie) return montrerErreur('Indiquez la catégorie.');
    if (!f) return montrerErreur('Choisissez le type de produit.');
    if (f === 'slide' && !nombre('logos_par_slide')) return montrerErreur('Indiquez le nombre de logos par slide.');
    const doublon = (produits || []).find(x => x.id !== p?.id && x.nom.toLowerCase() === nom.toLowerCase());
    if (doublon) return montrerErreur(`Un produit « ${doublon.nom} » existe déjà${doublon.actif ? '' : ' (désactivé)'}.`);

    const formats = texte('formats').toLowerCase().split(/[\s,;]+/).map(x => x.replace(/^\./, '')).filter(Boolean);
    const entier = (n) => { const x = nombre(n); return x ? Math.round(x) : null; };
    const donnees = {
      nom, categorie,
      mode_vente: form.querySelector('input[name=mode_vente]:checked')?.value || 'saison',
      largeur_px: entier('largeur_px'), hauteur_px: entier('hauteur_px'), duree_max_s: entier('duree_max_s'),
      formats: formats.length ? [...new Set(formats)] : null, remarque_format: texte('remarque_format') || null,
    };
    if (f === 'slide') {
      Object.assign(donnees, { logos_par_slide: entier('logos_par_slide'), duree_par_slide_s: entier('duree_par_slide_s') || 5 });
      if (nouveau) donnees.diffuse_dans_produit_id = pauseTiers?.id || null;
    } else if (f === 'temps' || f === 'exclusif') {
      Object.assign(donnees, { support: texte('support') || null, moment_defaut: champ('moment_defaut').value || null });
      // anneau : on garde l'anneau déjà relié (la Pub pause tiers a le sien), sinon « Anneau LED couplé » (migration 35)
      donnees.lie_a_produit_id = champ('anneau').checked ? (v.lie_a_produit_id || couple?.id || null) : null;
      if (f === 'temps') { const m = nombre('capacite_min'); donnees.capacite_s = m ? Math.round(m * 60) : null; }
    }
    if (nouveau) {
      donnees.famille = f;
      // place dans le déroulé de la soirée : avec les produits de sa catégorie, sinon à la fin
      const memeCat = actifs.filter(x => x.categorie === categorie).map(x => x.ordre ?? 100);
      donnees.ordre = memeCat.length ? Math.min(...memeCat) : 100;
    }

    bouton.disabled = true;
    const requete = nouveau ? sb.from('produits').insert(donnees).select('id, categorie').single()
      : sb.from('produits').update(donnees).eq('id', p.id).select('id, categorie').single();
    const { data, error } = await requete;
    bouton.disabled = false;
    if (error) {
      return montrerErreur(error.code === '23505' ? `Un produit « ${nom} » existe déjà.`
        : /remarque_format/.test(error.message) ? 'Exécutez d’abord la migration 32 dans Supabase.'
        : error.code === '42501' || /row-level security/i.test(error.message) ? 'Seules la Régie et l’admin peuvent créer ou modifier un produit.'
        : error.message);
    }
    if (!data) return montrerErreur('Enregistrement refusé (droits insuffisants ?).');
    fermer();
    if (nouveau) {
      notifier(`Produit « ${nom} » créé.`);
      location.href = `produit.html?id=${data.id}`;
    } else {
      notifier('Produit enregistré.');
      location.reload();
    }
  });
}
