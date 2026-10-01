-- =====================================================================
-- 29 — Ordre des produits = déroulé de la soirée
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Décidé par Léa (01.10.2026) : onglets, menu et listes dans l'ordre de la soirée.
--   1 Action scenes, 2 Pub warm-up (pendant le warm-up), 3 Pub après warm-up, 4 Pub pause tiers,
--   puis l'ordre d'avant : Angles match, Anneau LED, LED 3M / 6M, LED Sportcafé, Slides Young Dragons,
--   Slides Ladies ; le reste (ex. Pub arrêt de jeu) à 100, par ordre alphabétique.

update produits set ordre = 100;
update produits set ordre = 1  where categorie = 'Action scenes';
update produits set ordre = 2  where nom = 'Pub warm-up';
update produits set ordre = 3  where nom = 'Pub après warm-up';
update produits set ordre = 4  where nom = 'Pub pause tiers';
update produits set ordre = 5  where nom = 'Angles match';
update produits set ordre = 6  where nom = 'Anneau LED';
update produits set ordre = 7  where nom in ('LED 3M', 'LED 6M');
update produits set ordre = 8  where nom like 'LED Sportcaf%';
update produits set ordre = 9  where categorie in ('Slides Young Dragons', 'Young Dragons');
update produits set ordre = 10 where categorie in ('Slides Ladies', 'Ladies');

select ordre as "Ordre", string_agg(nom, ', ' order by nom) as "Produits"
from produits where actif and categorie is distinct from 'Action scenes'
group by ordre order by ordre;
