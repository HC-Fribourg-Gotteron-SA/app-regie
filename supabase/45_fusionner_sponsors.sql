-- =====================================================================
-- 45 — Fusionner deux sponsors (doublon) : Verbier → Téléverbier
-- À exécuter dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois (s'il n'y a plus de « Verbier », la fusion ne fait rien).
-- =====================================================================
-- Demandé par Léa (09.10.2026) : « Televerbier » et « Verbier » sont le même sponsor.
-- fusionner_sponsors(garder, absorbe) : tout ce qui appartient au sponsor absorbé passe au sponsor gardé
-- (contrats → diffusions, demandes, documents du dossier, « remplace »), son nom et ses alias deviennent des alias
-- du sponsor gardé (la recherche et les prochaines demandes « Verbier » retrouvent Téléverbier), puis il est supprimé.
-- Réutilisable pour d'autres doublons : select fusionner_sponsors('<id à garder>', '<id à absorber>');

create or replace function fusionner_sponsors(p_garder uuid, p_absorbe uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  g sponsors;
  a sponsors;
begin
  if auth.uid() is not null and not a_role('regie', 'admin') then
    raise exception 'Seules la Régie et l''admin peuvent fusionner des sponsors';
  end if;
  if p_garder = p_absorbe then raise exception 'Deux sponsors différents sont nécessaires'; end if;
  select * into g from sponsors where id = p_garder;
  select * into a from sponsors where id = p_absorbe;
  if g.id is null or a.id is null then raise exception 'Sponsor introuvable'; end if;

  update contrats set sponsor_id = g.id where sponsor_id = a.id;
  update demandes set sponsor_id = g.id where sponsor_id = a.id;
  update documents_sponsors set sponsor_id = g.id where sponsor_id = a.id;
  update sponsors set remplace_sponsor_id = g.id where remplace_sponsor_id = a.id;
  update sponsors set
    alias   = (select coalesce(array_agg(distinct x), '{}') from unnest(g.alias || a.alias || a.nom) x
               where lower(x) <> lower(g.nom)),
    notes   = nullif(concat_ws(E'\n', g.notes, a.notes), ''),
    email   = coalesce(g.email, a.email),
    telephone = coalesce(g.telephone, a.telephone),
    contact_nom = coalesce(g.contact_nom, a.contact_nom)
  where id = g.id;
  delete from sponsors where id = a.id;
  return format('« %s » fusionné dans « %s »', a.nom, g.nom);
end $$;

-- Verbier → Téléverbier (noms cherchés sans tenir compte des accents ni des majuscules)
do $fusion$
declare
  v_garder  uuid;
  v_absorbe uuid;
  n int;
begin
  select count(*), min(id::text)::uuid into n, v_garder from sponsors
  where translate(lower(nom), 'éèê', 'eee') in ('televerbier', 'tele verbier', 'tele-verbier', 'televerbier sa');
  if n = 0 then return; end if;          -- base de test : pas de Téléverbier, rien à fusionner
  if n > 1 then raise exception 'Téléverbier : % sponsors trouvés au lieu de 1 — dites-le à Claude', n; end if;

  select id into v_absorbe from sponsors where lower(trim(nom)) = 'verbier';
  if v_absorbe is not null then
    perform fusionner_sponsors(v_garder, v_absorbe);
  end if;
  -- demandes pas encore traitées où « Verbier » a été tapé comme nouveau sponsor
  update demandes set sponsor_id = v_garder
  where sponsor_id is null and lower(trim(sponsor_nom_saisi)) = 'verbier';
end $fusion$;

select nom as "Sponsor", array_to_string(alias, ', ') as "Aussi appelé",
       (select count(*) from contrats c join lignes_vendues l on l.contrat_id = c.id
        where c.sponsor_id = s.id and l.statut not in ('annule', 'termine')) as "Diffusions"
from sponsors s
where translate(lower(nom), 'éèê', 'eee') like '%verbier%';
