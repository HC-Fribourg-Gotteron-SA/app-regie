// Paramètres des projets Supabase (Project Settings > Data API / API Keys).
// La clé publishable peut être visible dans le navigateur : les règles d'accès (RLS) protègent les données.
// Ne jamais mettre ici la clé secrète (sb_secret_…).
//
// Deux bases :
//   - prod : les vraies données (version en ligne, Netlify) ;
//   - test : une copie vide + données fictives, pour essayer sans risque.
// En local (Live Server : 127.0.0.1 / localhost), l'outil utilise la base de TEST (bandeau orange),
// sauf si on bascule sur la vraie base avec le lien en bas du menu. En ligne : la vraie base,
// sauf sur le site de test (adresse contenant « test ») qui utilise la base de test.
const BASES = {
  prod: { url: 'https://qxclmmzmhenudhvaikmp.supabase.co', cle: 'sb_publishable_H8zdrsuxp3wpswxJvTRAkA_rgFgQJOH' },
  test: { url: 'https://euuglujtfyampnymwenz.supabase.co', cle: 'sb_publishable_ekXlCf8wI96H-JxbiPB4NQ_PN7nJJaT' },
};

export const EN_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
// Site en ligne « de test » (adresse qui contient « test », ex. regie-hcfg-test.netlify.app) : base de test
export const SITE_TEST = !EN_LOCAL && /test/i.test(location.hostname);
let choix = EN_LOCAL || SITE_TEST ? 'test' : 'prod';
try {
  const force = localStorage.getItem('base-choisie');
  if (EN_LOCAL && (force === 'prod' || force === 'test')) choix = force;
} catch { /* stockage indisponible */ }
if (!BASES[choix].url) choix = 'prod';          // base de test pas encore configurée

export const BASE = choix;                       // 'prod' ou 'test'
export const BASE_TEST_PRETE = !!BASES.test.url;
export const SUPABASE_URL = BASES[choix].url;
export const SUPABASE_KEY = BASES[choix].cle;

// Toutes les adresses e-mail sont acceptées (migration 27) : les comptes sont créés par un admin et
// n'ont aucun rôle (ne voient rien) tant qu'un admin ne les a pas activés.
