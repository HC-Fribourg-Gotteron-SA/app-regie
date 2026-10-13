-- =====================================================================
-- 53 — Importer les matchs Ladies sans toucher aux matchs NL (et sans « statement timeout »)
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 52, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (13.10.2026) : « Import impossible : canceling statement due to statement timeout » en important les matchs
-- Ladies. Deux problèmes (l'erreur a tout annulé : rien n'a été modifié) :
--   1. importer_matchs prenait un match déjà présent LE MÊME JOUR pour le même match et le mettait à jour : un match
--      Ladies le jour d'un match NL aurait remplacé le match NL (adversaire, heure, type) → et ce changement de type
--      relançait le calcul de toutes les diffusions à la saison. Maintenant : même jour ET même famille
--      (Ladies avec Ladies, le reste avec le reste).
--   2. la renumérotation qui suit l'import relançait des calculs pour chaque match renuméroté. Maintenant :
--      les matchs Ladies sont numérotés à part (1001, 1002… : ils ne décalent plus les numéros NL), et une
--      renumérotation ne recalcule plus que les rares diffusions qui dépendent encore du numéro du match.

-- 1. Numéros : NL / CHL / playoffs… 1, 2, 3… ; Ladies 1001, 1002…
create or replace function renumeroter_matchs(p_saison uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- numéros provisoires négatifs pour éviter les conflits d'unicité
  with ordre as (
    select id, (case when type::text = 'ladies' then 1000 else 0 end)
               + row_number() over (partition by type::text = 'ladies' order by date_heure, created_at) as n
    from matchs where saison_id = p_saison
  )
  update matchs m set numero = -o.n
  from ordre o where o.id = m.id and m.numero <> o.n;

  update matchs set numero = -numero where saison_id = p_saison and numero < 0;
end $$;

-- 2. Import : un match du même jour n'est mis à jour que s'il est de la même famille (Ladies / pas Ladies)
create or replace function importer_matchs(p_saison uuid, p_matchs jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  x        jsonb;
  v_id     uuid;
  v_quand  timestamptz;
  v_type   type_match;
  n_ajout  int := 0;
  n_maj    int := 0;
  v_base   int;
begin
  select coalesce(max(abs(numero)), 0) + 2000 into v_base from matchs where saison_id = p_saison;

  for x in select * from jsonb_array_elements(p_matchs) loop
    v_quand := (x->>'date_heure')::timestamptz;
    v_type  := coalesce(nullif(x->>'type', ''), 'saison')::type_match;

    select id into v_id from matchs
    where saison_id = p_saison
      and (date_heure at time zone 'Europe/Zurich')::date = (v_quand at time zone 'Europe/Zurich')::date
      and (type::text = 'ladies') = (v_type::text = 'ladies')
    limit 1;

    if v_id is null then
      v_base := v_base + 1;
      insert into matchs (saison_id, numero, date_heure, adversaire, type)
      values (p_saison, v_base, v_quand, trim(x->>'adversaire'), v_type);
      n_ajout := n_ajout + 1;
    else
      update matchs set date_heure = v_quand, adversaire = trim(x->>'adversaire'), type = v_type
      where id = v_id
        and (date_heure, adversaire, type) is distinct from (v_quand, trim(x->>'adversaire'), v_type);
      if found then n_maj := n_maj + 1; end if;
    end if;
  end loop;

  perform renumeroter_matchs(p_saison);
  return jsonb_build_object('ajoutes', n_ajout, 'mis_a_jour', n_maj);
end $$;

-- 3. Match ajouté / modifié / renuméroté : recalculer le strict nécessaire (reprend la 39)
create or replace function tg_match_passages() returns trigger
language plpgsql
as $$
begin
  -- renumérotation seule : seules les diffusions qui dépendent encore du NUMÉRO (un match sur N sans match de départ,
  -- ancienne rotation sans ordre de versions) ; les matchs autres que saison / playoffs (CHL, Ladies…) : rien
  if tg_op = 'UPDATE' and new.date_heure = old.date_heure and new.type = old.type then
    if new.type::text not in ('saison', 'playoffs') then return null; end if;
    perform generer_passages(l.id)
    from lignes_vendues l
    where l.type_vente = 'saison' and l.statut not in ('brouillon', 'annule')
      and ((l.un_match_sur > 1 and l.un_match_sur_depart is null)
           or (l.regle_rotation in ('alterner', 'equilibrer') and coalesce(array_length(l.ordre_variantes, 1), 0) < 2));
    return null;
  end if;

  -- Champions League, Ladies, amical… : pas concerné par les diffusions à la saison
  if new.type::text not in ('saison', 'playoffs')
     and (tg_op = 'INSERT' or old.type::text not in ('saison', 'playoffs')) then
    return null;
  end if;

  perform generer_passages(l.id)
  from lignes_vendues l
  where l.type_vente = 'saison' and l.statut not in ('brouillon', 'annule')
    and (new.type = 'saison'
         or (tg_op = 'UPDATE' and old.type = 'saison')
         or l.inclut_playoffs);
  return null;
end $$;

select 'Migration 53 OK : import des matchs Ladies séparé des matchs NL' as "Résultat";
