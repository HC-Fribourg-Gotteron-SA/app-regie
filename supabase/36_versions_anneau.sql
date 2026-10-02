-- =====================================================================
-- 36 — FR / DE un match sur deux aussi pour le visuel de l'anneau LED
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 34, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (02.10.2026) : chez certains sponsors (ex. la Mobilière), c'est SEULEMENT l'anneau LED qui
-- change VF / DE, pas la vidéo. Chaque zone de fichiers de la demande (vidéo, anneau) a donc sa propre question
-- « un match sur deux » ; l'anneau a sa propre diffusion (ligne couplée), qui alterne comme la vidéo.
--   demandes_produits.rotation_anneau / ordre_versions_anneau : comme rotation / ordre_versions (34), pour l'anneau.
--   demandes_produits.versions : clés « <role>__<nom du fichier> » (anciennes clés sans rôle = vidéo).

-- 1. Colonnes ------------------------------------------------------------------
alter table demandes_produits
  add column if not exists rotation_anneau       text check (rotation_anneau is null or rotation_anneau = 'alterner'),
  add column if not exists ordre_versions_anneau text[];

-- 2. Traiter UN produit d'une demande (reprend 34 ; nouveau : versions de l'anneau)
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

    -- produit « avec anneau LED » : ligne de l'anneau couplée
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
    -- FR / DE un match sur deux, à partir du prochain match : la vidéo…
    if dp.rotation = 'alterner' and coalesce(array_length(dp.ordre_versions, 1), 0) >= 2 then
      update lignes_vendues
      set regle_rotation = 'alterner', ordre_variantes = dp.ordre_versions,
          alternance_depart = (select x.match_id from matchs_de_ligne(v_ligne) x join matchs m on m.id = x.match_id
                               where m.date_heure >= now() order by m.date_heure limit 1)
      where id = v_ligne;
    end if;
    -- … et / ou l'anneau LED (sa propre diffusion)
    if v_anneau is not null and dp.rotation_anneau = 'alterner'
       and coalesce(array_length(dp.ordre_versions_anneau, 1), 0) >= 2 then
      update lignes_vendues
      set regle_rotation = 'alterner', ordre_variantes = dp.ordre_versions_anneau,
          alternance_depart = (select x.match_id from matchs_de_ligne(v_anneau) x join matchs m on m.id = x.match_id
                               where m.date_heure >= now() order by m.date_heure limit 1)
      where id = v_anneau;
    end if;

    -- Visuels : ajouter = valider (la Régie a vu le fichier et le contrôle). Valider archive l'ancien visuel
    -- de la même version seulement (trigger assets_apres) : FR et DE restent tous les deux.
    for f in select * from jsonb_array_elements(coalesce(p_options->'fichiers', '[]'::jsonb)) loop
      insert into assets (ligne_id, demande_id, nom_visuel, storage_path, mime, taille_octets,
                          largeur_px, hauteur_px, duree_s, avec_son, variante)
      values (case when f->>'role' = 'anneau' then coalesce(v_anneau, v_ligne) else v_ligne end,
              p_demande,
              coalesce(nullif(trim(f->>'nom_visuel'), ''), f->>'storage_path'),
              f->>'storage_path', f->>'mime', (f->>'taille_octets')::bigint,
              (f->>'largeur_px')::int, (f->>'hauteur_px')::int, (f->>'duree_s')::numeric,
              case when f->>'role' = 'anneau' then false else dp.avec_son end,
              nullif(trim(f->>'variante'), ''))
      returning id into v_asset;
      update assets set statut = 'valide' where id = v_asset;
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

select 'Migration 36 OK : FR / DE un match sur deux aussi pour l''anneau LED' as "Résultat";
