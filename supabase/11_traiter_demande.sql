-- =====================================================================
-- 11 — Ajouter les demandes depuis les fiches produit
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 10.
-- (Remplace une première version de ce fichier : on peut l'exécuter même
--  si l'ancienne version a déjà été exécutée.)
-- =====================================================================
-- Sur la fiche d'un produit, la Régie voit les demandes « à ajouter » et
-- clique « Ajouter » (ou « Mettre le nouveau visuel », « Retirer »,
-- « Ignorer »). traiter_produit() fait tout en une transaction : sponsor
-- créé si nouveau, contrat retrouvé ou créé (invisible à l'écran), ligne
-- vendue (+ ligne Anneau LED couplée), matchs, emplacements LED, visuels à
-- valider (qui pointent vers les fichiers déposés avec la demande).
-- Quand tous les produits d'une demande sont traités, la demande passe
-- automatiquement en « traitée ».
-- Fonctions « security invoker » : les droits (RLS) de la personne s'appliquent.

drop function if exists traiter_demande(uuid, jsonb, jsonb, text);

-- Suivi par produit d'une demande ------------------------------------------
alter table demandes_produits
  add column if not exists suite      text check (suite in ('ajoute', 'visuel', 'retire', 'ignore')),
  add column if not exists traite_le  timestamptz,
  add column if not exists traite_par uuid references profiles (id),
  add column if not exists ligne_id   uuid references lignes_vendues (id) on delete set null;

create index if not exists demandes_produits_a_traiter on demandes_produits (produit_id) where traite_le is null;

-- Contrat du sponsor qui couvre la saison ; créé s'il n'existe pas ---------
create or replace function contrat_pour(p_sponsor uuid, p_saison uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid;
begin
  select c.id into v_id
  from contrats c
  join saisons sd on sd.id = c.saison_debut_id
  join saisons sf on sf.id = c.saison_fin_id
  join saisons s  on s.id = p_saison
  where c.sponsor_id = p_sponsor and sd.debut <= s.debut and sf.fin >= s.fin
  order by c.created_at
  limit 1;

  if v_id is null then
    insert into contrats (sponsor_id, saison_debut_id, saison_fin_id)
    values (p_sponsor, p_saison, p_saison)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Sponsor d'une demande : repris s'il existe (même nom), sinon créé ---------
create or replace function sponsor_de_demande(p_demande uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  d demandes;
  v_id uuid;
begin
  select * into d from demandes where id = p_demande;
  if d.sponsor_id is not null then return d.sponsor_id; end if;
  if coalesce(trim(d.sponsor_nom_saisi), '') = '' then raise exception 'La demande n''indique pas de sponsor'; end if;

  select id into v_id from sponsors where lower(nom) = lower(trim(d.sponsor_nom_saisi));
  if v_id is null then
    insert into sponsors (nom) values (trim(d.sponsor_nom_saisi)) returning id into v_id;
  end if;
  update demandes set sponsor_id = v_id where id = p_demande;
  return v_id;
end $$;

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

  -- Visuels à valider
  if p_suite in ('ajoute', 'visuel') then
    for f in select * from jsonb_array_elements(coalesce(p_options->'fichiers', '[]'::jsonb)) loop
      insert into assets (ligne_id, demande_id, nom_visuel, storage_path, mime, taille_octets,
                          largeur_px, hauteur_px, duree_s, avec_son)
      values (case when f->>'role' = 'anneau' then coalesce(v_anneau, v_ligne) else v_ligne end,
              p_demande,
              coalesce(nullif(trim(f->>'nom_visuel'), ''), f->>'storage_path'),
              f->>'storage_path', f->>'mime', (f->>'taille_octets')::bigint,
              (f->>'largeur_px')::int, (f->>'hauteur_px')::int, (f->>'duree_s')::numeric,
              case when f->>'role' = 'anneau' then false else dp.avec_son end);
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
