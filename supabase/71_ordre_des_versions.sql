-- =====================================================================
-- 71 — Versions à tour de rôle (3 versions ou plus) : le cycle garde l'ordre V1 → V2 → V3
-- À exécuter sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (27.10.2026, AHG Cars · Angles match, V1 / V2 / V3) : Match du jour disait « Activer V3 · désactiver V1 » alors
-- qu'après V1 vient V2, et elle avait demandé V2 pour ce soir. Cause : le cycle était construit en mettant la version
-- du premier match en tête, puis les autres dans l'ordre (V2 choisie → V2, V1, V3 : après V1 venait V3).
-- Maintenant : le cycle part de la version choisie et continue dans l'ordre (V2 → V3 → V1 → V2…).
-- 1. langue_un_match_sur_deux corrigée (formulaire « Langue / version » du détail d'une diffusion)
-- 2. AHG Cars · Angles match : V2 ce soir (prochain match), puis V3, puis V1
-- Le résultat liste toutes les diffusions à 3 versions ou plus : ordre, version du prochain match.

create or replace function langue_un_match_sur_deux(p_ligne uuid, p_cible text, p_versions jsonb, p_premiere text)
returns text
language plpgsql
set search_path = public
as $$
declare
  l       lignes_vendues;
  v_cible uuid;
  v       jsonb;
  v_asset uuid;
  v_ordre text[];
  v_i     int;
begin
  if not a_role('regie', 'admin') then raise exception 'Seule la Régie peut régler les versions d''une diffusion'; end if;
  select * into l from lignes_vendues where id = p_ligne;
  if not found then raise exception 'Diffusion introuvable'; end if;
  v_cible := case when p_cible = 'anneau' then l.ligne_couplee_id else p_ligne end;
  if v_cible is null then raise exception 'Cette diffusion n''a pas d''anneau LED'; end if;

  if p_versions is null or jsonb_array_length(p_versions) < 2 then
    update lignes_vendues set regle_rotation = 'unique', ordre_variantes = null, alternance_depart = null where id = v_cible;
    return 'Plus d''alternance de langue';
  end if;

  for v in select * from jsonb_array_elements(p_versions) loop
    if coalesce(trim(v->>'variante'), '') = '' or coalesce(trim(v->>'nom'), '') = '' then
      raise exception 'Chaque version a besoin d''une langue et d''un nom';
    end if;
    select id into v_asset from assets
    where ligne_id = v_cible and lower(trim(nom_visuel)) = lower(trim(v->>'nom')) and statut in ('valide', 'archive')
    order by (statut = 'valide') desc, version desc limit 1;
    if v_asset is null then
      insert into assets (ligne_id, nom_visuel, variante) values (v_cible, trim(v->>'nom'), upper(trim(v->>'variante')))
      returning id into v_asset;
    else
      update assets set variante = upper(trim(v->>'variante')) where id = v_asset;
    end if;
    update assets set statut = 'valide' where id = v_asset and statut <> 'valide';
  end loop;

  -- versions dans l'ordre saisi (version 1, 2, 3…), cycle qui commence par celle du prochain match
  select array_agg(upper(trim(e->>'variante')) order by n) into v_ordre
  from jsonb_array_elements(p_versions) with ordinality t(e, n);
  v_i := coalesce(array_position(v_ordre, upper(trim(p_premiere))), 1);
  v_ordre := v_ordre[v_i:] || v_ordre[:v_i - 1];

  update lignes_vendues set
    regle_rotation = 'alterner', ordre_variantes = v_ordre,
    alternance_depart = (select x.match_id from matchs_de_ligne(v_cible) x join matchs m on m.id = x.match_id
                         where m.date_heure >= date_trunc('day', now()) order by m.date_heure limit 1)
  where id = v_cible;
  return format('Un match sur deux : %s au prochain match', v_ordre[1]);
end $$;

-- AHG Cars · Angles match : V2 au prochain match (ce soir), puis V3, puis V1
do $x$
declare r record;
begin
  for r in select l.id from lignes_vendues l
           join produits p on p.id = l.produit_id
           join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
           where sans_accent(s.nom) ilike '%ahg%' and p.nom ilike 'Angles%'
             and l.regle_rotation = 'alterner' and l.statut not in ('annule', 'termine')
             and l.ordre_variantes @> array['V1', 'V2', 'V3']
  loop
    -- une version sans visuel validé (archivé) : choisir_asset prenait le dernier visuel validé (V3) à la place
    -- de V2 → on remet en service le dernier visuel archivé de chaque version qui n'en a plus
    perform set_config('outil.depot_video_match', 'oui', true);
    update assets a set statut = 'valide'
    where a.id in (select distinct on (x.variante) x.id from assets x
                   where x.ligne_id = r.id and x.match_id is null and x.statut = 'archive'
                     and x.variante in ('V1', 'V2', 'V3')
                     and not exists (select 1 from assets y where y.ligne_id = r.id and y.match_id is null
                                     and y.statut = 'valide' and y.variante = x.variante)
                   order by x.variante, x.version desc);
    perform set_config('outil.depot_video_match', '', true);
    update lignes_vendues set
      ordre_variantes = array['V2', 'V3', 'V1'] || array(select x from unnest(ordre_variantes) x
                                                         where x not in ('V1', 'V2', 'V3') order by x),
      alternance_depart = (select x.match_id from matchs_de_ligne(r.id) x join matchs m on m.id = x.match_id
                           where m.date_heure >= date_trunc('day', now()) order by m.date_heure limit 1)
    where id = r.id;
  end loop;
end $x$;

-- contrôle : diffusions à 3 versions ou plus, version prévue au prochain match
select s.nom as sponsor, p.nom as produit, array_to_string(l.ordre_variantes, ' → ') as cycle,
       to_char(m.date_heure at time zone 'Europe/Zurich', 'DD.MM.YYYY') as prochain_match,
       a.variante as version_au_prochain_match, a.nom_visuel as visuel,
       (select string_agg(coalesce(v.variante, '?') || ' : ' || v.nom_visuel, ' | ' order by v.variante)
        from assets v where v.ligne_id = l.id and v.statut = 'valide' and v.match_id is null) as visuels_valides
from lignes_vendues l
join produits p on p.id = l.produit_id
join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
left join lateral (select x.match_id from matchs_de_ligne(l.id) x join matchs mm on mm.id = x.match_id
                   where mm.date_heure >= date_trunc('day', now()) order by mm.date_heure limit 1) pm on true
left join matchs m on m.id = pm.match_id
left join passages ps on ps.ligne_id = l.id and ps.match_id = pm.match_id
left join assets a on a.id = ps.asset_id
where l.regle_rotation = 'alterner' and coalesce(array_length(l.ordre_variantes, 1), 0) >= 3
  and l.statut not in ('annule', 'termine')
order by s.nom, p.nom;
