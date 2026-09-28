-- =====================================================================
-- 26 — « Pour ce soir » : infos générales et tâches d'un match (hors sponsors)
-- À exécuter une fois dans Supabase > SQL Editor, après 25.
-- =====================================================================
-- Dans Match du jour, la Régie note pour l'équipe :
--   • des infos (« match télévisé, pause tiers raccourcie », « arrivée 17h ») ;
--   • des tâches à cocher (« tester le micro », « charger la vidéo de l'hommage »).
-- Écrire / cocher : Régie et admin. Lire : tous les membres.

create table if not exists notes_match (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matchs (id) on delete cascade,
  type       text not null default 'info' check (type in ('info', 'tache')),
  texte      text not null check (length(trim(texte)) > 0),
  fait       boolean not null default false,
  fait_par   uuid references profiles (id),
  fait_le    timestamptz,
  cree_par   uuid references profiles (id) default auth.uid(),
  cree_le    timestamptz not null default now()
);
create index if not exists notes_match_match on notes_match (match_id);

-- Qui a coché la tâche, et quand
create or replace function tg_note_faite() returns trigger language plpgsql as $$
begin
  if new.fait is distinct from old.fait then
    new.fait_par := case when new.fait then auth.uid() end;
    new.fait_le  := case when new.fait then now() end;
  end if;
  return new;
end $$;
drop trigger if exists notes_match_fait on notes_match;
create trigger notes_match_fait before update of fait on notes_match
  for each row execute function tg_note_faite();

alter table notes_match enable row level security;
drop policy if exists notes_match_lecture on notes_match;
drop policy if exists notes_match_ecriture on notes_match;
create policy notes_match_lecture on notes_match for select to authenticated using (est_membre());
create policy notes_match_ecriture on notes_match for all to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));

select 'Table notes_match prête.' as "Résultat";
