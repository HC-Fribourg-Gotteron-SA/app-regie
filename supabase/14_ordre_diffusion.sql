-- =====================================================================
-- 14 — Ordre de diffusion des sponsors dans chaque produit
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 13.
-- =====================================================================
-- lignes_vendues.priorite = rang de diffusion dans le produit (1, 2, 3…).
-- L'import Airtable a créé les diffusions dans l'ordre des feuilles Airtable
-- (= ordre de diffusion) ; cet ordre est retrouvé grâce au journal (numéro
-- d'enregistrement croissant). Les nouvelles diffusions se placent à la fin.

-- 1) Ordre actuel, retrouvé dans le journal (ordre de création)
with ordre as (
  select l.id,
         row_number() over (partition by l.produit_id
                            order by coalesce(j.premier, 9223372036854775807), l.created_at, l.id) as rang
  from lignes_vendues l
  left join (select ligne_id, min(id) as premier
             from journal where table_nom = 'lignes_vendues' and action = 'insert'
             group by ligne_id) j on j.ligne_id = l.id
)
update lignes_vendues l set priorite = o.rang
from ordre o
where o.id = l.id and l.priorite is distinct from o.rang;

-- 2) Toute nouvelle diffusion se place à la fin de son produit
create or replace function tg_ligne_priorite() returns trigger language plpgsql as $$
begin
  if new.priorite is null then
    select coalesce(max(priorite), 0) + 1 into new.priorite
    from lignes_vendues where produit_id = new.produit_id;
  end if;
  return new;
end $$;

drop trigger if exists lignes_priorite on lignes_vendues;
create trigger lignes_priorite before insert on lignes_vendues
  for each row execute function tg_ligne_priorite();

select 'Ordre de diffusion enregistré pour ' || count(*) || ' diffusions.' as "Résultat"
from lignes_vendues where priorite is not null;
