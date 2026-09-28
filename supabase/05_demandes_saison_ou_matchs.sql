-- =====================================================================
-- 05 — Demandes : « Saison » ou « Au match » (une ou plusieurs dates)
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 04.
-- =====================================================================
-- Remplace, pour les nouvelles demandes, le choix « dès que possible /
-- à partir d'un match / à partir d'une date ». Les anciennes colonnes
-- date_effet et match_effet_id restent pour les demandes déjà saisies.

alter table demandes
  add column if not exists type_vente   type_vente,                          -- 'saison' ou 'match'
  add column if not exists saison_id    uuid references saisons (id),
  add column if not exists dates_matchs date[];                              -- jours de match choisis (vente au match)

alter table demandes drop constraint if exists demandes_dates_si_match;
alter table demandes add constraint demandes_dates_si_match
  check (type_vente is distinct from 'match' or coalesce(cardinality(dates_matchs), 0) > 0);

-- Saison active par défaut
create or replace function tg_demande_saison() returns trigger language plpgsql as $$
begin
  if new.saison_id is null and new.type_vente is not null then
    select id into new.saison_id from saisons where active limit 1;
  end if;
  return new;
end $$;

drop trigger if exists demandes_saison on demandes;
create trigger demandes_saison before insert on demandes
  for each row execute function tg_demande_saison();
