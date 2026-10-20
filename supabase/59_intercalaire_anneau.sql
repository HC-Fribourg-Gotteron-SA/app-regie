-- =====================================================================
-- 59 — Anneau LED : intercalaire après chaque sponsor (fond transparent, 5 s)
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (20.10.2026, capture de la playlist Colosseo) : après chaque sponsor de l'Anneau LED, on met le nôtre,
-- « fond_Transparent.png » de 5 s. Affiché dans la liste de la fiche (ligne grise après chaque sponsor) et compté
-- dans la durée totale. Nom et durée réglés par produit (un admin peut les changer sur la fiche).
alter table produits
  add column if not exists intercalaire_nom text,      -- ex. fond_Transparent.png
  add column if not exists intercalaire_s   int check (intercalaire_s is null or intercalaire_s > 0);

update produits set intercalaire_nom = 'fond_Transparent.png', intercalaire_s = 5
where nom = 'Anneau LED' and intercalaire_s is null;

select nom as "Produit", intercalaire_nom as "Intercalaire", intercalaire_s as "Durée (s)"
from produits where intercalaire_s is not null;
