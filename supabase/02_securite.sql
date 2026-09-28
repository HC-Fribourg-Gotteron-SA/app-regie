-- =====================================================================
-- Outil Sponsoring <-> Régie — 02_securite.sql
-- Comptes, rôles, règles d'accès (RLS) et stockage des fichiers
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Création automatique du profil à la première connexion
--    Seules les adresses @fribourg-gotteron.ch sont acceptées.
--    Le rôle reste vide : un admin l'attribue avant tout accès.
-- ---------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) not like '%@fribourg-gotteron.ch' then
    raise exception 'Adresse non autorisée : %', new.email;
  end if;
  insert into profiles (id, email) values (new.id, lower(new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Fonctions d'aide (security definer pour éviter la récursion RLS)
-- ---------------------------------------------------------------------
create or replace function mon_role() returns role_app
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role is not null)
$$;

create or replace function a_role(variadic roles role_app[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = any (roles) from profiles where id = auth.uid()), false)
$$;

-- Un utilisateur ne peut pas changer son propre rôle
create or replace function tg_profil_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() est vide dans le SQL Editor / service role : utile pour nommer le premier admin
  if new.role is distinct from old.role and auth.uid() is not null and not a_role('admin') then
    raise exception 'Seul un admin peut modifier un rôle';
  end if;
  return new;
end $$;
create trigger profiles_role before update on profiles
  for each row execute function tg_profil_role();

-- ---------------------------------------------------------------------
-- 3. RLS : tout le monde (membre actif) lit tout ;
--    l'écriture dépend du rôle.
-- ---------------------------------------------------------------------
alter table profiles            enable row level security;
alter table saisons             enable row level security;
alter table matchs              enable row level security;
alter table produits            enable row level security;
alter table emplacements        enable row level security;
alter table sponsors            enable row level security;
alter table contrats            enable row level security;
alter table demandes            enable row level security;
alter table demandes_produits   enable row level security;
alter table lignes_vendues      enable row level security;
alter table lignes_matchs       enable row level security;
alter table lignes_emplacements enable row level security;
alter table assets              enable row level security;
alter table passages            enable row level security;
alter table journal             enable row level security;

-- Profils : chacun voit son profil ; les membres voient l'équipe ; l'admin gère
create policy profiles_lecture on profiles for select to authenticated
  using (id = auth.uid() or est_membre());
create policy profiles_maj_soi on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on profiles for all to authenticated
  using (a_role('admin')) with check (a_role('admin'));

-- Lecture pour tous les membres actifs
do $$
declare t text;
begin
  foreach t in array array['saisons','matchs','produits','emplacements','sponsors','contrats',
                           'demandes','demandes_produits','lignes_vendues','lignes_matchs',
                           'lignes_emplacements','assets','passages','journal']
  loop
    execute format('create policy %1$s_lecture on %1$I for select to authenticated using (est_membre())', t);
  end loop;
end $$;

-- Référentiels : admin uniquement
do $$
declare t text;
begin
  foreach t in array array['saisons','matchs','produits','emplacements']
  loop
    execute format('create policy %1$s_admin on %1$I for all to authenticated
                    using (a_role(''admin'')) with check (a_role(''admin''))', t);
  end loop;
end $$;

-- Données commerciales : Sponsoring, Régie et admin créent et modifient ;
-- seul l'admin supprime (on préfère « annulé » / « terminé » à la suppression).
do $$
declare t text;
begin
  foreach t in array array['sponsors','contrats','demandes','demandes_produits',
                           'lignes_vendues','lignes_matchs','lignes_emplacements','assets']
  loop
    execute format('create policy %1$s_insert on %1$I for insert to authenticated
                    with check (a_role(''sponsoring'',''regie'',''admin''))', t);
    execute format('create policy %1$s_update on %1$I for update to authenticated
                    using (a_role(''sponsoring'',''regie'',''admin''))
                    with check (a_role(''sponsoring'',''regie'',''admin''))', t);
    execute format('create policy %1$s_delete on %1$I for delete to authenticated
                    using (a_role(''admin''))', t);
  end loop;
end $$;

-- Les liaisons produits / matchs / emplacements d'une demande ou d'une ligne
-- doivent pouvoir être décochées par les équipes.
create policy demandes_produits_delete_equipe on demandes_produits for delete to authenticated
  using (a_role('sponsoring', 'regie'));
create policy lignes_matchs_delete_equipe on lignes_matchs for delete to authenticated
  using (a_role('sponsoring', 'regie'));
create policy lignes_emplacements_delete_equipe on lignes_emplacements for delete to authenticated
  using (a_role('sponsoring', 'regie'));

-- Passages : générés automatiquement ; la Régie ordonne, pointe et coche Colosseo
create policy passages_update on passages for update to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));
create policy passages_admin on passages for all to authenticated
  using (a_role('admin')) with check (a_role('admin'));

-- Journal : écrit uniquement par les triggers (security definer), jamais à la main

-- Valider / refuser un fichier : contrôlé dans le trigger assets_avant (Régie ou admin).

-- ---------------------------------------------------------------------
-- 4. Stockage des fichiers : bucket privé « assets »
--    Chemin conseillé : <sponsor_id>/<ligne_id>/<nom_du_fichier>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

create policy assets_fichiers_lecture on storage.objects for select to authenticated
  using (bucket_id = 'assets' and est_membre());
create policy assets_fichiers_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and a_role('sponsoring', 'regie', 'admin'));
create policy assets_fichiers_maj on storage.objects for update to authenticated
  using (bucket_id = 'assets' and a_role('regie', 'admin'));
create policy assets_fichiers_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and a_role('admin'));
