// « + Ajouter un sponsor » sur une fiche produit, SANS demande (Régie / admin, demandé par Léa le 06.10.2026) :
// ce qui passe déjà (ex. Pub warm-up décidée en discussion, jamais entrée dans Airtable) ou ce qui a été décidé
// sans passer par le Sponsoring. RPC ajouter_diffusion (migration 42). Pas pour les bandes LED (plan des emplacements).
import { sb, echapper, notifier, lireDimensions, nomFichierSur, toutesLesLignes, dateCourte, libelleFichier } from './app.js';

const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// p = produit ; apres() = appelé après chaque ajout (recharger la fiche)
export async function ouvrirAjoutDiffusion(p, apres = () => {}) {
  const [sponsors, { data: saison }] = await Promise.all([
    toutesLesLignes((de, a) => sb.from('sponsors').select('id, nom').order('nom').range(de, a)),
    sb.from('saisons').select('id, libelle').eq('active', true).maybeSingle(),
  ]);
  const { data: matchs } = saison
    ? await sb.from('matchs').select('id, date_heure, adversaire, type').eq('saison_id', saison.id).order('date_heure')
    : { data: [] };
  const video = p.famille === 'temps' && p.support === 'Vidéotron';
  const anneau = !!p.lie_a_produit_id;
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  const jour = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

  const voile = document.createElement('div');
  voile.className = 'voile';
  const fenetre = document.createElement('div');
  fenetre.className = 'fenetre fenetre-moyenne';
  fenetre.setAttribute('role', 'dialog');
  fenetre.setAttribute('aria-modal', 'true');
  const zoneVisuel = (role, titre) => `
    <fieldset class="champ cadre-format" data-role="${role}">
      <legend>${titre}</legend>
      <div class="grille-2">
        <div class="champ"><label>Nom dans Colosseo<input type="text" name="nom_${role}" placeholder="ex. LEG26_Video_Skybox"></label></div>
        <div class="champ"><label>Fichier (facultatif)<input type="file" name="fichier_${role}"></label></div>
      </div>
    </fieldset>`;
  fenetre.innerHTML = `
    <div class="fenetre-entete">
      <div>
        <div class="surtitre">${echapper(p.nom)}</div>
        <h2>Ajouter un sponsor</h2>
        <div class="doux petit" style="margin-top:.3rem">Sans demande : pour ce qui passe déjà ou ce qui a été décidé en discussion.</div>
      </div>
      <button type="button" class="btn btn-discret" data-fermer aria-label="Fermer">✕</button>
    </div>
    <form class="fenetre-corps form-produit" novalidate>
      <div class="champ">
        <label for="ad-sponsor">Sponsor</label>
        <input type="text" id="ad-sponsor" name="sponsor" list="ad-sponsors" autocomplete="off" placeholder="Nom du sponsor">
        <datalist id="ad-sponsors">${sponsors.map(s => {
          // le navigateur compare aussi le libellé : nom sans accents (« televerbier » trouve « Téléverbier »)
          const simple = s.nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
          return `<option value="${echapper(s.nom)}"${simple !== s.nom ? ` label="${echapper(simple)}"` : ''}></option>`;
        }).join('')}</datalist>
        <div class="aide" id="ad-sponsor-aide"></div>
      </div>

      <div class="champ">
        <label>Dans Colosseo</label>
        <div class="choix">
          <label><input type="radio" name="colosseo" value="deja" checked> Passe déjà</label>
          <label><input type="radio" name="colosseo" value="a_mettre"> À mettre (dès le prochain match)</label>
        </div>
        <div class="aide">« Passe déjà » : rien n’apparaîtra à faire dans Match du jour. « À mettre » : Match du jour l’affichera à ajouter.</div>
      </div>

      <div class="champ">
        <label>Quand ?</label>
        <div class="choix">
          <label><input type="radio" name="quand" value="saison" ${p.mode_vente !== 'match' ? 'checked' : ''}> Toute la saison${saison ? ` ${echapper(saison.libelle)}` : ''}</label>
          <label><input type="radio" name="quand" value="match" ${p.mode_vente === 'match' ? 'checked' : ''}> Seulement certains matchs</label>
        </div>
        <div class="liste-matchs-ajout" id="ad-matchs" hidden>
          ${(matchs || []).map(m => `<label class="${new Date(m.date_heure) < debutJour ? 'doux' : ''}">
            <input type="checkbox" name="match" value="${jour(m.date_heure)}"> ${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}</label>`).join('')
            || '<p class="doux">Aucun match dans le calendrier de la saison.</p>'}
        </div>
      </div>

      ${video ? `<div class="champ"><label>Son</label><div class="choix">
        <label><input type="radio" name="son" value="oui"> Avec son</label>
        <label><input type="radio" name="son" value="non"> Sans son</label></div></div>` : ''}
      ${anneau ? `<div class="champ"><label>Anneau LED</label><div class="choix">
        <label><input type="radio" name="anneau" value="oui"> Avec anneau LED</label>
        <label><input type="radio" name="anneau" value="non"> Sans anneau LED</label></div></div>` : ''}
      ${p.famille === 'temps' ? `<div class="champ"><label for="ad-duree">Durée (secondes)</label>
        <input type="number" id="ad-duree" name="duree" min="1" style="max-width:10rem">
        <div class="aide">Reprise de la vidéo si vous déposez le fichier.</div></div>` : ''}

      ${zoneVisuel('visuel', echapper(libelleFichier(p, 'visuel')))}
      ${anneau ? `<div data-si-anneau hidden>${zoneVisuel('anneau', 'Visuel anneau LED')}</div>` : ''}

      <div class="champ">
        <label for="ad-remarques">Remarques</label>
        <textarea id="ad-remarques" name="remarques" rows="2" placeholder="ex. Décidé avec … le …"></textarea>
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
  const coche = (n) => form.querySelector(`input[name=${n}]:checked`)?.value;
  const trouverSponsor = () => sponsors.find(s => normaliser(s.nom) === normaliser(el('sponsor').value));

  const majAffichage = () => {
    form.querySelector('#ad-matchs').hidden = coche('quand') !== 'match';
    const zoneAnneau = form.querySelector('[data-si-anneau]');
    if (zoneAnneau) zoneAnneau.hidden = coche('anneau') !== 'oui';
    const nom = el('sponsor').value.trim();
    form.querySelector('#ad-sponsor-aide').innerHTML = !nom ? ''
      : trouverSponsor() ? '✓ Sponsor déjà dans l’outil'
      : `<span class="badge statut-nouvelle">nouveau sponsor</span> « ${echapper(nom)} » sera créé`;
  };
  majAffichage();
  form.addEventListener('input', majAffichage);
  form.addEventListener('change', majAffichage);
  // durée lue dans la vidéo
  el('fichier_visuel').addEventListener('change', async () => {
    const f = el('fichier_visuel').files[0];
    if (!f) return;
    if (!el('nom_visuel').value) el('nom_visuel').value = f.name.replace(/\.[^.]+$/, '');
    const dims = await lireDimensions(f);
    if (dims?.duree && el('duree') && !el('duree').value) el('duree').value = Math.round(dims.duree);
  });
  el('fichier_anneau')?.addEventListener('change', () => {
    const f = el('fichier_anneau').files[0];
    if (f && !el('nom_anneau').value) el('nom_anneau').value = f.name.replace(/\.[^.]+$/, '');
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

  async function ajouter(encore) {
    erreur.hidden = true;
    const nomSponsor = el('sponsor').value.trim();
    const quand = coche('quand');
    const dates = [...form.querySelectorAll('input[name=match]:checked')].map(c => c.value);
    if (!nomSponsor) return montrerErreur('Indiquez le sponsor.');
    if (quand === 'match' && !dates.length) return montrerErreur('Cochez au moins un match.');
    if (video && !coche('son')) return montrerErreur('Choisissez avec ou sans son.');
    if (anneau && !coche('anneau')) return montrerErreur('Choisissez avec ou sans anneau LED.');
    const avecAnneau = coche('anneau') === 'oui';

    boutons.forEach(b => { b.disabled = true; });
    const indication = fenetre.querySelector('[data-indication]');
    const ligneId = crypto.randomUUID();
    const envoyes = [];
    try {
      // fichiers d'abord (rangés sous la diffusion), puis la diffusion ; en cas d'échec, les fichiers sont retirés
      const visuels = [];
      for (const role of avecAnneau ? ['visuel', 'anneau'] : ['visuel']) {
        const f = el(`fichier_${role}`).files[0];
        const nomVisuel = el(`nom_${role}`).value.trim();
        if (!f && !nomVisuel) continue;
        const v = { role, nom_visuel: nomVisuel || null };
        if (f) {
          indication.textContent = `Envoi de ${f.name}…`;
          const chemin = `diffusions/${ligneId}/${role}__${Date.now().toString(36)}-${nomFichierSur(f.name)}`;
          const { error } = await sb.storage.from('assets').upload(chemin, f, { upsert: false, contentType: f.type || undefined });
          if (error) throw new Error(`Envoi de ${f.name} impossible : ${error.message}`);
          envoyes.push(chemin);
          const dims = await lireDimensions(f);
          Object.assign(v, { storage_path: chemin, nom: f.name, mime: f.type || null, taille_octets: f.size,
            largeur_px: dims?.largeur || null, hauteur_px: dims?.hauteur || null, duree_s: dims?.duree || null });
        }
        visuels.push(v);
      }
      indication.textContent = 'Enregistrement…';
      const s = trouverSponsor();
      const duree = parseInt(el('duree')?.value, 10);
      const { error } = await sb.rpc('ajouter_diffusion', { p_produit: p.id, p_options: {
        ligne_id: ligneId, ...(s?.id ? { sponsor_id: s.id } : { sponsor_nom: nomSponsor }),
        type_vente: quand, dates: quand === 'match' ? dates : [], avec_son: coche('son') === 'oui', avec_anneau: avecAnneau,
        duree_s: Number.isFinite(duree) && duree > 0 ? duree : null, consignes: el('remarques').value.trim() || null,
        deja_dans_colosseo: coche('colosseo') !== 'a_mettre', visuels } });
      if (error) {
        throw new Error(/ajouter_diffusion/.test(error.message) && /function|fonction/i.test(error.message)
          ? 'Exécutez d’abord la migration 42 dans Supabase.' : error.message);
      }
    } catch (e) {
      if (envoyes.length) await sb.storage.from('assets').remove(envoyes);
      indication.textContent = '';
      boutons.forEach(b => { b.disabled = false; });
      return montrerErreur(e.message);
    }
    notifier(`${nomSponsor} ajouté à ${p.nom}.`);
    apres();
    if (!encore) return fermer();
    // saisir le suivant : on garde « Dans Colosseo » et « Quand ? », on vide le reste
    if (!sponsors.some(x => normaliser(x.nom) === normaliser(nomSponsor))) sponsors.push({ id: null, nom: nomSponsor });
    for (const n of ['sponsor', 'nom_visuel', 'fichier_visuel', 'nom_anneau', 'fichier_anneau', 'duree', 'remarques']) if (el(n)) el(n).value = '';
    indication.textContent = `✓ ${nomSponsor} ajouté`;
    boutons.forEach(b => { b.disabled = false; });
    majAffichage();
    el('sponsor').focus();
  }
  fenetre.querySelector('[data-ajouter]').addEventListener('click', () => ajouter(false));
  fenetre.querySelector('[data-encore]').addEventListener('click', () => ajouter(true));
  form.addEventListener('submit', (e) => { e.preventDefault(); ajouter(false); });
}
