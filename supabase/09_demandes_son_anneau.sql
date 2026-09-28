-- =====================================================================
-- 09 — Demandes : son et anneau LED pour les pubs vidéotron
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 08.
-- =====================================================================
-- Pub pause tiers : vidéotron avec ou sans son, avec ou sans anneau LED
-- (4 combinaisons). Le son est demandé pour toutes les pubs vidéotron ;
-- l'anneau pour les produits reliés à l'anneau (produits.lie_a_produit_id).
-- Au traitement, « avec anneau » créera une ligne Anneau LED couplée
-- (lignes_vendues.ligne_couplee_id) et avec_son alimentera la ligne vendue.

alter table demandes_produits
  add column if not exists avec_son    boolean,   -- null = sans objet pour ce produit
  add column if not exists avec_anneau boolean;   -- null = sans objet pour ce produit
