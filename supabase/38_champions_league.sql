-- =====================================================================
-- 38 — Type de match « Champions League »
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (05.10.2026) : importer les matchs de Champions League (CHL) au calendrier.
-- Ce qu'on affiche en CHL n'est PAS la playlist de la saison : un sponsor pris « à la saison » n'y passe pas
-- (matchs_de_ligne ne prend que les matchs « saison », et les playoffs si la diffusion les inclut) ; seuls les
-- produits vendus pour ces matchs (« Seulement certains matchs ») y passent. Rien d'autre à changer en base.
-- (Playoffs : même playlist que la saison + des produits en plus — à voir plus tard avec Léa.)

alter type type_match add value if not exists 'champions_league';

select 'Migration 38 OK : type de match « Champions League »' as "Résultat";
