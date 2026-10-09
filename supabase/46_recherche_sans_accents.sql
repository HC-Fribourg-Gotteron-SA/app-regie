-- =====================================================================
-- 46 — Recherche de sponsors sans tenir compte des accents
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Signalé par Léa (09.10.2026) : « televerbier » ne trouvait pas « Téléverbier ». rechercher_sponsors (demande,
-- « est aussi sur » de la fiche produit, sponsors proches au traitement) compare maintenant les noms sans accents
-- ni majuscules (noms et autres noms / alias).

create or replace function sans_accent(t text)
returns text
language sql immutable
as $$
  select lower(translate(coalesce(t, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝœŒæÆ''’',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYoOaA  '))
$$;

create or replace function rechercher_sponsors(q text, nb int default 10)
returns table (id uuid, nom text, score real)
language sql stable
set search_path = public
as $$
  with r as (select sans_accent(trim(q)) as q)
  select s.id, s.nom,
         greatest(similarity(sans_accent(s.nom), r.q),
                  coalesce((select max(similarity(sans_accent(a), r.q)) from unnest(s.alias) a), 0)) as score
  from sponsors s, r
  where sans_accent(s.nom) like '%' || r.q || '%'
     or sans_accent(s.nom) % r.q
     or exists (select 1 from unnest(s.alias) a where sans_accent(a) like '%' || r.q || '%' or sans_accent(a) % r.q)
  order by score desc, s.nom
  limit nb
$$;

select nom as "Recherche « televerbier »" from rechercher_sponsors('televerbier', 5);
