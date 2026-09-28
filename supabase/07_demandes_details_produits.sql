-- =====================================================================
-- 07 — Demandes : détails par produit
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 06.
-- =====================================================================
-- Chaque produit d'une demande a son propre « Quand ? » (saison ou
-- certains matchs), une durée de spot facultative et deux remarques :
-- celle du Sponsoring et celle de la Régie.
-- Le « Quand ? » global de la demande (migration 05) n'est plus rempli
-- par le formulaire ; il reste pour les demandes déjà saisies.

alter table demandes_produits
  add column if not exists type_vente          type_vente not null default 'saison',
  add column if not exists dates_matchs        date[],          -- jours de match (vente au match)
  add column if not exists duree_s             int check (duree_s is null or duree_s > 0),
  add column if not exists remarque_sponsoring text,
  add column if not exists remarque_regie      text;

alter table demandes_produits drop constraint if exists demandes_produits_dates_si_match;
alter table demandes_produits add constraint demandes_produits_dates_si_match
  check (type_vente <> 'match' or coalesce(cardinality(dates_matchs), 0) > 0);

-- La saison active est rattachée à toute nouvelle demande
create or replace function tg_demande_saison() returns trigger language plpgsql as $$
begin
  if new.saison_id is null then
    select id into new.saison_id from saisons where active limit 1;
  end if;
  return new;
end $$;
