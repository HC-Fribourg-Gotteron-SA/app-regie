// Changer son mot de passe : depuis le lien « mot de passe oublié » reçu par e-mail,
// ou depuis le menu quand on est déjà connecté.
import { sb } from './app.js';

const $ = (id) => document.getElementById(id);

function message(texte, type) {
  $('message').textContent = texte;
  $('message').className = `message message-${type}`;
  $('message').hidden = !texte;
}

// Le lien reçu par e-mail ouvre une session temporaire (lue automatiquement dans l'adresse)
const params = new URLSearchParams(location.hash.slice(1) || location.search);
const { data: { session } } = await sb.auth.getSession();

if (params.get('error_description')) {
  message(`Ce lien n'est plus valable (${params.get('error_description')}). Redemandez-en un depuis la page de connexion.`, 'erreur');
} else if (!session) {
  message('Lien invalide ou expiré. Redemandez-en un depuis la page de connexion.', 'erreur');
} else {
  $('pour').textContent = `Compte : ${session.user.email}`;
  $('form-mdp').hidden = false;
  $('mdp1').focus();
}

$('form-mdp').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mdp = $('mdp1').value;
  if (mdp.length < 8) return message('Le mot de passe doit faire au moins 8 caractères.', 'erreur');
  if (mdp !== $('mdp2').value) return message('Les deux mots de passe ne sont pas identiques.', 'erreur');

  const bouton = $('btn-mdp');
  bouton.disabled = true;
  bouton.textContent = 'Enregistrement…';
  const { error } = await sb.auth.updateUser({ password: mdp });
  bouton.disabled = false;
  bouton.textContent = 'Enregistrer';

  if (error) {
    return message(/different from the old/i.test(error.message)
      ? "Le nouveau mot de passe doit être différent de l'ancien."
      : /weak|short/i.test(error.message)
        ? 'Mot de passe trop faible : ajoutez des chiffres, majuscules ou symboles.'
        : `Enregistrement impossible : ${error.message}`, 'erreur');
  }
  $('form-mdp').hidden = true;
  message('Mot de passe enregistré. Redirection…', 'ok');
  setTimeout(() => location.replace('demandes.html'), 1200);
});
