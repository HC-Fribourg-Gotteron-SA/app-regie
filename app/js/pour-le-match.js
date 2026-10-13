// « Pour le match » (rôle animation, demandé par Léa le 13.10.2026, migration 51) : Stéphane envoie des fichiers
// (visuels d'anniversaire, vidéos…) et un message pour un match → tâche dans « Pour ce soir » de Match du jour,
// avec les fichiers à télécharger ; la Régie la coche quand c'est fait. Il ne voit que ses envois.
import { sb, exigerConnexion, echapper, dateCourte, notifier, nomFichierSur, taille } from './app.js';

const { profil } = await exigerConnexion({ roles: ['animation', 'regie', 'admin'] });
const $ = (id) => document.getElementById(id);
const LIMITE = 50 * 1024 * 1024;
const heure = (d) => new Date(d).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

let matchs = [];
let fichiers = [];          // [{ fichier: File, nom }]

async function chargerMatchs() {
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  const { data, error } = await sb.from('matchs').select('id, date_heure, adversaire, type')
    .gte('date_heure', debut.toISOString()).order('date_heure');
  if (error) return notifier(error.message, 'erreur');
  matchs = data || [];
  $('choix-match').innerHTML = matchs.map(m => `<option value="${m.id}">${dateCourte(m.date_heure)} · ${heure(m.date_heure)} · ${
    echapper(m.adversaire)}${m.type === 'champions_league' ? ' (CHL)' : ''}</option>`).join('')
    || '<option value="">Aucun match à venir</option>';
  chargerEnvois();
}

async function chargerEnvois() {
  const matchId = $('choix-match').value;
  if (!matchId) return;
  const { data, error } = await sb.from('notes_match').select('*').eq('match_id', matchId).eq('cree_par', profil.id)
    .order('cree_le');
  if (error) {
    return notifier(/policy|permission|row-level/i.test(error.message) ? 'Exécutez d’abord la migration 51 dans Supabase.' : error.message, 'erreur');
  }
  $('nb-envois').textContent = data.length ? `(${data.length})` : '';
  $('envois-vide').hidden = data.length > 0;
  $('envois').innerHTML = data.map(n => `
    <li class="note note-tache${n.fait ? ' est-fait' : ''}">
      <span class="note-icone" aria-hidden="true">${n.fait ? '✓' : '⏳'}</span>
      <span class="note-texte">${echapper(n.texte)}
        <span class="doux petit">· ${n.fait ? `fait par la Régie à ${heure(n.fait_le)}` : `envoyé le ${dateCourte(n.cree_le)} à ${heure(n.cree_le)}, pas encore fait`}</span>
        ${(n.fichiers || []).length ? `<span class="note-fichiers">${n.fichiers.map(f =>
          `<span class="badge">📎 ${echapper(f.nom)}</span>`).join(' ')}</span>` : ''}</span>
      ${n.fait ? '' : `<button type="button" class="btn btn-discret petit" data-suppr="${n.id}" aria-label="Supprimer">✕</button>`}
    </li>`).join('');
}

// ---- fichiers : choisis ou glissés (dossiers compris) ----
function afficherChoisis() {
  $('choisis').hidden = !fichiers.length;
  $('choisis').innerHTML = fichiers.map((x, i) => `
    <li class="fichier-depose"><span class="fichier-nom" title="${echapper(x.nom)}">${echapper(x.nom)}</span>
      <span class="fichier-etat doux petit">${taille(x.fichier.size)}${x.fichier.size > LIMITE ? ' · <strong>trop lourd (max 50 Mo)</strong>' : ''}</span>
      <button type="button" class="btn btn-discret" data-retirer="${i}">Retirer</button></li>`).join('');
}
function ajouter(liste) {
  for (const x of liste) if (!fichiers.some(y => y.nom === x.nom && y.fichier.size === x.fichier.size)) fichiers.push(x);
  afficherChoisis();
}
async function fichiersDuDepot(dt) {
  const entrees = [...(dt.items || [])].map(it => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entrees.length) return [...dt.files].map(f => ({ fichier: f, nom: f.name }));
  const res = [];
  const parcourir = async (entree, chemin) => {
    if (entree.isFile) {
      const f = await new Promise((ok, ko) => entree.file(ok, ko));
      res.push({ fichier: f, nom: chemin + f.name });
    } else if (entree.isDirectory) {
      const lecteur = entree.createReader();
      let lot;
      do {
        lot = await new Promise((ok, ko) => lecteur.readEntries(ok, ko));
        for (const e of lot) await parcourir(e, `${chemin}${entree.name}/`);
      } while (lot.length);
    }
  };
  for (const e of entrees) await parcourir(e, '');
  return res;
}
const depot = $('depot');
depot.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') $('fichiers').click(); });
$('fichiers').addEventListener('change', (e) => { ajouter([...e.target.files].map(f => ({ fichier: f, nom: f.name }))); e.target.value = ''; });
depot.addEventListener('dragover', (e) => { e.preventDefault(); depot.classList.add('survol'); });
depot.addEventListener('dragleave', () => depot.classList.remove('survol'));
depot.addEventListener('drop', async (e) => { e.preventDefault(); depot.classList.remove('survol'); ajouter(await fichiersDuDepot(e.dataTransfer)); });
$('choisis').addEventListener('click', (e) => {
  const b = e.target.closest('[data-retirer]');
  if (b) { fichiers.splice(Number(b.dataset.retirer), 1); afficherChoisis(); }
});

// ---- envoi : une tâche dans « Pour ce soir », fichiers dans notes/<match>/<note>/… ----
$('form-envoi').addEventListener('submit', async (e) => {
  e.preventDefault();
  const matchId = $('choix-match').value;
  if (!matchId) return;
  if (fichiers.some(x => x.fichier.size > LIMITE)) return notifier('Un fichier dépasse 50 Mo : retirez-le ou réduisez-le.', 'erreur');
  let texte = $('texte').value.trim();
  if (!texte && !fichiers.length) return notifier('Ajoutez un fichier ou un message.', 'erreur');
  if (!texte) texte = fichiers.length === 1 ? fichiers[0].nom : `${fichiers.length} fichiers (${fichiers[0].nom.split('/')[0]}…)`;
  const bouton = $('btn-envoyer');
  bouton.disabled = true;
  const { data, error } = await sb.from('notes_match').insert({ match_id: matchId, type: 'tache', texte: `Animation : ${texte}` })
    .select('*').single();
  if (error) {
    bouton.disabled = false;
    return notifier(/policy|permission|row-level/i.test(error.message) ? 'Exécutez d’abord la migration 51 dans Supabase.'
      : `Envoi impossible : ${error.message}`, 'erreur');
  }
  const recus = [], echecs = [];
  for (const [k, x] of fichiers.entries()) {
    bouton.textContent = `Envoi ${k + 1}/${fichiers.length}…`;
    const chemin = `notes/${matchId}/${data.id}/${Date.now().toString(36)}${k}__${nomFichierSur(x.nom)}`;
    const { error: e2 } = await sb.storage.from('assets').upload(chemin, x.fichier, { upsert: false, contentType: x.fichier.type || undefined });
    if (e2) echecs.push(x.nom); else recus.push({ chemin, nom: x.nom, taille: x.fichier.size });
  }
  if (recus.length) {
    const { error: e3 } = await sb.from('notes_match').update({ fichiers: recus }).eq('id', data.id);
    if (e3) notifier(`Fichiers envoyés mais pas rattachés : ${e3.message}`, 'erreur');
  }
  bouton.disabled = false;
  bouton.textContent = 'Envoyer à la Régie';
  if (echecs.length) notifier(`${echecs.length} fichier(s) non envoyé(s) : ${echecs.join(', ')}`, 'erreur');
  else notifier('Envoyé à la Régie');
  fichiers = [];
  $('texte').value = '';
  afficherChoisis();
  chargerEnvois();
});

// supprimer un envoi pas encore fait (erreur)
$('envois').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-suppr]');
  if (!b || !confirm('Supprimer cet envoi et ses fichiers ?')) return;
  const { data: n } = await sb.from('notes_match').select('fichiers').eq('id', b.dataset.suppr).maybeSingle();
  const { error } = await sb.from('notes_match').delete().eq('id', b.dataset.suppr);
  if (error) return notifier(`Suppression impossible : ${error.message}`, 'erreur');
  const chemins = (n?.fichiers || []).map(f => f.chemin);
  if (chemins.length) await sb.storage.from('assets').remove(chemins);
  notifier('Envoi supprimé');
  chargerEnvois();
});

$('choix-match').addEventListener('change', chargerEnvois);
chargerMatchs();
