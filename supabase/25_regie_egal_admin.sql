-- =====================================================================
-- 25 — Régie et admin : les mêmes droits
-- À exécuter une fois dans Supabase > SQL Editor, après 24.
-- =====================================================================
-- Décidé par Léa : « régie et admin, c'est les mêmes droits en vrai ».
-- Toutes les règles de sécurité passent par a_role(...) : on la redéfinit pour que
-- « regie » et « admin » soient interchangeables (calendrier, produits, emplacements,
-- suppressions… aussi pour la Régie). Le Sponsoring ne change pas.
-- Les deux rôles restent affichés séparément (Léa = admin), mais ouvrent les mêmes portes.

create or replace function a_role(variadic roles role_app[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = any (roles)
        or (role in ('regie', 'admin') and roles && array['regie', 'admin']::role_app[])
    from profiles where id = auth.uid()), false)
$$;

select coalesce(role::text, 'en attente') as "Rôle", count(*) as "Comptes"
from profiles group by role order by role;
