-- =====================================================================
-- 24 — Rôle Sponsoring : faire des demandes et consulter, rien d'autre
-- À exécuter une fois dans Supabase > SQL Editor (après 01 → 22 ; 23 = remise à zéro, facultative).
-- =====================================================================
-- Décidé par Léa : le Sponsoring peut
--   • créer ses demandes, y joindre des fichiers, répondre aux questions de la Régie ;
--   • CONSULTER tous les onglets (produits, sponsors, match du jour…).
-- Il ne peut plus modifier directement ce qui est diffusé : sponsors, contrats, diffusions,
-- matchs / emplacements des diffusions, visuels, dossiers sponsors. C'est la Régie (ou l'admin)
-- qui le fait, en traitant les demandes.
-- Peut être exécuté plusieurs fois.

do $droits$
declare t text;
begin
  foreach t in array array['sponsors', 'contrats', 'lignes_vendues', 'lignes_matchs', 'lignes_emplacements', 'assets']
  loop
    execute format('drop policy if exists %1$s_insert on %1$I', t);
    execute format('drop policy if exists %1$s_update on %1$I', t);
    execute format('create policy %1$s_insert on %1$I for insert to authenticated
                    with check (a_role(''regie'', ''admin''))', t);
    execute format('create policy %1$s_update on %1$I for update to authenticated
                    using (a_role(''regie'', ''admin'')) with check (a_role(''regie'', ''admin''))', t);
  end loop;
end $droits$;

-- Décocher un match / un emplacement d'une diffusion : Régie seulement
drop policy if exists lignes_matchs_delete_equipe on lignes_matchs;
drop policy if exists lignes_emplacements_delete_equipe on lignes_emplacements;
create policy lignes_matchs_delete_equipe on lignes_matchs for delete to authenticated using (a_role('regie'));
create policy lignes_emplacements_delete_equipe on lignes_emplacements for delete to authenticated using (a_role('regie'));

-- Dossiers sponsors : le Sponsoring y inscrit les fichiers de SES demandes (automatique à l'envoi) ;
-- déposer un document hors demande ou modifier le dossier = Régie / admin
drop policy if exists documents_sponsors_insert on documents_sponsors;
drop policy if exists documents_sponsors_update on documents_sponsors;
create policy documents_sponsors_insert on documents_sponsors for insert to authenticated
  with check (a_role('regie', 'admin') or (a_role('sponsoring') and demande_id is not null));
create policy documents_sponsors_update on documents_sponsors for update to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));

-- Inchangé : demandes et produits des demandes (créer, compléter, répondre), dépôt de fichiers
-- dans le stockage, lecture de tout.

select coalesce(role::text, 'en attente') as "Rôle", count(*) as "Comptes"
from profiles group by role order by role;
