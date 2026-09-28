-- =====================================================================
-- 16 — Case « Validé » sur chaque diffusion
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 15.
-- =====================================================================
-- « Validé » = la diffusion passe à l'écran cette saison (colonne « Validation
-- saison 26/27 » d'Airtable). Quand un nouveau visuel est attendu, la diffusion
-- reste validée et l'ancien visuel est diffusé en attendant.
-- La Régie / l'admin cochent ou décochent directement dans la fiche produit.

alter table lignes_vendues
  add column if not exists validee    boolean not null default true,
  add column if not exists validee_le timestamptz,
  add column if not exists validee_par uuid references profiles (id);

-- Import Airtable : « ⚠ Non validé saison 26/27 » devient la case décochée
update lignes_vendues
set validee = false,
    consignes = nullif(trim(both E'\n ' from replace(consignes, '⚠ Non validé saison 26/27 dans Airtable', '')), '')
where consignes like '%⚠ Non validé saison 26/27 dans Airtable%';

-- Qui a coché / décoché, et quand
create or replace function tg_ligne_validee() returns trigger language plpgsql as $$
begin
  if new.validee is distinct from old.validee then
    new.validee_le  := now();
    new.validee_par := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists lignes_validee on lignes_vendues;
create trigger lignes_validee before update of validee on lignes_vendues
  for each row execute function tg_ligne_validee();

select count(*) filter (where validee) || ' diffusions validées, '
       || count(*) filter (where not validee) || ' non validées.' as "Résultat"
from lignes_vendues;
