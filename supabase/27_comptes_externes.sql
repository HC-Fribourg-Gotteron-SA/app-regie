-- =====================================================================
-- 27 — Comptes pour des personnes hors @fribourg-gotteron.ch
-- À exécuter sur LES DEUX bases (test puis vraie base), dans Supabase > SQL Editor, après 26.
-- =====================================================================
-- Décidé par Léa (30.09.2026) : on peut créer un compte pour quelqu'un d'extérieur au club.
-- La sécurité reste la même :
--   • les comptes sont créés par un admin (Authentication > Users) — l'inscription publique doit
--     rester DÉSACTIVÉE dans Authentication > Sign In / Providers (« Allow new users to sign up » : off) ;
--   • un nouveau compte n'a AUCUN rôle : il ne voit rien tant qu'un admin ne lui a pas donné
--     sponsoring / regie / admin (update profiles set role = …).

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, lower(new.email));
  return new;
end $$;

select 'Toutes les adresses e-mail sont acceptées (compte sans rôle tant qu''un admin ne l''a pas activé).' as "Résultat";
