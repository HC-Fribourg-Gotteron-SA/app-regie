-- =====================================================================
-- 35 — « Avec / sans anneau LED » pour tous les produits du vidéotron
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (02.10.2026) : comme la Pub pause tiers, toute pub du vidéotron (warm-up, après warm-up,
-- arrêt de jeu…) et chaque action scene peut avoir, ou non, un visuel sur l'anneau LED en même temps.
-- Ce n'est PAS le produit « Anneau LED » (bandeaux pendant le match) : l'anneau est compris dans le produit.
-- Même mécanisme que la migration 17 : la ligne de l'anneau est rattachée à un produit technique INACTIF
-- (jamais affiché), ici « Anneau LED couplé », partagé par tous ces produits. La Pub pause tiers garde le sien.
-- Concernés : produits actifs du vidéotron (support « Vidéotron »), sauf les slides, qui n'ont pas encore d'anneau.

do $anneau$
declare
  v_anneau  uuid := (select id from produits where nom = 'Anneau LED');
  v_couple  uuid;
begin
  -- 1) Le produit technique, inactif (mêmes formats que l'Anneau LED)
  insert into produits (nom, categorie, famille, support, mode_vente, largeur_px, hauteur_px, formats, ordre, actif)
  select 'Anneau LED couplé', a.categorie, 'temps', 'Anneau LED', 'saison', a.largeur_px, a.hauteur_px, a.formats, 100, false
  from produits a
  where a.id = v_anneau
    and not exists (select 1 from produits where nom = 'Anneau LED couplé');
  update produits set actif = false where nom = 'Anneau LED couplé';
  select id into v_couple from produits where nom = 'Anneau LED couplé';
  if v_couple is null then
    raise exception 'Produit « Anneau LED » introuvable : impossible de créer « Anneau LED couplé »';
  end if;

  -- 2) Les produits du vidéotron sont couplés à ce produit (la Pub pause tiers garde son anneau à elle)
  update produits
  set lie_a_produit_id = v_couple
  where actif and support = 'Vidéotron' and famille <> 'slide' and lie_a_produit_id is null;
end $anneau$;

select p.nom as "Produits qui proposent maintenant « Avec / sans anneau LED »", a.nom as "Anneau (technique, jamais affiché)"
from produits p join produits a on a.id = p.lie_a_produit_id
where p.actif
order by p.ordre, p.categorie, p.nom;
