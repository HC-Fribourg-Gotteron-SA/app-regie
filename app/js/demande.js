import { sb, exigerConnexion, LIBELLES, echapper, dateCourte, notifier, debounce, nomFichierSur, taille, libelleFichier,
         descriptionProduit, specsProduit, dimensionsAttendues, alertesFichier, lireDimensions, devinerVersion } from './app.js';
import { analyserSon, LIBELLE_SON } from './son-video.js';

await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });

const $ = (id) => document.getElementById(id);
const etat = {
  sponsor: null,          // { id, nom } ou { nouveau: true, nom }
  produits: new Map(),    // id -> produit
  anneaux: new Map(),     // id -> produit anneau couplé (inactif, pas dans la liste) : pour son format
  details: new Map(),     // id produit -> { quand, dates: Set, duree (lue dans la vidéo), son, remarque }
  matchs: [],             // matchs à venir
  saison: '',
};

// ---------------------------------------------------------------------
// Types de demande
// ---------------------------------------------------------------------
$('types').innerHTML = Object.entries(LIBELLES.type_demande).map(([val, txt]) =>
  `<label><input type="radio" name="type" value="${val}"> ${txt}</label>`).join('');

// ---------------------------------------------------------------------
// Produits, groupés par catégorie
// ---------------------------------------------------------------------
async function chargerProduits() {
  const { data, error } = await sb.from('produits')
    .select('*')
    .eq('actif', true).order('ordre').order('categorie').order('nom');
  if (error) { $('produits').innerHTML = `<p class="message message-erreur">${echapper(error.message)}</p>`; return; }
  etat.produits = new Map(data.map(p => [p.id, p]));
  const idsAnneaux = [...new Set(data.map(p => p.lie_a_produit_id).filter(Boolean))];
  if (idsAnneaux.length) {
    const { data: anneaux } = await sb.from('produits')
      .select('*').in('id', idsAnneaux);
    etat.anneaux = new Map((anneaux || []).map(a => [a.id, a]));
  }

  const groupes = new Map();
  for (const p of data) {
    const cat = p.categorie || 'Autres';
    if (!groupes.has(cat)) groupes.set(cat, []);
    groupes.get(cat).push(p);
  }
  $('produits').innerHTML = [...groupes].map(([cat, produits]) => `
    <details data-groupe="${echapper(cat)}">
      <summary><span>${echapper(cat)}</span>
        <span class="doux petit">${produits.length} produit${produits.length > 1 ? 's' : ''}</span>
        <span class="badge compte-coches" data-compte="${echapper(cat)}" hidden></span></summary>
      <div class="liste">
        ${produits.map(p => `
          <label data-recherche="${echapper(normaliser(`${p.nom} ${cat}`))}"><input type="checkbox" name="produit" value="${p.id}"
                 data-cat="${echapper(cat)}" data-nom="${echapper(p.nom)}"> ${echapper(p.nom.replace(/^Action scene – /, ''))}</label>`).join('')}
      </div>
    </details>`).join('');
  $('produits').addEventListener('change', () => { majCompteurs(); afficherDetails(); });
}

const produitsCoches = () => [...document.querySelectorAll('input[name=produit]:checked')].map(c => c.value);
const normaliser = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function majCompteurs() {
  const coches = [...document.querySelectorAll('input[name=produit]:checked')];
  document.querySelectorAll('[data-compte]').forEach(el => {
    const n = coches.filter(c => c.dataset.cat === el.dataset.compte).length;
    el.textContent = `${n} choisi${n > 1 ? 's' : ''}`;
    el.hidden = !n;
  });
  // pastilles des produits choisis (× pour retirer)
  $('selection-produits').hidden = !coches.length;
  $('selection-produits').innerHTML = coches.map(c => `
    <span class="puce">${echapper(c.dataset.nom)}
      <button type="button" data-decocher="${c.value}" aria-label="Retirer ${echapper(c.dataset.nom)}">✕</button></span>`).join('');
}

$('selection-produits').addEventListener('click', (e) => {
  const b = e.target.closest('[data-decocher]');
  if (!b) return;
  const c = document.querySelector(`input[name=produit][value="${b.dataset.decocher}"]`);
  c.checked = false;
  c.dispatchEvent(new Event('change', { bubbles: true }));
});

// Recherche dans les produits : ouvre les catégories qui contiennent un résultat
$('filtre-produits').addEventListener('input', (e) => {
  const q = normaliser(e.target.value.trim());
  document.querySelectorAll('#produits details').forEach(groupe => {
    let visibles = 0;
    groupe.querySelectorAll('label[data-recherche]').forEach(l => {
      const ok = !q || l.dataset.recherche.includes(q);
      l.hidden = !ok;
      if (ok) visibles++;
    });
    groupe.hidden = q && !visibles;
    groupe.open = !!q && visibles > 0;
  });
});
$('filtre-produits').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

// Résumé dans la barre d'envoi
function majResume() {
  const n = produitsCoches().length;
  const fichiers = [...etat.details.entries()]
    .filter(([id]) => produitsCoches().includes(id))
    .reduce((t, [, d]) => t + d.fichiers.visuel.length + (d.anneau === 'oui' ? d.fichiers.anneau.length : 0), 0);
  $('resume-envoi').textContent = [
    etat.sponsor ? etat.sponsor.nom : 'Sponsor à choisir',
    n ? `${n} produit${n > 1 ? 's' : ''}` : 'aucun produit',
    fichiers ? `${fichiers} fichier${fichiers > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------
// Détails par produit : quand (saison ou certains matchs), durée, remarque
// ---------------------------------------------------------------------
const jourLocal = (d) => {             // 'AAAA-MM-JJ' dans le fuseau du navigateur
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

async function chargerSaisonEtMatchs() {
  const [{ data: saison }, { data: matchs }] = await Promise.all([
    sb.from('saisons').select('libelle').eq('active', true).maybeSingle(),
    sb.from('matchs').select('date_heure, adversaire, type')
      .gte('date_heure', new Date().toISOString()).order('date_heure'),
  ]);
  etat.saison = saison?.libelle || '';
  etat.matchs = matchs || [];
}

function detailDe(id) {
  if (!etat.details.has(id)) {
    const p = etat.produits.get(id);
    etat.details.set(id, { id, quand: p?.mode_vente === 'match' ? 'match' : 'saison', dates: new Set(), duree: null, remarque: '',
                           son: null,                     // lu dans la vidéo : 'oui' / 'non' / null = pas lu
                           anneau: null,                  // 'oui' / 'non' / null = pas encore choisi
                           // plusieurs fichiers : 'alterner' (un match sur deux, ex. FR / DE) / 'non' / null = pas choisi
                           rotation: null, versions: new Map(), premiere: '',   // versions : File -> 'FR'
                           fichiers: { visuel: [], anneau: [] } });
  }
  return etat.details.get(id);
}

// ---------------------------------------------------------------------
// Fichiers par produit (facultatifs : ils peuvent arriver plus tard)
// Stockés dans demandes/<demande>/<produit>/<role>__<nom> ; role = visuel | anneau
// ---------------------------------------------------------------------
function rolesFichiers(p) {
  const roles = [{ role: 'visuel', libelle: libelleFichier(p, 'visuel'), cible: p }];
  if (demandeAnneau(p)) {
    // l'anneau de la Pub pause tiers est un produit technique inactif : on prend son format directement
    roles.push({ role: 'anneau', libelle: libelleFichier(p, 'anneau'), cible: etat.anneaux.get(p.lie_a_produit_id) });
  }
  return roles;
}

// Contrôle de chaque fichier déposé (taille, type, durée) : alerte, jamais bloquant
// + durée et son d'une vidéo, lus dans le fichier (plus de saisie à la main)
const controles = new WeakMap();      // File -> { alertes: [], lu: bool, duree: s | null, son: 'oui' | 'muet' | 'non' | null }
const secondes = (s) => `${Math.round(s * 10) / 10} s`.replace('.', ',');
function etatFichier(f, cible) {
  const c = controles.get(f);
  if (!c) return '<span class="doux petit">· vérification…</span>';
  const infos = [c.duree ? secondes(c.duree) : '', c.son ? LIBELLE_SON[c.son] : ''].filter(Boolean).join(' · ');
  return (infos ? `<span class="petit">· ${infos}</span> ` : '')
    + (c.alertes.length ? c.alertes.map(a => `<span class="badge badge-a-venir">⚠ ${echapper(a)}</span>`).join(' ')
       : c.lu && dimensionsAttendues(cible) ? '<span class="badge statut-traitee">format OK</span>' : '');
}

// Durée du spot et son, repris des vidéos déposées (rôle « visuel » : l'anneau LED n'a pas de son)
function majDepuisFichiers(d) {
  const lus = d.fichiers.visuel.map(f => controles.get(f)).filter(Boolean);
  const durees = lus.map(c => c.duree).filter(Boolean);
  d.duree = durees.length ? Math.max(...durees) : null;
  const sons = lus.map(c => c.son).filter(Boolean);
  d.son = sons.includes('oui') ? 'oui' : sons.length ? 'non' : null;
}

// Son : seulement noté, lu dans la vidéo (pas de choix à faire, décidé par Léa le 02.10.2026)
function texteSon(d) {
  const lus = d.fichiers.visuel.map(f => controles.get(f));
  if (!lus.length) return '<span class="doux">lu automatiquement quand la vidéo est déposée</span>';
  if (lus.some(c => !c)) return '<span class="doux">lecture de la vidéo…</span>';
  const sons = lus.map(c => c.son).filter(Boolean);
  if (sons.includes('oui')) return '<strong>🔊 Avec son</strong> <span class="doux">(lu dans la vidéo)</span>';
  if (sons.includes('muet')) return '<strong>🔇 Sans son</strong> <span class="doux">(la piste son de la vidéo est muette)</span>';
  if (sons.length) return '<strong>🔇 Sans son</strong> <span class="doux">(lu dans la vidéo)</span>';
  return '<span class="doux">son pas lu dans ce fichier : la Régie vérifiera</span>';
}

function texteDuree(d) {
  const durees = [...new Set(d.fichiers.visuel.map(f => controles.get(f)?.duree).filter(Boolean).map(s => Math.round(s)))];
  if (durees.length > 1) return `<strong>${durees.map(s => `${s} s`).join(' / ')}</strong> <span class="doux">(lue dans les vidéos)</span>`;
  if (d.duree) return `<strong>${Math.round(d.duree)} s</strong> <span class="doux">(lue dans la vidéo)</span>`;
  if (d.fichiers.visuel.some(f => !controles.get(f))) return '<span class="doux">lecture de la vidéo…</span>';
  return '<span class="doux">lue automatiquement quand la vidéo est déposée</span>';
}

function zoneFichiers(d, { role, libelle, cible }) {
  const cache = role === 'anneau' && d.anneau !== 'oui';
  const spec = specsProduit(cible);
  return `
    <div class="fichiers-produit" data-role-bloc="${role}" ${cache ? 'hidden' : ''}>
      <div class="petit"><strong>${libelle}</strong>${spec ? ` <span class="doux">· format attendu : ${echapper(spec)}</span>` : ''}
        ${cible?.remarque_format ? `<div class="doux">${echapper(cible.remarque_format)}</div>` : ''}</div>
      <div class="zone-depot zone-compacte" data-zone="${role}">
        Glissez le fichier ici ou <u>cliquez pour choisir</u> <span class="petit">(facultatif, peut suivre plus tard)</span>
        <input type="file" multiple hidden data-fichier-role="${role}">
      </div>
      ${d.fichiers[role].length ? `<ul class="liste-fichiers">${d.fichiers[role].map((f, i) => `
        <li><span>${echapper(f.name)} <span class="doux petit">${taille(f.size)}</span> ${etatFichier(f, cible)}</span>
            ${role === 'visuel' && alterne(d) ? `<label class="petit" style="margin:0">Version
              <input type="text" data-version="${i}" value="${echapper(d.versions.get(f) || '')}" placeholder="FR"
                     style="width:4.5rem;min-height:0;padding:.2rem .4rem"></label>` : ''}
            <button type="button" class="btn btn-discret" data-retirer-fichier="${role}" data-i="${i}">Retirer</button></li>`).join('')}
      </ul>` : ''}
      ${role === 'visuel' ? blocRotation(d) : ''}
    </div>`;
}

// ---------------------------------------------------------------------
// Plusieurs fichiers pour un produit (une minorité, expliqué par Léa le 02.10.2026) :
// FR / DE un match sur deux. Vidéo spéciale pour un match (ex. le chef présent ce soir-là) :
// demande « Changement de visuel » pour ce match (le visuel habituel revient ensuite).
// ---------------------------------------------------------------------
const alterne = (d) => d.fichiers.visuel.length >= 2 && d.rotation === 'alterner';
const versionsDe = (d) => [...new Set(d.fichiers.visuel.map(f => (d.versions.get(f) || '').trim()).filter(Boolean))];
const premiereDe = (d) => { const v = versionsDe(d); return v.includes(d.premiere) ? d.premiere : v[0] || ''; };
const ordreVersions = (d) => { const p = premiereDe(d); return [p, ...versionsDe(d).filter(v => v !== p)]; };
function premierMatch(d) {
  if (d.quand === 'match') return etat.matchs.find(m => d.dates.has(jourLocal(m.date_heure)));
  return etat.matchs[0];
}

function blocRotation(d) {
  if (d.fichiers.visuel.length < 2) return '';
  const m = premierMatch(d);
  return `
    <div class="rotation-produit" style="margin-top:.5rem">
      <div class="petit"><strong>Plusieurs fichiers : comment passent-ils ?</strong></div>
      <div class="choix choix-compact">
        <label><input type="radio" name="rotation-${d.id}" data-choix="rotation" value="alterner" ${d.rotation === 'alterner' ? 'checked' : ''}>
          Un match sur deux (ex. FR / DE)</label>
        <label><input type="radio" name="rotation-${d.id}" data-choix="rotation" value="non" ${d.rotation === 'non' ? 'checked' : ''}>
          Autrement (à préciser dans la remarque)</label>
      </div>
      ${alterne(d) ? `
        <div class="champ-ligne petit">
          <span>Au premier match${m ? ` (${dateCourte(m.date_heure)} · ${echapper(m.adversaire)})` : ''} :</span>
          <select data-premiere style="width:auto">${versionsDe(d).map(v =>
            `<option ${v === premiereDe(d) ? 'selected' : ''}>${echapper(v)}</option>`).join('')}</select>
          <span class="doux">puis chaque version à tour de rôle</span>
        </div>` : ''}
      <p class="aide" style="margin:.3rem 0 0">Vidéo spéciale pour un seul match (ex. le chef présent ce soir-là) :
        faites plutôt une demande « Changement de visuel » pour ce match.</p>
    </div>`;
}

function ajouterFichiersProduit(id, role, liste) {
  const d = detailDe(id);
  const p = etat.produits.get(id);
  const cible = role === 'anneau' ? etat.anneaux.get(p?.lie_a_produit_id) : p;
  for (const f of liste) {
    if (d.fichiers[role].some(x => x.name === f.name && x.size === f.size)) continue;
    d.fichiers[role].push(f);
    if (role === 'visuel') d.versions.set(f, devinerVersion(f.name) || `V${d.fichiers.visuel.length}`);
    Promise.all([lireDimensions(f), role === 'visuel' ? analyserSon(f) : null]).then(([dim, son]) => {
      controles.set(f, { lu: !!dim, alertes: alertesFichier(cible, { nom: f.name, ...(dim || {}) }),
                         duree: dim?.duree || null, son });
      majDepuisFichiers(d);
      afficherDetails();
    });
  }
  afficherDetails();
}

// Son : pour les pubs vidéotron ; anneau LED : pour les produits reliés à l'anneau (Pub pause tiers)
const demandeSon = (p) => p.famille === 'temps' && p.support === 'Vidéotron';
const demandeAnneau = (p) => !!p.lie_a_produit_id;

const choixOuiNon = (id, champ, valeur, oui, non) => `
  <div class="choix choix-compact">
    <label><input type="radio" name="${champ}-${id}" data-choix="${champ}" value="oui" ${valeur === 'oui' ? 'checked' : ''}> ${oui}</label>
    <label><input type="radio" name="${champ}-${id}" data-choix="${champ}" value="non" ${valeur === 'non' ? 'checked' : ''}> ${non}</label>
  </div>`;

function afficherDetails() {
  const ids = produitsCoches();
  $('bloc-details').hidden = ids.length === 0;
  $('num-derniere').textContent = ids.length ? '5' : '4';
  majResume();
  $('details-produits').innerHTML = ids.map(id => {
    const p = etat.produits.get(id), d = detailDe(id);
    const matchs = etat.matchs.length
      ? etat.matchs.map(m => {
          const jour = jourLocal(m.date_heure);
          return `<label><input type="checkbox" data-date="${jour}" ${d.dates.has(jour) ? 'checked' : ''}>
                    ${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}${m.type !== 'saison' ? ` (${LIBELLES.type_match[m.type].toLowerCase()})` : ''}</label>`;
        }).join('')
      : '<p class="aide">Aucun match à venir dans le calendrier.</p>';
    return `
      <div class="detail-produit" data-id="${id}">
        <div class="detail-entete">
          <strong>${echapper(p.nom)}</strong>
          <span class="doux petit description">${echapper(descriptionProduit(p))}</span>
        </div>
        <div class="choix">
          <label><input type="radio" name="quand-${id}" value="saison" ${d.quand === 'saison' ? 'checked' : ''}>
            Toute la saison ${echapper(etat.saison)}</label>
          <label><input type="radio" name="quand-${id}" value="match" ${d.quand === 'match' ? 'checked' : ''}>
            Seulement certains matchs</label>
        </div>
        <div class="matchs-produit" ${d.quand === 'match' ? '' : 'hidden'}>
          <p class="aide">Cochez le ou les matchs :${document.querySelector('input[name=type]:checked')?.value === 'changement_visuel'
            ? ' <strong>le nouveau visuel passe seulement à ces matchs</strong>, le visuel habituel revient ensuite (ex. vidéo du chef présent ce soir-là).' : ''}</p>
          <div class="choix choix-compact">${matchs}</div>
        </div>
        ${demandeSon(p) ? `
          <div class="champ-ligne"><span class="etiquette">Son</span> <span class="petit">${texteSon(d)}</span></div>` : ''}
        ${demandeAnneau(p) ? `
          <div class="champ-ligne"><span class="etiquette">Anneau LED</span>${choixOuiNon(id, 'anneau', d.anneau, 'Avec anneau LED', 'Sans anneau LED')}</div>` : ''}
        ${p.famille === 'temps' || d.duree ? `
          <div class="champ-ligne"><span class="etiquette">Durée du spot</span> <span class="petit">${texteDuree(d)}</span></div>` : ''}
        ${rolesFichiers(p).map(r => zoneFichiers(d, r)).join('')}
        <label for="remarque-${id}" class="petit" style="margin-top:.6rem">Remarque Sponsoring</label>
        <textarea id="remarque-${id}" data-champ="remarque" rows="2" style="min-height:0"
          placeholder="Ex. : remplace l'ancien logo ; version FR et DE…">${echapper(d.remarque)}</textarea>
      </div>`;
  }).join('');
}

// Dépôt de fichiers dans un bloc produit
const zoneSous = (e) => e.target.closest('[data-zone]');
$('details-produits').addEventListener('click', (e) => {
  const bloc = e.target.closest('.detail-produit');
  if (!bloc) return;
  const retirer = e.target.closest('[data-retirer-fichier]');
  if (retirer) {
    const d = detailDe(bloc.dataset.id);
    d.fichiers[retirer.dataset.retirerFichier].splice(Number(retirer.dataset.i), 1);
    majDepuisFichiers(d);
    afficherDetails();
    return;
  }
  const zone = zoneSous(e);
  if (zone && e.target.tagName !== 'INPUT') zone.querySelector('input[type=file]').click();
});
$('details-produits').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.fichierRole && t.files.length) {
    ajouterFichiersProduit(t.closest('.detail-produit').dataset.id, t.dataset.fichierRole, t.files);
  }
  // version modifiée : la liste « Au premier match » suit
  if (t.dataset.version !== undefined) afficherDetails();
});
$('details-produits').addEventListener('dragover', (e) => {
  const zone = zoneSous(e);
  if (zone) { e.preventDefault(); zone.classList.add('survol'); }
});
$('details-produits').addEventListener('dragleave', (e) => zoneSous(e)?.classList.remove('survol'));
$('details-produits').addEventListener('drop', (e) => {
  const zone = zoneSous(e);
  if (!zone) return;
  e.preventDefault();
  ajouterFichiersProduit(zone.closest('.detail-produit').dataset.id, zone.dataset.zone, e.dataTransfer.files);
});

$('details-produits').addEventListener('input', (e) => {
  const bloc = e.target.closest('.detail-produit');
  if (!bloc) return;
  const d = detailDe(bloc.dataset.id), t = e.target;
  if (t.dataset.version !== undefined) {
    d.versions.set(d.fichiers.visuel[Number(t.dataset.version)], t.value);
  } else if (t.dataset.premiere !== undefined) {
    d.premiere = t.value;
  } else if (t.dataset.choix) {
    d[t.dataset.choix] = t.value;
    if (t.dataset.choix === 'anneau') bloc.querySelector('[data-role-bloc=anneau]').hidden = t.value !== 'oui';
    if (t.dataset.choix === 'rotation') afficherDetails();
  } else if (t.type === 'radio') {
    d.quand = t.value;
    bloc.querySelector('.matchs-produit').hidden = d.quand !== 'match';
  } else if (t.dataset.date) {
    t.checked ? d.dates.add(t.dataset.date) : d.dates.delete(t.dataset.date);
  } else if (t.dataset.champ) {
    d[t.dataset.champ] = t.value;
  }
  // un match sur deux : le « premier match » affiché suit les matchs choisis
  if (alterne(d) && (t.dataset.date || (t.type === 'radio' && !t.dataset.choix))) {
    const s = bloc.querySelector('.rotation-produit');
    if (s) s.outerHTML = blocRotation(d);
  }
  erreur('');
});

// ---------------------------------------------------------------------
// Recherche de sponsor (tolérante aux variantes)
// ---------------------------------------------------------------------
const rechercher = debounce(async (q) => {
  if (q.length < 2) { $('suggestions').hidden = true; return; }
  const { data, error } = await sb.rpc('rechercher_sponsors', { q, nb: 8 });
  if (error) { notifier(error.message, 'erreur'); return; }
  $('suggestions').innerHTML =
    (data || []).map(s => `<button type="button" data-id="${s.id}" data-nom="${echapper(s.nom)}">${echapper(s.nom)}</button>`).join('') +
    `<button type="button" class="nouveau" data-nouveau="1" data-nom="${echapper(q)}">+ Nouveau sponsor : « ${echapper(q)} »</button>`;
  $('suggestions').hidden = false;
});

$('recherche-sponsor').addEventListener('input', (e) => rechercher(e.target.value.trim()));

// Entrée : sponsor existant si le nom correspond exactement (casse, accents, espaces et ponctuation ignorés),
// sinon nouveau sponsor avec le nom tapé.
const cleNom = (t) => normaliser(t).replace(/[^a-z0-9]/g, '');
$('recherche-sponsor').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = e.target.value.trim();
  if (q.length < 2) return;
  const { data, error } = await sb.rpc('rechercher_sponsors', { q, nb: 8 });
  if (error) { notifier(error.message, 'erreur'); return; }
  const existant = (data || []).find(s => cleNom(s.nom) === cleNom(q));
  choisirSponsor(existant ? { id: existant.id, nom: existant.nom } : { nouveau: true, nom: q });
});
$('suggestions').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  choisirSponsor(b.dataset.nouveau ? { nouveau: true, nom: b.dataset.nom } : { id: b.dataset.id, nom: b.dataset.nom });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#bloc-recherche')) $('suggestions').hidden = true;
});

function choisirSponsor(s) {
  etat.sponsor = s;
  $('suggestions').hidden = true;
  $('bloc-recherche').hidden = true;
  $('sponsor-choisi').hidden = false;
  $('sponsor-choisi-nom').innerHTML = s.nouveau
    ? `<strong>${echapper(s.nom)}</strong> <span class="badge statut-nouvelle">nouveau sponsor</span>`
    : `<strong>${echapper(s.nom)}</strong>`;
  if (s.nouveau) document.querySelector('input[name=type][value=nouveau_sponsor]').checked = true;
  majResume();
  filtrerProduitsDuSponsor();
}

$('btn-changer-sponsor').addEventListener('click', () => {
  etat.sponsor = null;
  $('sponsor-choisi').hidden = true;
  $('bloc-recherche').hidden = false;
  $('recherche-sponsor').focus();
  majResume();
  filtrerProduitsDuSponsor();
});

// ---------------------------------------------------------------------
// Changement de visuel / suppression : seulement les produits que le sponsor a déjà
// ---------------------------------------------------------------------
const TYPES_PRODUITS_DU_SPONSOR = ['changement_visuel', 'suppression'];
const produitsDuSponsor = new Map();      // id sponsor -> Set(id produit)

async function filtrerProduitsDuSponsor() {
  const type = document.querySelector('input[name=type]:checked')?.value;
  const limiter = TYPES_PRODUITS_DU_SPONSOR.includes(type) && etat.sponsor && !etat.sponsor.nouveau;
  let ids = null;
  if (limiter) {
    if (!produitsDuSponsor.has(etat.sponsor.id)) {
      const { data } = await sb.from('lignes_vendues').select('produit_id, contrat:contrats!inner(sponsor_id)')
        .eq('contrat.sponsor_id', etat.sponsor.id).not('statut', 'in', '(annule,termine)');
      produitsDuSponsor.set(etat.sponsor.id, new Set((data || []).map(l => l.produit_id)));
    }
    ids = produitsDuSponsor.get(etat.sponsor.id);
  }
  document.querySelectorAll('#produits details').forEach(groupe => {
    let visibles = 0;
    groupe.querySelectorAll('input[name=produit]').forEach(c => {
      const ok = !ids || ids.has(c.value);
      c.closest('label').classList.toggle('hors-sponsor', !ok);
      if (!ok && c.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }
      if (ok) visibles++;
    });
    groupe.classList.toggle('hors-sponsor', !visibles);
  });
  const aide = $('aide-produits-sponsor');
  aide.hidden = !limiter;
  if (limiter) {
    aide.textContent = ids.size
      ? `Seuls les produits que ${etat.sponsor.nom} a actuellement sont proposés (${ids.size}).`
      : `${etat.sponsor.nom} n'a actuellement aucun produit dans l'outil : rien à changer ou à supprimer.`;
  }
}
$('types').addEventListener('change', () => { filtrerProduitsDuSponsor(); afficherDetails(); });

// ---------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------
function erreur(texte) {
  $('erreur').textContent = texte;
  $('erreur').hidden = !texte;
  if (texte) $('erreur').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Entrée dans un champ n'envoie jamais la demande : seul le bouton « Envoyer la demande » le fait
$('form-demande').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
});

$('form-demande').addEventListener('submit', async (e) => {
  e.preventDefault();
  erreur('');

  const type = document.querySelector('input[name=type]:checked')?.value;
  const produits = produitsCoches();

  if (!etat.sponsor) return erreur('Choisissez un sponsor (ou créez-en un nouveau).');
  if (!type) return erreur('Choisissez le type de demande.');
  if (!produits.length && type !== 'autre') return erreur('Cochez au moins un produit.');
  for (const id of produits) {
    const d = detailDe(id);
    const p = etat.produits.get(id);
    if (d.quand === 'match' && !d.dates.size) {
      return erreur(`${p.nom} : cochez au moins un match, ou choisissez « Toute la saison ».`);
    }
    if (demandeAnneau(p) && !d.anneau) return erreur(`${p.nom} : indiquez si c'est avec ou sans anneau LED.`);
    if (d.fichiers.visuel.length >= 2 && !d.rotation) {
      return erreur(`${p.nom} : plusieurs fichiers — indiquez s'ils passent un match sur deux.`);
    }
    if (alterne(d)) {
      const v = d.fichiers.visuel.map(f => (d.versions.get(f) || '').trim());
      if (v.some(x => !x)) return erreur(`${p.nom} : donnez une version à chaque fichier (FR, DE…).`);
      if (new Set(v).size < 2) return erreur(`${p.nom} : un match sur deux demande au moins deux versions différentes (FR, DE…).`);
    }
  }

  const bouton = $('btn-envoyer');
  bouton.disabled = true;
  bouton.textContent = 'Envoi…';

  try {
    const { data: demande, error: e1 } = await sb.from('demandes').insert({
      sponsor_id: etat.sponsor.nouveau ? null : etat.sponsor.id,
      sponsor_nom_saisi: etat.sponsor.nouveau ? etat.sponsor.nom : null,
      type,
      remarque_sponsoring: $('remarque').value.trim() || null,
    }).select('id').single();
    if (e1) throw e1;

    if (produits.length) {
      const { error: e2 } = await sb.from('demandes_produits').insert(produits.map(produit_id => {
        const d = detailDe(produit_id), p = etat.produits.get(produit_id);
        return {
          avec_son: demandeSon(p) && d.son ? d.son === 'oui' : null,      // lu dans la vidéo ; null = pas encore lu
          avec_anneau: demandeAnneau(p) ? d.anneau === 'oui' : null,
          demande_id: demande.id,
          produit_id,
          type_vente: d.quand,
          dates_matchs: d.quand === 'match' ? [...d.dates].sort() : null,
          duree_s: d.duree ? Math.max(1, Math.round(d.duree)) : null,      // lue dans la vidéo
          remarque_sponsoring: d.remarque.trim() || null,
          // un match sur deux (migration 34) : version de chaque fichier + ordre, en commençant par le premier match
          ...(alterne(d) ? {
            rotation: 'alterner',
            versions: Object.fromEntries(d.fichiers.visuel.map(f => [nomFichierSur(f.name), d.versions.get(f).trim()])),
            ordre_versions: ordreVersions(d),
          } : {}),
        };
      }));
      if (e2 && /rotation|versions/.test(e2.message)) {
        throw new Error('« Un match sur deux » demande la migration 34 dans Supabase : prévenez la Régie');
      }
      if (e2) throw e2;
    }

    // fichiers des produits (pas de fichiers « hors produit » : tout est rangé par produit)
    const envois = [];
    for (const id of produits) {
      const d = detailDe(id);
      for (const role of ['visuel', 'anneau']) {
        if (role === 'anneau' && d.anneau !== 'oui') continue;
        for (const f of d.fichiers[role]) {
          envois.push({ f, role, produit_id: id, chemin: `demandes/${demande.id}/${id}/${role}__${nomFichierSur(f.name)}` });
        }
      }
    }

    const echecs = [], recus = [];
    for (const [i, { f, role, produit_id, chemin }] of envois.entries()) {
      bouton.textContent = `Envoi des fichiers (${i + 1}/${envois.length})…`;
      const { error } = await sb.storage.from('assets').upload(chemin, f, { upsert: false });
      if (error) echecs.push(`${f.name} (${error.message})`);
      else recus.push({ sponsor_id: etat.sponsor.nouveau ? null : etat.sponsor.id, demande_id: demande.id, produit_id,
                        role, nom: f.name, storage_path: chemin, mime: f.type || null, taille_octets: f.size });
    }
    // dossier du sponsor (trace des documents reçus)
    if (recus.length) {
      const { error } = await sb.from('documents_sponsors').insert(recus);
      if (error) console.warn('Dossier sponsor non mis à jour :', error.message);
    }

    if (echecs.length) {
      notifier(`Demande enregistrée, mais ${echecs.length} fichier(s) non envoyé(s) : ${echecs.join(', ')}`, 'erreur');
    }
    $('form-demande').hidden = true;
    $('confirmation').hidden = false;
    window.scrollTo({ top: 0 });
  } catch (err) {
    erreur(`La demande n'a pas pu être enregistrée : ${err.message}`);
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Envoyer la demande';
  }
});

// le message d'erreur disparaît dès qu'on corrige le formulaire
$('form-demande').addEventListener('input', () => erreur(''));
$('form-demande').addEventListener('change', () => erreur(''));

$('btn-autre').addEventListener('click', () => location.reload());

await Promise.all([chargerProduits(), chargerSaisonEtMatchs()]);
