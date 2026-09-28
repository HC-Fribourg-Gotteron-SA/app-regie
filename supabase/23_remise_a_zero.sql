-- =====================================================================
-- 23 — REMISE À ZÉRO des données (pour repartir sur une base vide)
-- À exécuter dans Supabase > SQL Editor, UNIQUEMENT quand on veut tout vider.
-- ⚠ IRRÉVERSIBLE : tout ce qui est effacé ne peut pas être récupéré.
-- =====================================================================
-- EFFACÉ : sponsors, contrats, diffusions (lignes, matchs, emplacements occupés), visuels,
--          passages (historique des matchs), demandes, dossiers sponsors, cases « Fait dans
--          Colosseo », notes « Pour ce soir », journal, marqueur d'import Airtable.
-- GARDÉ  : produits, emplacements LED, saisons, calendrier des matchs, comptes et rôles.
-- REMIS  : les « sponsors » HCFG (contenu du club) et National League (ligue), comme à l'installation.
--
-- Les FICHIERS du stockage ne sont pas effacés par ce script (Supabase l'interdit en SQL) :
-- Storage > assets > supprimer les dossiers « demandes » et « sponsors » à la main.
-- Sans ça, les fichiers restent dans le stockage mais ne sont plus reliés à rien (sans gêne).

do $raz$
begin
  truncate table colosseo_fait, passages, documents_sponsors, assets,
                 lignes_emplacements, lignes_matchs, lignes_vendues,
                 demandes_produits, demandes, contrats, sponsors
    cascade;
  truncate table journal restart identity;
  if to_regclass('public.imports_donnees') is not null then
    execute 'truncate table imports_donnees';
  end if;
  if to_regclass('public.notes_match') is not null then
    execute 'truncate table notes_match';
  end if;
  -- contenu du club et de la ligue (créés à l'installation, 03_donnees_depart) : on les remet
  insert into sponsors (nom, origine, alias) values
    ('HCFG', 'club', '{"Banner HCFG","HC Fribourg-Gottéron","Gottéron"}'),
    ('National League', 'ligue', '{"NationalLeague","NL"}');
end $raz$;

select (select count(*) from sponsors)        as "Sponsors",
       (select count(*) from lignes_vendues)  as "Diffusions",
       (select count(*) from demandes)        as "Demandes",
       (select count(*) from produits)        as "Produits (gardés)",
       (select count(*) from emplacements)    as "Emplacements (gardés)",
       (select count(*) from matchs)          as "Matchs (gardés)",
       (select count(*) from profiles)        as "Comptes (gardés)";
