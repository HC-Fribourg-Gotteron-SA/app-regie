-- =====================================================================
-- 44 — Fichiers de travail de la Régie : PSD des LED et designs Canva des slides
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (08.10.2026) : la Régie tient UN fichier PSD (calques) pour les bandes LED 3M et 6M, et un design
-- Canva par série de slides (Honorary, Golden…). Sur la fiche produit : le dernier PSD / le lien Canva, et la liste
-- de ce qui a changé depuis la dernière mise à jour (logos à ajouter, à enlever).
-- Une ligne = une mise à jour : « cle » = 'led' (PSD commun aux LED 3M et 6M) ou l'id du produit (slides).
-- Fichier (bucket assets, travail/<cle>/…) OU lien (OneDrive si le PSD dépasse 50 Mo, design Canva), ou rien
-- (« ✓ à jour » seulement : sert de point de départ à la liste des changements).

create table if not exists fichiers_travail (
  id             uuid primary key default gen_random_uuid(),
  cle            text not null,
  storage_path   text,
  nom            text,
  taille_octets  bigint,
  lien           text,
  note           text,
  fait_par       uuid references profiles (id) default auth.uid(),
  fait_le        timestamptz not null default now()
);
create index if not exists fichiers_travail_cle on fichiers_travail (cle, fait_le desc);

alter table fichiers_travail enable row level security;
drop policy if exists fichiers_travail_lecture on fichiers_travail;
drop policy if exists fichiers_travail_ajout on fichiers_travail;
drop policy if exists fichiers_travail_suppr on fichiers_travail;
create policy fichiers_travail_lecture on fichiers_travail for select to authenticated using (est_membre());
create policy fichiers_travail_ajout on fichiers_travail for insert to authenticated with check (a_role('regie', 'admin'));
create policy fichiers_travail_suppr on fichiers_travail for delete to authenticated using (a_role('regie', 'admin'));

select 'Migration 44 OK : fichiers de travail (PSD des LED, Canva des slides)' as "Résultat";
