import { sb, exigerConnexion, LIBELLES, echapper, dateCourte, notifier } from './app.js';

const { profil } = await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });
const estAdmin = ['regie', 'admin'].includes(profil.role);   // Régie = mêmes droits que l'admin (migration 25)

const $ = (id) => document.getElementById(id);
const HEURE_DEFAUT = '19:45';
const etat = {
  saison: null,       // { id, libelle, debut, fin }
  matchs: [],
  apercu: [],         // lignes analysées avant import
  edite: null,        // match en cours de modification (null = ajout)
};

$('actions-admin').hidden = !estAdmin;
if (!estAdmin) $('tableau-matchs').classList.add('non-cliquable');
$('f-type').innerHTML = Object.entries(LIBELLES.type_match)
  .map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

// ---------------------------------------------------------------------
// Dates : tout est affiché et saisi à l'heure de Suisse (celle du navigateur)
// ---------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const heureLocale = (d) => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };
const versIso = (jour, heure) => new Date(`${jour}T${heure}`).toISOString();
const jourSemaine = (d) => new Date(d).toLocaleDateString('fr-CH', { weekday: 'short' });

// ---------------------------------------------------------------------
// Chargement et liste
// ---------------------------------------------------------------------
async function charger() {
  const { data: saison, error } = await sb.from('saisons').select('id, libelle, debut, fin').eq('active', true).maybeSingle();
  if (error || !saison) { notifier(error?.message || 'Aucune saison active.', 'erreur'); return; }
  etat.saison = saison;
  $('titre-saison').textContent = saison.libelle;

  const { data, error: e2 } = await sb.from('matchs')
    .select('id, numero, date_heure, adversaire, type').eq('saison_id', saison.id).order('date_heure');
  if (e2) { notifier(`Chargement impossible : ${e2.message}`, 'erreur'); return; }
  etat.matchs = data;
  afficher();
}

function afficher() {
  const maintenant = new Date();
  $('vide').hidden = etat.matchs.length > 0;
  $('lignes').innerHTML = etat.matchs.map(m => `
    <tr data-id="${m.id}" class="${new Date(m.date_heure) < maintenant ? 'passe' : ''}">
      <td>${m.numero}</td>
      <td>${jourSemaine(m.date_heure)} ${dateCourte(m.date_heure)}</td>
      <td>${heureLocale(m.date_heure)}</td>
      <td><strong>${echapper(m.adversaire)}</strong></td>
      <td>${m.type === 'saison' ? '<span class="doux">Saison</span>' : `<span class="badge">${LIBELLES.type_match[m.type]}</span>`}</td>
    </tr>`).join('');
}

$('lignes').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && estAdmin) ouvrir(etat.matchs.find(m => m.id === tr.dataset.id));
});

// ---------------------------------------------------------------------
// Import d'une liste collée
// ---------------------------------------------------------------------
const RE_DATE = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[./](\d{1,2})[./](\d{2,4})/;
const RE_HEURE = /(?:^|[^\d])(\d{1,2})\s?[:h.]\s?(\d{2})(?!\d)/i;
const RE_JOUR = /(?:^|\s)(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim|lu|ma|me|je|ve|sa|di|mo|mi|do|fr|so)\.?,?(?=\s|$)/gi;
const RE_PLAYOFFS = /\b(play-?offs?|pr[ée]-?playoffs?|play-?in|quarts?|demi|finale?|viertelfinal|halbfinal)\b/gi;
const RE_AMICAL = /\b(amical|test|exhibition( games?)?|pr[ée]pa(ration)?|freundschaftsspiel)\b/gi;
// mots du site de la ligue (sihf.ch) à ignorer
const RE_BRUIT = /\b(national league|nl|regular season|qualification|fin|comme prévu|en cours|après (ot\d*|so|prol\.?)|reporté)\b/gi;
const RE_NOUS = /(hc\s+)?fribourg[\s-]*gott[ée]ron|hcfg/i;
const nettoyer = (t) => t.replace(/(^|\s)(\d{1,2}|\\?[-–—:|,])(?=\s|$)/g, ' ')   // scores, tirets isolés
  .replace(/\(\s*\)|\[\s*\]|[[\]]/g, ' ').replace(/\s+/g, ' ').trim();

// Regroupe les lignes collées par match : une nouvelle date = un nouveau match.
// Marche pour « une ligne par match » (Excel) comme pour la page de la ligue (plusieurs lignes par match).
function decouper(texte) {
  const groupes = [];
  for (const l of texte.split(/\r?\n/)) {
    if (RE_DATE.test(l)) groupes.push(l);
    else if (groupes.length && l.trim()) groupes[groupes.length - 1] += `\n${l}`;
  }
  return groupes;
}

// Fichier iCalendar (.ics) : chaque VEVENT devient une ligne « JJ.MM.AAAA HH:MM Équipe A - Équipe B »,
// analysée ensuite comme une ligne collée.
function icsVersLignes(texte) {
  const deplie = texte.replace(/\r?\n[ \t]/g, '');            // lignes repliées (RFC 5545)
  const valeur = (bloc, cle) => {
    const m = bloc.match(new RegExp(`^${cle}(;[^:\\n]*)?:(.*)$`, 'mi'));
    return m ? { params: m[1] || '', texte: m[2].trim().replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1') } : null;
  };
  return (deplie.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []).map(bloc => {
    const debut = valeur(bloc, 'DTSTART');
    const resume = valeur(bloc, 'SUMMARY')?.texte || '';
    if (!debut) return `${resume} (date manquante)`;
    const m = debut.texte.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z)?)?/);
    if (!m) return `${resume} (date illisible)`;
    let quand = `${m[3]}.${m[2]}.${m[1]}`;
    if (m[4]) {
      // heure UTC (…Z) convertie à l'heure locale ; sinon l'heure est déjà celle de Suisse
      const d = m[6] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null;
      quand = d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
                : `${quand} ${m[4]}:${m[5]}`;
    }
    // le type (amical, playoffs) peut n'être que dans la description ou les catégories
    const infos = `${valeur(bloc, 'DESCRIPTION')?.texte || ''} ${valeur(bloc, 'CATEGORIES')?.texte || ''}`;
    const type = infos.match(RE_PLAYOFFS) ? ' playoffs' : infos.match(RE_AMICAL) ? ' amical' : '';
    return `${quand} ${resume}${type}`;
  });
}

function analyserLigne(brute) {
  let texte = brute.replace(/\t|;|\|/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/\d/.test(texte)) return null;          // ligne vide ou en-tête de colonnes
  const ligne = { brute: brute.replace(/\s+/g, ' ').trim(), remarques: [], erreur: null, inclure: true };

  const d = texte.match(RE_DATE);
  if (!d) return { ...ligne, erreur: 'Date introuvable', inclure: false };
  let [a, mo, j] = d[1] ? [+d[1], +d[2], +d[3]] : [+d[6], +d[5], +d[4]];
  if (a < 100) a += 2000;
  const date = new Date(a, mo - 1, j);
  if (date.getMonth() !== mo - 1 || date.getDate() !== j) return { ...ligne, erreur: 'Date invalide', inclure: false };
  ligne.jour = `${a}-${pad(mo)}-${pad(j)}`;
  texte = texte.replace(d[0], ' ');

  const h = texte.match(RE_HEURE);
  if (h && +h[1] < 24 && +h[2] < 60) {
    ligne.heure = `${pad(+h[1])}:${h[2]}`;
    texte = texte.replace(h[0], ' ');
  } else {
    ligne.heure = HEURE_DEFAUT;
    ligne.remarques.push(`heure manquante : ${HEURE_DEFAUT} par défaut`);
  }

  ligne.type = texte.match(RE_PLAYOFFS) ? 'playoffs' : texte.match(RE_AMICAL) ? 'amical' : 'saison';
  texte = texte.replace(RE_PLAYOFFS, ' ').replace(RE_AMICAL, ' ').replace(RE_BRUIT, ' ').replace(RE_JOUR, ' ')
               .replace(/\bvs\b\.?/gi, ' ');

  // L'équipe qui reçoit est écrite en premier : « Fribourg-Gottéron – SC Bern » = à domicile,
  // « SC Bern – Fribourg-Gottéron » = à l'extérieur (écarté).
  const nous = texte.match(RE_NOUS);
  if (nous) {
    const avant = nettoyer(texte.slice(0, nous.index));
    const apres = nettoyer(texte.slice(nous.index + nous[0].length));
    if (avant && !apres) {
      texte = avant;
      ligne.inclure = false;
      ligne.remarques.push('match à l’extérieur : écarté');
    } else {
      texte = apres || avant;
      if (avant && apres) ligne.remarques.push('à vérifier');
    }
  }
  ligne.adversaire = nettoyer(texte);
  if (!ligne.adversaire) return { ...ligne, erreur: 'Adversaire introuvable', inclure: false };

  if (ligne.inclure && ligne.jour < jourLocal(new Date())) {
    ligne.inclure = false;
    ligne.remarques.push('déjà joué');
  }

  const s = etat.saison;
  if (ligne.jour < s.debut || ligne.jour > s.fin) ligne.remarques.push(`hors saison ${s.libelle}`);

  const existant = etat.matchs.find(m => jourLocal(m.date_heure) === ligne.jour);
  if (existant) {
    const identique = heureLocale(existant.date_heure) === ligne.heure
      && existant.adversaire === ligne.adversaire && existant.type === ligne.type;
    ligne.remarques.push(identique ? 'déjà au calendrier (identique)' : 'déjà au calendrier ce jour-là : sera mis à jour');
    if (identique) ligne.inclure = false;
  }
  return ligne;
}

$('btn-importer').addEventListener('click', () => {
  $('bloc-import').hidden = false;
  $('texte-import').focus();
});
$('btn-annuler-import').addEventListener('click', () => {
  $('bloc-import').hidden = true;
  $('apercu').hidden = true;
  $('texte-import').value = '';
});

$('btn-analyser').addEventListener('click', () => analyser(decouper($('texte-import').value)));

// Fichier : .ics, ou texte / CSV traité comme une liste collée
const zoneIcs = $('zone-ics');
zoneIcs.addEventListener('click', () => $('fichier-ics').click());
zoneIcs.addEventListener('dragover', (e) => { e.preventDefault(); zoneIcs.classList.add('survol'); });
zoneIcs.addEventListener('dragleave', () => zoneIcs.classList.remove('survol'));
zoneIcs.addEventListener('drop', (e) => {
  e.preventDefault(); zoneIcs.classList.remove('survol');
  if (e.dataTransfer.files[0]) lireFichier(e.dataTransfer.files[0]);
});
$('fichier-ics').addEventListener('change', (e) => {
  if (e.target.files[0]) lireFichier(e.target.files[0]);
  e.target.value = '';
});

async function lireFichier(fichier) {
  const texte = await fichier.text();
  if (/BEGIN:VCALENDAR/i.test(texte)) {
    const lignes = icsVersLignes(texte);
    if (!lignes.length) { notifier(`Aucun match trouvé dans « ${fichier.name} ».`, 'erreur'); return; }
    analyser(lignes);
  } else {
    analyser(decouper(texte));
  }
  $('apercu-titre').textContent += ` — depuis « ${fichier.name} »`;
}

function analyser(groupes) {
  const lignes = groupes.map(analyserLigne).filter(Boolean);
  // un seul match par jour dans la liste collée
  const vus = new Set();
  for (const l of lignes) {
    if (l.erreur || !l.inclure) continue;
    if (vus.has(l.jour)) { l.erreur = 'Doublon dans la liste (même jour)'; l.inclure = false; }
    vus.add(l.jour);
  }
  etat.apercu = lignes;
  afficherApercu();
}

function afficherApercu() {
  const lignes = etat.apercu;
  $('apercu').hidden = false;
  if (!lignes.length) {
    $('apercu-titre').textContent = 'Aucune ligne à analyser.';
    $('apercu-lignes').innerHTML = '';
    $('btn-confirmer-import').disabled = true;
    return;
  }
  $('apercu-lignes').innerHTML = lignes.map((l, i) => l.erreur
    ? `<tr class="ligne-erreur"><td><input type="checkbox" disabled></td>
         <td colspan="4" class="petit">${echapper(l.brute)}</td>
         <td class="petit"><strong>${echapper(l.erreur)}</strong></td></tr>`
    : `<tr><td><input type="checkbox" data-i="${i}" ${l.inclure ? 'checked' : ''} aria-label="Importer"></td>
         <td>${jourSemaine(l.jour + 'T12:00')} ${dateCourte(l.jour + 'T12:00')}</td>
         <td>${l.heure}</td>
         <td>${echapper(l.adversaire)}</td>
         <td>${LIBELLES.type_match[l.type]}</td>
         <td class="petit doux">${echapper(l.remarques.join(' ; '))}</td></tr>`).join('');
  majCompteImport();
}

function majCompteImport() {
  const n = etat.apercu.filter(l => l.inclure && !l.erreur).length;
  const erreurs = etat.apercu.filter(l => l.erreur).length;
  $('apercu-titre').textContent = `${n} match${n > 1 ? 's' : ''} à importer` +
    (erreurs ? ` · ${erreurs} ligne${erreurs > 1 ? 's' : ''} non reconnue${erreurs > 1 ? 's' : ''}` : '');
  $('btn-confirmer-import').disabled = n === 0;
  $('btn-confirmer-import').textContent = n ? `Importer ${n} match${n > 1 ? 's' : ''}` : 'Importer';
}

$('apercu-lignes').addEventListener('change', (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { etat.apercu[i].inclure = e.target.checked; majCompteImport(); }
});

$('btn-confirmer-import').addEventListener('click', async () => {
  const choisis = etat.apercu.filter(l => l.inclure && !l.erreur);
  if (!choisis.length) return;
  const bouton = $('btn-confirmer-import');
  bouton.disabled = true;
  bouton.textContent = 'Import…';
  const { data, error } = await sb.rpc('importer_matchs', {
    p_saison: etat.saison.id,
    p_matchs: choisis.map(l => ({ date_heure: versIso(l.jour, l.heure), adversaire: l.adversaire, type: l.type })),
  });
  bouton.disabled = false;
  if (error) { notifier(`Import impossible : ${error.message}`, 'erreur'); majCompteImport(); return; }
  notifier(`${data.ajoutes} match(s) ajouté(s), ${data.mis_a_jour} mis à jour.`);
  $('btn-annuler-import').click();
  await charger();
});

// ---------------------------------------------------------------------
// Ajout / modification d'un match
// ---------------------------------------------------------------------
function ouvrir(match = null) {
  etat.edite = match;
  $('f-titre').textContent = match ? `Match ${match.numero}` : 'Ajouter un match';
  $('f-date').value = match ? jourLocal(match.date_heure) : '';
  $('f-heure').value = match ? heureLocale(match.date_heure) : HEURE_DEFAUT;
  $('f-adversaire').value = match?.adversaire || '';
  $('f-type').value = match?.type || 'saison';
  $('btn-supprimer').hidden = !match;
  erreurForm('');
  $('fenetre').hidden = $('voile').hidden = false;
  document.body.classList.add('fenetre-ouverte');
  (match ? $('f-adversaire') : $('f-date')).focus();
}

function fermer() {
  $('fenetre').hidden = $('voile').hidden = true;
  document.body.classList.remove('fenetre-ouverte');
  etat.edite = null;
}
$('btn-ajouter').addEventListener('click', () => ouvrir());
$('btn-fermer').addEventListener('click', fermer);
$('voile').addEventListener('click', fermer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fenetre').hidden) fermer(); });

function erreurForm(texte) {
  $('f-erreur').textContent = texte;
  $('f-erreur').hidden = !texte;
}

$('form-match').addEventListener('submit', async (e) => {
  e.preventDefault();
  const jour = $('f-date').value, heure = $('f-heure').value, adversaire = $('f-adversaire').value.trim();
  const type = $('f-type').value;
  if (!jour) return erreurForm('Indiquez la date.');
  if (!heure) return erreurForm("Indiquez l'heure.");
  if (!adversaire) return erreurForm("Indiquez l'adversaire.");
  const autre = etat.matchs.find(m => jourLocal(m.date_heure) === jour && m.id !== etat.edite?.id);
  if (autre) return erreurForm(`Il y a déjà un match ce jour-là (match ${autre.numero} contre ${autre.adversaire}).`);

  $('btn-enregistrer').disabled = true;
  let error;
  if (etat.edite) {
    ({ error } = await sb.from('matchs')
      .update({ date_heure: versIso(jour, heure), adversaire, type }).eq('id', etat.edite.id));
    if (!error) ({ error } = await sb.rpc('renumeroter_matchs', { p_saison: etat.saison.id }));
  } else {
    ({ error } = await sb.rpc('importer_matchs', {
      p_saison: etat.saison.id, p_matchs: [{ date_heure: versIso(jour, heure), adversaire, type }] }));
  }
  $('btn-enregistrer').disabled = false;
  if (error) return erreurForm(`Enregistrement impossible : ${error.message}`);
  notifier(etat.edite ? 'Match modifié' : 'Match ajouté');
  fermer();
  await charger();
});

$('btn-supprimer').addEventListener('click', async () => {
  const m = etat.edite;
  if (!m) return;
  if (!confirm(`Supprimer le match du ${dateCourte(m.date_heure)} contre ${m.adversaire} ?\n\n` +
               'Tout ce qui était prévu pour ce match (diffusions, pointage) sera supprimé aussi.')) return;
  let { error } = await sb.from('matchs').delete().eq('id', m.id);
  if (!error) ({ error } = await sb.rpc('renumeroter_matchs', { p_saison: etat.saison.id }));
  if (error) return erreurForm(`Suppression impossible : ${error.message}`);
  notifier('Match supprimé');
  fermer();
  await charger();
});

await charger();
