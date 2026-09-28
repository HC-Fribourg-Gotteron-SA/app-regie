-- =====================================================================
-- 10 — Noms des catégories de produits (vocabulaire de la Régie)
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 09.
-- =====================================================================
-- Les catégories servent à regrouper les produits dans le formulaire de demande.

update produits set categorie = 'Anneau LED 3M & 6M'   where categorie = 'LED bandes';
update produits set categorie = 'LED Sportcafé'        where categorie = 'Sportcafé';
update produits set categorie = 'Slides Ladies'        where categorie = 'Ladies';
update produits set categorie = 'Slides Young Dragons' where categorie = 'Young Dragons';
update produits set categorie = 'Vidéotron pub (warm-up, après warm-up, pause tiers, arrêt de jeu)'
where categorie = 'Vidéotron';
