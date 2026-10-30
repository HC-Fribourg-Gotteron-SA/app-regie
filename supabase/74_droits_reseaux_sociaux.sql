-- =====================================================================
-- 74 — Accès « reseaux » : la personne gère la page Réseaux sociaux (Mathys, community manager)
-- À exécuter sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (30.10.2026, option A) : Mathys a les droits du Sponsoring (rôle sponsoring) + sur le produit Réseaux sociaux
-- seulement : « + Ajouter », traiter les demandes, commentaires, créer un sponsor. Pas les Jeux app (Léa les gère).
-- Il ne supprime pas de demande ni de fichier (Régie / admin).

-- 1. Qui a l'accès --------------------------------------------------------------------------
create or replace function gere_reseaux() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role is not null and 'reseaux' = any (espaces) from profiles where id = auth.uid()), false)
$$;

-- 2. Seul un admin change un rôle OU des accès (avant : chacun pouvait modifier ses propres espaces)
create or replace function tg_profil_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.espaces is distinct from old.espaces)
     and auth.uid() is not null and not a_role('admin') then
    raise exception 'Seul un admin peut modifier un rôle ou des accès';
  end if;
  return new;
end $$;

-- 3. Droits, en plus de ceux du rôle ---------------------------------------------------------
drop policy if exists digital_elements_reseaux on digital_elements;
create policy digital_elements_reseaux on digital_elements for all to authenticated
  using (gere_reseaux() and produit_id in (select id from produits where nom ilike 'r_seaux%'))
  with check (gere_reseaux() and produit_id in (select id from produits where nom ilike 'r_seaux%'));

drop policy if exists sponsors_insert_reseaux on sponsors;
create policy sponsors_insert_reseaux on sponsors for insert to authenticated with check (gere_reseaux());

drop policy if exists documents_sponsors_insert_reseaux on documents_sponsors;
create policy documents_sponsors_insert_reseaux on documents_sponsors for insert to authenticated
  with check (gere_reseaux());

-- 4. traiter_digital : aussi pour lui, sur les Réseaux sociaux seulement
do $x$
declare src text;
begin
  select pg_get_functiondef('traiter_digital(uuid, uuid, text, jsonb)'::regprocedure) into src;
  if position('gere_reseaux' in src) = 0 then
    if position($r$if not a_role('regie', 'admin') then$r$ in src) = 0 then
      raise exception 'traiter_digital : contrôle du rôle introuvable, rien n''a été modifié';
    end if;
    src := replace(src, $r$if not a_role('regie', 'admin') then$r$,
      $r$if not (a_role('regie', 'admin')
             or (gere_reseaux() and exists (select 1 from produits where id = p_produit and nom ilike 'r_seaux%'))) then$r$);
    execute src;
  end if;
end $x$;

select 'Migration 74 OK : accès Réseaux sociaux' as "Résultat",
       (select count(*) from profiles where 'reseaux' = any (espaces)) as "Comptes avec cet accès";
