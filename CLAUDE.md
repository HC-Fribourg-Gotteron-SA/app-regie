# Outil Sponsoring ↔ Régie — HC Fribourg-Gottéron

Contexte du projet pour Claude. Mets ce fichier à jour quand une décision est prise ou qu'une étape avance.

## ⏰ À rappeler à Léa en début de prochaine session

0-bis. **Tests des collègues sur données fictives** : `23_remise_a_zero.sql` (efface, puis remet HCFG et National
   League) → `demo_donnees_test.sql` (sponsors « (démo) », tous les états, changements Match du jour vs match
   précédent, 5 demandes, notes « Pour ce soir » ; refuse une base non vide ; fonction d'aide `demo_ligne` supprimée
   à la fin) → tests → `23` à nouveau → vrai import. Exécution à confirmer.
   `changements.js` : un visuel ne compte comme changé que si l'ancien ET le nouveau sont connus (les diffusions
   importées n'ont pas de visuel sur les matchs passés → sinon tout serait « Remplacer le visuel »).
0. **Plan décidé le 28.09.2026 : remise à zéro puis nouvel import.** Léa va bientôt faire ses tests, puis on
   **efface les données de test** et on **réimporte ce qui passe actuellement** en Régie. À faire quand elle est prête :
   (a) ✅ écrit : `23_remise_a_zero.sql` (demandé par Léa pour tester sur une base vide ; exécution à confirmer) — efface sponsors, contrats, diffusions, passages, demandes, fichiers du bucket,
   documents_sponsors, colosseo_fait, journal, imports_donnees — et **garde** produits, emplacements, saisons, matchs,
   profils ; (b) nouvel export Airtable (ou vérifié avec Colosseo) ; (c) ✅ fait le 29.09.2026 (`outils/import-airtable.mjs`
   passe validee / visuel_attendu / priorite / priorite de l'anneau à la base, remplit les visuels des matchs passés,
   refuse une base non vide ; ne génère plus la migration 15) — script d'import qui intègre directement tout
   ce qui a été corrigé après coup : ordre de diffusion (15), À l'écran (16 + 21 : LED toutes à l'écran sauf club),
   anneau de la pause tiers sur le produit inactif (17), visuel attendu (18), LED 6M = 2 emplacements, Banner HCFG
   = libre. Tout exécuter en **un seul bloc `do`** (piège du SQL Editor).

00. **Recette du 01.10.2026 : corrections faites, à faire tester par Léa** (migration **28** à exécuter sur les deux
   bases) — décisions prises avec Léa :
   - **Traitement partout pareil** : `app/js/traitement.js` = LA carte de traitement d'un produit de demande (fichiers,
     dimensions, plan LED, remarques Sponsoring / Régie, Ajouter ✓ / Mettre le nouveau visuel / Retirer / Ignorer).
     Utilisée sur la fiche produit (« À ajouter », mode `produit`) ET dans le détail d'une demande (mode `demande`) ;
     Match du jour ouvre la demande. Ne jamais recréer une 2e façon de traiter.
   - **Une seule case « À l'écran »** : plus de « Désactivé » à l'écran. Décocher = `validee = false` + raison facultative
     dans `motif_suspension` (`suspendue` remis à false) ; anciennes lignes `suspendue` affichées « Pas à l'écran ».
   - **Comment la Régie travaille (expliqué par Léa, 01.10.2026 — à respecter)** : TOUT se fait le jour du match.
     Traiter une demande = l'ajouter dans l'outil ET dans Colosseo en même temps (nouveau sponsor à la saison, nouveau
     logo / vidéo, retrait…). Puis on regarde le **spécial du match** (vendu pour ce match) et on l'ajoute dans Colosseo.
     **Match du jour = 2 blocs** : 1) « Demandes à traiter » (bouton Ajouter / Changer le visuel / Retirer → ouvre la
     demande ; traitée = reste affichée **grisée** « ✓ Ajouté par … le … » + Voir, demandé par Léa ; pas de case Fait ;
     « Prendre en charge » retiré de Demandes, inutile) ; 2) « Spécial de ce match » = changements des seules diffusions
     **au match** (➕ ce soir, ➖ celles du match précédent, 🔄) avec case « Fait » + « Détails ». Les changements à la
     saison faits sur une fiche (retrait, case À l'écran) **ne sont pas listés** (Colosseo fait au même moment).
     Ne PAS remettre une liste de « tous les changements depuis le match précédent » (confusion Ajouter / Fait).
   - **Fichier arrivé après la demande = option A** : « + Ajouter un fichier » sur chaque produit de la demande
     (Sponsoring et Régie) → RPC `fichier_ajoute_demande` (28) : produit déjà ajouté → revient à traiter avec
     « Mettre le nouveau visuel » sur la même diffusion (`ligne_id` gardé), demande traitée → « Nouvelle ».
   - **Pub pause tiers** (fiche + Match du jour) : groupes avec son + anneau, avec son, sans son + anneau, sans son
     sans anneau, puis ordre de diffusion.
   - Demande « changement de visuel » / « suppression » : seuls les produits que le sponsor a sont proposés.
     « Suppression » en badge rouge dans la liste des demandes.
   - Sponsoring : ne voit plus Match du jour, Par match, Calendrier.
   - **Fiche produit = playlist Colosseo** (Léa) : un sponsor « au match » n'entre dans la playlist que le jour de son
     match. Sur les fiches et la page Action scenes, au lieu de « À l'écran » : « 📅 Prévu le JJ.MM » avant,
     « À l'écran ce soir » le jour J, puis « Matchs passés » (`etatAuMatch()` dans app.js). Match du jour : ➖ =
     « Dans l'outil : enlevé automatiquement · Dans Colosseo : à enlever à la main ».
   - Slides « Aucun logo » dans la Pub pause tiers : normal si aucun logo des fiches Slides n'est « À l'écran ».
   - Téléphone : pas important (outil fait pour l'ordinateur), dit par Léa.
0-ter. **Netlify gratuit bloque les déploiements** (30.09.2026 : crédits épuisés ; 2 sites reliés au même dépôt =
   2 déploiements par push). Léa teste d'abord sur le site actuel ; **plus tard** : passer le site de test (puis
   peut-être le vrai) sur **Cloudflare Pages** (recommandé) ou plan payant. En attendant : regrouper les push.
   Recette des tests (page claude.ai, commentaires + export) : https://claude.ai/artifact/AKvYKr63XcgFcWQF76MMbQ
1. **Remarques Régie / admin + case « Validé » + détail au clic** (fait le 26.09.2026, migration 16, pas encore
   testé) : demander à Léa si c'est bon. Page Action scenes (28.09.2026) : rangées cliquables → fiche de la scène
   avec le détail ouvert (`produit.html?id=…&ligne=…`, retour vers la page Action scenes ; fermer le détail ✕ /
   Échap / clic à côté, ou « Retirer », ramène à la page Action scenes), état À l'écran /
   Désactivé / visuel attendu à la place des anciens badges.
3. **Anneau LED à vérifier par Léa** (26.09.2026) : comparer la fiche **Anneau LED** (bandeaux pendant le match,
   importés de la feuille « LED match ») et les anneaux de la **Pub pause tiers** avec ce qui tourne
   **actuellement dans le système de diffusion (Colosseo)** : sponsors, visuels, durées, ordre. Lui demander le
   résultat et corriger ce qui ne correspond pas.
4. **Fiche Pub pause tiers** (pas encore testé) : colonne Anneau LED = oui / non. Demander une capture à Léa.
5. **Dossiers sponsors** (28.09.2026) : migration 19 exécutée ? page testée (liste, dossier, ajout d'un document) ?
7. **Match du jour** (28.09.2026) : migrations 20, 21, 22 exécutées ? Page testée sur un vrai match ? Ce qui manque
   ou ce qui est en trop pour la Régie (ordre des blocs, wording, son d'abord, slides) ?
6. Colonne « Visuel écran » de la liste d'un produit : **laissée de côté** par Léa (28.09.2026) ; ne pas relancer
   sauf si elle en reparle (options : « dernier visuel reçu » ou suppression).
2. Vérifier que les migrations **13** (Ajouter = valider le visuel), **14**, **15** (ordre de diffusion), **16**
   (Validé), **17** (anneau de la pause tiers) et **18** (visuel attendu) ont été exécutées, et que l'ordre des fiches correspond à Airtable (nouveaux en bas, « au match » à leur place).

## Le projet

Application web interne qui remplace Airtable (un formulaire + une feuille par produit) pour l'échange
d'infos entre le **département Sponsoring** (vend des produits de visibilité aux sponsors) et la
**Régie** (diffuse : anneau LED, vidéotron, bandes LED, angles, slides de logos…).

- Porteuse du projet : Léa Talon (Régie), admin de l'outil. Elle parle français ; réponds en français.
- Cahier des charges complet (Claude Docs) : https://claude.ai/code/artifact/deecc0db-6e12-4cf6-b96f-06bd15ee4bac
- Utilisateurs : Sponsoring, Régie, admin. **Pas de portail sponsor** en V1.
- La diffusion se fait dans **Colosseo**, qui **n'accepte aucun import** : la Régie recopie à la main
  les playlists depuis l'outil. L'outil doit donc rendre cette saisie facile (ordre, noms exacts, changements).

## Stack

- **Supabase** : Postgres, Auth (e-mail + mot de passe), Storage (bucket privé `assets`), RLS, Realtime.
  **Deux projets** (30.09.2026) : **vraie base** `https://qxclmmzmhenudhvaikmp.supabase.co` (en ligne, Netlify) et
  **base de test** `https://euuglujtfyampnymwenz.supabase.co` (données fictives). `app/js/config.js` choisit tout seul :
  **en local (Live Server) = base de TEST** (bandeau orange en bas de l'écran), en ligne = vraie base ; lien en bas du
  menu (en local) « Passer sur la vraie base / Revenir sur la base de test » (localStorage `base-choisie`, bandeau
  rouge sur la vraie base en local). Installer / mettre à jour la base de test : `node outils/installation-base-test.mjs`
  → `supabase/installation_base_test.sql` (toutes les migrations sauf 15 et 23), puis `demo_donnees_test.sql`.
  **Nouvelle migration = à exécuter sur LES DEUX bases** (test d'abord).
  **Site de test en ligne** pour les collègues : tout site dont l'adresse contient « test » (ex. 2e site Netlify
  `…-test.netlify.app`, même dépôt) utilise la base de test (`SITE_TEST`, bandeau orange). ⚠ L'adresse du vrai site ne
  doit jamais contenir « test ». Les collègues ont besoin d'un compte dans le projet de test (Auth séparée).
- **Front** : HTML + CSS + JS vanilla en modules ES, **sans build**. supabase-js v2 importé depuis
  `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`. Lancé en local avec Live Server
  (`http://127.0.0.1:5500/app/index.html`).
- Éditeur : VS Code. E-mails transactionnels prévus via le SMTP de Brevo (déjà utilisé au club).

## Structure

```
outil-regie/
├── CLAUDE.md
├── LISEZMOI.md            ← installation, ajout d'un collègue, pages
├── supabase/
│   ├── 01_schema.sql      ← types, tables, fonctions métier, triggers, vues
│   ├── 02_securite.sql    ← profil auto, rôles, RLS, storage
│   ├── 03_donnees_depart.sql ← saison 2026-27, produits, 148 emplacements LED
│   ├── 04_temps_reel.sql  ← realtime sur `demandes`
│   ├── 05_demandes_saison_ou_matchs.sql ← demandes : type_vente, saison_id, dates_matchs
│   ├── 06_calendrier.sql  ← RPC importer_matchs(saison, jsonb), renumeroter_matchs(saison)
│   ├── 07_demandes_details_produits.sql ← demandes_produits : type_vente, dates_matchs, duree_s, remarques
│   ├── 08_produits_au_match.sql ← Sponsor du match (produit + action scene) proposés « au match »
│   ├── 09_demandes_son_anneau.sql ← demandes_produits : avec_son, avec_anneau
│   ├── 10_noms_categories.sql ← catégories renommées (vocabulaire Régie)
│   ├── 11_traiter_demande.sql ← demandes_produits.suite/traite_le/traite_par/ligne_id, RPC traiter_produit(),
│   │                            sponsor_de_demande(), contrat_pour()
│   ├── 12_ordre_produits.sql ← produits.ordre (importance)
│   ├── 13_ajouter_valide_visuel.sql ← traiter_produit() : les visuels sont créés directement « validés »
│   ├── 14_ordre_diffusion.sql ← lignes_vendues.priorite = ordre de diffusion dans le produit (+ trigger : fin)
│   ├── 15_ordre_import_airtable.sql ← (généré) ordre des lignes importées = ordre des feuilles Airtable
│   ├── 16_diffusion_validee.sql ← lignes_vendues.validee (+ validee_le / validee_par)
│   ├── 17_anneau_pause_tiers.sql ← anneau de la Pub pause tiers séparé de l'Anneau LED (produit technique inactif)
│   ├── 18_visuel_attendu.sql ← lignes_vendues.visuel_attendu (+ trigger : enlevé quand un visuel est validé)
│   ├── 19_dossiers_sponsors.sql ← table documents_sponsors (dossier par sponsor) + reprise des fichiers des demandes
│   ├── 20_emplacements_liberes.sql ← v_plan_emplacements : sponsor retiré = emplacement LED libre (Banner HCFG)
│   ├── 21_led_a_l_ecran.sql ← LED 3M / 6M : tout « À l'écran » sauf réservé club / contenu club / désactivé
│   ├── 22_match_du_jour.sql ← passages suivent À l'écran / désactivé (matchs futurs) + table colosseo_fait
│   ├── 23_remise_a_zero.sql ← ⚠ vide les données (sponsors, diffusions, demandes…), garde produits / emplacements /
│   │                           saisons / matchs / comptes ; fichiers du bucket à supprimer à la main (Storage)
│   ├── 24_droits_sponsoring.sql ← Sponsoring = demandes + consultation (RLS)
│   ├── 25_regie_egal_admin.sql ← a_role() : regie et admin ont les mêmes droits
│   ├── 26_notes_match.sql ← table notes_match : infos et tâches d'un match (« Pour ce soir »)
│   ├── 27_comptes_externes.sql ← toutes les adresses e-mail acceptées (comptes créés par un admin)
│   ├── 28_fichier_ajoute_apres.sql ← RPC fichier_ajoute_demande : fichier ajouté après la demande
│   └── 29_ordre_produits_soiree.sql ← ordre des produits = déroulé de la soirée
├── import-airtable/       ← CSV exportés d'Airtable (une feuille par produit ; liens Airtable retirés)
├── outils/import-airtable.mjs ← `node outils/import-airtable.mjs` : CSV -> supabase/import_airtable_2026-27.sql
│                                (+ import_airtable_annuler.sql) et résumé (sponsors regroupés, lignes ignorées)
└── app/
    ├── index.html / js/connexion.js        ← connexion + mot de passe oublié
    ├── mot-de-passe.html / js/mot-de-passe.js
    ├── demande.html / js/demande.js        ← nouvelle demande
    ├── demandes.html / js/demandes.js      ← file des demandes + détail
    ├── produits.html / js/produits.js      ← liste des fiches produit (+ « demandes à ajouter »)
    ├── produit.html / js/produit.js        ← fiche d'UN produit (?id=…) : « À ajouter » + sponsors du produit
    ├── categorie.html / js/categorie.js    ← une catégorie sur une page (?c=Action%20scenes) : toutes les scènes + sponsor
    ├── match-du-jour.html / js/match-du-jour.js ← « Match du jour » : à faire dans Colosseo + playlist (accueil Régie)
    ├── js/changements.js  ← calcul pur des changements entre 2 matchs (testable dans Node)
    ├── js/traitement.js   ← LA carte de traitement d'un produit de demande (fiche produit + détail d'une demande)
    ├── matchs.html / js/matchs.js          ← « Par match » : ventes au match + demandes au match à ajouter, par match
    ├── calendrier.html / js/calendrier.js  ← matchs à domicile (lecture tous ; ajout/import/modif admin)
    ├── sponsors.html / js/sponsors.js      ← « Dossiers sponsors » : liste (avec produits / avec documents / tous)
    ├── sponsor.html / js/sponsor.js        ← dossier d'UN sponsor (?id=…) : ce qu'il a, documents reçus, demandes
    ├── import-dossiers.html / js/import-dossiers.js ← import en masse d'un dossier (un sous-dossier par sponsor), Régie
    ├── js/rapprochement.js ← calcul pur : nom de dossier -> sponsor, nom de fichier -> visuel (testable dans Node)
    ├── img/logo.jpg
    ├── js/app.js      ← client `sb`, exigerConnexion({roles}), menu, LIBELLES, outils (echapper, notifier…)
    ├── js/config.js
    └── css/style.css  ← variables CSS dans :root, classes en français
```

Les fichiers SQL 01 → 12 ont été exécutés **dans l'ordre** sur le projet Supabase (septembre 2026 ; 10–12
vérifiés le 25.09.2026 avec une requête qui teste leurs traces : colonnes / fonctions / valeurs).
13 → 22 exécutés et testés : « tout bon » confirmé par Léa (session suivant le 28.09.2026).
Pour modifier la base, **écrire un nouveau fichier** `supabase/30_….sql` (migration) plutôt que
réécrire 01–04, et donner à Léa les instructions pour l'exécuter dans le SQL Editor.

## Modèle métier (à respecter)

**Quatre familles de produits** (`produits.famille`) :

| Famille | Exemples | Capacité |
| --- | --- | --- |
| `emplacement` | LED 3M (1 emplacement), LED 6M (2 emplacements) | Emplacements physiques de 300 × 80 px ; 74 par bande (3M = anneaux A/B, 6M = C/D) ; 5 NORD-OUEST réservés club par bande. Un 3M vendu peut être placé sur la bande 6M. |
| `slide` | Young Dragons Golden 4 / Active 6 / Honorary 12 / Club de soutien 4 ; Ladies Legend 4 / Ailes 6 / Founders 12 (logos par slide) | Élastique : une slide de plus quand la dernière est pleine. Les slides sont diffusées comme une vidéo dans la « Pub pause tiers » et consomment son temps. |
| `temps` | Anneau LED, Pub pause tiers (vidéotron, **max 17 min**), Angles match (**max 20 min**), LED Sportcafé (1344 × 96), Pub après warm-up, arrêt de jeu, warm-up | Secondes par match |
| `exclusif` | 39 Action scenes, Sponsor du match, Top Ring, Bottom Ring | 1 sponsor par produit et par match |

**Vocabulaire des catégories** (`produits.categorie`, migration 10) : « Anneau LED 3M & 6M » (les bandes LED 3M / 6M),
« Anneau LED » (le produit temps qui passe pendant le match), « LED Sportcafé », « Slides Ladies »,
« Slides Young Dragons », « Vidéotron pub (warm-up, après warm-up, pause tiers, arrêt de jeu) », « Action scenes »…

**Ordre = déroulé de la soirée** (`produits.ordre`, migrations 12 puis **29** du 01.10.2026 ; plus petit = d'abord) :
1 Action scenes, 2 Pub warm-up, 3 Pub après warm-up, 4 Pub pause tiers, 5 Angles match, 6 Anneau LED, 7 LED 3M / 6M,
8 LED Sportcafé, 9 Slides Young Dragons, 10 Slides Ladies, puis 100 pour tout le reste (alphabétique). Toujours trier `order('ordre').order('categorie').order('nom')` ;
une catégorie se place selon son produit le plus important.

**Action scenes** = animations affichées au moment d'une action du match (goal, temps mort, pénalité…).
Un seul sponsor par scène, **en principe pris pour la saison** ; certaines se prennent pour un match
(comme « Sponsor du match »). **Tout produit** peut être pris à la saison ou pour un ou plusieurs matchs :
`produits.mode_vente` ne sert qu'à pré-cocher le choix dans la demande (`match` = « Seulement certains matchs »).

Autres règles décidées :

- Vente **à la saison** (tous les matchs à domicile, playoffs en option, matchs ajoutés plus tard inclus)
  ou **par match** (matchs cochés). Contrats pluriannuels possibles (`saison_debut_id` → `saison_fin_id`).
- Capacité dépassée = **alerte, jamais de blocage** (vue `v_alertes`).
- Ordre des playlists : **spots avec son d'abord** (contrainte technique), puis ordre manuel de la Régie.
- **Ordre de diffusion dans un produit** = `lignes_vendues.priorite` (migrations 14 + 15) : les diffusions
  importées reprennent **la position de leur ligne dans la feuille Airtable** (15, généré par le script d'import ;
  les « au match » de la Pub pause tiers gardent leur place dans la feuille, les anneaux couplés passent après la
  feuille LED match) ; tout ce qui est ajouté hors import va **en bas**, dans l'ordre d'ajout (trigger `lignes_priorite`).
  **Jamais trier les sponsors par ordre alphabétique** dans les listes d'un produit (erreur corrigée le 26.09.2026).
- Plusieurs visuels par ligne avec `regle_rotation` (unique / alterner / equilibrer / par_match / par_langue).
- Couplage vidéotron ↔ anneau selon le produit de base (`lie_a_produit_id`, `ligne_couplee_id`).
  **L'anneau de la Pub pause tiers ≠ le produit « Anneau LED »** (bandeaux pendant le match, feuille « LED match »).
  Il est **compris dans la Pub pause tiers** (migration 17) : ligne couplée rattachée au produit technique
  **inactif** « Anneau LED pause tiers » (invisible : menu, produits, formulaire, Par match) ; ses visuels
  s'affichent sur la fiche Pub pause tiers. Colonne « Anneau LED » = **simplement oui / non** (décidé le 26.09.2026).
  Détail d'une ligne : liste des visuels (vidéo écran + anneau). **Pas de bloc « Ce qui passe » ni de saisie du nom
  du visuel dans l'outil** (essayé puis retiré le 28.09.2026) : **Colosseo est la seule référence de ce qui passe** ;
  recopier les visuels dans l'outil = double saisie et risque de décalage. L'outil garde ce que le Sponsoring
  envoie (demande + fichiers) et ce que la Régie doit faire.
  **Slides dans la fiche Pub pause tiers** : 7 lignes calculées (bleues, lecture seule, en bas, ordre Airtable :
  YD Golden, Active, Club de soutien, Honorary, Ladies Legend, Ailes, Founder) = logos **à l'écran** des fiches
  Slides → nb de slides × `duree_par_slide_s` (5 s, à confirmer) ; clic = fiche Slides.
  **Pub pause tiers = 4 cas** : vidéotron avec/sans son × avec/sans anneau LED. Dans la demande, le Sponsoring
  choisit obligatoirement le son (toutes les pubs vidéotron) et l'anneau (produits avec `lie_a_produit_id`).
- Suspension temporaire d'une ligne (météo, trop de pub) sans toucher au contrat.
- **Sponsors « au match » dont tous les matchs sont passés** (30.09.2026, validé par Léa) : quittent la liste principale
  de la fiche produit → section repliée **« Matchs passés »** en bas (historique, cliquable) ; masqués sur la page
  Action scenes. Rien n'est effacé. Match du jour les propose déjà à « Enlever » au match suivant (cocher Fait).
- **Retirer un sponsor d'un produit sans demande** (28.09.2026) : bouton « Retirer de ce produit… » dans le détail
  d'une ligne (Régie / admin, confirmation) → `statut = 'termine'`, `date_fin = aujourd'hui` (ligne + anneau couplé) ;
  disparaît des listes, reste dans l'historique. Pas de suppression réelle (réservée à l'admin en base).
  Pas encore de moyen de le remettre depuis l'outil.
  **LED 3M / 6M** : un emplacement existe toujours ; retirer le sponsor = l'emplacement **redevient libre (Banner
  HCFG) et à vendre**. Migration 20 : `v_plan_emplacements` ignore les lignes annulées / terminées **et** celles dont
  la `date_fin` est passée (retrait par demande « Suppression ») ; corrige aussi le doublon (ligne « libre » + nouveau
  sponsor) qu'on avait avec l'ancienne vue quand un emplacement était revendu.
  **Liste des fiches LED 3M / 6M = par emplacement** (28.09.2026, comme Airtable) : tous les emplacements de la bande
  dans l'ordre (anneau, position) ; sponsor du produit (rangée cliquable ; **une LED 6M = 2 rangées au même nom**, une par emplacement, décidé
  le 28.09.2026 ; les 2 rangées se mettent à jour ensemble),
  **« Banner HCFG » (libre)** sinon, « réservé club », ou sponsor d'un autre produit (ex. LED 3M sur la bande 6M :
  chargé dans `etat.autres`, rangée normale et cliquable avec un badge du produit ; `trouverLigne(id)` cherche dans
  les deux listes).
  En fin de fiche 3M : « LED 3M placées sur la bande 6M » puis « À placer ». Compteur « N Banner HCFG libres ».
- **État d'une diffusion = 3 informations seulement** (décidé le 26.09.2026, pour éviter la confusion
  case « Validé » / badge « programmé ») : **À l'écran / Pas à l'écran** (`validee`, migration 16 = « Validation
  saison 26/27 » d'Airtable), **⏸ Désactivé** + motif (`suspendue`, `motif_suspension`), **⏳ visuel attendu**
  (`visuel_attendu`, migration 18 ; l'ancien visuel passe en attendant ; s'enlève tout seul quand un visuel est
  validé). Dans la fiche produit : **une seule colonne « État »** (case + libellé), plus de colonne « Statut »
  technique ni de badges « validé / programmé » sur les visuels (seulement « à valider » quand il faut agir).
  Régie / admin : case À l'écran et **Remarques** (`consignes`) modifiables sur place ; **clic sur une ligne** =
  détail (État : À l'écran, Nouveau visuel attendu, Désactiver… / Réactiver ; visuels écran + anneau ; remarques ;
  matchs, emplacement, origine).
- Contenu club (HCFG, Banner) et ligue (National League…) = sponsors avec `origine` club / ligue.
- Tout le monde en Régie peut traiter les demandes et valider les fichiers. Pas de preuve photo exigée,
  mais il faut un **export de ce qui a été diffusé par match**.
- Produits hors Airtable (speaker, glace…) : **hors périmètre** (pas gérés par la Régie).
- **Champions League : pas traitée pour l'instant** (types de match inchangés : saison / playoffs / amical).
- **Répartition des rôles (décidé le 25.09.2026)** : c'est le **Sponsoring** qui précise ce qu'il faut diffuser
  (durée, nombre de passages, son, consignes…) dans sa demande. La **Régie ne gère pas les contrats** : on lui
  envoie ce qu'il faut afficher pour la saison. Le contrat reste un conteneur technique créé **automatiquement**
  (invisible à l'écran). Traiter une demande côté Régie = vérifier, placer sur les bandes LED, valider les fichiers.

## Base de données — points clés

- Tables : `profiles`, `saisons`, `matchs`, `produits`, `emplacements`, `sponsors`, `contrats`,
  `demandes`, `demandes_produits`, `lignes_vendues`, `lignes_matchs`, `lignes_emplacements`,
  `assets`, `passages`, `journal`.
- `passages` = une ligne vendue × un match ; **générés automatiquement** par `generer_passages(ligne)`
  (triggers sur lignes, lignes_matchs, contrats, matchs, assets). Ne jamais les créer à la main côté front.
- `assets` : version auto, contrôle auto (`conformite` jsonb : dimensions, format, durée, poids),
  seule la Régie/admin peut passer à `valide`/`refuse` (motif obligatoire), l'ancienne version est archivée.
- Une ligne passée à `vendu` devient `fichiers_attendus` → `a_valider` → `programme` selon ses fichiers.
- Vues (security_invoker) : `v_diffusions` (tout à plat), `v_capacite`, `v_alertes`,
  `v_preparation_colosseo` (ordre de saisie + colonne `changement`), `v_colosseo_retraits`, `v_plan_emplacements`.
- RPC : `rechercher_sponsors(q, nb)` (pg_trgm + alias), `renouveler_contrats(ids[], saison)`,
  `traiter_produit(p_demande, p_produit, p_suite, p_options)` avec suite = ajoute / visuel / retire / ignore
  (tout ou rien pour UN produit : sponsor repris par nom ou créé via `sponsor_de_demande`, contrat via
  `contrat_pour(sponsor, saison)`, ligne + ligne Anneau LED couplée si « avec anneau », lignes_matchs depuis les
  dates, emplacements, assets à valider ; marque le produit traité ; **demande → traitée quand tous ses produits
  sont traités**).
- Fichiers des demandes : bucket `assets`. **Par produit** : `demandes/<demande_id>/<produit_id>/<role>__<nom_sûr>`
  avec role = `visuel` (vidéo vidéotron, logo, visuel…) ou `anneau` (visuel anneau LED d'une Pub pause tiers
  « avec anneau »). Facultatifs à la demande (« Fichier à venir »). Autres fichiers (charte, zip) :
  `demandes/<demande_id>/<nom_sûr>`.
  Au traitement, les `assets` **pointent vers ces mêmes fichiers** (`storage_path` = chemin de la demande, pas de copie).
  Visuels déposés plus tard directement sur une ligne (à venir) : `<sponsor_id>/<ligne_id>/<fichier>`.

## Sécurité

- Rôles dans `profiles.role` : `sponsoring`, `regie`, `admin` ; `null` = compte en attente (ne voit rien).
- Inscription publique désactivée : les comptes sont créés par un admin (Authentication > Users).
  **Toutes les adresses acceptées depuis la migration 27** (décidé par Léa le 30.09.2026 : comptes pour des
  personnes hors club) : `handle_new_user` ne filtre plus le domaine, la page de connexion non plus. Garde-fous :
  inscription publique **désactivée** dans les deux projets (Authentication > Sign In / Providers) + nouveau compte
  **sans rôle** (ne voit rien) tant qu'un admin ne l'a pas activé.
- Lecture : tous les membres. **Sponsoring = faire des demandes et consulter** (décidé par Léa, migration 24) :
  écrit seulement `demandes`, `demandes_produits`, fichiers du stockage et `documents_sponsors` de ses demandes.
  Sponsors, contrats, diffusions (lignes, matchs, emplacements), visuels, dépôt dans un dossier sponsor : Régie + admin.
  **Régie = admin : mêmes droits** (décidé par Léa, migration 25 : `a_role` traite regie et admin comme
  interchangeables) ; référentiels (produits, emplacements, saisons, matchs / calendrier) et suppressions aussi pour la Régie.
  Les deux rôles restent distincts à l'affichage.
  À l'écran, toute action de modification est derrière `estRegie` (regie / admin).
- Helpers SQL : `mon_role()`, `est_membre()`, `a_role(...)`. `auth.uid()` est null dans le SQL Editor
  (c'est ce qui permet d'y nommer un admin).
- Ne jamais utiliser ni demander la clé `sb_secret_…` / service_role côté front.

## Conventions de code

- Noms en **français** (tables, colonnes, fonctions, variables, classes CSS), sans accents dans les identifiants.
- Une page = un fichier HTML + un module JS ; logique commune dans `app.js`. Chaque page protégée
  commence par `await exigerConnexion({ roles: [...] })`.
- Toujours échapper le texte venant de la base avec `echapper()` avant de l'injecter en HTML.
- Messages d'erreur clairs en français pour l'utilisateur ; libellés des enums dans `LIBELLES`.
- Mise en page responsive (390 px de large sans défilement horizontal).
- Navigation : **menu latéral gauche** (`MENU` dans `app.js` : rubriques avec un titre et les onglets dessous,
  compteur « à traiter » / « questions en attente » ; tiroir derrière ☰ sous 860 px). Ajouter une page = ajouter
  un lien dans `MENU`. Rubrique « Produits » : « Vue d'ensemble » + **une entrée par produit** générée par
  `menuProduits()` (sous-menus dépliables par catégorie, lien direct si la catégorie n'a qu'un produit, compteur
  « à ajouter » par produit, catégorie de la page ouverte dépliée). Le tout est dans « Tous les produits (N) »,
  **replié par défaut** (ouvert sur produits.html / produit.html, sinon dernier choix gardé en localStorage),
  avec le total « à ajouter » visible même replié. Catégories dans `CATEGORIES_UNE_PAGE` (aujourd'hui « Action
  scenes ») : **une seule entrée** vers `categorie.html` (tableau de toutes les scènes, filtre toutes/vendues/libres),
  aussi une seule carte dans la vue d'ensemble ; chaque scène reste cliquable vers sa fiche (pour « Ajouter »).
- **Fiches produit en onglets = la façon d'ouvrir les produits** (01.10.2026 : Léa remplace « Vue d'ensemble » par les onglets ; menu Produits → « Fiches produit », compteur à ajouter ; lien « ← Tous les produits » retiré sauf retour Action scenes ; produits.html reste accessible mais n'est plus dans le menu). Historique : **variante à tester (28.09.2026) : fiches produit en onglets**, comme les feuilles d'un classeur Excel. Menu Produits
  → « Fiches en onglets » (`produit.html` sans id = dernier onglet ouvert, gardé en localStorage `dernier-onglet`,
  sinon le premier produit). Barre `ongletsProduits(zone, { produit | categorie })` dans `app.js`, en haut de
  `produit.html` et `categorie.html`, **sous le titre**, onglets grands et bien visibles (demandé par Léa), collante sur ordinateur : un onglet par produit dans l'ordre d'importance,
  petit écart entre catégories, Action scenes = un seul onglet, compteur « à ajouter ». L'ancien menu dépliant
  « Tous les produits » est gardé en attendant le choix de Léa (garder l'un, l'autre ou les deux).
- Identité visuelle (25.09.2026) : **bleu nuit** (`--noir: #0f2240`, nom de variable historique) et blanc,
  fond gris bleuté, menu bleu nuit avec liseré blanc,
  titres avec `surtitre`, formulaires en étapes numérotées (`etape`, `etape-num`), choix en pastilles noires,
  statuts en couleur (liseré à gauche des lignes). Logo : `app/img/logo.jpg` (écusson triangulaire sur fond blanc,
  affiché dans un carré blanc arrondi ; monogramme « HCFG » s'il manque ; constante `LOGO` dans `app.js`),
  aussi utilisé comme icône d'onglet (`<link rel="icon">` sur chaque page). Détail d'une demande : colonne principale + colonne « Suivi / Historique »,
  actions dans la barre fixe `fenetre-pied`.
- Tests : sur le PC de Léa, **pas de Postgres local ni de navigateur automatisable** (Edge bloqué par l'IT
  pour Playwright / headless). Vérifier la syntaxe (`node --check`), tester la logique pure dans Node, puis
  faire tester Léa en vrai (Live Server) et lui demander une capture d'écran pour le rendu.

## Avancement

- [x] Cahier des charges validé (réponses de la Régie intégrées)
- [x] Base Supabase installée (01 → 04), compte admin de Léa créé
- [x] Connexion e-mail + mot de passe, mot de passe oublié, changement de mot de passe (connexion testée OK)
- [x] Nouvelle demande + file des demandes (traitement : en cours / question / traitée)
- [x] Détail d'une demande en **fenêtre centrée** (plein écran sur mobile) + **historique complet**
      (créée, prise en charge, question, réponse, traitée, rouverte), reconstruit depuis `journal` — pas de table dédiée
- [x] Demande « Quand ? » = **Saison 2026-27 (dès maintenant)** ou **Au match** (une ou plusieurs dates ;
      cases à cocher si le calendrier est chargé, sinon saisie libre des dates) — migration 05 exécutée (25.09.2026).
      Les dates sont stockées en `date[]` ; la Régie les rattache aux matchs lors du traitement.
- [x] Calendrier des matchs : page `calendrier.html` (liste, ajout manuel, import d'un **fichier .ics**
      (« Télécharger ICS » sur sihf.ch) ou d'une liste collée (Excel, page sihf.ch) avec aperçu, matchs à l'extérieur écartés, numérotation chronologique auto) —
      migration 06 exécutée, calendrier 2026-27 importé (25.09.2026)
- [x] Demande : **détails par produit** (migrations 07, 08, 09 exécutées ; testé OK par Léa le 25.09.2026),
      son + anneau LED, fichiers par produit. Chaque produit coché a son propre
      « Quand ? » (**toute la saison** ou **seulement certains matchs**, cochés dans le calendrier), une durée de
      spot **facultative** pour les produits vidéo (plus tard : reprise automatiquement de la vidéo), une
      **Remarque Sponsoring** et une **Remarque Régie** (modifiable par la Régie dans le détail). Pas de nombre de
      passages, pas de zone ni de nombre d'emplacements LED (6M = 2 × 3M automatiquement), slides = logo seul.
      **Plus de zone « Autres fichiers »** en fin de formulaire (retirée le 28.09.2026 : sinon le Sponsoring y met
      tout au lieu de ranger par produit) ; tous les fichiers se déposent dans le produit concerné.
      Une phrase explique chaque produit (ex. « Anneau LED · passe pendant le match » ≠ bandes LED 3M / 6M).
      Le « Quand ? » global (05) n'est plus rempli ; il reste affiché pour les anciennes demandes.
- [x] Refonte visuelle : bleu nuit, logo, menu latéral, étapes numérotées, liste lisible, détail en 2 colonnes
      (migration 10 : noms des catégories — exécutée)
- [x] **Traitement par les fiches produit** (décidé le 25.09.2026 ; migrations 11 et 12 exécutées ; « Ajouter »
      testé OK par Léa le 25.09.2026 : sponsor créé, anneau couplé, LED placée, demande passée en « Traitée »). Comme dans Airtable : la Régie travaille **produit par produit**. Une page de traitement en étapes a été
      essayée puis **abandonnée** (trop compliquée, « ça sert à rien »). Menu « Produits » → `produits.html` (fiches
      par catégorie, badge « N à ajouter ») → `produit.html?id=` : en haut **« À ajouter »** (demandes reçues pour ce
      produit, avec fichiers, dimensions lues, avertissement si nom de sponsor proche), boutons **Ajouter ✓** /
      Mettre le nouveau visuel (changement de visuel) / Retirer (suppression) / Ignorer ; dessous **« Sur ce
      produit »** (sponsors, quand, son, anneau, emplacement, visuel, statut, remarques). Nouveau sponsor créé
      automatiquement. LED : on met le logo **là où il y a un Banner HCFG** (emplacement libre), clic sur le plan,
      facultatif. Fiche LED 3M : seulement la bande 3M (A/B) ; la bande 6M n'apparaît **que si la 3M est pleine**.
      Fiche LED 6M : seulement la bande 6M (C/D). Dans le détail d'une demande : état par produit (« Ajouté le … par … » / « À ajouter ») + lien vers
      la fiche ; « Marquer comme traitée » reste en secours.
- [ ] **Par match** (`matchs.html`, menu Saison, pas encore testé) : pour chaque match (à venir / avec ventes au
      match / passés), les lignes vendues **au match** (produit, sponsor, son, état du visuel) et les produits de
      demandes « au match » pas encore ajoutés (lien vers la fiche produit). Future porte d'entrée de la
      préparation Colosseo.
- [ ] **Ajouter = valider le visuel** (décidé le 25.09.2026, migration 13 à exécuter par Léa) : pas de page de
      validation séparée pour les demandes ; « Ajouter » / « Mettre le nouveau visuel » créent les visuels
      directement validés (l'ancien est archivé). Bouton « Valider » dans « Sur ce produit » pour un visuel resté
      « à valider ». Une vraie page de validation ne servira que si des fichiers arrivent hors demande
      (cf. question « fichier qui arrive après la demande »).
- [ ] **Dossiers sponsors** (demandé le 28.09.2026, migration 19 à exécuter, pas encore testé) : menu « Sponsors »
      → `sponsors.html` → `sponsor.html?id=` : **ce qu'il a** (produits en cours, quand, état), **documents reçus**
      (table `documents_sponsors` : nom, type, produit, reçu le / par, note, lien vers la demande, Télécharger) et
      ses demandes. Le « dossier » est **dans l'outil** (fichiers dans le bucket, pas de copie) : les fichiers joints à
      une demande y sont inscrits automatiquement (demande.js ; nouveau sponsor : trigger quand la demande reçoit
      son sponsor_id) ; on peut aussi y déposer un document reçu hors demande (`sponsors/<sponsor_id>/<horodatage>__<fichier>`).
      Suppression d'un document : admin seulement (pas encore de bouton).
      **Import en masse** (30.09.2026, demandé par Léa, pas encore testé) : menu Sponsors → « Importer des dossiers »
      (Régie / admin ; lien de menu filtré par `roles`). Léa choisit un dossier (pas de zip) avec **un sous-dossier par
      sponsor** ; aperçu : sous-dossier → sponsor (`rapprochement.js` : même nom, alias, puis « contient », marqué « à
      vérifier » ; correction via une case avec liste), fichiers > 50 Mo refusés (limite Supabase gratuit, alerte au-delà
      de ~900 Mo au total), déjà présents ignorés (même sponsor + nom + taille : on peut relancer). Envoi 3 à la fois
      vers `sponsors/<sponsor_id>/…` + ligne `documents_sponsors` (note « Import des dossiers de la saison 26-27 ») ;
      si le nom du fichier (sans extension) = nom d'un visuel importé sans fichier, l'asset reçoit `storage_path` →
      **Télécharger** dans Match du jour et les fiches. Ne jamais déposer à la main dans Supabase Storage.
      Diffusion **sans fichier à elle** (ex. Sponsor du match importé sans nom de visuel) : Match du jour (carte) et le
      détail d'une diffusion (section « Dossier du sponsor ») proposent les fichiers du **dossier du sponsor** avec
      Télécharger (ceux du même produit d'abord). Signalé par Léa le 30.09.2026 (Comptoir Gruérien).
      **Match du jour → bouton d'un changement = fenêtre « comme une demande »** (demandé par Léa le 30.09.2026, avec
      captures) : ouverte sur la page même (`ouvrirChangement`), mise en page de demandes.html (`detail-produit`,
      `suivi-produit`, badges saison / matchs / son / anneau, liste des matchs, emplacement, durée, **Fichiers** : visuel,
      ancien visuel, visuel de l'anneau, dossier du sponsor, tous avec Télécharger ; Remarques + « Pourquoi ce
      changement » ; à droite Suivi : origine (import Airtable / lien vers la demande), demande traitée par, fait dans
      Colosseo) ; pied : bouton « ✓ Fait dans Colosseo » (même effet que la case) ; lien « Ouvrir la fiche → ».
      Les demandes pas encore traitées ouvrent la vraie demande (demandes.html?id=…&retour=…).
- [ ] **Match du jour** (28.09.2026, migration 22 à exécuter, pas encore testé). **But n° 1 de l'outil : faciliter la
      vie de la Régie le jour de match, rester simple.** Décidé avec Léa : les playlists Colosseo **restent** d'un
      match à l'autre ; la Régie prépare **le jour du match** ; « changement » = **depuis le match précédent**.
      Page `match-du-jour.html` = page d'arrivée de la Régie / admin (connexion.js, logo du menu ; Sponsoring →
      demandes). **Réservée Régie / admin** (30.09.2026, Léa : le Sponsoring ne touche pas à Colosseo) : lien caché
      du menu, « Accès réservé » sinon : bilan en une ligne (« N choses à faire dans Colosseo » / « ✓ Rien à changer »), demandes pas
      traitées, **À faire dans Colosseo** par produit (➖ enlever / ➕ ajouter / 🔄 remplacer le visuel, avec sponsor,
      raison, emplacement LED, son, visuel, Télécharger, case **Fait** partagée = table `colosseo_fait`), puis
      **Ce qui passe** (playlist repliée par produit, ordre de diffusion). Choix d'un autre match (liste).
      Calcul : passages du match vs match précédent (**le dernier joué, même de la saison d'avant** : 1er match de
      saison comparé à la fin de la saison précédente, décidé le 30.09.2026) ; un passage « passe » si statut prévu / diffusé.
      Migration 22 : `generer_passages` met les passages futurs en `suspendu` si la ligne n'est pas À l'écran ou
      est désactivée (les matchs passés restent figés = historique) ; point de départ aligné sur l'état actuel.
      **Le nom « Anneau LED pause tiers » ne doit jamais s'afficher** (rappel de Léa le 28.09.2026) : l'anneau fait
      partie (ou non) de la Pub pause tiers. Dans Match du jour : ajout / retrait de l'anneau fusionné avec sa Pub
      pause tiers (« avec anneau LED (visuel) »), sinon « Ajouter / Enlever l'anneau LED », « Remplacer le visuel de
      l'anneau LED » sous Pub pause tiers ; playlist : badge « + anneau LED ». Attention : `ligne_couplee_id` est posé
      **dans les deux sens** (Pub ↔ anneau) ; l'anneau se reconnaît à son produit **inactif**.
      **Demandes pas encore traitées dans « À faire dans Colosseo »** (demandé par Léa) : les produits de demandes
      non ajoutés qui concernent ce match (saison, ou « au match » avec cette date) apparaissent en tête de leur
      produit (📨 « Demande à ajouter » / « Nouveau visuel demandé » / « Retrait demandé », son, anneau, durée,
      remarque, bouton **Traiter** → fiche produit ; Sponsoring : « en attente de la Régie ») et comptent dans le
      bilan (« dont N demandes à traiter d'abord »). Une fois ajoutée, la demande devient un vrai changement.
      Le lien du haut ne montre plus que les **autres** demandes en cours (pas pour ce match, questions).
      Les **fichiers de la demande** (dossier `demandes/<demande>/<produit>/` du bucket) sont listés dans la carte avec
      **Télécharger** (vidéo vidéotron, visuel anneau LED, logo…) ou « ⏳ Fichier à venir » — pour les mettre dans
      Colosseo sans changer de page (demandé par Léa).
      Bouton de la demande = « Ajouter » (pour Léa, « traiter » et « ajouter » c'est pareil). Mais **« traitée » ≠
      « fait »** (corrigé par Léa) : traitée = ajoutée dans l'outil ; fait = mis dans Colosseo. Donc PAS de « Fait »
      automatique : le changement issu d'une demande affiche « Demande traitée par … le … » (info) et garde sa case Fait.
      **Libellés** (01.10.2026, demandé par Léa) : « Ajouter à <produit> » / « Enlever de <produit> » (ex. « Ajouter à
      Sponsor du match », « Ajouter à Action scene · Goal ») ; LED : « Mettre le logo » / « remettre Banner HCFG ». **Chaque changement a un bouton** (Ajouter / Remplacer / Voir)
      qui ouvre la diffusion sur sa fiche (`produit.html?id=…&ligne=…&retour=match-du-jour.html?match=…` : détail
      ouvert, visuels avec **Télécharger** ; fermer = retour au Match du jour).
      **« Pour ce soir »** (demandé par Léa, migration 26) : bloc sous le bilan pour les infos générales du match et
      les tâches hors sponsors (📝 info / ☐ tâche à cocher, qui / quand, ✕ supprimer) ; Régie / admin écrivent,
      Sponsoring lit ; le bilan compte les tâches restantes. Caché si la table n'existe pas encore.
      « Retirer de ce produit » met maintenant `date_fin = hier` (ne passe plus dès le prochain match, même le soir même).
- [ ] Préparation Colosseo par match (+ case « saisi dans Colosseo », zip des fichiers, retraits)
- [ ] Vue produit, grille de capacité, plan des emplacements LED
- [ ] Export « diffusé au match » (PDF / CSV), pointage après match
- [ ] Administration : utilisateurs et rôles, calendrier des matchs (import CSV), produits
- [ ] Renouvellement de saison
- [x] **Migration des données Airtable** (importée avec succès le 25.09.2026, 2e essai) : 467 sponsors, 649 diffusions.
      Règles : LED = une ligne CSV par emplacement dans l'ordre (37 par anneau) ; sur la bande 6M, 2 lignes identiques
      consécutives = LED 6M, sinon LED 3M sur bande 6M ; « Banner HCFG » = emplacement libre (rien créé) ;
      « désactivé » (Validation régie) = ligne suspendue ; non coché « Validation saison 26/27 » = importé avec
      « ⚠ Non validé » dans les consignes ; noms de visuels = assets **validés** sans fichier (trigger assets_avant
      désactivé le temps de l'import) ; lignes « Youngs/Ladies » de la Pub pause tiers ignorées (vidéos des slides) ;
      « Emplacement au match » = lignes au match (dates -> matchs du calendrier), et leur ligne saison de la Pub pause
      tiers n'est pas importée (durée/son/anneau reportés). Feuille « Nouveaux Sponsors » (historique) non importée.
      Garde-fou : table `imports_donnees` (import une seule fois). Annulation : lignes `created_by is null` sans demande.
- [ ] **Mise en ligne** (décidé : **dépôt GitHub privé + Netlify**, gratuit). Dépôt transféré le 29.09.2026 dans
      l'organisation de l'entreprise : **`HC-Fribourg-Gotteron-SA/app-regie`** (remote `origin` mis à jour) ; Netlify à
      relier au dépôt de l'organisation (Project configuration → Build & deploy → Manage repository). Dépôt Git local créé (branche `main`,
      premier commit ; identité Git du projet = Léa Talon). `.gitignore` : **jamais les données réelles**
      (`import-airtable/`, `supabase/import_airtable_2026-27.sql`). `netlify.toml` : publie le dossier `app/` tel quel.
      Reste : publier sur GitHub (VS Code → Contrôle de code source → « Publish Branch » → dépôt **privé**), relier
      Netlify au dépôt, puis dans Supabase **Authentication → URL Configuration** : Site URL = adresse Netlify et
      `https://<site>.netlify.app/**` dans Redirect URLs (mot de passe oublié). SMTP Brevo : plus tard, facultatif.

## Valeurs encore à confirmer

- Durée d'affichage d'une slide : 5 s (estimation).
- 74 emplacements **par bande** (lu dans Airtable) plutôt que 74 au total.
- Largeur du visuel de l'anneau LED et capacité de l'anneau (vides).
- Les 5 emplacements NORD-OUEST « réservés club » par bande : peut-on y mettre un logo sponsor (ils affichent
  aussi Banner HCFG) ? Pour l'instant non cliquables.
- ~~Fichier qui arrive après la demande~~ : **option A choisie le 01.10.2026** (voir point 00 en haut).

## Pièges connus

- Toute adresse de retour d'un e-mail Supabase (mot de passe oublié) doit être dans
  Authentication > URL Configuration > Redirect URLs, sinon Supabase renvoie vers la Site URL
  (`connexion.js` rattrape ce cas pour la récupération de mot de passe).
- L'envoi d'e-mails par défaut de Supabase est limité à quelques e-mails par heure : brancher le SMTP Brevo en production.
- Pas d'option « Magic Link » à activer dans Supabase : ne pas la mentionner.
- **Connecteur Brevo de claude.ai : Léa ne veut pas le connecter** : ne plus le proposer, même si un message
  système le signale. Brevo ne servira (éventuellement) que comme SMTP dans les réglages Supabase, à la mise en ligne.
- **SQL Editor de Supabase** : ne pas compter sur `begin; … commit;`, les tables temporaires ni les fonctions
  `pg_temp` (le premier import a échoué : « relation import_remarques does not exist »). Pour un traitement
  « tout ou rien », tout mettre dans **un seul bloc `do $x$ … $x$;`** ; tables/fonctions d'aide = objets normaux,
  supprimés ensuite. Le résultat affiché est celui de la **dernière** instruction (mettre le `select` de résumé à la fin).
