-- =====================================================================
-- 51 — « Pour le match » : le rôle animation (Stéphane) envoie fichiers et messages dans Match du jour
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 41, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (13.10.2026) : Stéphane (animation) glisse souvent des choses pour les matchs, dont les visuels des
-- anniversaires (images et vidéos, 3-4 au plus, à tout moment). Page « Pour le match » : il choisit le match, glisse
-- ses fichiers + un mot → une TÂCHE dans « Pour ce soir » de Match du jour (fichiers à télécharger), que la Régie
-- coche quand c'est fait. Il ne voit que SES envois (et s'ils sont faits) ; il ne voit pas le reste de l'outil.

-- notes_match : ses propres tâches seulement
drop policy if exists notes_match_animation_lecture on notes_match;
drop policy if exists notes_match_animation_ajout on notes_match;
drop policy if exists notes_match_animation_maj on notes_match;
drop policy if exists notes_match_animation_suppr on notes_match;
create policy notes_match_animation_lecture on notes_match for select to authenticated
  using (mon_role()::text = 'animation' and cree_par = auth.uid());
create policy notes_match_animation_ajout on notes_match for insert to authenticated
  with check (mon_role()::text = 'animation' and cree_par = auth.uid() and type = 'tache' and not fait);
create policy notes_match_animation_maj on notes_match for update to authenticated          -- rattacher ses fichiers
  using (mon_role()::text = 'animation' and cree_par = auth.uid() and not fait)
  with check (mon_role()::text = 'animation' and cree_par = auth.uid() and not fait);
create policy notes_match_animation_suppr on notes_match for delete to authenticated
  using (mon_role()::text = 'animation' and cree_par = auth.uid() and not fait);

-- fichiers : seulement sous notes/… (bucket assets)
drop policy if exists assets_notes_animation_depot on storage.objects;
drop policy if exists assets_notes_animation_lecture on storage.objects;
drop policy if exists assets_notes_animation_suppr on storage.objects;
create policy assets_notes_animation_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and name like 'notes/%' and mon_role()::text = 'animation');
create policy assets_notes_animation_lecture on storage.objects for select to authenticated
  using (bucket_id = 'assets' and name like 'notes/%' and mon_role()::text = 'animation' and owner = auth.uid());
create policy assets_notes_animation_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and name like 'notes/%' and mon_role()::text = 'animation' and owner = auth.uid());

select 'Migration 51 OK : le rôle animation peut envoyer des fichiers pour un match' as "Résultat";
