import { sb, exigerConnexion, LIBELLES, echapper, dateCourte, dateHeure, notifier, debounce, taille, libelleFichier,
         depuis, initiales } from './app.js';
import { carteTraitement, CHAMPS_A_TRAITER, ajouterFichierDemande, boutonAjoutFichier, supprimerDemande,
         boutonSupprimerFichier, confirmerSuppressionFichier } from './traitement.js';

const { profil } = await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });
const estRegie = ['regie', 'admin'].includes(profil.role);

const $ = (id) => document.getElementById(id);
const ONGLETS = [
  { cle: 'a_traiter', texte: 'À traiter', statuts: ['nouvelle', 'en_cours'] },
  { cle: 'question',  texte: 'Questions', statuts: ['question'] },
  { cle: 'traitee',   texte: 'Traitées',  statuts: ['traitee'] },
  { cle: 'toutes',    texte: 'Toutes',    statuts: null },
];

const etat = {
  demandes: [],
  personnes: new Map(),   // id -> nom ou e-mail
  roles: new Map(),       // id -> rôle
  adversaires: new Map(), // 'AAAA-MM-JJ' -> adversaire du match ce jour-là
  onglet: estRegie ? 'a_traiter' : 'toutes',
  recherche: '',
  type: '',
  mesDemandes: !estRegie,
  ouverte: new URLSearchParams(location.search).get('id'),
};
// Page d'où l'on vient (ex. Match du jour) : fermer la demande y ramène
const RETOUR = (() => {
  const r = new URLSearchParams(location.search).get('retour');
  return r && /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(r) ? r : null;
})();

$('mes-demandes').checked = etat.mesDemandes;
$('sous-titre').textContent = estRegie
  ? 'Les demandes du Sponsoring à traiter par la Régie.'
  : 'Vos demandes à la Régie et leur suivi.';
$('filtre-type').innerHTML += Object.entries(LIBELLES.type_demande)
  .map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

// ---------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------
async function charger() {
  const [{ data, error }, { data: personnes }, { data: matchs }] = await Promise.all([
    sb.from('demandes')
      .select(`*, sponsor:sponsors(id, nom),
               produits:demandes_produits(*, produit:produits(id, nom, famille, support)),
               match_effet:matchs(numero, date_heure, adversaire),
               saison:saisons(libelle)`)
      .order('created_at', { ascending: false }),
    sb.from('profiles').select('id, nom, email, role'),
    sb.from('matchs').select('date_heure, adversaire'),
  ]);
  if (error) { notifier(`Chargement impossible : ${error.message}`, 'erreur'); return; }
  etat.demandes = data;
  etat.personnes = new Map((personnes || []).map(p => [p.id, p.nom || p.email.split('@')[0]]));
  etat.roles = new Map((personnes || []).map(p => [p.id, p.role]));
  etat.adversaires = new Map((matchs || []).map(m => [jourLocal(m.date_heure), m.adversaire]));
  afficher();
}

const jourLocal = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const nomSponsor = (d) => d.sponsor?.nom || d.sponsor_nom_saisi || '—';
// statut affiché : « Fichier à refaire » quand la Régie attend un nouveau fichier (migration 37)
const libelleStatut = (d) => d.statut === 'question' && d.produits.some(x => x.a_corriger && !x.traite_le)
  ? '⚠ Fichier à refaire' : LIBELLES.statut_demande[d.statut];
const listeProduits = (d) => d.produits.map(x => x.produit?.nom).filter(Boolean);
// avant la migration 07, le « Quand ? » était donné pour toute la demande
const ancienQuand = (d) => d.type_vente || d.match_effet || d.date_effet;
const saisonDe = (d) => `Saison ${d.saison?.libelle || ''}`.trim();

const effet = (d, complet = false) => {
  if (!ancienQuand(d)) {
    const types = new Set(d.produits.map(x => x.type_vente));
    if (!types.size) return '—';
    if (types.size > 1) return 'Saison + au match';
    return types.has('match') ? '<span class="badge badge-match">Au match</span>' : saisonDe(d);
  }
  if (d.type_vente === 'saison') return saisonDe(d);
  if (d.type_vente === 'match') {
    const dates = (d.dates_matchs || []).map(dateCourte);
    const liste = complet || dates.length <= 2 ? dates.join(', ') : `${dates.slice(0, 2).join(', ')} +${dates.length - 2}`;
    return `Au match : ${liste}`;
  }
  return d.match_effet
    ? `Match ${d.match_effet.numero} (${dateCourte(d.match_effet.date_heure)})`
    : d.date_effet ? `Dès le ${dateCourte(d.date_effet)}` : 'Dès que possible';
};

// Les matchs d'un produit vendu au match : « 03.10.2026 · SC Bern »
const matchsLisibles = (dates) => (dates || []).map(j =>
  `${dateCourte(j + 'T12:00')}${etat.adversaires.has(j) ? ` · ${echapper(etat.adversaires.get(j))}` : ''}`);

function blocProduits(d) {
  if (!d.produits.length) return '<p class="doux">Aucun produit.</p>';
  return `<div class="details-produits">${d.produits.map(x => estRegie && !x.traite_le && d.statut !== 'traitee'
    // pas encore traité : la même carte que sur la fiche produit (Ajouter, plan LED, fichiers…)
    ? `<div data-carte-traitement="${x.produit?.id}"><span class="doux petit">${echapper(x.produit?.nom || '')} : chargement…</span></div>`
    : `
    <div class="detail-produit" data-produit="${x.produit?.id}">
      <div class="suivi-produit ${x.traite_le ? 'fait' : ''}">
        ${x.traite_le
          ? `✓ ${SUITES[x.suite] || 'Traité'} le ${dateHeure(x.traite_le)} par ${echapper(etat.personnes.get(x.traite_par) || '—')}`
          : x.a_corriger ? '⚠ Fichier à refaire' : `En attente de la Régie`}
        <a href="produit.html?id=${x.produit?.id}">Ouvrir la fiche →</a>
      </div>
      ${x.a_corriger && !x.traite_le ? `<p class="message message-erreur petit">⚠ <strong>La Régie ne peut pas utiliser le fichier</strong>${
        x.a_corriger_le ? ` (le ${dateCourte(x.a_corriger_le)})` : ''} : ${echapper(x.a_corriger)}<br>
        Ajoutez le bon fichier ci-dessous avec « + Ajouter un fichier » : la Régie sera prévenue.</p>` : ''}
      <div class="detail-entete">
        <strong>${echapper(x.produit?.nom || '?')}</strong>
        ${ancienQuand(d) ? '' : x.type_vente === 'match'
          ? '<span class="badge badge-match">Seulement certains matchs</span>'
          : `<span class="badge">Toute la ${echapper(saisonDe(d).toLowerCase())}</span>`}
        ${x.avec_son === true ? '<span class="badge badge-son">Avec son</span>' : x.avec_son === false ? '<span class="badge">Sans son</span>' : ''}
        ${x.avec_anneau === true ? '<span class="badge badge-son">+ Anneau LED</span>' : x.avec_anneau === false ? '<span class="badge">Sans anneau LED</span>' : ''}
      </div>
      ${x.type_vente === 'match' && !ancienQuand(d) ? `
        <div style="margin-bottom:.75rem">
          <div class="titre-bloc">Matchs</div>
          <div class="petit">${matchsLisibles(x.dates_matchs).join('<br>')}</div>
        </div>` : ''}
      ${x.duree_s ? `<div class="petit" style="margin-bottom:.75rem"><span class="titre-bloc">Durée du spot</span> <strong>${x.duree_s} s</strong></div>` : ''}
      <div class="fichiers-du-produit" data-fichiers-produit="${x.produit?.id}" style="margin-bottom:.9rem">
        <span class="doux petit">Fichiers : chargement…</span></div>
      <div class="grille-remarques">
        <div>
          <div class="titre-bloc">Remarque Sponsoring</div>
          <div class="bloc-texte petit">${echapper(x.remarque_sponsoring || '—')}</div>
        </div>
        <div>
          <div class="titre-bloc">Remarque Régie</div>
          ${estRegie
            ? `<textarea class="petit" data-remarque-regie="${x.produit?.id}" rows="2" style="min-height:0"
                 placeholder="Ex. : logo reçu, à retravailler…">${echapper(x.remarque_regie || '')}</textarea>`
            : `<div class="bloc-texte petit">${echapper(x.remarque_regie || '—')}</div>`}
        </div>
      </div>
    </div>`).join('')}</div>`;
}

function filtrer() {
  const q = etat.recherche.toLowerCase();
  const onglet = ONGLETS.find(o => o.cle === etat.onglet);
  return etat.demandes.filter(d =>
    (!etat.mesDemandes || d.cree_par === profil.id) &&
    (!etat.type || d.type === etat.type) &&
    (!q || [nomSponsor(d), d.remarque_sponsoring, d.reponse_regie, ...listeProduits(d)]
            .some(v => (v || '').toLowerCase().includes(q))) &&
    (!onglet.statuts || onglet.statuts.includes(d.statut)));
}

// ---------------------------------------------------------------------
// Affichage de la liste
// ---------------------------------------------------------------------
function afficher() {
  // compteurs des onglets (après filtres « mes demandes », type et recherche)
  const base = etat.demandes.filter(d =>
    (!etat.mesDemandes || d.cree_par === profil.id) && (!etat.type || d.type === etat.type));
  $('onglets').innerHTML = ONGLETS.map(o => {
    const n = o.statuts ? base.filter(d => o.statuts.includes(d.statut)).length : base.length;
    return `<button data-onglet="${o.cle}" class="${o.cle === etat.onglet ? 'actif' : ''}">${o.texte}<span class="compte">${n}</span></button>`;
  }).join('');

  const liste = filtrer();
  $('vide').hidden = liste.length > 0;
  $('lignes').innerHTML = liste.map(d => {
    const produits = listeProduits(d).map(n => n.replace(/^Action scene – /, 'Action scene · '));
    // une demande non traitée depuis plus de 2 jours est signalée
    const enRetard = d.statut !== 'traitee' && Date.now() - new Date(d.created_at) > 48 * 3600e3;
    return `
      <tr data-id="${d.id}" class="ligne-${d.statut}${d.id === etat.ouverte ? ' selectionnee' : ''}">
        <td>
          <div class="demande-sponsor">${echapper(nomSponsor(d))}</div>
          <div class="demande-sous">${d.type === 'suppression'
            ? `<span class="badge badge-suppression">✕ ${LIBELLES.type_demande[d.type]}</span>`
            : LIBELLES.type_demande[d.type]}${d.sponsor ? '' : ' · <strong>nouveau sponsor</strong>'}</div>
          ${produits.length ? `<div class="puces-produits">
            ${produits.slice(0, 4).map(n => `<span class="puce-produit">${echapper(n)}</span>`).join('')}
            ${produits.length > 4 ? `<span class="puce-produit">+${produits.length - 4}</span>` : ''}</div>` : ''}
        </td>
        <td class="col-optionnelle">${effet(d)}</td>
        <td><span class="badge statut-${d.statut}">${libelleStatut(d)}</span></td>
        <td class="col-optionnelle">
          <span class="anciennete${enRetard ? ' en-retard' : ''}" title="${dateHeure(d.created_at)}">${depuis(d.created_at)}</span>
        </td>
        <td class="col-optionnelle"><span class="personnes">${avatar(d.cree_par)}${d.traite_par && d.statut === 'traitee'
          ? `<span class="fleche">→</span>${avatar(d.traite_par)}` : ''}</span></td>
      </tr>`;
  }).join('');
}

function avatar(id) {
  const nom = etat.personnes.get(id) || '?';
  const regie = ['regie', 'admin'].includes(etat.roles.get(id));
  return `<span class="avatar${regie ? ' avatar-regie' : ''}" title="${echapper(nom)}">${echapper(initiales(nom))}</span>`;
}

$('onglets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-onglet]');
  if (b) { etat.onglet = b.dataset.onglet; afficher(); }
});
$('recherche').addEventListener('input', debounce((e) => { etat.recherche = e.target.value.trim(); afficher(); }, 150));
$('filtre-type').addEventListener('change', (e) => { etat.type = e.target.value; afficher(); });
$('mes-demandes').addEventListener('change', (e) => { etat.mesDemandes = e.target.checked; afficher(); });
$('lignes').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) ouvrir(tr.dataset.id);
});

// ---------------------------------------------------------------------
// Panneau de détail
// ---------------------------------------------------------------------
async function ouvrir(id, { silencieux = false } = {}) {
  const d = etat.demandes.find(x => x.id === id);
  if (!d) { if (!silencieux) notifier('Demande introuvable', 'erreur'); return; }
  etat.ouverte = id;
  history.replaceState(null, '', `?id=${id}`);
  afficher();

  $('d-surtitre').textContent = LIBELLES.type_demande[d.type];
  $('d-titre').textContent = nomSponsor(d);
  $('d-sous-titre').innerHTML =
    `<span class="badge statut-${d.statut}">${libelleStatut(d)}</span>` +
    `${d.sponsor ? '' : ' <span class="badge badge-a-venir">nouveau sponsor</span>'}` +
    ` &nbsp;reçue ${depuis(d.created_at)} · ${dateHeure(d.created_at)}`;

  $('d-corps').innerHTML = `
    <div class="detail-grille">
      <div>
        <section class="detail-section">
          <h3>Produits (${d.produits.length})</h3>
          ${ancienQuand(d) ? `<p class="petit">Quand : <strong>${effet(d, true)}</strong></p>` : ''}
          ${blocProduits(d)}
        </section>

        ${d.remarque_sponsoring ? `
          <section class="detail-section">
            <h3>Remarque générale du Sponsoring</h3>
            <div class="bloc-texte">${echapper(d.remarque_sponsoring)}</div>
          </section>` : ''}

        <section class="detail-section">
          <h3>Autres fichiers</h3>
          <ul class="liste-fichiers" id="d-fichiers" style="margin:0"><li class="doux">Chargement…</li></ul>
        </section>

        <section class="detail-section encart encart-regie">
          ${estRegie ? blocRegie(d) : blocSponsoring(d)}
        </section>
      </div>

      <aside class="detail-cote">
        <div class="encart">
          <h3>Suivi</h3>
          <dl>
            <dt>Demandé par</dt><dd>${echapper(etat.personnes.get(d.cree_par) || '—')}
              <div class="doux petit">${dateHeure(d.created_at)}</div></dd>
            <dt id="d-pris-titre" hidden>Pris en charge par</dt><dd id="d-pris" hidden></dd>
            ${d.statut === 'traitee' && d.traite_par ? `<dt>Traité par</dt><dd>${echapper(etat.personnes.get(d.traite_par) || '')}
              <div class="doux petit">${dateHeure(d.traite_le)}</div></dd>` : ''}
          </dl>
        </div>
        <div class="encart">
          <h3>Historique</h3>
          <ol class="historique" id="d-historique"><li class="doux">Chargement…</li></ol>
        </div>
      </aside>
    </div>
  `;

  $('d-pied').innerHTML = estRegie ? piedRegie(d) : piedSponsoring(d);
  $('d-pied').hidden = !$('d-pied').innerHTML.trim();

  $('fenetre').hidden = false;
  $('voile').hidden = false;
  document.body.classList.add('fenetre-ouverte');
  brancherActions(d);
  chargerFichiers(d.id);
  chargerFichiersProduits(d);
  chargerHistorique(d.id);
  afficherTraitements(d);
}

// Après un traitement ou une suppression : on rouvre la demande, ou on ferme si elle n'existe plus
const rouvrirOuFermer = (id) => async () => {
  await charger();
  if (etat.demandes.some(x => x.id === id)) ouvrir(id); else fermer();
};

// Produits pas encore traités (Régie) : la carte de traitement, identique à celle de la fiche produit
async function afficherTraitements(d) {
  const zones = [...document.querySelectorAll('#d-corps [data-carte-traitement]')];
  if (!zones.length) return;
  const { data, error } = await sb.from('demandes_produits').select(CHAMPS_A_TRAITER)
    .eq('demande_id', d.id).is('traite_le', null);
  if (error) { notifier(`Chargement impossible : ${error.message}`, 'erreur'); return; }
  if (etat.ouverte !== d.id) return;
  for (const zone of zones) {
    const a = (data || []).find(x => x.produit_id === zone.dataset.carteTraitement);
    if (a) carteTraitement(zone, a, { estRegie, mode: 'demande', apres: rouvrirOuFermer(d.id) });
  }
}

// ---------------------------------------------------------------------
// Historique (reconstruit depuis la table journal, alimentée par trigger)
// ---------------------------------------------------------------------
async function chargerHistorique(id) {
  const { data, error } = await sb.from('journal')
    .select('action, user_id, le, avant, apres')
    .eq('table_nom', 'demandes').eq('ligne_id', id)
    .order('le').order('id');
  const ol = $('d-historique');
  if (!ol || etat.ouverte !== id) return;
  if (error) { ol.innerHTML = `<li class="doux">${echapper(error.message)}</li>`; return; }

  const evenements = (data || []).map(decrireEvenement).filter(Boolean);
  ol.innerHTML = evenements.length
    ? evenements.map(e => `
        <li><strong>${e.titre}</strong>
          <div class="quand">${echapper(e.qui)} · ${dateHeure(e.le)}</div>
          ${e.texte ? `<div class="bloc-texte">${echapper(e.texte)}</div>` : ''}</li>`).join('')
    : '<li class="doux">Aucun historique.</li>';

  const prise = evenements.filter(e => e.priseEnCharge).at(-1);
  if (prise) {
    $('d-pris').innerHTML = `${echapper(prise.qui)}<div class="doux petit">${dateHeure(prise.le)}</div>`;
    $('d-pris').hidden = $('d-pris-titre').hidden = false;
  }
}

function decrireEvenement(j) {
  const qui = etat.personnes.get(j.user_id) || 'Quelqu’un';
  const base = { qui, le: j.le };
  if (j.action === 'insert') return { ...base, titre: 'Demande créée' };
  if (j.action !== 'update') return null;

  const a = j.avant || {}, n = j.apres || {};
  if (a.statut !== n.statut) {
    switch (n.statut) {
      case 'en_cours':
        return a.statut === 'traitee'
          ? { ...base, titre: 'Demande rouverte', priseEnCharge: true }
          : { ...base, titre: 'Prise en charge', priseEnCharge: true };
      case 'question':
        return { ...base, titre: 'Question posée au Sponsoring', texte: n.reponse_regie };
      case 'traitee':
        return { ...base, titre: 'Demande traitée',
                 texte: n.reponse_regie !== a.reponse_regie ? n.reponse_regie : null };
      case 'nouvelle': {
        const ajout = (n.remarque_sponsoring || '').slice((a.remarque_sponsoring || '').length)
          .replace(/^\s*— Réponse du [^\n]*:\n/, '').trim();
        return { ...base, titre: a.statut === 'question' ? 'Réponse du Sponsoring' : 'Remise à traiter', texte: ajout || null };
      }
    }
  }
  if (a.reponse_regie !== n.reponse_regie) return { ...base, titre: 'Réponse de la Régie modifiée', texte: n.reponse_regie };
  if (a.remarque_sponsoring !== n.remarque_sponsoring && /— Fichier ajouté le/.test(n.remarque_sponsoring || '')) {
    return { ...base, titre: 'Fichier ajouté', texte: (n.remarque_sponsoring || '').slice((a.remarque_sponsoring || '').length).replace(/^\s*— /, '').trim() };
  }
  if (a.sponsor_id !== n.sponsor_id) return { ...base, titre: 'Sponsor rattaché' };
  return null;
}

function blocRegie(d) {
  return `
    <h3>Réponse de la Régie</h3>
    <textarea id="d-reponse" placeholder="Réponse au Sponsoring, ou la question à lui poser. Ex. : 3M ok, honorary à faire…">${echapper(d.reponse_regie || '')}</textarea>`;
}

// Barre d'actions en bas de la fenêtre (toujours visible)
function piedRegie(d) {
  if (d.statut === 'traitee') {
    return `<span class="indication">Demande traitée. Rouvrir ne supprime pas ce qui a été programmé.</span>
            <button class="btn" data-statut="en_cours">Rouvrir</button>`;
  }
  return `<span class="indication">Ajoutez chaque produit ci-dessus (ou sur sa fiche, c’est la même chose) ; la demande passe en « Traitée » quand tout est fait.</span>
    <button class="btn btn-discret btn-danger" id="btn-supprimer-demande" title="Erreur ou demande qui ne se fera pas">Supprimer la demande…</button>
    <button class="btn" data-statut="question">Poser une question</button>
    <button class="btn" data-statut="traitee" title="Normalement automatique quand tous les produits sont ajoutés">Marquer comme traitée</button>`;
}

const SUITES = { ajoute: 'Ajouté', visuel: 'Nouveau visuel mis', retire: 'Retiré', ignore: 'Ignoré' };

function blocSponsoring(d) {
  return `
    <h3>Réponse de la Régie</h3>
    <div class="bloc-texte">${echapper(d.reponse_regie || 'Pas encore de réponse.')}</div>
    ${d.statut === 'question' ? `
      <h3 style="margin-top:1rem">Votre réponse</h3>
      <textarea id="d-complement" placeholder="Répondez à la question de la Régie"></textarea>` : ''}`;
}

function piedSponsoring(d) {
  return d.statut === 'question'
    ? `<span class="indication">La Régie attend votre réponse.</span>
       <button class="btn btn-principal" id="btn-repondre">Envoyer la réponse</button>`
    : '';
}

function brancherActions(d) {
  // remarque Régie par produit : enregistrée dès qu'on quitte le champ
  document.querySelectorAll('#d-corps [data-remarque-regie]').forEach(t => t.addEventListener('change', async () => {
    const texte = t.value.trim() || null;
    const { error } = await sb.from('demandes_produits').update({ remarque_regie: texte })
      .eq('demande_id', d.id).eq('produit_id', t.dataset.remarqueRegie);
    if (error) { notifier(`Remarque non enregistrée : ${error.message}`, 'erreur'); return; }
    const x = d.produits.find(p => p.produit?.id === t.dataset.remarqueRegie);
    if (x) x.remarque_regie = texte;
    notifier('Remarque Régie enregistrée');
  }));

  document.querySelectorAll('#d-pied [data-statut]').forEach(b => b.addEventListener('click', async () => {
    const statut = b.dataset.statut;
    const reponse = $('d-reponse').value.trim();
    if (statut === 'question' && !reponse) {
      notifier('Écrivez la question dans la réponse de la Régie.', 'erreur');
      $('d-reponse').focus();
      return;
    }
    await enregistrer(d.id, { statut, reponse_regie: reponse || null },
      { en_cours: 'Demande prise en charge', question: 'Question envoyée au Sponsoring', traitee: 'Demande traitée' }[statut]);
  }));

  $('btn-supprimer-demande')?.addEventListener('click', async () => {
    if (!confirm(`Supprimer la demande de ${nomSponsor(d)} ?\n\nÀ utiliser pour une erreur ou une demande qui ne se fera pas : `
      + 'elle disparaît de l’outil avec ses fichiers.')) return;
    try {
      await supprimerDemande(d.id);
      notifier('Demande supprimée');
      await rouvrirOuFermer(d.id)();
    } catch (err) { notifier(err.message, 'erreur'); }
  });

  $('btn-repondre')?.addEventListener('click', async () => {
    const texte = $('d-complement').value.trim();
    if (!texte) return;
    const ajout = `\n\n— Réponse du ${dateHeure(new Date())} :\n${texte}`;
    await enregistrer(d.id, { statut: 'nouvelle', remarque_sponsoring: (d.remarque_sponsoring || '') + ajout },
      'Réponse envoyée à la Régie');
  });
}

async function enregistrer(id, champs, succes) {
  const { error } = await sb.from('demandes').update(champs).eq('id', id);
  if (error) { notifier(`Enregistrement impossible : ${error.message}`, 'erreur'); return; }
  notifier(succes);
  await charger();
  ouvrir(id);
}

async function chargerFichiers(id) {
  const dossier = `demandes/${id}`;
  const { data, error } = await sb.storage.from('assets').list(dossier, { sortBy: { column: 'name', order: 'asc' } });
  const ul = $('d-fichiers');
  if (!ul) return;
  if (error) { ul.innerHTML = `<li class="doux">${echapper(error.message)}</li>`; return; }
  const fichiers = (data || []).filter(f => f.id);   // ignore les dossiers (fichiers des produits)
  ul.innerHTML = fichiers.length
    ? fichiers.map(f => ligneFichier(`${dossier}/${f.name}`, f.name, f.metadata?.size)).join('')
    : '<li class="doux">Aucun autre fichier.</li>';
}

const ligneFichier = (chemin, nom, octets) => `
  <li><span>${echapper(nom)} <span class="doux petit">${taille(octets)}</span></span>
      <span><button class="btn" data-fichier="${echapper(chemin)}">Télécharger</button>
      ${estRegie ? boutonSupprimerFichier(chemin) : ''}</span></li>`;

// Fichiers de chaque produit : demandes/<demande>/<produit>/<role>__<nom>
// Une ligne par fichier attendu (ex. « Vidéo vidéotron », « Visuel anneau LED »), avec le fichier ou « à venir ».
async function chargerFichiersProduits(d) {
  await Promise.all(d.produits.map(async (x) => {
    const pid = x.produit?.id;
    const dossier = `demandes/${d.id}/${pid}`;
    const { data, error } = await sb.storage.from('assets').list(dossier, { sortBy: { column: 'name', order: 'asc' } });
    const zone = document.querySelector(`[data-fichiers-produit="${pid}"]`);
    if (!zone || etat.ouverte !== d.id) return;
    if (error) { zone.innerHTML = `<span class="doux petit">${echapper(error.message)}</span>`; return; }
    const fichiers = (data || []).filter(f => f.id).map(f => {
      const i = f.name.indexOf('__');
      return { ...f, role: i > 0 ? f.name.slice(0, i) : 'visuel', nomCourt: i > 0 ? f.name.slice(i + 2) : f.name };
    });
    const roles = ['visuel', ...(x.avec_anneau ? ['anneau'] : [])];
    zone.innerHTML = roles.map(role => {
      const liste = fichiers.filter(f => f.role === role);
      return `
        <div class="fichier-attendu">
          <div class="petit"><strong>${libelleFichier(x.produit, role)}</strong>
            ${liste.length ? '' : ' <span class="badge badge-a-venir">à venir</span>'}</div>
          ${liste.length ? `<ul class="liste-fichiers" style="margin:.25rem 0 0">${liste.map(f =>
            (x.fichiers_refuses || []).includes(`${dossier}/${f.name}`)
              ? `<li><span><s>${echapper(f.nomCourt)}</s> <span class="badge badge-a-venir">refusé · à refaire</span></span></li>`
              : ligneFichier(`${dossier}/${f.name}`, f.nomCourt, f.metadata?.size)).join('')}</ul>` : ''}
          ${x.suite === 'retire' || x.suite === 'ignore' ? '' : boutonAjoutFichier(role)}
        </div>`;
    }).join('');
  }));
}

// Fichier arrivé après la demande : le Sponsoring (ou la Régie) l'ajoute au produit.
// Si le produit était déjà ajouté, il revient « à traiter » : la Régie met le nouveau visuel (migration 28).
$('d-corps').addEventListener('change', async (e) => {
  const t = e.target.closest('[data-ajout-fichier]');
  if (!t || t.closest('[data-traitement]') || !t.files?.length) return;   // les cartes de traitement gèrent les leurs
  const d = etat.demandes.find(x => x.id === etat.ouverte);
  const produitId = t.closest('[data-produit]')?.dataset.produit;
  if (!d || !produitId) return;
  const fichier = t.files[0];
  notifier(`Envoi de ${fichier.name}…`);
  try {
    await ajouterFichierDemande({ demandeId: d.id, produitId, sponsorId: d.sponsor?.id, role: t.dataset.ajoutFichier, fichier });
    notifier(estRegie ? 'Fichier ajouté' : 'Fichier ajouté : la Régie est prévenue');
  } catch (err) { notifier(err.message, 'erreur'); }
  await charger();
  ouvrir(d.id);
});

// Supprimer un fichier qui n'est pas le bon (les cartes de traitement gèrent les leurs)
$('d-corps').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-supprimer-fichier]');
  if (!b || b.closest('[data-traitement]')) return;
  const id = etat.ouverte;
  b.disabled = true;
  if (await confirmerSuppressionFichier(b.dataset.supprimerFichier)) { await charger(); ouvrir(id); }
  b.disabled = false;
});

// Téléchargement (un seul écouteur pour tous les boutons du détail)
$('d-corps').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-fichier]');
  if (!b || b.closest('[data-traitement]')) return;
  const { data, error } = await sb.storage.from('assets').createSignedUrl(b.dataset.fichier, 600, { download: true });
  if (error) { notifier(error.message, 'erreur'); return; }
  location.href = data.signedUrl;
});

function fermer() {
  // ouvert depuis Match du jour : on y retourne
  if (RETOUR) { location.href = RETOUR; return; }
  $('fenetre').hidden = true;
  $('voile').hidden = true;
  document.body.classList.remove('fenetre-ouverte');
  etat.ouverte = null;
  history.replaceState(null, '', location.pathname);
  afficher();
}
$('btn-fermer').addEventListener('click', fermer);
$('voile').addEventListener('click', fermer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fenetre').hidden) fermer(); });

// ---------------------------------------------------------------------
// Mise à jour en direct (nécessite 04_temps_reel.sql)
// ---------------------------------------------------------------------
const rafraichir = debounce(async () => {
  const ouverte = etat.ouverte;
  const saisie = document.activeElement?.tagName === 'TEXTAREA';
  await charger();
  if (ouverte && !saisie) ouvrir(ouverte, { silencieux: true });
}, 500);
sb.channel('demandes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes' }, rafraichir)
  .subscribe();

await charger();
if (etat.ouverte) ouvrir(etat.ouverte, { silencieux: true });
