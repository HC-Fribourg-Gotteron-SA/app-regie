# Outil Sponsoring ↔ Régie

## Installation (≈ 5 min)

1. Créer un projet Supabase dans une **région européenne**.
2. Dans **SQL Editor**, exécuter dans l'ordre les fichiers du dossier `supabase/` :
   1. `01_schema.sql` : tables, fonctions métier, vues
   2. `02_securite.sql` : comptes, rôles, règles d'accès (RLS), bucket de fichiers
   3. `03_donnees_depart.sql` : saison 2026-27, catalogue produits, 148 emplacements LED
   4. `04_temps_reel.sql` : mise à jour en direct de la liste des demandes
3. **Connexion par e-mail + mot de passe** (fournisseur **Email**, actif par défaut). À régler dans
   **Authentication** :
   - *Sign In / Providers* : désactiver **Allow new users to sign up**. Seuls les comptes créés par
     un admin peuvent alors se connecter ;
   - *URL Configuration* : ajouter `http://127.0.0.1:5500/app/mot-de-passe.html` dans
     *Redirect URLs* (lien « mot de passe oublié »), puis l'adresse en ligne de l'app le moment venu ;
   - *Email Templates > Reset Password* : traduire l'e-mail en français (facultatif) ;
   - pour la production, brancher un SMTP (par exemple celui de Brevo), car l'envoi par défaut
     de Supabase est limité à quelques e-mails par heure.
   Les adresses hors `@fribourg-gotteron.ch` sont refusées par la base.
4. Créer le premier compte : **Authentication > Users > Add user > Create new user**
   (adresse @fribourg-gotteron.ch, un mot de passe, cocher *Auto Confirm User*), puis dans le SQL Editor :
   ```sql
   update profiles set role = 'admin', nom = 'Léa Talon'
   where email = 'lea.talon@fribourg-gotteron.ch';
   ```

## Ajouter un collègue

1. **Authentication > Users > Add user > Create new user** : son adresse, un mot de passe provisoire,
   *Auto Confirm User* coché.
2. Dans le SQL Editor, lui donner un rôle :
   - `sponsoring` : fait des demandes (avec fichiers), répond aux questions de la Régie, **consulte** tout le reste ;
   - `regie` ou `admin` : **mêmes droits** — traite les demandes, ajoute / retire les sponsors sur les fiches,
     Match du jour, dossiers, calendrier, produits, suppressions.
   ```sql
   update profiles set role = 'regie', nom = 'Prénom Nom'
   where email = 'prenom.nom@fribourg-gotteron.ch';
   ```
3. Lui transmettre le mot de passe provisoire. Il le change ensuite via **Mot de passe** dans le menu.
   Il peut aussi utiliser « Mot de passe oublié ? » pour en choisir un lui-même.

## Lancer l'app

1. Ouvrir le dossier `outil-regie` dans VS Code.
2. Clic droit sur `app/index.html` > **Open with Live Server** (adresse `http://127.0.0.1:5500/app/index.html`).
3. Se connecter avec son e-mail et son mot de passe : on arrive sur la liste des demandes.

| Page | Pour qui | Rôle |
| --- | --- | --- |
| `index.html` | Tous | Connexion e-mail + mot de passe, « mot de passe oublié » |
| `mot-de-passe.html` | Tous | Choisir un nouveau mot de passe (depuis le menu ou le lien reçu par e-mail) |
| `demande.html` | Sponsoring (et Régie) | Nouvelle demande : sponsor, type, produits, date d'effet, remarque, fichiers |
| `demandes.html` | Tous | File des demandes : onglets par statut, recherche, détail, réponse et statut (Régie), réponse aux questions (Sponsoring) |

Les paramètres du projet sont dans `app/js/config.js`. Les fichiers joints aux demandes sont rangés
dans le bucket `assets`, sous `demandes/<id de la demande>/`.

## Ce que la base fait toute seule

| Quand… | …la base |
| --- | --- |
| une ligne passe à « vendu » | la met en « fichiers attendus » et crée un passage par match couvert |
| un match est ajouté au calendrier | ajoute les passages de toutes les lignes vendues à la saison |
| un fichier est déposé | le numérote (version), le contrôle (dimensions, format, durée, poids) et note les écarts dans `conformite` |
| la Régie valide un fichier | archive l'ancienne version, passe la ligne en « programmé », met le visuel dans les passages à venir |
| une ligne a une date de fin | retire les passages des matchs suivants (jamais ceux déjà pointés) |
| une demande passe à « traitée » | enregistre qui l'a traitée et quand |
| n'importe quelle modification | l'écrit dans `journal` (avant / après) |

## Vues à utiliser dans l'interface

| Vue | Écran |
| --- | --- |
| `v_diffusions` | Vue produit, vue match, exports CSV |
| `v_preparation_colosseo` | Préparation Colosseo : ordre de saisie (son d'abord), changements depuis le match précédent, slides regroupées |
| `v_colosseo_retraits` | Ce qui passait au match précédent et ne passe plus |
| `v_capacite` | Jauges et grille produits × matchs |
| `v_alertes` | Capacité dépassée, emplacement attribué deux fois, emplacements manquants |
| `v_plan_emplacements` | Plan des bandes LED |

Fonctions utiles : `rechercher_sponsors('winniger')` pour une recherche tolérante aux fautes, et `renouveler_contrats(array[...], saison_id)` pour l'écran de renouvellement.

## Qui peut faire quoi

- **Tous les membres** voient tout.
- **Sponsoring et Régie** créent et modifient les sponsors, contrats, demandes, lignes et fichiers.
- **Régie seule** valide ou refuse un fichier (un motif est obligatoire pour un refus), ordonne, pointe et coche « saisi dans Colosseo ».
- **Admin seul** gère les produits, emplacements, saisons, matchs et utilisateurs, et peut supprimer.

## À confirmer (valeurs provisoires dans `03_donnees_depart.sql`)

- **Durée d'une slide** : 5 s, estimé d'après Airtable (Honorary ≈ 1 min 50).
- **Emplacements LED** : 74 par bande (3M sur A/B, 6M sur C/D), comme dans Airtable. Les 5 NORD-OUEST de chaque bande sont réservés au club.
- **Largeur du visuel de l'anneau LED** et **capacité de l'anneau** : laissées vides pour l'instant.

## Testé

Le script a été exécuté sur PostgreSQL 16, en simulant les comptes Supabase, sur 16 scénarios : domaine refusé, compte sans rôle, droits par rôle, vente à la saison et par match, « 1 match sur 2 », ajout de match, contrôle d'un fichier en 3000 × 80, validation et versions, slides → temps vidéotron, capacité dépassée, suspension, date de fin, préparation Colosseo, recherche de sponsor et journal.
