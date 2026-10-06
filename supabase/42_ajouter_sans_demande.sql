-- =====================================================================
-- 42 — La Régie ajoute un sponsor sur un produit SANS demande
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (06.10.2026) : des choses passent (ex. Pub warm-up) sans être passées par Airtable, décidées
-- en discussion. Bouton « + Ajouter un sponsor » sur la fiche produit (Régie / admin) -> ajouter_diffusion().
-- Comme « Ajouter » d'une demande (traiter_produit), mais sans demande :
--   sponsor repris par nom (ou créé), contrat de la saison, diffusion « À l'écran », anneau LED couplé,
--   matchs, visuels (fichier déposé et / ou simple nom du visuel dans Colosseo) directement validés.
-- « deja_dans_colosseo » = true : passe déjà -> rien à faire dans Match du jour (passages aussi sur les matchs passés) ;
-- false : à mettre dans Colosseo -> date_debut = aujourd'hui, Match du jour affiche « Ajouter » au prochain match.
--
-- p_options = { "ligne_id": "<uuid>" (facultatif, choisi par la page pour ranger les fichiers),
--               "sponsor_id": "<uuid>" | "sponsor_nom": "…", "type_vente": "saison" | "match",
--               "dates": ["2026-10-08", …], "avec_son": bool, "avec_anneau": bool, "duree_s": 15,
--               "consignes": "…", "deja_dans_colosseo": bool,
--               "visuels": [{ "role": "visuel" | "anneau", "nom_visuel": "…", "storage_path": "…", "nom": "…",
--                             "mime": "…", "taille_octets": 123, "largeur_px": 1920, "hauteur_px": 1080, "duree_s": 15 }] }

create or replace function ajouter_diffusion(p_produit uuid, p_options jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  pr         produits;
  o          jsonb := coalesce(p_options, '{}'::jsonb);
  f          jsonb;
  v_sponsor  uuid;
  v_nom      text;
  v_saison   uuid;
  v_contrat  uuid;
  v_ligne    uuid;
  v_anneau   uuid;
  v_asset    uuid;
  v_type     type_vente := coalesce(nullif(o->>'type_vente', ''), 'saison')::type_vente;
  v_son      boolean := coalesce((o->>'avec_son')::boolean, false);
  v_debut    date := case when coalesce((o->>'deja_dans_colosseo')::boolean, true) then null else current_date end;
begin
  if not a_role('regie', 'admin') then
    raise exception 'Seule la Régie peut ajouter un sponsor sur un produit';
  end if;
  select * into pr from produits where id = p_produit;
  if not found then raise exception 'Produit introuvable'; end if;

  -- sponsor : choisi dans la liste, sinon repris par nom, sinon créé
  v_sponsor := nullif(o->>'sponsor_id', '')::uuid;
  if v_sponsor is null then
    v_nom := trim(coalesce(o->>'sponsor_nom', ''));
    if v_nom = '' then raise exception 'Indiquez le sponsor'; end if;
    select id into v_sponsor from sponsors where lower(nom) = lower(v_nom);
    if v_sponsor is null then
      insert into sponsors (nom) values (v_nom) returning id into v_sponsor;
    end if;
  end if;

  v_saison := (select id from saisons where active limit 1);
  if v_saison is null then raise exception 'Aucune saison active'; end if;
  v_contrat := contrat_pour(v_sponsor, v_saison);

  if v_type = 'match' and jsonb_array_length(coalesce(o->'dates', '[]'::jsonb)) = 0 then
    raise exception 'Cochez au moins un match';
  end if;

  insert into lignes_vendues (id, contrat_id, produit_id, type_vente, date_debut, duree_s, avec_son, consignes, statut)
  values (coalesce(nullif(o->>'ligne_id', '')::uuid, gen_random_uuid()), v_contrat, pr.id, v_type, v_debut,
          nullif(o->>'duree_s', '')::numeric::int, v_son, nullif(trim(coalesce(o->>'consignes', '')), ''), 'vendu')
  returning id into v_ligne;

  insert into lignes_matchs (ligne_id, match_id)
  select v_ligne, m.id from matchs m
  where v_type = 'match'
    and (m.date_heure at time zone 'Europe/Zurich')::date in
        (select d::date from jsonb_array_elements_text(o->'dates') d);

  -- anneau LED couplé (même mécanisme que la demande, migrations 17 et 35)
  if coalesce((o->>'avec_anneau')::boolean, false) and pr.lie_a_produit_id is not null then
    insert into lignes_vendues (contrat_id, produit_id, type_vente, date_debut, duree_s, avec_son,
                                consignes, statut, ligne_couplee_id)
    values (v_contrat, pr.lie_a_produit_id, v_type, v_debut, nullif(o->>'duree_s', '')::numeric::int, false,
            'Couplé à : ' || pr.nom, 'vendu', v_ligne)
    returning id into v_anneau;
    insert into lignes_matchs (ligne_id, match_id)
    select v_anneau, match_id from lignes_matchs where ligne_id = v_ligne;
    update lignes_vendues set ligne_couplee_id = v_anneau where id = v_ligne;
  end if;

  -- visuels : validés tout de suite (la Régie sait ce qui passe)
  for f in select * from jsonb_array_elements(coalesce(o->'visuels', '[]'::jsonb)) loop
    continue when coalesce(nullif(trim(f->>'nom_visuel'), ''), nullif(f->>'storage_path', '')) is null;
    insert into assets (ligne_id, nom_visuel, storage_path, mime, taille_octets, largeur_px, hauteur_px, duree_s, avec_son)
    values (case when f->>'role' = 'anneau' then coalesce(v_anneau, v_ligne) else v_ligne end,
            coalesce(nullif(trim(f->>'nom_visuel'), ''), f->>'nom', f->>'storage_path'),
            nullif(f->>'storage_path', ''), f->>'mime', (f->>'taille_octets')::bigint,
            (f->>'largeur_px')::int, (f->>'hauteur_px')::int, (f->>'duree_s')::numeric,
            case when f->>'role' = 'anneau' then false else v_son end)
    returning id into v_asset;
    update assets set statut = 'valide' where id = v_asset;
    -- fichier déposé : aussi dans le dossier du sponsor
    if nullif(f->>'storage_path', '') is not null then
      insert into documents_sponsors (sponsor_id, produit_id, role, nom, storage_path, mime, taille_octets, notes)
      values (v_sponsor, pr.id, coalesce(f->>'role', 'visuel'), coalesce(f->>'nom', f->>'storage_path'),
              f->>'storage_path', f->>'mime', (f->>'taille_octets')::bigint, 'Ajouté par la Régie sur la fiche produit')
      on conflict (storage_path) do nothing;
    end if;
  end loop;

  return jsonb_build_object('ligne_id', v_ligne, 'sponsor_id', v_sponsor);
end $$;

select 'Migration 42 OK : la Régie peut ajouter un sponsor sur un produit sans demande' as "Résultat";
