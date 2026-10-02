// Son d'une vidéo, détecté dans le navigateur (demandé par Léa le 02.10.2026 : le Sponsoring ne note plus
// la durée ni le son à la main, l'outil les lit dans le fichier).
//   1. MP4 / MOV : on cherche une piste son dans le fichier (boîte « hdlr » de type « soun ») ;
//      seuls les en-têtes sont lus, pas toute la vidéo.
//   2. Si une piste existe, on la décode pour vérifier qu'elle n'est pas muette (export avec une piste vide).
// Résultat : 'oui' (son), 'muet' (piste son silencieuse), 'non' (pas de piste son), null (pas pu lire).
// pisteAudioIsoBmff() est pure (testable dans Node) ; analyserSon() a besoin du navigateur.

export const LIBELLE_SON = { oui: '🔊 avec son', muet: '🔇 son muet', non: '🔇 sans son' };

const TYPES_HAUT = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot', 'uuid', 'meta', 'moof', 'mfra', 'styp', 'sidx']);
const CONTENEURS = new Set(['moov', 'trak', 'mdia']);
const MAX_MOOV = 32 * 1024 * 1024;           // en-têtes d'une vidéo : quelques Mo au plus
const MAX_DECODAGE = 80 * 1024 * 1024;        // au-delà, on ne vérifie pas si la piste est muette

const texte4 = (o, i) => String.fromCharCode(o[i], o[i + 1], o[i + 2], o[i + 3]);
const u32 = (o, i) => ((o[i] << 24) >>> 0) + (o[i + 1] << 16) + (o[i + 2] << 8) + o[i + 3];
const u64 = (o, i) => u32(o, i) * 2 ** 32 + u32(o, i + 4);

/**
 * Le fichier MP4 / MOV contient-il une piste son ?
 * lire(debut, fin) -> Promise<Uint8Array> (octets [debut, fin[) ; taille = taille du fichier en octets.
 * Renvoie true / false, ou null si ce n'est pas un MP4 / MOV lisible.
 */
export async function pisteAudioIsoBmff(lire, taille) {
  let pos = 0, premier = true;
  while (pos + 8 <= taille) {
    const t = await lire(pos, Math.min(pos + 16, taille));
    if (t.length < 8) return null;
    let longueur = u32(t, 0);
    const type = texte4(t, 4);
    if (premier && !TYPES_HAUT.has(type)) return null;
    premier = false;
    let entete = 8;
    if (longueur === 1) { if (t.length < 16) return null; longueur = u64(t, 8); entete = 16; }
    else if (longueur === 0) longueur = taille - pos;
    if (longueur < entete) return null;
    if (type === 'moov') {
      if (longueur > MAX_MOOV) return null;
      const moov = await lire(pos, Math.min(pos + longueur, taille));
      return chercherSon(moov, entete, moov.length);
    }
    pos += longueur;
  }
  return null;
}

// Parcourt moov > trak > mdia > hdlr ; MP4 et QuickTime ont le type de piste au même endroit
function chercherSon(o, debut, fin) {
  let pos = debut;
  while (pos + 8 <= fin) {
    let longueur = u32(o, pos);
    const type = texte4(o, pos + 4);
    let entete = 8;
    if (longueur === 1) { longueur = u64(o, pos + 8); entete = 16; }
    else if (longueur === 0) longueur = fin - pos;
    if (longueur < entete || pos + longueur > fin) return false;
    if (type === 'hdlr' && pos + 20 <= fin && texte4(o, pos + 16) === 'soun') return true;
    if (CONTENEURS.has(type) && chercherSon(o, pos + entete, pos + longueur)) return true;
    pos += longueur;
  }
  return false;
}

// Plus fort échantillon de la piste son décodée (0 = silence complet)
async function niveauMax(octets) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx(1, 1, 44100);
  const audio = await ctx.decodeAudioData(octets);
  let max = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const donnees = audio.getChannelData(c);
    for (let i = 0; i < donnees.length; i++) {
      const v = Math.abs(donnees[i]);
      if (v > max) max = v;
    }
  }
  return max;
}

// Lecture par morceaux : fichier choisi sur l'ordinateur, ou adresse du stockage (requêtes « Range »)
function lecteur(source) {
  if (source instanceof Blob) {
    return { taille: source.size, lire: async (a, b) => new Uint8Array(await source.slice(a, b).arrayBuffer()),
             tout: () => source.arrayBuffer() };
  }
  let entier = null;                          // serveur qui ignore « Range » : on garde le fichier reçu
  return {
    taille: source.taille,
    lire: async (a, b) => {
      if (entier) return entier.subarray(a, b);
      const r = await fetch(source.url, { headers: { Range: `bytes=${a}-${b - 1}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const o = new Uint8Array(await r.arrayBuffer());
      if (r.status === 200) { entier = o; return o.subarray(a, b); }
      return o;
    },
    tout: async () => entier ? entier.buffer.slice(0) : (await fetch(source.url)).arrayBuffer(),
  };
}

const estVideo = (nom, mime) => /^video\//.test(mime || '') || /\.(mp4|mov|m4v|webm)$/i.test(nom || '');

/**
 * Son d'une vidéo : 'oui' / 'muet' / 'non' / null (pas une vidéo, ou pas pu lire).
 * source = File, ou { url, taille, nom, mime } pour un fichier du stockage.
 */
export async function analyserSon(source) {
  const nom = source.name || source.nom, mime = source.type || source.mime;
  if (!estVideo(nom, mime)) return null;
  try {
    const l = lecteur(source);
    let piste = null;
    if (l.taille) piste = await pisteAudioIsoBmff(l.lire, l.taille);
    if (piste === false) return 'non';
    if (!l.taille || l.taille > MAX_DECODAGE) return piste ? 'oui' : null;
    try {
      const max = await niveauMax(await l.tout());
      if (max === null) return piste ? 'oui' : null;
      return max < 0.001 ? 'muet' : 'oui';     // 0.001 ≈ -60 dB : rien d'audible
    } catch {
      // piste trouvée mais pas décodable par le navigateur : on la compte comme du son
      return piste ? 'oui' : null;
    }
  } catch {
    return null;
  }
}
