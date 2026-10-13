-- =====================================================================
-- 51 — « Pour ce soir » ouvert au rôle animation (Stéphane) dans Match du jour
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 41, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (13.10.2026) : Stéphane (animation) glisse souvent des choses pour les matchs, dont les visuels des
-- anniversaires (images et vidéos, 3-4 au plus, à tout moment). Il les met directement dans « Pour ce soir » de
-- Match du jour (il ne voit que ce bloc) : il voit toutes les infos / tâches du match, en ajoute (avec fichiers),
-- supprime les siennes tant qu'elles ne sont pas faites. La Régie et l'admin gardent tout (voir, ajouter, cocher,
-- supprimer) : leurs droits ne changent pas.

drop policy if exists notes_match_animation_lecture on notes_match;
drop policy if exists notes_match_animation_ajout on notes_match;
drop policy if exists notes_match_animation_maj on notes_match;
drop policy if exists notes_match_animation_suppr on notes_match;
create policy notes_match_animation_lecture on notes_match for select to authenticated
  using (mon_role()::text = 'animation');
create policy notes_match_animation_ajout on notes_match for insert to authenticated
  with check (mon_role()::text = 'animation' and cree_par = auth.uid() and not fait);
create policy notes_match_animation_maj on notes_match for update to authenticated          -- rattacher ses fichiers
  using (mon_role()::text = 'animation' and cree_par = auth.uid() and not fait)
  with check (mon_role()::text = 'animation' and cree_par = auth.uid() and not fait);
create policy notes_match_animation_suppr on notes_match for delete to authenticated
  using (mon_role()::text = 'animation' and cree_par = auth.uid() and not fait);

-- fichiers des notes (bucket assets, notes/…) : il les télécharge tous, dépose et supprime les siens
drop policy if exists assets_notes_animation_depot on storage.objects;
drop policy if exists assets_notes_animation_lecture on storage.objects;
drop policy if exists assets_notes_animation_suppr on storage.objects;
create policy assets_notes_animation_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and name like 'notes/%' and mon_role()::text = 'animation');
create policy assets_notes_animation_lecture on storage.objects for select to authenticated
  using (bucket_id = 'assets' and name like 'notes/%' and mon_role()::text = 'animation');
create policy assets_notes_animation_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and name like 'notes/%' and mon_role()::text = 'animation' and owner = auth.uid());

select 'Migration 51 OK : « Pour ce soir » ouvert au rôle animation' as "Résultat";
