-- =====================================================================
-- 34 — Visuels qui changent selon le match
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Deux cas (expliqués par Léa le 02.10.2026, une minorité de sponsors) :
--   1. FR / DE un match sur deux : la demande contient plusieurs fichiers, chacun avec sa version,
--      et la version du premier match. La diffusion passe en règle « alterner » : ordre des versions
--      (ordre_variantes) + match de départ (alternance_depart) ; ensuite, une version par match à tour de rôle.
--   2. Vidéo spéciale pour certains matchs (ex. vidéo du chef présent ce soir-là) : demande
--      « Changement de visuel » pour certains matchs sur une diffusion à la saison. Le visuel est
--      rattaché à ces matchs seulement (assets.match_id) ; les autres matchs gardent le visuel habituel.
--      (Avant : il remplaçait le visuel pour toute la saison.)

-- 1. Colonnes ------------------------------------------------------------------
alter table demandes_produits
  add column if not exists rotation       text check (rotation is null or rotation = 'alterner'),
  add column if not exists versions       jsonb,      -- { "<nom du fichier>": "FR", … }
  add column if not exists ordre_versions text[];     -- [version du premier match, puis les suivantes]

alter table lignes_vendues
  add column if not exists ordre_variantes   text[],
  add column if not exists alternance_depart uuid references matchs (id) on delete set null;

-- 2. Visuel d'un passage ---------------------------------------------------------
create or replace function choisir_asset(p_ligne uuid, p_match uuid)
returns uuid
language plpgsql stable
set search_path = public
as $$
declare
  l        lignes_vendues;
  v_id     uuid;
  v_nb     int;
  v_rang   int;
  v_depart int;
  v_num    int;
begin
  select * into l from lignes_vendues where id = p_ligne;

  -- visuel réservé à ce match (vidéo spéciale) : quelle que soit la règle
  select id into v_id from assets
  where ligne_id = p_ligne and statut = 'valide' and match_id = p_match
  order by version desc, depose_le desc limit 1;
  if v_id is not null then return v_id; end if;

  if l.regle_rotation in ('alterner', 'equilibrer') then
    v_nb := coalesce(array_length(l.ordre_variantes, 1), 0);
    if v_nb >= 2 then
      -- rang du match parmi les matchs de la diffusion ; le match de départ a la 1re version
      with r as (
        select x.match_id, row_number() over (order by m.date_heure) as n
        from matchs_de_ligne(p_ligne) x join matchs m on m.id = x.match_id
      )
      select (select n from r where match_id = p_match),
             coalesce((select n from r where match_id = l.alternance_depart), 1)
      into v_rang, v_depart;
      if v_rang is not null then
        select id into v_id from assets
        where ligne_id = p_ligne and statut = 'valide' and match_id is null
          and variante = l.ordre_variantes[1 + (((v_rang - v_depart) % v_nb) + v_nb) % v_nb]
        order by version desc, depose_le desc limit 1;
        if v_id is not null then return v_id; end if;
      end if;
    else
      -- ancienne règle : variantes par ordre alphabétique, selon le numéro du match
      select numero into v_num from matchs where id = p_match;
      select count(*) into v_nb from assets where ligne_id = p_ligne and statut = 'valide' and match_id is null;
      if v_nb > 0 and v_num is not null then
        select id into v_id from assets
        where ligne_id = p_ligne and statut = 'valide' and match_id is null
        order by coalesce(variante, ''), version
        offset ((v_num - 1) % v_nb) limit 1;
        return v_id;
      end if;
    end if;
  end if;

  -- un seul visuel (ou repli) : le dernier validé
  select id into v_id from assets
  where ligne_id = p_ligne and statut = 'valide' and match_id is null
  order by version desc, depose_le desc limit 1;
  return v_id;
end $$;

-- l'ordre des versions et le match de départ changent aussi les passages
drop trigger if exists lignes_passages on lignes_vendues;
create trigger lignes_passages after insert or update of
  statut, type_vente, inclut_playoffs, date_debut, date_fin, un_match_sur, regle_rotation, contrat_id,
  validee, suspendue, ordre_variantes, alternance_depart
  on lignes_vendues for each row execute function tg_ligne_passages();

-- 3. Traiter UN produit d'une demande (reprend 13 ; nouveau : versions et visuels réservés à des matchs)
-- p_options.fichiers[] reçoit en plus "variante" (FR, DE…)
create or replace function traiter_produit(p_demande uuid, p_produit uuid, p_suite text, p_options jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  d          demandes;
  dp         demandes_produits;
  pr         produits;
  f          jsonb;
  v_sponsor  uuid;
  v_saison   uuid;
  v_contrat  uuid;
  v_ligne    uuid;
  v_anneau   uuid;
  v_asset    uuid;
  v_matchs   uuid[];
  v_m        uuid;
  n_assets   int := 0;
  v_traitee  boolean := false;
begin
  if not a_role('regie', 'admin') then
    raise exception 'Seule la Régie peut ajouter une demande à un produit';
  end if;

  select * into d from demandes where id = p_demande for update;
  if not found then raise exception 'Demande introuvable'; end if;
  select * into dp from demandes_produits where demande_id = p_demande and produit_id = p_produit;
  if not found then raise exception 'Ce produit ne fait pas partie de la demande'; end if;
  if dp.traite_le is not null then raise exception 'Ce produit a déjà été traité pour cette demande'; end if;
  select * into pr from produits where id = p_produit;
  p_options := coalesce(p_options, '{}'::jsonb);

  if p_suite = 'ajoute' then
    v_sponsor := sponsor_de_demande(p_demande);
    v_saison  := coalesce(d.saison_id, (select id from saisons where active limit 1));
    v_contrat := contrat_pour(v_sponsor, v_saison);

    insert into lignes_vendues (contrat_id, produit_id, demande_id, type_vente, duree_s, avec_son, consignes, statut)
    values (v_contrat, pr.id, p_demande, dp.type_vente, dp.duree_s, coalesce(dp.avec_son, false),
            nullif(concat_ws(E'\n', dp.remarque_sponsoring, dp.remarque_regie), ''), 'vendu')
    returning id into v_ligne;

    insert into lignes_matchs (ligne_id, match_id)
    select v_ligne, m.id from matchs m
    where dp.type_vente = 'match'
      and (m.date_heure at time zone 'Europe/Zurich')::date = any (dp.dates_matchs);

    insert into lignes_emplacements (ligne_id, emplacement_id)
    select v_ligne, e::uuid from jsonb_array_elements_text(coalesce(p_options->'emplacements', '[]'::jsonb)) e;

    -- Pub pause tiers « avec anneau LED » : ligne Anneau LED couplée
    if dp.avec_anneau and pr.lie_a_produit_id is not null then
      insert into lignes_vendues (contrat_id, produit_id, demande_id, type_vente, duree_s, avec_son,
                                  consignes, statut, ligne_couplee_id)
      values (v_contrat, pr.lie_a_produit_id, p_demande, dp.type_vente, dp.duree_s, false,
              'Couplé à : ' || pr.nom, 'vendu', v_ligne)
      returning id into v_anneau;

      insert into lignes_matchs (ligne_id, match_id)
      select v_anneau, match_id from lignes_matchs where ligne_id = v_ligne;

      update lignes_vendues set ligne_couplee_id = v_anneau where id = v_ligne;
    end if;

  elsif p_suite = 'visuel' then
    v_ligne := nullif(p_options->>'ligne_id', '')::uuid;
    select ligne_couplee_id into v_anneau from lignes_vendues where id = v_ligne and produit_id = p_produit;
    if not found then raise exception 'Diffusion introuvable pour « % »', pr.nom; end if;

  elsif p_suite = 'retire' then
    v_ligne := nullif(p_options->>'ligne_id', '')::uuid;
    update lignes_vendues
    set date_fin = coalesce(nullif(p_options->>'date_fin', '')::date, current_date)
    where id = v_ligne
       or id = (select ligne_couplee_id from lignes_vendues where id = v_ligne);
    if not found then raise exception 'Diffusion introuvable pour « % »', pr.nom; end if;

  elsif p_suite <> 'ignore' then
    raise exception 'Action inconnue : %', p_suite;
  end if;

  if p_suite in ('ajoute', 'visuel') then
    -- FR / DE un match sur deux : la diffusion alterne ses versions, à partir du prochain match
    if dp.rotation = 'alterner' and coalesce(array_length(dp.ordre_versions, 1), 0) >= 2 then
      update lignes_vendues
      set regle_rotation = 'alterner', ordre_variantes = dp.ordre_versions,
          alternance_depart = (select x.match_id from matchs_de_ligne(v_ligne) x join matchs m on m.id = x.match_id
                               where m.date_heure >= now() order by m.date_heure limit 1)
      where id = v_ligne;
    end if;

    -- Changement de visuel pour certains matchs sur une diffusion à la saison : visuel réservé à ces matchs
    -- (ex. vidéo du chef présent ce soir-là) ; sinon un seul visuel pour tous les matchs (match_id null)
    if p_suite = 'visuel' and dp.type_vente = 'match'
       and (select type_vente from lignes_vendues where id = v_ligne) = 'saison' then
      v_matchs := array(select m.id from matchs m
                        where (m.date_heure at time zone 'Europe/Zurich')::date = any (dp.dates_matchs));
      if coalesce(array_length(v_matchs, 1), 0) = 0 then
        raise exception 'Aucun match du calendrier aux dates de la demande';
      end if;
    else
      v_matchs := array[null::uuid];
    end if;

    -- Visuels : ajouter = valider (la Régie a vu le fichier et le contrôle). Valider archive l'ancien visuel
    -- de la même version et du même match (trigger assets_apres).
    for f in select * from jsonb_array_elements(coalesce(p_options->'fichiers', '[]'::jsonb)) loop
      foreach v_m in array v_matchs loop
        insert into assets (ligne_id, demande_id, nom_visuel, storage_path, mime, taille_octets,
                            largeur_px, hauteur_px, duree_s, avec_son, variante, match_id)
        values (case when f->>'role' = 'anneau' then coalesce(v_anneau, v_ligne) else v_ligne end,
                p_demande,
                coalesce(nullif(trim(f->>'nom_visuel'), ''), f->>'storage_path'),
                f->>'storage_path', f->>'mime', (f->>'taille_octets')::bigint,
                (f->>'largeur_px')::int, (f->>'hauteur_px')::int, (f->>'duree_s')::numeric,
                case when f->>'role' = 'anneau' then false else dp.avec_son end,
                case when f->>'role' = 'anneau' then null else nullif(trim(f->>'variante'), '') end,
                v_m)
        returning id into v_asset;
        update assets set statut = 'valide' where id = v_asset;
      end loop;
      n_assets := n_assets + 1;
    end loop;
  end if;

  update demandes_produits
  set suite = p_suite, traite_le = now(), traite_par = auth.uid(), ligne_id = v_ligne
  where demande_id = p_demande and produit_id = p_produit;

  -- Tous les produits traités : la demande est traitée
  if d.statut <> 'traitee'
     and not exists (select 1 from demandes_produits where demande_id = p_demande and traite_le is null) then
    update demandes set statut = 'traitee' where id = p_demande;
    v_traitee := true;
  end if;

  return jsonb_build_object('ligne_id', v_ligne, 'visuels', n_assets, 'demande_traitee', v_traitee);
end $$;

select 'Migration 34 OK : versions des visuels (un match sur deux) et visuels réservés à des matchs' as "Résultat";
