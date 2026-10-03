// Run of show : le rundown d'un match, comme l'Excel de la Régie (revu avec Léa le 02.10.2026).
// Avant le match : une HEURE par élément (le compte à rebours se calcule depuis le face-off) ;
// pendant le match : un « quand » en texte libre (arrêt de jeu, 00:01:00, 0:18:00…). Sections, lignes importantes.
// Régie / admin : créent et modifient ; Sponsoring et « Chrono & animation » : consultent, en direct le soir du match.
import { sb, exigerConnexion, echapper, dateCourte, notifier, debounce } from './app.js';
import { lireHeure, lireDuree, formatHMS, secondesDuJour, colonnesTemps, ligneEnCours, heureLigne,
         tempsCourt, heureCourteLigne } from './ros-calcul.js';

const { profil } = await exigerConnexion({ roles: ['regie', 'admin', 'sponsoring', 'animation'] });
const estRegie = ['regie', 'admin'].includes(profil.role);

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const heureCourte = (d) => d ? d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const heureMin = (d) => d ? d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : '';
const memeJour = (a, b) => a.toDateString() === b.toDateString();

// Colonnes de texte (comme l'Excel) : Action, Cube, Light, Audio, Speaker, Instructions (+ Lien si rempli)
const CHAMPS = [
  ['action', 'Action', 'textarea'], ['video', 'Cube', 'input'], ['light', 'Light', 'input'],
  ['audio', 'Audio', 'input'], ['speaker', 'Speaker', 'input'], ['instructions', 'Instructions', 'textarea'],
  ['lien', 'Lien', 'input'],
];

const etat = {
  matchs: [], modeles: [],
  match: null, modele: null,       // ce qu'on affiche : le run of show d'un match, ou un modèle
  ros: null, lignes: [],
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
  const { error: eTable } = await sb.from('ros_lignes').select('id, quand, est_section').limit(1);
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
    $('r-sous-titre').innerHTML = '<span class="message message-erreur petit">Le run of show n’est pas encore installé : exécutez les migrations 30 et 31 dans Supabase.</span>';
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

// Heure du face-off : calendrier (ou modifiée pour ce match) ; modèle : 19:45 d'exemple
function faceOff() {
  if (etat.modele) { const d = new Date(); d.setHours(19, 45, 0, 0); return d; }
  if (etat.ros?.face_off) return new Date(etat.ros.face_off);
  return etat.match ? new Date(etat.match.date_heure) : null;
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------
function afficher() {
  const fo = faceOff();
  if (etat.modele) {
    $('r-surtitre').textContent = 'Run of show · modèle';
    $('r-titre').textContent = etat.modele.nom;
    $('r-sous-titre').textContent = 'Heures pour un face-off à 19:45 : dans un match, elles suivent l’heure du face-off.';
  } else if (etat.match) {
    $('r-surtitre').textContent = 'Run of show';
    $('r-titre').textContent = `${dateCourte(etat.match.date_heure)} · contre ${etat.match.adversaire}`;
    $('r-sous-titre').textContent = `Match n° ${etat.match.numero ?? ''}${etat.ros?.face_off ? ' · heure du face-off modifiée pour ce match' : ''}`;
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
  $('aide-en-cours').hidden = !(estRegie && !etat.edition && !etat.modele);
  $('btn-vers-modele').hidden = !!etat.modele;
  $('btn-renommer').hidden = !etat.modele;
  $('btn-supprimer').textContent = etat.modele ? 'Supprimer ce modèle…' : 'Supprimer ce run of show…';

  // Face-off (en haut, comme dans l'Excel) : modifiable par la Régie pour un match
  $('reperes').innerHTML = estRegie && etat.edition && !etat.modele
    ? `<label class="ros-face-off">Face-off <input type="time" step="1" id="face-off" value="${heureCourte(fo)}"></label>`
    : `<span class="ros-face-off">Face-off <strong>${heureCourte(fo)}</strong></span>`;
  afficherLignes();
  tic();
}

// Numéro d'item : les sections ne comptent pas
const numeros = () => { let n = 0; return etat.lignes.map(l => l.est_section ? null : ++n); };

function afficherLignes() {
  if (etat.edition && estRegie) return afficherEdition();
  const fo = faceOff();
  const cols = CHAMPS.filter(([c]) => c !== 'lien' || etat.lignes.some(l => (l.lien || '').trim()));
  const nb = 3 + cols.length;
  // lecture : pas de N°, colonnes de temps étroites (format court), le texte prend la place (Léa, 03.10.2026)
  $('tableau').classList.add('ros-lecture');
  $('entete').innerHTML = `<tr><th class="ros-col-temps">Heure</th><th class="ros-col-temps">Compte à rebours</th>
    <th class="ros-col-temps">Durée</th>${cols.map(([, t]) => `<th>${t}</th>`).join('')}</tr>`;
  $('lignes').innerHTML = etat.lignes.length ? etat.lignes.map((l, i) => {
    if (l.est_section) return `<tr class="ros-section" data-rang="${i}"><td colspan="${nb}">${echapper(l.action || '')}</td></tr>`;
    const t = colonnesTemps(l, fo);
    const avecHeure = l.decalage_s !== null && l.decalage_s !== undefined;
    return `
    <tr class="ros-ligne${l.important ? ' ros-important' : ''}" data-rang="${i}" data-id="${l.id}">
      <td class="ros-heure">${echapper(heureCourteLigne(t.heure))}</td>
      <td class="ros-heure">${echapper(avecHeure ? tempsCourt(t.compte) : t.compte)}</td>
      <td class="ros-heure">${l.duree_s ? tempsCourt(formatHMS(l.duree_s)) : '-'}</td>
      ${cols.map(([c]) => `<td class="${c === 'action' ? 'ros-action' : 'petit'}">${c === 'lien' ? lienCliquable(l.lien) : texte(l[c])}</td>`).join('')}
    </tr>`;
  }).join('') : `<tr><td colspan="${nb}" class="doux">Aucune ligne pour l’instant.</td></tr>`;
}

const texte = (v) => v ? echapper(v).replace(/\n/g, '<br>') : '-';
const lienCliquable = (v) => !v ? '' : /^https?:\/\//i.test(v.trim())
  ? `<a href="${echapper(v.trim())}" target="_blank" rel="noopener">Ouvrir ↗</a>` : echapper(v);

// Mode modification (Régie) : chaque cellule est un champ, enregistré dès qu'on le quitte
function afficherEdition() {
  $('tableau').classList.remove('ros-lecture');
  const fo = faceOff();
  const num = numeros();
  const nb = 6 + CHAMPS.length;
  $('entete').innerHTML = `<tr><th></th><th>Heure</th><th>Compte à rebours / quand</th><th>Durée</th>${CHAMPS.map(([, t]) => `<th>${t}</th>`).join('')}<th title="Ligne importante (en rouge)">!</th><th></th></tr>`;
  const deplacer = (i) => `
      <td class="ros-deplacer">
        <span class="doux">${num[i] ?? ''}</span>
        <button type="button" class="btn btn-discret petit" data-monter ${i ? '' : 'disabled'} aria-label="Monter">↑</button>
        <button type="button" class="btn btn-discret petit" data-descendre ${i < etat.lignes.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button>
      </td>`;
  const fin = `<td class="ros-fin">
        <button type="button" class="btn btn-discret petit" data-inserer title="Insérer une ligne en dessous" aria-label="Insérer une ligne en dessous">＋</button>
        <button type="button" class="btn btn-discret btn-danger petit" data-supprimer-ligne aria-label="Supprimer">✕</button></td>`;
  $('lignes').innerHTML = etat.lignes.map((l, i) => {
    if (l.est_section) {
      return `<tr class="ros-section" data-id="${l.id}">${deplacer(i)}
        <td colspan="${nb - 3}"><input type="text" data-champ="action" value="${echapper(l.action || '')}" placeholder="Titre de la section (ex. 1er TIERS)" aria-label="Titre de la section"></td>
        ${fin}</tr>`;
    }
    const t = colonnesTemps(l, fo);
    const avecHeure = l.decalage_s !== null && l.decalage_s !== undefined;
    return `
    <tr class="ros-ligne${l.important ? ' ros-important' : ''}" data-id="${l.id}">
      ${deplacer(i)}
      <td><input type="text" data-champ="heure" value="${avecHeure ? echapper(t.heure) : ''}" placeholder="18:00" aria-label="Heure" class="ros-court"></td>
      <td>${avecHeure
        ? `<span class="ros-calcule" data-compte>${echapper(t.compte)}</span>`
        : `<input type="text" data-champ="quand" value="${echapper(l.quand || '')}" placeholder="à la suite, arrêt de jeu…" aria-label="Quand">`}</td>
      <td><input type="text" data-champ="duree" value="${l.duree_s ? formatHMS(l.duree_s) : ''}" placeholder="00:01:30" aria-label="Durée" class="ros-court"></td>
      ${CHAMPS.map(([c, titre, genre]) => `<td>${genre === 'textarea'
        ? `<textarea data-champ="${c}" rows="2" aria-label="${titre}">${echapper(l[c] || '')}</textarea>`
        : `<input type="text" data-champ="${c}" value="${echapper(l[c] || '')}" aria-label="${titre}">`}</td>`).join('')}
      <td><input type="checkbox" data-champ="important" ${l.important ? 'checked' : ''} title="Ligne importante (en rouge)" aria-label="Importante"></td>
      ${fin}
    </tr>`;
  }).join('') || `<tr><td colspan="${nb}" class="doux">Aucune ligne : « + Ajouter une ligne ».</td></tr>`;
}

// Horloge, temps avant le face-off, ligne en cours (le jour du match)
function tic() {
  const maintenant = new Date();
  $('horloge').textContent = heureCourte(maintenant);
  const fo = faceOff();
  const leJour = !etat.modele && fo && memeJour(fo, maintenant);
  const reste = fo ? (fo - maintenant) / 1000 : null;
  $('avant-fo').textContent = !leJour ? '' : reste > 0 ? `· face-off dans ${formatHMS(reste)}` : '· match commencé';
  if (etat.edition) return;
  // ligne en cours : la plus récente des deux — celle cliquée par la Régie (pendant le match) ou celle dont l'heure
  // est arrivée (avant le match). Corrigé le 03.10.2026 : une ligne cliquée plus tôt bloquait les heures suivantes.
  const choisie = etat.ros?.reperes?.en_cours;
  const iChoisie = choisie ? etat.lignes.findIndex(l => l.id === choisie) : -1;
  const iHeure = leJour ? ligneEnCours(etat.lignes, fo, maintenant) : -1;
  const cliqueLe = etat.ros?.reperes?.en_cours_le ? new Date(etat.ros.reperes.en_cours_le) : new Date(0);
  const heureArrivee = iHeure >= 0 ? heureLigne(etat.lignes[iHeure], fo) : null;
  const enCours = iChoisie >= 0 && !(heureArrivee && heureArrivee > cliqueLe) ? iChoisie : iHeure;
  document.querySelectorAll('#lignes tr[data-rang]').forEach(tr => tr.classList.toggle('en-cours', Number(tr.dataset.rang) === enCours));
  suivreLigne(enCours);
}
setInterval(tic, 1000);

// La page défile toute seule jusqu'à la ligne en cours (demandé par Léa le 03.10.2026), au milieu de l'écran.
// Quelqu'un fait défiler à la main : pause de 20 s, puis retour sur la ligne en cours. Case « Suivre » : par écran.
const defilement = { derniere: -1, pauseJusqua: 0, aRecentrer: true };
try { $('suivre').checked = localStorage.getItem('ros-suivre') !== 'non'; } catch { /* stockage indisponible */ }
$('suivre').addEventListener('change', () => {
  try { localStorage.setItem('ros-suivre', $('suivre').checked ? 'oui' : 'non'); } catch { /* stockage indisponible */ }
  defilement.aRecentrer = true;
  tic();
});
const pauseManuelle = () => { defilement.pauseJusqua = Date.now() + 20000; defilement.aRecentrer = true; };
['wheel', 'touchmove'].forEach(ev => window.addEventListener(ev, pauseManuelle, { passive: true }));
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key) && !e.target.closest('input, textarea, select')) pauseManuelle();
});

function suivreLigne(enCours) {
  if (!$('suivre').checked || enCours < 0 || Date.now() < defilement.pauseJusqua) return;
  if (enCours === defilement.derniere && !defilement.aRecentrer) return;
  const tr = document.querySelector(`#lignes tr[data-rang="${enCours}"]`);
  if (!tr) return;
  tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  defilement.derniere = enCours;
  defilement.aRecentrer = false;
}

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
  if (!tr || !t.dataset.champ || !etat.edition) return;
  const id = tr.dataset.id, c = t.dataset.champ;
  let champs;
  if (c === 'heure') {
    // l'heure tapée (18:00) est gardée par rapport au face-off : si le face-off change, elle suit
    if (!t.value.trim()) champs = { decalage_s: null };
    else {
      const s = lireHeure(t.value);
      if (s === null) return notifier('Heure illisible : écrivez par exemple 18:00 ou 19:23:07', 'erreur');
      champs = { decalage_s: s - secondesDuJour(faceOff()) };
    }
  } else if (c === 'duree') {
    const s = lireDuree(t.value);
    if (t.value.trim() && s === null) return notifier('Durée illisible : écrivez par exemple 00:01:30', 'erreur');
    champs = { duree_s: s || null };
  } else if (c === 'important') {
    champs = { important: t.checked };
  } else {
    champs = { [c]: t.value.trim() || null };
  }
  if (!(await majLigne(id, champs))) return;
  if (c === 'important') tr.classList.toggle('ros-important', t.checked);
  if (c === 'heure') afficherLignes();      // la colonne « compte à rebours » change de forme
});

// Renumérote toute la liste (10, 20, 30…) dans l'ordre donné
async function renumeroter(ordre) {
  const maj = ordre.map((l, k) => ({ l, rang: (k + 1) * 10 })).filter(x => x.l.rang !== x.rang);
  const resultats = await Promise.all(maj.map(x => sb.from('ros_lignes').update({ rang: x.rang }).eq('id', x.l.id)));
  const erreur = resultats.find(r => r.error);
  if (erreur) { notifier(`Enregistrement de l’ordre impossible : ${erreur.error.message}`, 'erreur'); return false; }
  maj.forEach(x => { x.l.rang = x.rang; });
  etat.lignes = ordre;
  return true;
}

async function nouvelleLigne(apres, champs) {
  // place la ligne juste après l'index `apres` (-1 = à la fin)
  const parent = etat.modele ? { modele_id: etat.modele.id } : { ros_id: etat.ros.id };
  const { data, error } = await sb.from('ros_lignes')
    .insert({ ...parent, rang: 0, decalage_s: null, ...champs }).select('*').single();
  if (error) { notifier(`Ajout impossible : ${error.message}`, 'erreur'); return; }
  const ordre = etat.lignes.slice();
  ordre.splice(apres < 0 ? ordre.length : apres + 1, 0, data);
  if (await renumeroter(ordre)) {
    afficherLignes();
    document.querySelector(`tr[data-id="${data.id}"] [data-champ="action"]`)?.focus();
  }
}

$('lignes').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id], tr[data-rang]');
  if (!tr) return;
  // lecture : la Régie clique sur une ligne pour la marquer « en cours » (vue par tout le monde, en direct)
  if (!etat.edition) {
    if (!estRegie || etat.modele || !etat.ros || !tr.dataset.id || e.target.closest('a')) return;
    const reperes = { ...(etat.ros.reperes || {}) };
    if (reperes.en_cours === tr.dataset.id) { delete reperes.en_cours; delete reperes.en_cours_le; }
    else { reperes.en_cours = tr.dataset.id; reperes.en_cours_le = new Date().toISOString(); }
    const { error } = await sb.from('ros_matchs').update({ reperes, maj_le: new Date().toISOString() }).eq('id', etat.ros.id);
    if (error) return notifier(`Enregistrement impossible : ${error.message}`, 'erreur');
    etat.ros.reperes = reperes;
    return tic();
  }
  const i = etat.lignes.findIndex(l => l.id === tr.dataset.id);
  if (i < 0) return;
  if (e.target.closest('[data-inserer]')) return nouvelleLigne(i, {});
  if (e.target.closest('[data-supprimer-ligne]')) {
    const l = etat.lignes[i];
    if (!confirm(`Supprimer ${l.est_section ? 'la section' : 'la ligne'}${l.action ? ` « ${l.action} »` : ''} ?`)) return;
    const { error } = await sb.from('ros_lignes').delete().eq('id', l.id);
    if (error) return notifier(`Suppression impossible : ${error.message}`, 'erreur');
    etat.lignes.splice(i, 1);
    return afficherLignes();
  }
  const sens = e.target.closest('[data-monter]') ? -1 : e.target.closest('[data-descendre]') ? 1 : 0;
  if (!sens || !etat.lignes[i + sens]) return;
  const ordre = etat.lignes.slice();
  [ordre[i], ordre[i + sens]] = [ordre[i + sens], ordre[i]];
  if (await renumeroter(ordre)) afficherLignes();
});

$('btn-ajouter').addEventListener('click', () => nouvelleLigne(-1, { quand: 'à la suite' }));
$('btn-ajouter-section').addEventListener('click', () => nouvelleLigne(-1, { est_section: true, action: 'NOUVELLE SECTION' }));

$('btn-edition').addEventListener('click', async () => {
  etat.edition = !etat.edition;
  if (!etat.edition) await chargerVue(); else afficher();
});

// Face-off modifié (match retardé…) : toutes les heures suivent ; vide = heure du calendrier
$('reperes').addEventListener('change', async (e) => {
  if (e.target.id !== 'face-off') return;
  let face_off = null;
  const s = lireHeure(e.target.value);
  if (s !== null) {
    const d = new Date(etat.match.date_heure);
    d.setHours(Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60, 0);
    face_off = d.getTime() === new Date(etat.match.date_heure).getTime() ? null : d.toISOString();
  }
  const { error } = await sb.from('ros_matchs').update({ face_off, maj_le: new Date().toISOString() }).eq('id', etat.ros.id);
  if (error) return notifier(`Enregistrement impossible : ${error.message}`, 'erreur');
  etat.ros.face_off = face_off;
  notifier(face_off ? `Face-off à ${e.target.value} : les heures ont suivi` : 'Face-off : heure du calendrier');
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
  const nom = prompt('Nom du modèle (ex. « NL Regular Season 26/27 ») :', '');
  if (!nom?.trim()) return;
  const { data: m, error } = await sb.from('ros_modeles').insert({ nom: nom.trim() }).select('id, nom').single();
  if (error) return notifier(`Création impossible : ${error.message}`, 'erreur');
  const erreur = await copierLignes({ ros_id: etat.ros.id }, { modele_id: m.id });
  if (erreur) return notifier(`Modèle créé, mais les lignes n’ont pas été copiées : ${erreur}`, 'erreur');
  etat.modeles.push(m);
  remplirChoix();
  notifier(`Modèle « ${m.nom} » enregistré`);
});

$('btn-renommer').addEventListener('click', async () => {
  const nom = prompt('Nouveau nom du modèle :', etat.modele.nom);
  if (!nom?.trim() || nom.trim() === etat.modele.nom) return;
  const { error } = await sb.from('ros_modeles').update({ nom: nom.trim() }).eq('id', etat.modele.id);
  if (error) return notifier(`Renommage impossible : ${error.message}`, 'erreur');
  etat.modele.nom = nom.trim();
  remplirChoix();
  afficher();
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
    const nom = prompt('Nom du nouveau modèle (ex. « CHL Regular Season ») :', '');
    if (!nom?.trim()) { remplirChoix(); return; }
    const { data, error } = await sb.from('ros_modeles').insert({ nom: nom.trim() }).select('id').single();
    if (error) { remplirChoix(); return notifier(`Création impossible : ${error.message}`, 'erreur'); }
    location.href = `run-of-show.html?modele=${data.id}&edition=1`;
    return;
  }
  location.href = `run-of-show.html?modele=${v}`;
});

// ---------------------------------------------------------------------
// En direct : chrono / animation voient les changements et la ligne en cours sans recharger
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
