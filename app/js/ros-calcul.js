// Run of show : calcul pur des heures (testable dans Node).
// Chaque ligne est placée par rapport à un repère : le face-off (heure du match), le début d'une pause,
// la fin du match, ou « à la suite » de la ligne précédente (comme « following » dans le rundown CHL).

export const REPERES = {
  face_off: 'Face-off', pause1: 'Pause 1', pause2: 'Pause 2', fin_match: 'Fin du match', suite: 'À la suite',
};

// Types de ligne = couleur (proches du rundown CHL)
export const TYPES = {
  compte:  'Compte à rebours',
  video:   'Vidéo',
  speaker: 'Speaker / animation',
  intro:   'Intro / show',
  sponsor: 'Sponsor',
  lumiere: 'Lumières',
  jeu:     'Jeu / pause',
  autre:   'Autre',
};

// « 22:30 », « 1:00:00 », « 90 » (secondes), « -5:00 », « +2:00 » -> secondes (null si vide ou illisible)
export function lireDuree(texte) {
  const t = String(texte ?? '').trim().replace(/[−–]/g, '-');
  if (!t) return null;
  const m = t.match(/^([+-]?)(\d+)(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (!m) return null;
  const signe = m[1] === '-' ? -1 : 1;
  const parties = [m[2], m[3], m[4]].filter(x => x !== undefined).map(Number);
  if (parties.slice(1).some(x => x > 59)) return null;
  const s = parties.length === 1 ? parties[0]
    : parties.length === 2 ? parties[0] * 60 + parties[1]
    : parties[0] * 3600 + parties[1] * 60 + parties[2];
  return signe * s;
}

// secondes -> « 22:30 » / « 1:00:00 » (sans signe)
export function formatDuree(s) {
  if (s === null || s === undefined || !isFinite(s)) return '';
  const a = Math.abs(Math.round(s));
  const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), sec = a % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Libellé du repère d'une ligne : « FO −22:30 », « Face-off », « Pause 1 +2:00 », « À la suite »
export function libelleQuand(l) {
  if (l.repere === 'suite') return 'À la suite';
  const d = l.decalage_s || 0;
  if (l.repere === 'face_off') return d ? `FO ${d < 0 ? '−' : '+'}${formatDuree(d)}` : 'Face-off';
  return `${REPERES[l.repere] || l.repere}${d ? ` ${d < 0 ? '−' : '+'}${formatDuree(d)}` : ''}`;
}

/**
 * Heure de début de chaque ligne (dans l'ordre donné).
 * reperes : { face_off: Date|null, pause1: Date|null, pause2: Date|null, fin_match: Date|null }
 * -> [{ debut: Date|null, fin: Date|null }]  (null = pas encore connu, ex. pause pas commencée)
 */
export function calculerHeures(lignes, reperes) {
  const res = [];
  let precedent = null;
  for (const l of lignes) {
    let debut = null;
    if (l.repere === 'suite') {
      debut = precedent?.fin || null;
    } else {
      const base = reperes[l.repere];
      debut = base ? new Date(base.getTime() + (l.decalage_s || 0) * 1000) : null;
    }
    const fin = debut && l.duree_s ? new Date(debut.getTime() + l.duree_s * 1000) : null;
    precedent = { debut, fin };
    res.push(precedent);
  }
  return res;
}

// Ligne en cours à l'instant `maintenant` : celle qui a commencé le plus récemment
// (les lignes ne sont pas forcément dans l'ordre des heures, comme dans le rundown CHL)
export function ligneEnCours(heures, maintenant) {
  let i = -1, plusRecent = null;
  heures.forEach((h, k) => {
    if (h.debut && h.debut <= maintenant && (!plusRecent || h.debut >= plusRecent)) { plusRecent = h.debut; i = k; }
  });
  return i;
}
