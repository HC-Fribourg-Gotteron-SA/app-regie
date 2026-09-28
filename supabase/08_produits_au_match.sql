-- =====================================================================
-- 08 — Produits proposés « au match » par défaut
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 07.
-- =====================================================================
-- Tout produit peut être pris à la saison OU pour un ou plusieurs matchs
-- (le choix se fait dans la demande). produits.mode_vente ne sert plus
-- qu'à pré-cocher le choix : 'match' = « Seulement certains matchs ».
-- Les Action scenes se prennent en principe à la saison, sauf celles qui
-- se prennent pour un match, comme le Sponsor du match.

update produits set mode_vente = 'match'
where nom in ('Sponsor du match', 'Action scene – Sponsor du match');
