-- =====================================================================
-- 41 — Fichiers joints aux tâches et infos « Pour ce soir » (Match du jour)
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 26, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (05.10.2026) : des visuels à faire qui ne viennent pas du Sponsoring (pour l'un ou l'autre) →
-- en ajoutant une tâche ou une info, on peut glisser des fichiers (ou un dossier) avec la ligne.
-- Fichiers dans le bucket « assets » : notes/<match>/<note>/<horodatage>__<nom>. Ici, la liste :
-- [{ "chemin": "notes/…", "nom": "visuel hommage.png", "taille": 123456 }, …]

alter table notes_match add column if not exists fichiers jsonb not null default '[]';

select 'Migration 41 OK : fichiers joints aux notes « Pour ce soir »' as "Résultat";
