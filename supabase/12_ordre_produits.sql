-- =====================================================================
-- 12 — Ordre des produits par importance
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 11.
-- =====================================================================
-- produits.ordre : plus petit = plus important. Sert au menu, à la vue
-- d'ensemble des produits et au formulaire de demande. Une catégorie se
-- place selon son produit le plus important ; à égalité (100), ordre
-- alphabétique.

alter table produits add column if not exists ordre int not null default 100;

update produits set ordre = 100;
update produits set ordre = 1 where categorie = 'Action scenes';
update produits set ordre = 2 where nom = 'Angles match';
update produits set ordre = 3 where nom = 'Anneau LED';
update produits set ordre = 4 where nom in ('LED 3M', 'LED 6M');
update produits set ordre = 5 where nom = 'Pub pause tiers';
update produits set ordre = 6 where nom like 'LED Sportcaf%';
update produits set ordre = 7 where categorie in ('Slides Young Dragons', 'Young Dragons');
update produits set ordre = 8 where categorie in ('Slides Ladies', 'Ladies');
