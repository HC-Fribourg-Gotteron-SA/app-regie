-- =====================================================================
-- 13 — « Ajouter » valide directement le visuel
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 12.
-- =====================================================================
-- Pour la Régie, ajouter une demande sur la fiche produit = valider son
-- visuel (le fichier et le contrôle des dimensions sont visibles avant
-- de cliquer). traiter_produit() crée donc les visuels directement
-- « validés » : la ligne passe en « programmé » et les passages reçoivent
-- le visuel. Pour « Mettre le nouveau visuel », l'ancien est archivé.
-- (Même fonction que dans 11, seul le bloc « Visuels » change.)

-- Traiter UN produit d'une demande ------------------------------------------
-- p_suite   = 'ajoute' | 'visuel' | 'retire' | 'ignore'
-- p_options = { "ligne_id": "<uuid>",            -- visuel / retire : la diffusion existante
--               "date_fin": "2026-10-03",         -- retire
--               "emplacements": ["<uuid>", …],    -- LED 3M / 6M (facultatif)
--               "fichiers": [{ "role": "visuel" | "anneau", "storage_path": "…", "nom_visuel": "…",
--                              "mime": "…", "taille_octets": 123, "largeur_px": 1920,
--                              "hauteur_px": 1080, "duree_s": 15.2 }] }
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

  -- Visuels : ajouter = valider (la Régie a vu le fichier et le contrôle sur la fiche produit).
  -- Valider archive automatiquement l'ancien visuel de la ligne (trigger assets_apres).
  if p_suite in ('ajoute', 'visuel') then
    for f in select * from jsonb_array_elements(coalesce(p_options->'fichiers', '[]'::jsonb)) loop
      insert into assets (ligne_id, demande_id, nom_visuel, storage_path, mime, taille_octets,
                          largeur_px, hauteur_px, duree_s, avec_son)
      values (case when f->>'role' = 'anneau' then coalesce(v_anneau, v_ligne) else v_ligne end,
              p_demande,
              coalesce(nullif(trim(f->>'nom_visuel'), ''), f->>'storage_path'),
              f->>'storage_path', f->>'mime', (f->>'taille_octets')::bigint,
              (f->>'largeur_px')::int, (f->>'hauteur_px')::int, (f->>'duree_s')::numeric,
              case when f->>'role' = 'anneau' then false else dp.avec_son end)
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
