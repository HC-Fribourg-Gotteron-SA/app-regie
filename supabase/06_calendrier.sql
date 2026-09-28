-- =====================================================================
-- 06 — Calendrier des matchs : import en lot et numérotation automatique
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 05.
-- =====================================================================
-- Les matchs sont numérotés 1, 2, 3… dans l'ordre chronologique de la saison
-- (le numéro sert à « 1 match sur 2 » et à l'affichage). La numérotation est
-- refaite après chaque ajout, modification de date ou suppression.
-- Les fonctions sont « security invoker » : les droits (admin) s'appliquent.

-- Renumérote les matchs d'une saison par ordre chronologique ------------
create or replace function renumeroter_matchs(p_saison uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- 1) numéros provisoires négatifs pour éviter les conflits d'unicité
  with ordre as (
    select id, row_number() over (order by date_heure, created_at) as n
    from matchs where saison_id = p_saison
  )
  update matchs m set numero = -o.n
  from ordre o where o.id = m.id and m.numero <> o.n;

  -- 2) numéros définitifs
  update matchs set numero = -numero where saison_id = p_saison and numero < 0;
end $$;

-- Import d'une liste de matchs --------------------------------------------
-- p_matchs = [{"date_heure": "2026-10-03T17:45:00Z", "adversaire": "SC Bern", "type": "saison"}, …]
-- Un match déjà présent le même jour (heure de Suisse) est mis à jour au lieu d'être doublé.
create or replace function importer_matchs(p_saison uuid, p_matchs jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  x        jsonb;
  v_id     uuid;
  v_quand  timestamptz;
  n_ajout  int := 0;
  n_maj    int := 0;
  v_base   int;
begin
  select coalesce(max(abs(numero)), 0) + 1000 into v_base from matchs where saison_id = p_saison;

  for x in select * from jsonb_array_elements(p_matchs) loop
    v_quand := (x->>'date_heure')::timestamptz;

    select id into v_id from matchs
    where saison_id = p_saison
      and (date_heure at time zone 'Europe/Zurich')::date = (v_quand at time zone 'Europe/Zurich')::date
    limit 1;

    if v_id is null then
      v_base := v_base + 1;
      insert into matchs (saison_id, numero, date_heure, adversaire, type)
      values (p_saison, v_base, v_quand, trim(x->>'adversaire'),
              coalesce(nullif(x->>'type', ''), 'saison')::type_match);
      n_ajout := n_ajout + 1;
    else
      update matchs set date_heure = v_quand,
                        adversaire = trim(x->>'adversaire'),
                        type       = coalesce(nullif(x->>'type', ''), 'saison')::type_match
      where id = v_id
        and (date_heure, adversaire, type) is distinct from
            (v_quand, trim(x->>'adversaire'), coalesce(nullif(x->>'type', ''), 'saison')::type_match);
      if found then n_maj := n_maj + 1; end if;
    end if;
  end loop;

  perform renumeroter_matchs(p_saison);
  return jsonb_build_object('ajoutes', n_ajout, 'mis_a_jour', n_maj);
end $$;
