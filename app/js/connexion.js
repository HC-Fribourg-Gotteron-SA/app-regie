import { sb } from './app.js';
import { DOMAINE_AUTORISE } from './config.js';

const $ = (id) => document.getElementById(id);
// Page d'arrivée : la Régie commence par le match du jour, le Sponsoring par ses demandes
async function allerAccueil() {
  const { data: { user } } = await sb.auth.getUser();
  const { data: profil } = user ? await sb.from('profiles').select('role').eq('id', user.id).maybeSingle() : { data: null };
  location.replace(['regie', 'admin'].includes(profil?.role) ? 'match-du-jour.html' : 'demandes.html');
}

function message(texte, type) {
  $('message').textContent = texte;
  $('message').className = `message message-${type}`;
  $('message').hidden = !texte;
}

function occupe(bouton, texte) {
  bouton.dataset.texte ??= bouton.textContent;
  bouton.disabled = !!texte;
  bouton.textContent = texte || bouton.dataset.texte;
}

// Lien « mot de passe oublié » arrivé ici par erreur (adresse de retour non autorisée dans
// Supabase : il renvoie alors vers la Site URL) : on l'envoie vers la bonne page.
const retourMail = new URLSearchParams(location.hash.slice(1));
const estRecuperation = retourMail.get('type') === 'recovery';
sb.auth.onAuthStateChange((evenement) => {
  if (evenement === 'PASSWORD_RECOVERY') location.replace('mot-de-passe.html');
});

// Déjà connecté (ou session ouverte par un lien reçu par e-mail) : on entre directement
const { data: { session } } = await sb.auth.getSession();
if (session) {
  if (estRecuperation) location.replace('mot-de-passe.html');
  else await allerAccueil();
}
if (retourMail.get('error_description')) {
  message(`Le lien reçu par e-mail n'est plus valable (${retourMail.get('error_description')}). Redemandez-en un.`, 'erreur');
}

// ---------------------------------------------------------------------
// Connexion e-mail + mot de passe
// ---------------------------------------------------------------------
$('form-connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const password = $('mdp').value;

  if (!email.endsWith(DOMAINE_AUTORISE)) return message(`Utilisez votre adresse ${DOMAINE_AUTORISE}.`, 'erreur');
  if (!password) return message('Saisissez votre mot de passe.', 'erreur');

  occupe($('btn-connexion'), 'Connexion…');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  occupe($('btn-connexion'));

  if (error) {
    const texte = /invalid login credentials/i.test(error.message)
      ? 'E-mail ou mot de passe incorrect.'
      : /email not confirmed/i.test(error.message)
        ? "Ce compte n'est pas encore confirmé. Contactez un admin."
        : `Connexion impossible : ${error.message}`;
    return message(texte, 'erreur');
  }
  await allerAccueil();
});

// ---------------------------------------------------------------------
// Mot de passe oublié
// ---------------------------------------------------------------------
function basculer(oubli) {
  $('form-connexion').hidden = oubli;
  $('form-oubli').hidden = !oubli;
  message('');
  if (oubli) { $('email-oubli').value = $('email').value; $('email-oubli').focus(); }
}
$('lien-oubli').addEventListener('click', () => basculer(true));
$('lien-retour').addEventListener('click', () => basculer(false));

$('form-oubli').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email-oubli').value.trim().toLowerCase();
  if (!email.endsWith(DOMAINE_AUTORISE)) return message(`Utilisez votre adresse ${DOMAINE_AUTORISE}.`, 'erreur');

  occupe($('btn-oubli'), 'Envoi…');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('mot-de-passe.html', location.href).href,
  });
  occupe($('btn-oubli'));

  if (error) {
    return message(/rate limit/i.test(error.message)
      ? "Trop de demandes d'e-mail en peu de temps. Réessayez dans quelques minutes."
      : `Envoi impossible : ${error.message}`, 'erreur');
  }
  // Même message que le compte existe ou non (on ne révèle pas quelles adresses ont un compte)
  message(`Si un compte existe pour ${email}, un lien vient d'être envoyé. Pensez à vérifier les indésirables.`, 'ok');
});
