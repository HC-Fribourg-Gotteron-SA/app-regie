-- =====================================================================
-- 75 — LED 3M / 6M : déplacer un sponsor sur un autre emplacement (ou l'échanger avec un autre sponsor)
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (16.11.2026) : ce qui passe sur les LED 3M ne correspond pas à ce qui est noté dans l'outil ; il faut pouvoir
-- changer l'emplacement des logos. Avant, l'emplacement ne se choisissait qu'en ajoutant la demande.
--
-- RPC deplacer_emplacement(ligne, emplacement) :
--   * LED 3M = 1 emplacement, LED 6M = 2 emplacements qui se suivent dans le même anneau (à partir de celui choisi) ;
--   * emplacement libre (Banner HCFG) → le sponsor y va, son ancien emplacement redevient libre ;
--   * emplacement occupé → ÉCHANGE : le(s) sponsor(s) qui y étaient prennent l'ancienne place ;
--   * refusé : emplacement réservé club, LED 6M hors de la bande 6M, échange impossible (ex. un 3M sur la moitié
--     d'un 6M : déplacer plutôt le 6M).
-- Tout ou rien (une seule fonction).

create or replace function deplacer_emplacement(p_ligne uuid, p_emplacement uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  l          lignes_vendues;
  v_produit  text;
  v_sponsor  text;
  v_depart   emplacements;
  v_n        int;
  v_cibles   uuid[];
  v_anciens  uuid[];
  v_libres   uuid[];
  v_occ      record;
  v_besoin   int := 0;
  v_i        int := 1;
  v_noms     text[] := '{}';
  v_occ_ids  uuid[] := '{}';
  v_occ_nb   int[]  := '{}';
  v_code     text;
begin
  if not a_role('regie', 'admin') then raise exception 'Seule la Régie peut changer un emplacement LED'; end if;

  select * into l from lignes_vendues where id = p_ligne;
  if not found then raise exception 'Diffusion introuvable'; end if;
  select pr.nom, s.nom into v_produit, v_sponsor
  from produits pr, contrats c join sponsors s on s.id = c.sponsor_id
  where pr.id = l.produit_id and c.id = l.contrat_id;

  select * into v_depart from emplacements where id = p_emplacement;
  if not found then raise exception 'Emplacement introuvable'; end if;

  -- emplacements actuels de la diffusion, dans l'ordre
  select coalesce(array_agg(e.id order by e.anneau, e.position), '{}') into v_anciens
  from lignes_emplacements le join emplacements e on e.id = le.emplacement_id
  where le.ligne_id = p_ligne;

  v_n := case when v_produit ilike '%6M%' then 2 else greatest(cardinality(v_anciens), 1) end;
  if v_produit ilike '%6M%' and v_depart.bande <> '6M' then
    raise exception 'Une LED 6M ne peut aller que sur la bande 6M (anneaux C / D)';
  end if;

  -- emplacements visés : celui choisi (+ le suivant du même anneau pour une LED 6M)
  select array_agg(id order by position) into v_cibles
  from emplacements
  where anneau = v_depart.anneau and position >= v_depart.position and position < v_depart.position + v_n;
  if cardinality(v_cibles) < v_n then
    raise exception 'Pas assez de place après %-%-% (une LED 6M prend 2 emplacements qui se suivent)',
      v_depart.anneau, v_depart.zone, v_depart.position;
  end if;
  if exists (select 1 from emplacements where id = any (v_cibles) and reserve_club) then
    raise exception 'Emplacement réservé au club';
  end if;
  if v_cibles = v_anciens then return 'Déjà à cet emplacement'; end if;

  -- places libérées pour un échange
  select coalesce(array_agg(x order by o), '{}') into v_libres
  from unnest(v_anciens) with ordinality as t(x, o) where x <> all (v_cibles);

  -- sponsors qui occupent les emplacements visés (diffusions en cours), dans l'ordre des emplacements
  for v_occ in
    select lv.id as ligne_id, s.nom,
           (select array_agg(e2.id order by e2.anneau, e2.position)
              from lignes_emplacements x join emplacements e2 on e2.id = x.emplacement_id
             where x.ligne_id = lv.id) as empls
    from lignes_emplacements le
    join emplacements e on e.id = le.emplacement_id
    join lignes_vendues lv on lv.id = le.ligne_id
    join contrats c on c.id = lv.contrat_id
    join sponsors s on s.id = c.sponsor_id
    where le.emplacement_id = any (v_cibles) and lv.id <> p_ligne
      and lv.statut not in ('annule', 'termine')
      and (lv.date_fin is null or lv.date_fin >= current_date)
    group by lv.id, s.nom
    order by min(e.position)
  loop
    if not (v_occ.empls <@ v_cibles) then
      raise exception '% occupe aussi un emplacement à côté : déplacez plutôt %', v_occ.nom, v_occ.nom;
    end if;
    v_occ_ids := v_occ_ids || v_occ.ligne_id;
    v_occ_nb := v_occ_nb || cardinality(v_occ.empls);
    v_noms := v_noms || v_occ.nom;
    v_besoin := v_besoin + cardinality(v_occ.empls);
  end loop;
  if v_besoin > cardinality(v_libres) then
    if cardinality(v_anciens) = 0 then
      raise exception 'Emplacement occupé : % n''a pas encore d''emplacement à échanger', v_sponsor;
    end if;
    raise exception 'Échange impossible : il n''y a pas la même place des deux côtés (LED 3M ↔ LED 6M ?)';
  end if;

  -- 1. la diffusion et les occupants quittent leurs emplacements
  delete from lignes_emplacements where ligne_id = p_ligne or ligne_id = any (v_occ_ids);
  -- 2. les occupants prennent les places libérées, dans l'ordre
  for j in 1 .. cardinality(v_occ_ids) loop
    insert into lignes_emplacements (ligne_id, emplacement_id)
    select v_occ_ids[j], v_libres[i] from generate_series(v_i, v_i + v_occ_nb[j] - 1) as i;
    v_i := v_i + v_occ_nb[j];
  end loop;
  -- 3. la diffusion prend les emplacements visés
  insert into lignes_emplacements (ligne_id, emplacement_id) select p_ligne, unnest(v_cibles);

  select string_agg(anneau || '-' || zone || '-' || position, ' + ' order by position) into v_code
  from emplacements where id = any (v_cibles);
  return coalesce(v_sponsor, 'Sponsor') || ' déplacé en ' || v_code
    || case when cardinality(v_noms) > 0 then ' · échangé avec ' || array_to_string(v_noms, ', ') else '' end;
end;
$$;

grant execute on function deplacer_emplacement(uuid, uuid) to authenticated;

select 'Migration 75 OK : déplacer un sponsor LED' as "Résultat";
