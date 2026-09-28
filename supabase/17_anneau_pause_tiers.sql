-- =====================================================================
-- 17 — « Anneau LED pause tiers » séparé de l'« Anneau LED » (pendant le match)
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 16.
-- =====================================================================
-- Deux choses différentes :
--   - Anneau LED = bandeaux pendant le match (feuille « LED match » d'Airtable), un produit à part ;
--   - l'anneau de la Pub pause tiers = COMPRIS dans la Pub pause tiers (option « Avec anneau LED »).
-- Pour la base, l'anneau de la pause tiers garde sa propre ligne couplée (son visuel, son temps),
-- rattachée à un produit technique « Anneau LED pause tiers » INACTIF : il n'apparaît ni dans le
-- menu, ni dans les produits, ni dans le formulaire ; il s'affiche dans la fiche Pub pause tiers.
-- Peut être exécuté plusieurs fois.

do $anneau$
declare
  v_anneau  uuid := (select id from produits where nom = 'Anneau LED');
  v_ppt     uuid := (select id from produits where nom = 'Pub pause tiers');
  v_nouveau uuid;
begin
  -- 1) Le produit technique, inactif (mêmes formats que l'Anneau LED)
  insert into produits (nom, categorie, famille, support, mode_vente, moment_defaut,
                        largeur_px, hauteur_px, formats, ordre, actif)
  select 'Anneau LED pause tiers', ppt.categorie, 'temps', 'Anneau LED', 'saison', 'pause_tiers',
         a.largeur_px, a.hauteur_px, a.formats, ppt.ordre, false
  from produits ppt, produits a
  where ppt.id = v_ppt and a.id = v_anneau
    and not exists (select 1 from produits where nom = 'Anneau LED pause tiers');
  update produits set actif = false where nom = 'Anneau LED pause tiers';
  select id into v_nouveau from produits where nom = 'Anneau LED pause tiers';

  -- 2) La Pub pause tiers est désormais couplée à ce produit
  update produits set lie_a_produit_id = v_nouveau where id = v_ppt;

  -- 3) Les anneaux couplés aux Pub pause tiers changent de produit (ordre conservé)
  update lignes_vendues a set produit_id = v_nouveau
  from lignes_vendues p
  where a.produit_id = v_anneau
    and p.id = a.ligne_couplee_id and p.produit_id = v_ppt;

  -- 4) Renumérotation de l'ordre de diffusion dans les deux produits
  with rangs as (
    select id, row_number() over (partition by produit_id order by priorite nulls last, created_at, id) as rang
    from lignes_vendues where produit_id in (v_anneau, v_nouveau)
  )
  update lignes_vendues l set priorite = r.rang
  from rangs r where r.id = l.id and l.priorite is distinct from r.rang;
end $anneau$;

select p.nom as "Produit", count(l.id) as "Diffusions"
from produits p left join lignes_vendues l on l.produit_id = p.id
where p.nom in ('Anneau LED', 'Anneau LED pause tiers')
group by p.nom order by p.nom;
