-- =====================================================================
-- Annule l'import Airtable (supprime les diffusions et sponsors importés)
-- Les diffusions créées dans l'outil (depuis une demande) ne sont PAS touchées.
-- Remet aussi en état après un import interrompu. Peut être exécuté plusieurs fois.
-- =====================================================================
do $annuler$
begin
  -- la protection des visuels est toujours réactivée
  alter table assets enable trigger assets_avant;

  -- diffusions importées = créées dans le SQL Editor (sans auteur) et sans demande
  delete from lignes_vendues where created_by is null and demande_id is null;
  delete from contrats c where c.created_by is null and not exists (select 1 from lignes_vendues l where l.contrat_id = c.id);
  delete from sponsors s where s.notes = 'Import Airtable 26/27'
    and not exists (select 1 from contrats c where c.sponsor_id = s.id)
    and not exists (select 1 from demandes d where d.sponsor_id = s.id);

  if to_regclass('public.imports_donnees') is not null then
    delete from imports_donnees where nom = 'Import Airtable 26/27';
  end if;
  if to_regclass('public.import_remarques') is not null then
    delete from import_remarques;
  end if;
end $annuler$;

drop function if exists import_airtable_ligne(text, text, type_vente, int, boolean, int, text, boolean, text, date[], text[], text[], boolean);

select 'Annulation terminée : ' || (select count(*) from lignes_vendues where created_by is null and demande_id is null)
       || ' diffusion importée restante, ' || (select count(*) from sponsors where notes = 'Import Airtable 26/27')
       || ' sponsor importé restant (ceux liés à une demande sont gardés).' as "Résultat";
