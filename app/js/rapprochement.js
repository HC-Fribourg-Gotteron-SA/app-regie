// Rapprochement de noms (calcul pur, testable dans Node) : dossier -> sponsor, fichier -> visuel.
// Même nettoyage que l'import Airtable : minuscules, sans accents, sans « (…) », sans SA / Sàrl / AG / GmbH.

export const cle = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)/g, ' ').replace(/\b(sa|sarl|ag|gmbh|s a)\b/g, ' ').replace(/[^a-z0-9]/g, '');

// Nom de fichier -> clé de visuel (sans l'extension)
export const cleVisuel = (nom) => cle((nom || '').replace(/\.[a-z0-9]{2,5}$/i, ''));

// Sponsor le plus proche d'un nom de dossier : même nom, puis alias, puis l'un contient l'autre.
// sponsors : [{ id, nom, alias: [] }] -> { sponsor, sur } (sur = rapprochement exact) ou null
export function trouverSponsor(nomDossier, sponsors) {
  const k = cle(nomDossier);
  if (!k) return null;
  const exact = sponsors.find(s => cle(s.nom) === k) || sponsors.find(s => (s.alias || []).some(a => cle(a) === k));
  if (exact) return { sponsor: exact, sur: true };
  if (k.length < 4) return null;                       // trop court pour deviner sans risque
  // l'un contient l'autre (nom ou alias) ; le plus proche en longueur d'abord
  const ecart = (s) => Math.min(...[s.nom, ...(s.alias || [])].map(n => cle(n)).filter(kn => kn.length >= 4
    && (kn.includes(k) || k.includes(kn))).map(kn => Math.abs(kn.length - k.length)));
  const proches = sponsors.map(s => ({ s, e: ecart(s) })).filter(x => Number.isFinite(x.e)).sort((a, b) => a.e - b.e);
  return proches.length ? { sponsor: proches[0].s, sur: false } : null;
}

// Fichiers à ignorer (système, temporaires)
export const fichierSysteme = (nom) => /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$/i.test(nom || '');
