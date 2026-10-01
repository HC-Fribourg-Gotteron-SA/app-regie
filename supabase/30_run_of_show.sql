-- =====================================================================
-- 30 — Run of show : déroulé minuté de chaque match + rôle « Chrono & animation »
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (01.10.2026), sur le modèle du « Jumbotron Operator Rundown » de la CHL :
--   • un run of show par match : des lignes minutées par rapport au face-off (heure du calendrier),
--     aux pauses ou à la fin du match, ou « à la suite » de la ligne précédente ;
--   • des modèles (ex. « CHL standard », « National League standard ») copiés pour un match puis ajustés ;
--   • la Régie (et l'admin) crée et modifie ; tout le monde consulte ;
--   • nouveau rôle « animation » (Chrono & animation) : voit UNIQUEMENT le run of show.
-- Les heures des pauses ne sont connues que le soir même : la Régie clique « Pause 1 commence »
-- (ros_matchs.reperes = { "pause1": "<horodatage>", … }).

-- Nouveau rôle. Une valeur d'enum ajoutée ne peut pas être utilisée dans la même transaction :
-- tout ce qui suit la compare en texte (role::text = 'animation').
alter type role_app add value if not exists 'animation';

-- « Membre » = voit l'outil (demandes, produits, sponsors…) : le rôle animation n'en fait pas partie
create or replace function est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role is not null and role::text <> 'animation')
$$;

-- Le rôle animation lit les matchs (date, heure, adversaire) pour le run of show
drop policy if exists matchs_lecture_animation on matchs;
create policy matchs_lecture_animation on matchs for select to authenticated
  using (mon_role()::text = 'animation');

-- Modèles ---------------------------------------------------------------------
create table if not exists ros_modeles (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

-- Run of show d'un match ------------------------------------------------------
create table if not exists ros_matchs (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null unique references matchs (id) on delete cascade,
  modele_id   uuid references ros_modeles (id) on delete set null,
  face_off    timestamptz,                         -- null = heure du match au calendrier
  reperes     jsonb not null default '{}'::jsonb,  -- heures réelles : pause1, pause2, fin_match
  remarque    text,
  maj_le      timestamptz not null default now(),
  maj_par     uuid default auth.uid()
);

-- Lignes (d'un run of show OU d'un modèle) -----------------------------------
create table if not exists ros_lignes (
  id            uuid primary key default gen_random_uuid(),
  ros_id        uuid references ros_matchs (id) on delete cascade,
  modele_id     uuid references ros_modeles (id) on delete cascade,
  rang          int not null default 0,
  repere        text not null default 'face_off'
                check (repere in ('face_off', 'pause1', 'pause2', 'fin_match', 'suite')),
  decalage_s    int not null default 0,              -- secondes par rapport au repère (négatif = avant)
  duree_s       int,
  type          text,                                -- couleur : compte, video, speaker, intro, sponsor, lumiere, autre
  action        text,
  video         text,                                -- vidéotron (« Cube »)
  audio         text,
  speaker       text,
  led           text,
  instructions  text,
  lien          text,
  check ((ros_id is null) <> (modele_id is null))
);
create index if not exists ros_lignes_ros on ros_lignes (ros_id, rang);
create index if not exists ros_lignes_modele on ros_lignes (modele_id, rang);

-- Droits : tout compte avec un rôle lit ; Régie / admin écrivent -------------
alter table ros_modeles enable row level security;
alter table ros_matchs  enable row level security;
alter table ros_lignes  enable row level security;

do $droits$
declare t text;
begin
  foreach t in array array['ros_modeles', 'ros_matchs', 'ros_lignes'] loop
    execute format('drop policy if exists %1$s_lecture on %1$I', t);
    execute format('drop policy if exists %1$s_ecriture on %1$I', t);
    execute format('create policy %1$s_lecture on %1$I for select to authenticated using (mon_role() is not null)', t);
    execute format('create policy %1$s_ecriture on %1$I for all to authenticated
                    using (a_role(''regie'', ''admin'')) with check (a_role(''regie'', ''admin''))', t);
  end loop;
end $droits$;

-- Mise à jour en direct (chrono / animation voient les changements et les pauses sans recharger)
do $rt$
begin
  begin alter publication supabase_realtime add table ros_matchs; exception when others then null; end;
  begin alter publication supabase_realtime add table ros_lignes; exception when others then null; end;
end $rt$;

select 'Migration 30 OK : run of show + rôle animation' as "Résultat";
