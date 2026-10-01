// Run of show : déroulé minuté d'un match (face-off, pauses, fin), à partir de modèles.
// Régie / admin : créent et modifient ; Sponsoring et « Chrono & animation » : consultent (en direct le soir du match).
import { sb, exigerConnexion, echapper, dateCourte, notifier, debounce } from './app.js';
import { REPERES, TYPES, lireDuree, formatDuree, libelleQuand, calculerHeures, ligneEnCours } from './ros-calcul.js';

const { profil } = await exigerConnexion({ roles: ['regie', 'admin', 'sponsoring', 'animation'] });
const estRegie = ['regie', 'admin'].includes(profil.role);

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const heureCourte = (d) => d ? d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const heureMin = (d) => d ? d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : '';
const memeJour = (a, b) => a.toDateString() === b.toDateString();

// Colonnes de texte d'une ligne (dans l'ordre du tableau)
const CHAMPS = [
  ['action', 'Action', 'textarea'], ['video', 'Vidéotron', 'input'], ['audio', 'Audio', 'input'],
  ['speaker', 'Speaker', 'textarea'], ['led', 'LED', 'input'], ['instructions', 'Instructions', 'textarea'],
  ['lien', 'Lien', 'input'],
];
const REPERES_PAUSE = ['pause1', 'pause2', 'fin_match'];
const BOUTON_REPERE = { pause1: 'Pause 1 commence', pause2: 'Pause 2 commence', fin_match: 'Fin du match' };

const etat = {
  matchs: [], modeles: [],
  match: null, modele: null,       // ce qu'on affiche : le run of show d'un match, ou un modèle
  ros: null, lignes: [], heures: [],
  edition: false, tablesOk: true,
};

// ---------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------
async function chargerListes() {
  const [{ data: matchs, error }, { data: modeles }] = await Promise.all([
    sb.from('matchs').select('id, numero, date_heure, adversaire').order('date_heure'),
    sb.from('ros_modeles').select('id, nom').order('nom'),
  ]);
  if (error) { $('r-titre').textContent = 'Chargement impossible'; notifier(error.message, 'erreur'); return false; }
  etat.matchs = matchs || [];
  etat.modeles = modeles || [];
  const { error: eTable } = await sb.from('ros_matchs').select('id').limit(1);
  etat.tablesOk = !eTable;
  return true;
}

async function chargerVue() {
  const idModele = params.get('modele');
  etat.modele = idModele ? etat.modeles.find(m => m.id === idModele) || null : null;
  if (!etat.modele) {
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
    etat.match = etat.matchs.find(m => m.id === params.get('match'))
      || etat.matchs.find(m => new Date(m.date_heure) >= debutJour) || etat.matchs.at(-1) || null;
  }
  remplirChoix();
  if (!etat.tablesOk) {
    $('r-titre').textContent = 'Run of show';
    $('r-sous-titre').innerHTML = '<span class="message message-erreur petit">Le run of show n’est pas encore installé : exécutez la migration 30 dans Supabase.</span>';
    return;
  }
  etat.ros = null;
  if (etat.modele) {
    const { data } = await sb.from('ros_lignes').select('*').eq('modele_id', etat.modele.id).order('rang');
    etat.lignes = data || [];
  } else if (etat.match) {
    const { data: ros } = await sb.from('ros_matchs').select('*').eq('match_id', etat.match.id).maybeSingle();
    etat.ros = ros;
    const { data } = ros ? await sb.from('ros_lignes').select('*').eq('ros_id', ros.id).order('rang') : { data: [] };
    etat.lignes = data || [];
  }
  afficher();
}

function remplirChoix() {
  $('choix-match').innerHTML = (etat.modele ? '<option value="">— Revenir à un match —</option>' : '')
    + etat.matchs.map(m => `<option value="${m.id}" ${m.id === etat.match?.id && !etat.modele ? 'selected' : ''}>
      ${dateCourte(m.date_heure)} · ${echapper(m.adversaire)}</option>`).join('');
  $('choix-modele').hidden = !estRegie;
  $('choix-modele').innerHTML = `<option value="">Modèles (${etat.modeles.length})…</option>`
    + etat.modeles.map(m => `<option value="${m.id}" ${m.id === etat.modele?.id ? 'selected' : ''}>${echapper(m.nom)}</option>`).join('')
    + '<option value="__nouveau">+ Nouveau modèle…</option>';
}

// ---------------------------------------------------------------------
// Repères : face-off (calendrier ou modifié), pauses et fin (cliquées le soir du match)
// ---------------------------------------------------------------------
function reperes() {
  if (etat.modele) {        // modèle : heures d'exemple pour un face-off à 19:45
    const fo = new Date(); fo.setHours(19, 45, 0, 0);
    return { face_off: fo };
  }
  const r = { face_off: etat.ros?.face_off ? new Date(etat.ros.face_off) : etat.match ? new Date(etat.match.date_heure) : null };
  for (const k of REPERES_PAUSE) r[k] = etat.ros?.reperes?.[k] ? new Date(etat.ros.reperes[k]) : null;
  return r;
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------
function afficher() {
  const r = reperes();
  if (etat.modele) {
    $('r-surtitre').textContent = 'Run of show · modèle';
    $('r-titre').textContent = etat.modele.nom;
    $('r-sous-titre').textContent = 'Heures d’exemple pour un face-off à 19:45. Copiez ce modèle pour un match depuis la page du match.';
  } else if (etat.match) {
    $('r-surtitre').textContent = 'Run of show';
    $('r-titre').textContent = `${dateCourte(etat.match.date_heure)} · contre ${etat.match.adversaire}`;
    $('r-sous-titre').textContent = `Match n° ${etat.match.numero ?? ''} · face-off ${heureMin(r.face_off)}`
      + (etat.ros?.face_off ? ' (heure modifiée)' : '');
  } else {
    $('r-titre').textContent = 'Aucun match au calendrier';
    return;
  }
  document.title = `Run of show — ${$('r-titre').textContent}`;

  const existe = !!etat.modele || !!etat.ros;
  $('vide').hidden = existe;
  $('vide-regie').hidden = !estRegie;
  $('vide-lecture').hidden = estRegie;
  if (!existe && estRegie) {
    $('modele-depart').innerHTML = etat.modeles.map(m => `<option value="${m.id}">Modèle : ${echapper(m.nom)}</option>`).join('')
      + '<option value="">Page vide</option>';
  }
  $('ros-barre').hidden = !existe;
  $('bloc-lignes').hidden = !existe;
  if (!existe) return;

  $('btn-edition').hidden = !estRegie;
  $('btn-edition').textContent = etat.edition ? '✓ Terminer' : '✏️ Modifier';
  $('ros-pied').hidden = !(estRegie && etat.edition);
  $('aide-edition').hidden = !(estRegie && etat.edition);
  $('btn-vers-modele').hidden = !!etat.modele;
  $('btn-supprimer').hidden = false;
  $('btn-supprimer').textContent = etat.modele ? 'Supprimer ce modèle…' : 'Supprimer ce run of show…';
  afficherReperes(r);
  afficherLignes();
  tic();
}

function afficherReperes(r) {
  const morceaux = [];
  if (etat.edition && estRegie && !etat.modele) {
    morceaux.push(`<label class="ros-repere">Face-off <input type="time" id="face-off" value="${heureMin(r.face_off)}" style="width:auto"></label>`);
  } else {
    morceaux.push(`<span class="ros-repere">Face-off <strong>${heureMin(r.face_off)}</strong></span>`);
  }
  if (!etat.modele) {
    for (const k of REPERES_PAUSE) {
      if (r[k]) {
        morceaux.push(`<span class="ros-repere">${REPERES[k]} <strong>${heureMin(r[k])}</strong>${estRegie
          ? ` <button type="button" class="btn btn-discret petit" data-annuler-repere="${k}" title="Effacer cette heure">✕</button>` : ''}</span>`);
      } else if (estRegie) {
        morceaux.push(`<button type="button" class="btn" data-repere="${k}">▶ ${BOUTON_REPERE[k]}</button>`);
      } else {
        morceaux.push(`<span class="ros-repere doux">${REPERES[k]} : pas encore</span>`);
      }
    }
  }
  $('reperes').innerHTML = morceaux.join('');
}

function afficherLignes() {
  etat.heures = calculerHeures(etat.lignes, reperes());
  if (etat.edition && estRegie) return afficherEdition();
  // lecture : on cache les colonnes vides
  const cols = CHAMPS.filter(([c]) => etat.lignes.some(l => (l[c] || '').trim()));
  $('entete').innerHTML = `<tr><th>N°</th><th>Heure</th><th>Quand</th><th>Durée</th>${cols.map(([, t]) => `<th>${t}</th>`).join('')}</tr>`;
  $('lignes').innerHTML = etat.lignes.length ? etat.lignes.map((l, i) => `
    <tr class="ros-ligne ros-type-${echapper(l.type || 'autre')}" data-rang="${i}">
      <td class="doux">${i + 1}</td>
      <td class="ros-heure" data-heure="${i}">${celluleHeure(l, i)}</td>
      <td class="petit">${echapper(libelleQuand(l))}</td>
      <td class="petit">${l.duree_s ? formatDuree(l.duree_s) : ''}</td>
      ${cols.map(([c]) => `<td class="${c === 'action' ? '' : 'petit'}">${c === 'lien' ? lienCliquable(l.lien) : texte(l[c], c === 'action')}</td>`).join('')}
    </tr>`).join('')
    : `<tr><td colspan="${4 + cols.length}" class="doux">Aucune ligne pour l’instant.</td></tr>`;
}

const texte = (v, fort) => v ? (fort ? `<strong>${echapper(v)}</strong>` : echapper(v)).replace(/\n/g, '<br>') : '';
const lienCliquable = (v) => !v ? '' : /^https?:\/\//i.test(v.trim())
  ? `<a href="${echapper(v.trim())}" target="_blank" rel="noopener">Ouvrir ↗</a>` : echapper(v);

function celluleHeure(l, i) {
  const h = etat.heures[i];
  if (h?.debut) return `<strong>${heureCourte(h.debut)}</strong>`;
  if (l.repere === 'suite') return '<span class="doux">à la suite</span>';
  return `<span class="doux">après ${REPERES[l.repere] || ''}</span>`;
}

// Mode modification (Régie) : chaque cellule est un champ, enregistré dès qu'on le quitte
function modeQuand(l) {
  if (l.repere === 'face_off') return (l.decalage_s || 0) < 0 ? 'avant' : 'apres';
  return l.repere;
}
function afficherEdition() {
  $('entete').innerHTML = `<tr><th></th><th>Quand</th><th>Durée</th><th>Type</th>${CHAMPS.map(([, t]) => `<th>${t}</th>`).join('')}<th></th></tr>`;
  $('lignes').innerHTML = etat.lignes.map((l, i) => {
    const mode = modeQuand(l);
    return `
    <tr class="ros-ligne ros-type-${echapper(l.type || 'autre')}" data-id="${l.id}">
      <td class="ros-deplacer">
        <span class="doux">${i + 1}</span>
        <button type="button" class="btn btn-discret petit" data-monter ${i ? '' : 'disabled'} aria-label="Monter">↑</button>
        <button type="button" class="btn btn-discret petit" data-descendre ${i < etat.lignes.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button>
      </td>
      <td class="ros-quand">
        <select data-champ="mode">
          <option value="avant" ${mode === 'avant' ? 'selected' : ''}>Avant le face-off</option>
          <option value="apres" ${mode === 'apres' ? 'selected' : ''}>Après le face-off</option>
          <option value="pause1" ${mode === 'pause1' ? 'selected' : ''}>Pause 1 +</option>
          <option value="pause2" ${mode === 'pause2' ? 'selected' : ''}>Pause 2 +</option>
          <option value="fin_match" ${mode === 'fin_match' ? 'selected' : ''}>Fin du match +</option>
          <option value="suite" ${mode === 'suite' ? 'selected' : ''}>À la suite</option>
        </select>
        <input type="text" data-champ="decalage" value="${l.repere === 'suite' ? '' : formatDuree(l.decalage_s || 0)}"
               placeholder="22:30" ${l.repere === 'suite' ? 'hidden' : ''} aria-label="Temps">
        <div class="petit" data-heure="${i}">${celluleHeure(l, i)}</div>
      </td>
      <td><input type="text" data-champ="duree" value="${l.duree_s ? formatDuree(l.duree_s) : ''}" placeholder="1:30" aria-label="Durée"></td>
      <td><select data-champ="type">${Object.entries(TYPES).map(([v, t]) =>
        `<option value="${v}" ${(l.type || 'autre') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      ${CHAMPS.map(([c, t, genre]) => `<td>${genre === 'textarea'
        ? `<textarea data-champ="${c}" rows="2" aria-label="${t}">${echapper(l[c] || '')}</textarea>`
        : `<input type="text" data-champ="${c}" value="${echapper(l[c] || '')}" aria-label="${t}">`}</td>`).join('')}
      <td><button type="button" class="btn btn-discret btn-danger petit" data-supprimer-ligne aria-label="Supprimer la ligne">✕</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="${5 + CHAMPS.length}" class="doux">Aucune ligne : « + Ajouter une ligne ».</td></tr>`;
}

// Heures recalculées sans redessiner le tableau (on ne perd pas le champ en cours de saisie)
function majHeures() {
  etat.heures = calculerHeures(etat.lignes, reperes());
  etat.lignes.forEach((l, i) => { const c = document.querySelector(`[data-heure="${i}"]`); if (c) c.innerHTML = celluleHeure(l, i); });
}

// Horloge, temps avant le face-off, ligne en cours (le jour du match)
function tic() {
  const maintenant = new Date();
  $('horloge').textContent = heureCourte(maintenant);
  const r = reperes();
  const leJour = !etat.modele && r.face_off && memeJour(r.face_off, maintenant);
  const reste = r.face_off ? (r.face_off - maintenant) / 1000 : null;
  $('avant-fo').textContent = !leJour ? '' : reste > 0 ? `· face-off dans ${formatDuree(reste)}` : '· match commencé';
  if (etat.edition) return;
  const enCours = leJour ? ligneEnCours(etat.heures, maintenant) : -1;
  document.querySelectorAll('#lignes tr[data-rang]').forEach(tr => tr.classList.toggle('en-cours', Number(tr.dataset.rang) === enCours));
}
setInterval(tic, 1000);

// ---------------------------------------------------------------------
// Modifications (Régie / admin)
// ---------------------------------------------------------------------
async function majLigne(id, champs) {
  const { error } = await sb.from('ros_lignes').update(champs).eq('id', id);
  if (error) { notifier(`Enregistrement impossible : ${error.message}`, 'erreur'); return false; }
  Object.assign(etat.lignes.find(l => l.id === id) || {}, champs);
  return true;
}

$('lignes').addEventListener('change', async (e) => {
  const t = e.target, tr = t.closest('tr[data-id]');
  if (!tr || !t.dataset.champ) return;
  const id = tr.dataset.id, c = t.dataset.champ;
  let champs;
  if (c === 'mode' || c === 'decalage') {
    const mode = tr.querySelector('[data-champ="mode"]').value;
    const saisie = tr.querySelector('[data-champ="decalage"]');
    saisie.hidden = mode === 'suite';
    const s = lireDuree(saisie.value);
    if (saisie.value.trim() && s === null) return notifier('Temps illisible : écrivez par exemple 22:30 ou 1:00:00', 'erreur');
    const abs = Math.abs(s || 0);
    champs = { repere: ['avant', 'apres'].includes(mode) ? 'face_off' : mode,
               decalage_s: mode === 'avant' ? -abs : mode === 'suite' ? 0 : abs };
  } else if (c === 'duree') {
    const s = lireDuree(t.value);
    if (t.value.trim() && s === null) return notifier('Durée illisible : écrivez par exemple 1:30', 'erreur');
    champs = { duree_s: s ? Math.abs(s) : null };
  } else {
    champs = { [c]: t.value.trim() || null };
  }
  if (!(await majLigne(id, champs))) return;
  if (c === 'type') tr.className = `ros-ligne ros-type-${t.value}`;
  majHeures();
});

$('lignes').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const i = etat.lignes.findIndex(l => l.id === tr.dataset.id);
  if (e.target.closest('[data-supprimer-ligne]')) {
    const l = etat.lignes[i];
    if (!confirm(`Supprimer la ligne ${i + 1}${l.action ? ` « ${l.action} »` : ''} ?`)) return;
    const { error } = await sb.from('ros_lignes').delete().eq('id', l.id);
    if (error) return notifier(`Suppression impossible : ${error.message}`, 'erreur');
    etat.lignes.splice(i, 1);
    return afficherLignes();
  }
  const sens = e.target.closest('[data-monter]') ? -1 : e.target.closest('[data-descendre]') ? 1 : 0;
  if (!sens || !etat.lignes[i + sens]) return;
  // on renumérote toute la liste (10, 20, 30…) pour éviter les égalités
  const ordre = etat.lignes.slice();
  [ordre[i], ordre[i + sens]] = [ordre[i + sens], ordre[i]];
  const maj = ordre.map((l, k) => ({ l, rang: (k + 1) * 10 })).filter(x => x.l.rang !== x.rang);
  const resultats = await Promise.all(maj.map(x => sb.from('ros_lignes').update({ rang: x.rang }).eq('id', x.l.id)));
  const erreur = resultats.find(r => r.error);
  if (erreur) return notifier(`Déplacement impossible : ${erreur.error.message}`, 'erreur');
  maj.forEach(x => { x.l.rang = x.rang; });
  etat.lignes = ordre;
  afficherLignes();
});

$('btn-ajouter').addEventListener('click', async () => {
  const rang = (etat.lignes.at(-1)?.rang || 0) + 10;
  const parent = etat.modele ? { modele_id: etat.modele.id } : { ros_id: etat.ros.id };
  const { data, error } = await sb.from('ros_lignes').insert({ ...parent, rang, repere: 'suite', type: 'autre' }).select('*').single();
  if (error) return notifier(`Ajout impossible : ${error.message}`, 'erreur');
  etat.lignes.push(data);
  afficherLignes();
  document.querySelector(`tr[data-id="${data.id}"] [data-champ="action"]`)?.focus();
});

$('btn-edition').addEventListener('click', () => { etat.edition = !etat.edition; afficher(); if (!etat.edition) chargerVue(); });

// Face-off modifié (match retardé…) : vide = heure du calendrier
$('reperes').addEventListener('change', async (e) => {
  if (e.target.id !== 'face-off') return;
  let face_off = null;
  if (e.target.value) {
    const [h, m] = e.target.value.split(':').map(Number);
    const d = new Date(etat.match.date_heure); d.setHours(h, m, 0, 0);
    face_off = d.getTime() === new Date(etat.match.date_heure).getTime() ? null : d.toISOString();
  }
  const { error } = await sb.from('ros_matchs').update({ face_off, maj_le: new Date().toISOString() }).eq('id', etat.ros.id);
  if (error) return notifier(`Enregistrement impossible : ${error.message}`, 'erreur');
  etat.ros.face_off = face_off;
  notifier(face_off ? `Face-off à ${e.target.value}` : 'Face-off : heure du calendrier');
  afficher();
});

// « Pause 1 commence » etc. : l'heure réelle, toutes les lignes de la pause se calculent
$('reperes').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-repere], [data-annuler-repere]');
  if (!b) return;
  const k = b.dataset.repere || b.dataset.annulerRepere;
  if (b.dataset.annulerRepere && !confirm(`Effacer l’heure de « ${REPERES[k]} » ?`)) return;
  const nouveaux = { ...(etat.ros.reperes || {}) };
  if (b.dataset.repere) nouveaux[k] = new Date().toISOString(); else delete nouveaux[k];
  const { error } = await sb.from('ros_matchs').update({ reperes: nouveaux, maj_le: new Date().toISOString() }).eq('id', etat.ros.id);
  if (error) return notifier(`Enregistrement impossible : ${error.message}`, 'erreur');
  etat.ros.reperes = nouveaux;
  if (b.dataset.repere) notifier(`${REPERES[k]} : ${heureMin(new Date(nouveaux[k]))}`);
  afficher();
});

// Créer le run of show d'un match (copie d'un modèle, ou vide)
$('btn-creer').addEventListener('click', async () => {
  const modeleId = $('modele-depart').value || null;
  $('btn-creer').disabled = true;
  const { data: ros, error } = await sb.from('ros_matchs').insert({ match_id: etat.match.id, modele_id: modeleId }).select('*').single();
  if (error) { $('btn-creer').disabled = false; return notifier(`Création impossible : ${error.message}`, 'erreur'); }
  if (modeleId) {
    const erreur = await copierLignes({ modele_id: modeleId }, { ros_id: ros.id });
    if (erreur) notifier(`Run of show créé, mais les lignes du modèle n’ont pas été copiées : ${erreur}`, 'erreur');
  }
  $('btn-creer').disabled = false;
  etat.edition = !modeleId;
  await chargerVue();
});

// Copie toutes les lignes d'un run of show / modèle vers un autre
async function copierLignes(source, cible) {
  const [[cle, val]] = Object.entries(source);
  const { data, error } = await sb.from('ros_lignes').select('*').eq(cle, val).order('rang');
  if (error) return error.message;
  if (!data?.length) return null;
  const copies = data.map(({ id, ros_id, modele_id, ...reste }) => ({ ...reste, ros_id: null, modele_id: null, ...cible }));
  const { error: e2 } = await sb.from('ros_lignes').insert(copies);
  return e2?.message || null;
}

$('btn-vers-modele').addEventListener('click', async () => {
  const nom = prompt('Nom du modèle (ex. « National League standard ») :', '');
  if (!nom?.trim()) return;
  const { data: m, error } = await sb.from('ros_modeles').insert({ nom: nom.trim() }).select('id, nom').single();
  if (error) return notifier(`Création impossible : ${error.message}`, 'erreur');
  const erreur = await copierLignes({ ros_id: etat.ros.id }, { modele_id: m.id });
  if (erreur) return notifier(`Modèle créé, mais les lignes n’ont pas été copiées : ${erreur}`, 'erreur');
  etat.modeles.push(m);
  remplirChoix();
  notifier(`Modèle « ${m.nom} » enregistré`);
});

$('btn-supprimer').addEventListener('click', async () => {
  const quoi = etat.modele ? `le modèle « ${etat.modele.nom} » (les run of show déjà créés ne changent pas)` : 'le run of show de ce match';
  if (!confirm(`Supprimer ${quoi} ? Toutes ses lignes seront effacées.`)) return;
  const { error } = etat.modele
    ? await sb.from('ros_modeles').delete().eq('id', etat.modele.id)
    : await sb.from('ros_matchs').delete().eq('id', etat.ros.id);
  if (error) return notifier(`Suppression impossible : ${error.message}`, 'erreur');
  notifier('Supprimé');
  if (etat.modele) { location.href = 'run-of-show.html'; return; }
  etat.edition = false;
  await chargerVue();
});

$('btn-imprimer').addEventListener('click', () => window.print());

// Choix d'un match / d'un modèle
$('choix-match').addEventListener('change', (e) => {
  location.href = e.target.value ? `run-of-show.html?match=${e.target.value}` : 'run-of-show.html';
});
$('choix-modele').addEventListener('change', async (e) => {
  const v = e.target.value;
  if (!v) return;
  if (v === '__nouveau') {
    const nom = prompt('Nom du nouveau modèle (ex. « CHL standard ») :', '');
    if (!nom?.trim()) { remplirChoix(); return; }
    const { data, error } = await sb.from('ros_modeles').insert({ nom: nom.trim() }).select('id').single();
    if (error) { remplirChoix(); return notifier(`Création impossible : ${error.message}`, 'erreur'); }
    location.href = `run-of-show.html?modele=${data.id}&edition=1`;
    return;
  }
  location.href = `run-of-show.html?modele=${v}`;
});

// ---------------------------------------------------------------------
// En direct : chrono / animation voient les changements et les pauses sans recharger
// ---------------------------------------------------------------------
const rafraichir = debounce(() => { if (!etat.edition) chargerVue(); }, 400);
sb.channel('run-of-show')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ros_lignes' }, rafraichir)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ros_matchs' }, rafraichir)
  .subscribe();

if (await chargerListes()) {
  etat.edition = estRegie && params.get('edition') === '1';
  await chargerVue();
}
