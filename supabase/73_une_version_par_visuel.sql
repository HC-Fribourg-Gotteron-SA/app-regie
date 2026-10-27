-- =====================================================================
-- 73 — Versions à tour de rôle : chaque version a SON visuel (même si le nom dans Colosseo est le même)
-- À exécuter sur la base de TEST puis sur la VRAIE base, APRÈS la 72. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (27.10.2026, AHG Cars · Angles match) : V2 choisie pour ce soir, Match du jour disait toujours V3. Cause : les
-- versions V1 / V2 / V3 ont le même nom de visuel ; langue_un_match_sur_deux retrouvait le visuel par son nom et
-- réutilisait LE MÊME pour chaque version (V1, puis V2, puis V3 : il n'en restait qu'un, en V3). choisir_asset ne
-- trouvait pas de V2 et prenait le dernier visuel (V3).
-- 1. langue_un_match_sur_deux : un visuel déjà pris par une version de la liste n'est pas réutilisé
-- 2. toutes les diffusions qui alternent : chaque version du cycle sans visuel validé en reçoit un (même nom,
--    sans fichier, comme l'import), puis les passages sont recalculés → ce soir AHG Cars = V2

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
  v_pris  uuid[] := '{}';
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
    -- visuel de cette version : d'abord celui qui a déjà cette version, puis un visuel du même nom pas encore pris
    select id into v_asset from assets
    where ligne_id = v_cible and match_id is null and statut in ('valide', 'archive') and not (id = any (v_pris))
      and (variante = upper(trim(v->>'variante')) or lower(trim(nom_visuel)) = lower(trim(v->>'nom')))
    order by (variante = upper(trim(v->>'variante'))) desc nulls last, (statut = 'valide') desc, version desc limit 1;
    if v_asset is null then
      insert into assets (ligne_id, nom_visuel, variante) values (v_cible, trim(v->>'nom'), upper(trim(v->>'variante')))
      returning id into v_asset;
    else
      update assets set variante = upper(trim(v->>'variante')), nom_visuel = trim(v->>'nom') where id = v_asset;
    end if;
    v_pris := v_pris || v_asset;
    update assets set statut = 'valide' where id = v_asset and statut <> 'valide';
  end loop;

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

-- 2. versions sans visuel : on en crée un (même nom que le visuel actuel de la diffusion, sans fichier)
do $x$
declare
  r     record;
  v_ver text;
  v_nom text;
  v_id  uuid;
begin
  perform set_config('outil.depot_video_match', 'oui', true);    -- validation directe (comme le dépôt)
  for r in select l.id, l.ordre_variantes from lignes_vendues l
           where l.regle_rotation = 'alterner' and coalesce(array_length(l.ordre_variantes, 1), 0) >= 2
             and l.statut not in ('annule', 'termine')
  loop
    select nom_visuel into v_nom from assets
    where ligne_id = r.id and match_id is null and statut in ('valide', 'archive')
    order by (statut = 'valide') desc, version desc limit 1;
    foreach v_ver in array r.ordre_variantes loop
      if not exists (select 1 from assets where ligne_id = r.id and match_id is null and statut = 'valide'
                     and variante = v_ver) then
        -- d'abord un ancien visuel archivé de cette version, sinon un nouveau
        select id into v_id from assets
        where ligne_id = r.id and match_id is null and statut = 'archive' and variante = v_ver
        order by version desc limit 1;
        if v_id is null then
          insert into assets (ligne_id, nom_visuel, variante) values (r.id, coalesce(v_nom, v_ver), v_ver)
          returning id into v_id;
        end if;
        update assets set statut = 'valide' where id = v_id;
        v_id := null;
      end if;
    end loop;
    perform generer_passages(r.id);
  end loop;
  perform set_config('outil.depot_video_match', '', true);
end $x$;

-- contrôle : version prévue au prochain match + visuels de chaque version
select s.nom as sponsor, p.nom as produit, array_to_string(l.ordre_variantes, ' → ') as "cycle (à partir du prochain match)",
       to_char(m.date_heure at time zone 'Europe/Zurich', 'DD.MM.YYYY') as prochain_match,
       a.variante as version_au_prochain_match,
       (select string_agg(v.variante || ' : ' || v.nom_visuel, ' | ' order by v.variante)
        from assets v where v.ligne_id = l.id and v.statut = 'valide' and v.match_id is null) as visuels_valides
from lignes_vendues l
join produits p on p.id = l.produit_id
join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
left join lateral (select x.match_id from matchs_de_ligne(l.id) x join matchs mm on mm.id = x.match_id
                   where mm.date_heure >= date_trunc('day', now()) order by mm.date_heure limit 1) pm on true
left join matchs m on m.id = pm.match_id
left join passages ps on ps.ligne_id = l.id and ps.match_id = pm.match_id
left join assets a on a.id = ps.asset_id
where l.regle_rotation = 'alterner' and l.statut not in ('annule', 'termine')
order by s.nom, p.nom;
