// « + Ajouter » sur une page Digital, SANS demande (Régie / admin, demandé par Léa le 16.10.2026 : « pour aller plus
// vite »). Même fenêtre que « + Ajouter un sponsor » des fiches produit (ajout-diffusion.js), mais crée directement
// les éléments Digital (digital_elements ; programme : un par match coché). Pas de diffusion, pas de passages.
import { sb, echapper, notifier, nomFichierSur, toutesLesLignes, dateCourte, libelleFichier, vueDigital } from './app.js';

const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// p = produit Digital ; apres() = appelé après chaque ajout (recharger la page)
export async function ouvrirAjoutDigital(p, apres = () => {}) {
  const vue = vueDigital(p);
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const [sponsors, { data: matchs }, { data: joueurs }] = await Promise.all([
    toutesLesLignes((de, a) => sb.from('sponsors').select('id, nom').order('nom').range(de, a)),
    ['programme', 'reseaux'].includes(vue)
      ? sb.from('matchs').select('id, date_heure, adversaire, type').neq('type', 'ladies')
          .gte('date_heure', debutJour.toISOString()).order('date_heure')
      : Promise.resolve({ data: [] }),
    vue === 'parrainage' ? sb.from('joueurs').select('id, numero, prenom, nom').eq('actif', true).order('numero')
                         : Promise.resolve({ data: [] }),
  ]);
  // joueurs déjà parrainés : grisés avec le nom du parrain (Léa, 21.10.2026)
  const parrains = new Map();
  if (vue === 'parrainage') {
    const { data } = await sb.from('digital_elements').select('joueur_id, sponsor:sponsors(nom)')
      .eq('produit_id', p.id).eq('statut', 'actif').not('joueur_id', 'is', null);
    (data || []).forEach(x => parrains.set(x.joueur_id, x.sponsor?.nom || 'un parrain'));
  }
  // réseaux sociaux (migration 65) : types de posts
  let types = [];
  const postsPris = new Map();          // pris à la saison : grisés (Léa, 22.10.2026)
  if (vue === 'reseaux') {
    const [{ data }, { data: pris }] = await Promise.all([
      sb.from('types_posts').select('nom').eq('actif', true).order('ordre'),
      sb.from('digital_elements').select('type_post, sponsor:sponsors(nom)')
        .eq('produit_id', p.id).eq('statut', 'actif').is('match_id', null).not('type_post', 'is', null),
    ]);
    types = (data || []).map(t => t.nom);
    (pris || []).forEach(x => postsPris.set(x.type_post, x.sponsor?.nom || 'un sponsor'));
  }

  const voile = document.createElement('div');
  voile.className = 'voile';
  const fenetre = document.createElement('div');
  fenetre.className = 'fenetre fenetre-moyenne';
  fenetre.setAttribute('role', 'dialog');
  fenetre.setAttribute('aria-modal', 'true');
  const questions = vue === 'programme' ? `
      <div class="champ">
        <label>Match(s)</label>
        <div class="liste-matchs-ajout">
          ${(matchs || []).map(m => `<label><input type="checkbox" name="match" value="${m.id}"> ${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}</label>`).join('')
            || '<p class="doux">Aucun match à venir dans le calendrier.</p>'}
        </div>
      </div>
      <div class="champ">
        <label>Format</label>
        <div class="choix">
          <label><input type="radio" name="format" value="pleine"> Page pleine</label>
          <label><input type="radio" name="format" value="demi"> Demi-page</label>
        </div>
      </div>`
    : vue === 'reseaux' ? `
      <div class="champ">
        <label>Post(s)</label>
        <div class="choix">${types.map(t => `<label class="${postsPris.has(t) ? 'doux' : ''}"><input type="checkbox" name="type_post" value="${echapper(t)}"
          ${postsPris.has(t) ? 'disabled' : ''}> ${echapper(t)}${postsPris.has(t) ? ` <span class="petit">— pris à la saison par ${echapper(postsPris.get(t))}</span>` : ''}</label>`).join('')}</div>
      </div>
      <div class="champ">
        <label>Quand ?</label>
        <div class="choix">
          <label><input type="radio" name="quand" value="saison" checked> Toute la saison</label>
          <label><input type="radio" name="quand" value="match"> Seulement certains matchs</label>
        </div>
        <div class="liste-matchs-ajout" data-matchs-reseaux hidden>
          ${(matchs || []).map(m => `<label><input type="checkbox" name="match" value="${m.id}"> ${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}</label>`).join('')
            || '<p class="doux">Aucun match à venir dans le calendrier.</p>'}
        </div>
      </div>`
    : vue === 'app' ? `
      <div class="grille-2">
        <div class="champ"><label>Du<input type="date" name="du"></label></div>
        <div class="champ"><label>Au<input type="date" name="au"></label></div>
      </div>`
    : `
      <div class="champ">
        <label for="adg-joueur">Joueur</label>
        <select id="adg-joueur" name="joueur">
          <option value="">— Choisir le joueur —</option>
          ${(joueurs || []).map(j => `<option value="${j.id}" ${parrains.has(j.id) ? 'disabled' : ''}>${j.numero ?? ''} · ${echapper(`${j.prenom} ${j.nom}`)}${
            parrains.has(j.id) ? ` — parrainé par ${echapper(parrains.get(j.id))}` : ''}</option>`).join('')}
        </select>
      </div>`;
  fenetre.innerHTML = `
    <div class="fenetre-entete">
      <div>
        <div class="surtitre">${echapper(p.nom)}</div>
        <h2>Ajouter</h2>
        <div class="doux petit" style="margin-top:.3rem">Sans demande du Sponsoring.</div>
      </div>
      <button type="button" class="btn btn-discret" data-fermer aria-label="Fermer">✕</button>
    </div>
    <form class="fenetre-corps form-produit" novalidate>
      <div class="champ">
        <label for="adg-sponsor">Sponsor</label>
        <input type="text" id="adg-sponsor" name="sponsor" list="adg-sponsors" autocomplete="off" placeholder="Nom du sponsor">
        <datalist id="adg-sponsors">${sponsors.map(s => {
          const simple = s.nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
          return `<option value="${echapper(s.nom)}"${simple !== s.nom ? ` label="${echapper(simple)}"` : ''}></option>`;
        }).join('')}</datalist>
        <div class="aide" id="adg-sponsor-aide"></div>
      </div>
      ${questions}
      <div class="champ">
        <label>${echapper(libelleFichier(p, 'visuel'))} (facultatif)<input type="file" name="fichiers" multiple></label>
      </div>
      <div class="champ">
        <label for="adg-remarque">Remarque</label>
        <textarea id="adg-remarque" name="remarque" rows="2"></textarea>
      </div>
      <p class="message message-erreur" data-erreur hidden></p>
    </form>
    <div class="fenetre-pied">
      <span class="indication" data-indication></span>
      <button type="button" class="btn btn-discret" data-fermer>Fermer</button>
      <button type="button" class="btn" data-encore>Ajouter et en saisir un autre</button>
      <button type="button" class="btn btn-principal" data-ajouter>Ajouter</button>
    </div>`;
  document.body.append(voile, fenetre);
  document.body.classList.add('fenetre-ouverte');

  const form = fenetre.querySelector('form');
  const el = (n) => form.elements[n];
  const trouverSponsor = () => sponsors.find(s => normaliser(s.nom) === normaliser(el('sponsor').value));
  const majAffichage = () => {
    const nom = el('sponsor').value.trim();
    form.querySelector('#adg-sponsor-aide').innerHTML = !nom ? ''
      : trouverSponsor() ? '✓ Sponsor déjà dans l’outil'
      : `<span class="badge statut-nouvelle">nouveau sponsor</span> « ${echapper(nom)} » sera créé`;
  };
  form.addEventListener('input', majAffichage);
  // réseaux sociaux : la liste des matchs seulement pour « certains matchs »
  form.addEventListener('change', () => {
    const zone = form.querySelector('[data-matchs-reseaux]');
    if (zone) zone.hidden = form.querySelector('input[name=quand]:checked')?.value !== 'match';
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
  el('sponsor').focus();

  const erreur = fenetre.querySelector('[data-erreur]');
  const montrerErreur = (texte) => { erreur.textContent = texte; erreur.hidden = false; erreur.scrollIntoView({ block: 'nearest' }); };
  const boutons = fenetre.querySelectorAll('[data-ajouter], [data-encore]');
  const indication = fenetre.querySelector('[data-indication]');

  async function ajouter(encore) {
    erreur.hidden = true;
    const nomSponsor = el('sponsor').value.trim();
    const idsMatchs = [...form.querySelectorAll('input[name=match]:checked')].map(c => c.value);
    const format = form.querySelector('input[name=format]:checked')?.value;
    if (!nomSponsor) return montrerErreur('Indiquez le sponsor.');
    if (vue === 'programme' && !idsMatchs.length) return montrerErreur('Cochez au moins un match.');
    if (vue === 'programme' && !format) return montrerErreur('Page pleine ou demi-page ?');
    if (vue === 'app' && (!el('du').value || !el('au').value)) return montrerErreur('Indiquez du … au ….');
    if (vue === 'app' && el('au').value < el('du').value) return montrerErreur('La date de fin est avant la date de début.');
    if (vue === 'parrainage' && !el('joueur').value) return montrerErreur('Choisissez le joueur.');
    const typesCoches = [...form.querySelectorAll('input[name=type_post]:checked')].map(c => c.value);
    const auMatch = form.querySelector('input[name=quand]:checked')?.value === 'match';
    if (vue === 'reseaux' && !typesCoches.length) return montrerErreur('Cochez au moins un post.');
    if (vue === 'reseaux' && auMatch && !idsMatchs.length) return montrerErreur('Cochez au moins un match, ou « Toute la saison ».');

    boutons.forEach(b => { b.disabled = true; });
    const groupe = crypto.randomUUID();
    const envoyes = [];
    let sponsorCree = null;
    try {
      // sponsor : existant, sinon créé
      let s = trouverSponsor();
      if (!s?.id) {
        const { data, error } = await sb.from('sponsors').insert({ nom: nomSponsor }).select('id, nom').single();
        if (error) throw new Error(`Sponsor non créé : ${error.message}`);
        s = sponsorCree = data;
      }
      // fichiers (partagés par les éléments : un programme sur plusieurs matchs = le même visuel)
      const fichiers = [];
      for (const f of el('fichiers').files) {
        indication.textContent = `Envoi de ${f.name}…`;
        const chemin = `digital/${groupe}/${nomFichierSur(f.name)}`;
        const { error } = await sb.storage.from('assets').upload(chemin, f, { upsert: false, contentType: f.type || undefined });
        if (error) throw new Error(`Envoi de ${f.name} impossible : ${error.message}`);
        envoyes.push(chemin);
        fichiers.push({ chemin, nom: f.name, taille: f.size, mime: f.type || null });
      }
      indication.textContent = 'Enregistrement…';
      const base = { produit_id: p.id, sponsor_id: s.id, fichiers: fichiers.map(({ mime, ...f }) => f),
                     remarque: el('remarque').value.trim() || null };
      const lignes = vue === 'programme' ? idsMatchs.map(match_id => ({ ...base, match_id, format }))
        : vue === 'reseaux' ? typesCoches.flatMap(type_post => auMatch
            ? idsMatchs.map(match_id => ({ ...base, type_post, match_id }))
            : [{ ...base, type_post }])
        : vue === 'app' ? [{ ...base, du: el('du').value, au: el('au').value }]
        : [{ ...base, joueur_id: el('joueur').value }];
      const { error } = await sb.from('digital_elements').insert(lignes);
      if (error) throw new Error(error.message);
      // dossier du sponsor (trace des documents reçus)
      if (fichiers.length) {
        const { error: e2 } = await sb.from('documents_sponsors').insert(fichiers.map(f => ({
          sponsor_id: s.id, produit_id: p.id, role: 'visuel', nom: f.nom, storage_path: f.chemin, mime: f.mime, taille_octets: f.taille })));
        if (e2) console.warn('Dossier sponsor non mis à jour :', e2.message);
      }
      if (sponsorCree) sponsors.push(sponsorCree);
    } catch (e) {
      if (envoyes.length) await sb.storage.from('assets').remove(envoyes);
      if (sponsorCree) await sb.from('sponsors').delete().eq('id', sponsorCree.id);
      indication.textContent = '';
      boutons.forEach(b => { b.disabled = false; });
      return montrerErreur(e.message);
    }
    notifier(`${nomSponsor} ajouté à ${p.nom}.`);
    apres();
    if (!encore) return fermer();
    // saisir le suivant : on garde les matchs / dates / format, on vide sponsor, joueur, fichiers, remarque
    for (const n of ['sponsor', 'joueur', 'fichiers', 'remarque']) if (el(n)) el(n).value = '';
    indication.textContent = `✓ ${nomSponsor} ajouté`;
    boutons.forEach(b => { b.disabled = false; });
    majAffichage();
    el('sponsor').focus();
  }
  fenetre.querySelector('[data-ajouter]').addEventListener('click', () => ajouter(false));
  fenetre.querySelector('[data-encore]').addEventListener('click', () => ajouter(true));
  form.addEventListener('submit', (e) => { e.preventDefault(); ajouter(false); });
}
