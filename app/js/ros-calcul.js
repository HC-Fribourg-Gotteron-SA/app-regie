// Run of show : calcul pur des heures (testable dans Node).
// Comme le rundown de la Régie (Excel) : avant le match, chaque élément a une HEURE réelle (18:00, 19:05…) et le
// compte à rebours avant le face-off se calcule ; pendant le match, le « quand » est un texte libre
// (« arrêt de jeu », « 00:01:00 », « 0:18:00 », « à la suite »…).
// En base, l'heure est gardée comme un décalage par rapport au face-off (decalage_s, négatif = avant) :
// si le face-off change (match à 20:00, copie d'un modèle), toutes les heures suivent.

const pad = (n) => String(n).padStart(2, '0');

// « 18:00 », « 18:00:00 », « 18h00 » -> secondes depuis minuit (null si vide ou illisible)
export function lireHeure(texte) {
  const t = String(texte ?? '').trim().replace(/h/i, ':');
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

// « 22:30 », « 1:00:00 », « 90 » -> secondes (null si vide ou illisible) — pour les durées
export function lireDuree(texte) {
  const t = String(texte ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d+)(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (!m) return null;
  const parties = [m[1], m[2], m[3]].filter(x => x !== undefined).map(Number);
  if (parties.slice(1).some(x => x > 59)) return null;
  return parties.length === 1 ? parties[0]
    : parties.length === 2 ? parties[0] * 60 + parties[1]
    : parties[0] * 3600 + parties[1] * 60 + parties[2];
}

// secondes -> « 01:45:00 » (comme dans l'Excel)
export function formatHMS(s) {
  if (s === null || s === undefined || !isFinite(s)) return '';
  const a = Math.abs(Math.round(s));
  return `${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}:${pad(a % 60)}`;
}

// Format court pour la lecture (03.10.2026 : colonnes plus étroites, les commentaires d'abord) :
// « 00:45:00 » -> « 45:00 », « 01:45:00 » -> « 1:45:00 », « +00:05:00 » -> « +5:00 », « 18:00:00 » (heure) -> « 18:00 »
export function tempsCourt(hms) {
  const m = String(hms ?? '').match(/^(\+?)(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return hms ?? '';
  const [, signe, h, mi, s] = m;
  return Number(h) ? `${signe}${Number(h)}:${mi}:${s}` : `${signe}${Number(mi)}:${s}`;
}
export const heureCourteLigne = (h) => String(h ?? '').replace(/^(\d{2}:\d{2}):00$/, '$1');

// secondes depuis minuit d'une date
export const secondesDuJour = (d) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

// Heure réelle d'une ligne (Date) ou null si la ligne n'a pas d'heure (texte libre)
export function heureLigne(l, faceOff) {
  if (l.est_section || l.decalage_s === null || l.decalage_s === undefined || !faceOff) return null;
  return new Date(faceOff.getTime() + l.decalage_s * 1000);
}

// Ce qu'on affiche dans les colonnes « Heure » et « Compte à rebours »
export function colonnesTemps(l, faceOff) {
  const h = heureLigne(l, faceOff);
  if (h) {
    const avant = -l.decalage_s;
    return { heure: h.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
             compte: avant >= 0 ? formatHMS(avant) : `+${formatHMS(-avant)}` };
  }
  const q = (l.quand || '').trim();
  return { heure: /^à la suite$/i.test(q) ? 'à la suite' : '-', compte: q };
}

// Pendant le match, les lignes n'ont pas d'heure (temps de jeu, « arrêt de jeu »…). Estimation (essai demandé par
// Léa le 03.10.2026, idée B) : après le face-off, chaque section sans heure dure un temps réel estimé — tiers 35 min
// (20 min de jeu + arrêts), pause 20 min, prolongation / tirs au but 10 min — et ses lignes se répartissent
// régulièrement dans ce temps. Ça se décale si un tiers dure plus ou moins : la Régie peut toujours cliquer la ligne.
export const DUREES_SECTION_MIN = { pause: 20, prolongation: 10, tiers: 35 };
export function dureeSection(nom) {
  const n = String(nom || '').toLowerCase();
  if (/pause|intermission|drittelpause/.test(n)) return DUREES_SECTION_MIN.pause * 60;
  if (/prolong|overtime|\bot\b|tirs au but|shoot|penalty/.test(n)) return DUREES_SECTION_MIN.prolongation * 60;
  return DUREES_SECTION_MIN.tiers * 60;
}

// Sections du match (après la ligne du face-off) sans heures à elles : celles qu'on estime et qu'on « lance ».
// Renvoie [{ k: index de la section, dedans: [index des lignes] }].
export function sectionsDuMatch(lignes) {
  const debutMatch = lignes.findIndex(l => !l.est_section && l.decalage_s !== null && l.decalage_s !== undefined && l.decalage_s >= 0);
  if (debutMatch < 0) return [];
  const res = [];
  for (let k = debutMatch + 1; k < lignes.length; k++) {
    if (!lignes[k].est_section) continue;
    let fin = k + 1;
    while (fin < lignes.length && !lignes[fin].est_section) fin++;
    const dedans = [];
    for (let j = k + 1; j < fin; j++) dedans.push(j);
    const avecHeures = dedans.some(j => lignes[j].decalage_s !== null && lignes[j].decalage_s !== undefined);
    if (!avecHeures) res.push({ k, dedans });
    k = fin - 1;
  }
  return res;
}

// Heure de chaque ligne : réelle si elle en a une, sinon estimée (voir plus haut) ; null si rien.
// lancements = { <id de la section>: { debut: ISO } } : la Régie a « lancé » le tiers / la pause à cette heure
// (03.10.2026) ; la section démarre alors à l'heure du clic, et les suivantes s'estiment à partir de là.
// Renvoie [{ heure: Date | null, estimee: bool, lancee: bool }] dans l'ordre des lignes.
// Tiers (et prolongation) : PAS d'estimation dans le tiers (03.10.2026, Léa : trop dur avec les arrêts de jeu) ;
// lancé = sa 1re ligne s'allume, la Régie clique les suivantes ; on ne sait pas quand il finit.
// Pause : lancée = ses lignes avancent toutes seules sur 20 min, et on sait quand commence la section suivante.
export const estPause = (nom) => /pause|intermission|drittelpause/i.test(String(nom || ''));

export function heuresLignes(lignes, faceOff, lancements = {}) {
  const res = lignes.map(l => ({ heure: heureLigne(l, faceOff), estimee: false, lancee: false }));
  if (!faceOff) return res;
  let curseur = faceOff.getTime();           // début prévu de la section suivante (null = on ne sait pas)
  for (const { k, dedans } of sectionsDuMatch(lignes)) {
    const lance = lancements?.[lignes[k].id]?.debut;
    const debut = lance ? new Date(lance).getTime() : curseur;
    res[k] = { heure: debut === null ? null : new Date(debut), estimee: !lance && debut !== null, lancee: !!lance };
    if (!estPause(lignes[k].action)) {
      if (lance && dedans.length) res[dedans[0]] = { heure: new Date(debut), estimee: false, lancee: true };
      curseur = null;
      continue;
    }
    const duree = dureeSection(lignes[k].action) * 1000;
    if (lance) dedans.forEach((j, n) => { res[j] = { heure: new Date(debut + duree * n / dedans.length), estimee: true, lancee: true }; });
    curseur = debut === null ? null : debut + duree;
  }
  return res;
}

// Prochaine section à lancer : celle qui suit la dernière lancée (la première du match sinon). -1 si plus rien.
export function prochaineSection(lignes, lancements = {}) {
  const sections = sectionsDuMatch(lignes);
  let derniere = -1;
  sections.forEach((s, n) => { if (lancements?.[lignes[s.k].id]?.debut) derniere = n; });
  return sections[derniere + 1]?.k ?? -1;
}

// Ligne en cours à l'instant `maintenant` : celle qui a commencé le plus récemment (heure réelle ou estimée).
// Les sections ne sont jamais « en cours » (leur première ligne l'est). -1 si aucune.
export function ligneEnCours(lignes, faceOff, maintenant, lancements = {}) {
  const heures = heuresLignes(lignes, faceOff, lancements);
  let i = -1, plusRecent = null;
  lignes.forEach((l, k) => {
    const h = heures[k].heure;
    if (!l.est_section && h && h <= maintenant && (!plusRecent || h >= plusRecent)) { plusRecent = h; i = k; }
  });
  return i;
}
