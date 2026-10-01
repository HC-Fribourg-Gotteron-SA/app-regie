-- =====================================================================
-- INSTALLATION COMPLÈTE d'une base neuve (base de TEST) — généré par outils/installation-base-test.mjs
-- À exécuter UNE fois dans le SQL Editor du projet de test (jamais sur la vraie base).
-- Contient : 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28.
-- Ensuite : créer son compte (Authentication > Users), se mettre admin (voir en bas),
-- importer le calendrier dans l'outil (.ics), puis lancer supabase/demo_donnees_test.sql.
-- =====================================================================

-- #####################################################################
-- 01_schema.sql
-- #####################################################################
-- =====================================================================
-- Outil Sponsoring <-> Régie — HC Fribourg-Gottéron
-- 01_schema.sql : types, tables, index, fonctions métier, vues
-- À exécuter dans Supabase > SQL Editor (ou via `supabase db push`),
-- puis 02_securite.sql, puis 03_donnees_depart.sql.
-- =====================================================================

create extension if not exists pg_trgm;   -- recherche tolérante sur les noms de sponsors

-- ---------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------
create type role_app        as enum ('sponsoring', 'regie', 'admin');
create type famille_produit as enum ('emplacement', 'slide', 'temps', 'exclusif');
create type mode_vente      as enum ('saison', 'match', 'les_deux');
create type type_vente      as enum ('saison', 'match');
create type origine_sponsor as enum ('sponsor', 'club', 'ligue');
create type type_match      as enum ('saison', 'playoffs', 'amical');
create type moment_diffusion as enum (
  'avant_match', 'echauffement', 'apres_echauffement', 'pendant_jeu',
  'pause_tiers', 'arret_de_jeu', 'fin_de_match', 'continu');
create type frequence_diffusion as enum (
  'par_match', 'par_tiers', 'par_pause', 'echauffement', 'fin_de_match', 'autre');
create type regle_rotation  as enum ('unique', 'alterner', 'equilibrer', 'par_match', 'par_langue');
create type statut_ligne    as enum (
  'brouillon', 'vendu', 'fichiers_attendus', 'a_valider', 'valide', 'programme', 'termine', 'annule');
create type statut_asset    as enum ('a_valider', 'valide', 'refuse', 'archive');
create type statut_passage  as enum ('prevu', 'diffuse', 'non_diffuse', 'suspendu');
create type type_demande    as enum ('nouveau_sponsor', 'ajout_produit', 'changement_visuel', 'suppression', 'autre');
create type statut_demande  as enum ('nouvelle', 'en_cours', 'question', 'traitee');

-- ---------------------------------------------------------------------
-- 2. Référentiels (gérés par les admins)
-- ---------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nom         text,
  role        role_app,                      -- null = compte en attente d'activation par un admin
  created_at  timestamptz not null default now()
);

create table saisons (
  id       uuid primary key default gen_random_uuid(),
  libelle  text not null unique,             -- ex. '2026-27'
  debut    date not null,
  fin      date not null,
  active   boolean not null default false,
  check (fin > debut)
);
create unique index saisons_une_seule_active on saisons (active) where active;

create table matchs (
  id          uuid primary key default gen_random_uuid(),
  saison_id   uuid not null references saisons (id),
  numero      int  not null,                 -- 1, 2, 3… dans la saison (sert à « 1 match sur 2 »)
  date_heure  timestamptz not null,
  adversaire  text not null,
  type        type_match not null default 'saison',
  created_at  timestamptz not null default now(),
  unique (saison_id, numero)
);
create index matchs_date on matchs (date_heure);

create table produits (
  id                       uuid primary key default gen_random_uuid(),
  nom                      text not null unique,
  categorie                text,              -- regroupement d'affichage : 'LED bandes', 'Young Dragons', 'Action scenes'…
  famille                  famille_produit not null,
  support                  text,              -- 'Anneau LED', 'Vidéotron', 'Angles', 'Bande LED', 'LED Sportcafé'…
  mode_vente               mode_vente not null default 'saison',
  moment_defaut            moment_diffusion,
  -- capacité
  capacite_s               int,               -- famille 'temps' : secondes disponibles par match (null = non plafonné)
  emplacements_requis      int  default 1,    -- famille 'emplacement' : 1 pour 3M, 2 pour 6M
  logos_par_slide          int,               -- famille 'slide'
  duree_par_slide_s        int,               -- famille 'slide' : durée d'affichage d'une slide
  -- specs attendues des fichiers
  largeur_px               int,
  hauteur_px               int,
  formats                  text[],            -- ex. '{png,jpg,mp4}'
  duree_max_s              int,
  poids_max_mo             int,
  -- liens entre produits
  lie_a_produit_id         uuid references produits (id),   -- vidéotron <-> anneau LED couplé
  diffuse_dans_produit_id  uuid references produits (id),   -- slides -> diffusées dans la pub pause tiers
  actif                    boolean not null default true,
  created_at               timestamptz not null default now(),
  check (famille <> 'slide' or logos_par_slide > 0)
);

create table emplacements (
  id            uuid primary key default gen_random_uuid(),
  bande         text not null,                -- '3M' (anneaux A/B) ou '6M' (anneaux C/D)
  anneau        text not null,                -- 'A', 'B', 'C', 'D'
  zone          text not null,                -- 'OUEST', 'NORD-OUEST', 'NORD'…
  position      int  not null,                -- ordre physique dans l'anneau
  reserve_club  boolean not null default false,
  largeur_px    int not null default 300,
  hauteur_px    int not null default 80,
  unique (anneau, position)
);

-- ---------------------------------------------------------------------
-- 3. Sponsors, contrats, lignes vendues
-- ---------------------------------------------------------------------
create table sponsors (
  id                   uuid primary key default gen_random_uuid(),
  nom                  text not null,
  alias                text[] not null default '{}',   -- variantes d'écriture rencontrées
  origine              origine_sponsor not null default 'sponsor',
  contact_nom          text,
  email                text,
  telephone            text,
  commercial_id        uuid references profiles (id),
  remplace_sponsor_id  uuid references sponsors (id),  -- « Frienergie remplace Ewatra »
  actif                boolean not null default true,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index sponsors_nom_unique on sponsors (lower(nom));
create index sponsors_nom_trgm on sponsors using gin (nom gin_trgm_ops);

create table contrats (
  id                uuid primary key default gen_random_uuid(),
  sponsor_id        uuid not null references sponsors (id),
  saison_debut_id   uuid not null references saisons (id),
  saison_fin_id     uuid not null references saisons (id),   -- = début pour un contrat d'une saison
  reference         text,
  notes             text,
  created_by        uuid references profiles (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index contrats_sponsor on contrats (sponsor_id);

create table demandes (
  id                   uuid primary key default gen_random_uuid(),
  sponsor_id           uuid references sponsors (id),      -- null tant qu'un nouveau sponsor n'est pas créé
  sponsor_nom_saisi    text,                               -- nom tel que saisi pour un nouveau sponsor
  type                 type_demande not null,
  date_effet           date,
  match_effet_id       uuid references matchs (id),        -- alternative à la date : « dès le match du 26.9 »
  remarque_sponsoring  text,
  reponse_regie        text,
  statut               statut_demande not null default 'nouvelle',
  cree_par             uuid references profiles (id) default auth.uid(),
  traite_par           uuid references profiles (id),
  traite_le            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (sponsor_id is not null or sponsor_nom_saisi is not null)
);
create index demandes_statut on demandes (statut);

create table demandes_produits (
  demande_id  uuid references demandes (id) on delete cascade,
  produit_id  uuid references produits (id),
  primary key (demande_id, produit_id)
);

create table lignes_vendues (
  id                 uuid primary key default gen_random_uuid(),
  contrat_id         uuid not null references contrats (id) on delete cascade,
  produit_id         uuid not null references produits (id),
  demande_id         uuid references demandes (id),
  type_vente         type_vente not null default 'saison',
  inclut_playoffs    boolean not null default false,
  date_debut         date,                   -- « dès le 26.9 » ; null = début du contrat
  date_fin           date,                   -- date d'effet d'une suppression ; null = fin du contrat
  -- diffusion
  duree_s            int,                    -- durée d'un passage (temps d'antenne)
  occurrences        int not null default 1, -- nombre de passages par match
  frequence          frequence_diffusion not null default 'par_match',
  moment             moment_diffusion,       -- null = moment par défaut du produit
  tiers              smallint[],             -- ex. '{1}' = uniquement au 1er tiers ; null = tous
  un_match_sur       int not null default 1 check (un_match_sur >= 1),
  priorite           int,                    -- ajustement manuel de l'ordre par la Régie
  avec_son           boolean not null default false,
  regle_rotation     regle_rotation not null default 'unique',
  ligne_couplee_id   uuid references lignes_vendues (id),   -- vidéo vidéotron <-> visuel anneau
  consignes          text,                   -- tout ce qui ne rentre pas dans les champs
  -- suivi
  statut             statut_ligne not null default 'brouillon',
  suspendue          boolean not null default false,
  motif_suspension   text,
  reprise_le         date,
  created_by         uuid references profiles (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (date_fin is null or date_debut is null or date_fin >= date_debut)
);
create index lignes_produit on lignes_vendues (produit_id);
create index lignes_contrat on lignes_vendues (contrat_id);
create index lignes_statut on lignes_vendues (statut);

create table lignes_matchs (
  ligne_id  uuid references lignes_vendues (id) on delete cascade,
  match_id  uuid references matchs (id) on delete cascade,
  primary key (ligne_id, match_id)
);

create table lignes_emplacements (
  ligne_id        uuid references lignes_vendues (id) on delete cascade,
  emplacement_id  uuid references emplacements (id),
  primary key (ligne_id, emplacement_id)
);
create index lignes_emplacements_empl on lignes_emplacements (emplacement_id);

-- ---------------------------------------------------------------------
-- 4. Visuels (assets) et passages
-- ---------------------------------------------------------------------
create table assets (
  id              uuid primary key default gen_random_uuid(),
  ligne_id        uuid not null references lignes_vendues (id) on delete cascade,
  demande_id      uuid references demandes (id),
  nom_visuel      text not null,             -- nom exact à retrouver dans Colosseo
  version         int  not null default 1,
  variante        text,                      -- 'FR', 'DE', 'V1', 'moitié nord'…
  match_id        uuid references matchs (id),   -- spot réservé à un match précis (règle par_match)
  storage_path    text,                      -- chemin dans le bucket 'assets'
  mime            text,
  largeur_px      int,
  hauteur_px      int,
  duree_s         numeric(6,2),
  taille_octets   bigint,
  avec_son        boolean,
  conformite      jsonb not null default '[]', -- alertes calculées au dépôt
  statut          statut_asset not null default 'a_valider',
  motif_refus     text,
  depose_par      uuid references profiles (id) default auth.uid(),
  depose_le       timestamptz not null default now(),
  valide_par      uuid references profiles (id),
  valide_le       timestamptz
);
create index assets_ligne on assets (ligne_id);
create index assets_statut on assets (statut);

create table passages (
  id              uuid primary key default gen_random_uuid(),
  ligne_id        uuid not null references lignes_vendues (id) on delete cascade,
  match_id        uuid not null references matchs (id) on delete cascade,
  asset_id        uuid references assets (id) on delete set null,
  ordre           int,
  statut          statut_passage not null default 'prevu',
  motif           text,
  saisi_colosseo  boolean not null default false,
  saisi_par       uuid references profiles (id),
  pointe_par      uuid references profiles (id),
  pointe_le       timestamptz,
  created_at      timestamptz not null default now(),
  unique (ligne_id, match_id)
);
create index passages_match on passages (match_id);

create table journal (
  id          bigint generated always as identity primary key,
  table_nom   text not null,
  ligne_id    uuid,
  action      text not null,
  user_id     uuid default auth.uid(),
  le          timestamptz not null default now(),
  avant       jsonb,
  apres       jsonb
);
create index journal_ligne on journal (ligne_id);

-- =====================================================================
-- 5. Fonctions métier
-- =====================================================================

-- Matchs couverts par une ligne vendue --------------------------------
create or replace function matchs_de_ligne(p_ligne uuid)
returns table (match_id uuid)
language sql stable
set search_path = public
as $$
  with l as (
    select lv.*, c.saison_debut_id, c.saison_fin_id
    from lignes_vendues lv join contrats c on c.id = lv.contrat_id
    where lv.id = p_ligne
  ),
  bornes as (
    select l.*, sd.debut as contrat_debut, sf.fin as contrat_fin
    from l
    join saisons sd on sd.id = l.saison_debut_id
    join saisons sf on sf.id = l.saison_fin_id
  )
  -- vente par match : les matchs cochés
  select lm.match_id
  from bornes b join lignes_matchs lm on lm.ligne_id = b.id
  where b.type_vente = 'match'
  union
  -- vente à la saison : tous les matchs à domicile de la période
  select m.id
  from bornes b
  join matchs m on m.date_heure::date between b.contrat_debut and b.contrat_fin
  where b.type_vente = 'saison'
    and (m.type = 'saison' or (m.type = 'playoffs' and b.inclut_playoffs))
    and (b.date_debut is null or m.date_heure::date >= b.date_debut)
    and (b.date_fin   is null or m.date_heure::date <= b.date_fin)
    and ((m.numero - 1) % b.un_match_sur) = 0
$$;

-- Choix du visuel d'un passage selon la règle de rotation --------------
create or replace function choisir_asset(p_ligne uuid, p_match uuid)
returns uuid
language plpgsql stable
set search_path = public
as $$
declare
  v_regle regle_rotation;
  v_num   int;
  v_nb    int;
  v_id    uuid;
begin
  select regle_rotation into v_regle from lignes_vendues where id = p_ligne;
  select numero into v_num from matchs where id = p_match;

  if v_regle = 'par_match' then
    select id into v_id from assets
    where ligne_id = p_ligne and statut = 'valide' and match_id = p_match
    order by version desc limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if v_regle in ('alterner', 'equilibrer') then
    select count(*) into v_nb from assets where ligne_id = p_ligne and statut = 'valide' and match_id is null;
    if v_nb > 0 then
      select id into v_id from assets
      where ligne_id = p_ligne and statut = 'valide' and match_id is null
      order by coalesce(variante, ''), version
      offset ((v_num - 1) % v_nb) limit 1;
      return v_id;
    end if;
  end if;

  -- 'unique', 'par_langue' (tous les visuels valides sont affichés dans la préparation) ou repli
  select id into v_id from assets
  where ligne_id = p_ligne and statut = 'valide' and match_id is null
  order by version desc, depose_le desc limit 1;
  return v_id;
end $$;

-- (Re)génère les passages d'une ligne ----------------------------------
-- Ne touche jamais aux passages déjà pointés ni aux matchs passés.
create or replace function generer_passages(p_ligne uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut statut_ligne;
begin
  select statut into v_statut from lignes_vendues where id = p_ligne;

  -- ligne pas (ou plus) active : on retire les passages futurs non pointés
  if v_statut in ('brouillon', 'annule') then
    delete from passages p using matchs m
    where p.ligne_id = p_ligne and m.id = p.match_id
      and p.statut = 'prevu' and m.date_heure >= now();
    return;
  end if;

  -- retirer les passages futurs de matchs qui ne sont plus couverts
  delete from passages p using matchs m
  where p.ligne_id = p_ligne and m.id = p.match_id
    and p.statut = 'prevu' and m.date_heure >= now()
    and p.match_id not in (select match_id from matchs_de_ligne(p_ligne));

  -- créer les passages manquants
  insert into passages (ligne_id, match_id, asset_id)
  select p_ligne, x.match_id, choisir_asset(p_ligne, x.match_id)
  from matchs_de_ligne(p_ligne) x
  on conflict (ligne_id, match_id) do nothing;

  -- rafraîchir le visuel des passages futurs non encore saisis dans Colosseo
  update passages p set asset_id = choisir_asset(p.ligne_id, p.match_id)
  from matchs m
  where p.ligne_id = p_ligne and m.id = p.match_id
    and p.statut = 'prevu' and not p.saisi_colosseo and m.date_heure >= now();
end $$;

-- Contrôle d'un fichier déposé par rapport aux specs du produit ---------
create or replace function controler_asset(p_asset assets)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  pr   produits;
  ext  text;
  res  jsonb := '[]';
  nb   int;
begin
  select p.* into pr from produits p join lignes_vendues l on l.produit_id = p.id where l.id = p_asset.ligne_id;

  if pr.famille = 'emplacement' then
    -- un 3M = 300 x 80 px, un 6M = 600 x 80 px
    select greatest(count(*), coalesce(pr.emplacements_requis, 1)) into nb
    from lignes_emplacements where ligne_id = p_asset.ligne_id;
    pr.largeur_px := 300 * nb;
    pr.hauteur_px := 80;
  end if;

  if pr.largeur_px is not null and p_asset.largeur_px is not null
     and (p_asset.largeur_px <> pr.largeur_px or p_asset.hauteur_px <> pr.hauteur_px) then
    res := res || jsonb_build_object('code', 'dimensions',
      'message', format('Attendu %s x %s px, reçu %s x %s px',
                        pr.largeur_px, pr.hauteur_px, p_asset.largeur_px, p_asset.hauteur_px));
  end if;

  ext := lower(substring(coalesce(p_asset.storage_path, p_asset.nom_visuel) from '\.([A-Za-z0-9]+)$'));
  if pr.formats is not null and ext is not null and not (ext = any (pr.formats)) then
    res := res || jsonb_build_object('code', 'format',
      'message', format('Format .%s non accepté (attendu : %s)', ext, array_to_string(pr.formats, ', ')));
  end if;

  if pr.duree_max_s is not null and p_asset.duree_s > pr.duree_max_s then
    res := res || jsonb_build_object('code', 'duree',
      'message', format('Durée %s s > maximum %s s', p_asset.duree_s, pr.duree_max_s));
  end if;

  if pr.poids_max_mo is not null and p_asset.taille_octets > pr.poids_max_mo::bigint * 1024 * 1024 then
    res := res || jsonb_build_object('code', 'poids',
      'message', format('Fichier de %s Mo > maximum %s Mo',
                        round(p_asset.taille_octets / 1048576.0, 1), pr.poids_max_mo));
  end if;

  return res;
end $$;

-- Recherche de sponsor tolérante aux variantes ---------------------------
create or replace function rechercher_sponsors(q text, nb int default 10)
returns table (id uuid, nom text, score real)
language sql stable
set search_path = public
as $$
  select s.id, s.nom,
         greatest(similarity(s.nom, q),
                  coalesce((select max(similarity(a, q)) from unnest(s.alias) a), 0)) as score
  from sponsors s
  where s.nom ilike '%' || q || '%'
     or s.nom % q
     or exists (select 1 from unnest(s.alias) a where a ilike '%' || q || '%' or a % q)
  order by score desc, s.nom
  limit nb
$$;

-- Renouvellement : prolonge d'une saison les contrats choisis ------------
create or replace function renouveler_contrats(p_contrats uuid[], p_saison uuid)
returns int
language plpgsql
set search_path = public
as $$
declare n int;
begin
  update contrats set saison_fin_id = p_saison
  where id = any (p_contrats)
    and (select debut from saisons where id = p_saison) >
        (select fin   from saisons where id = contrats.saison_fin_id);
  get diagnostics n = row_count;
  perform generer_passages(l.id)
  from lignes_vendues l where l.contrat_id = any (p_contrats);
  return n;
end $$;

-- =====================================================================
-- 6. Triggers
-- =====================================================================

create or replace function tg_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger sponsors_updated  before update on sponsors       for each row execute function tg_updated_at();
create trigger contrats_updated  before update on contrats       for each row execute function tg_updated_at();
create trigger demandes_updated  before update on demandes       for each row execute function tg_updated_at();
create trigger lignes_updated    before update on lignes_vendues for each row execute function tg_updated_at();

-- Journal générique
create or replace function tg_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into journal (table_nom, ligne_id, action, avant, apres)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null),
          lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger j_sponsors after insert or update or delete on sponsors       for each row execute function tg_journal();
create trigger j_contrats after insert or update or delete on contrats       for each row execute function tg_journal();
create trigger j_lignes   after insert or update or delete on lignes_vendues for each row execute function tg_journal();
create trigger j_assets   after insert or update or delete on assets         for each row execute function tg_journal();
create trigger j_demandes after insert or update or delete on demandes       for each row execute function tg_journal();

-- Ligne : « vendu » passe directement à « fichiers attendus »
create or replace function tg_ligne_statut() returns trigger language plpgsql as $$
begin
  if new.statut = 'vendu' then
    new.statut := case
      when exists (select 1 from assets where ligne_id = new.id and statut = 'valide') then 'programme'
      when exists (select 1 from assets where ligne_id = new.id and statut = 'a_valider') then 'a_valider'
      else 'fichiers_attendus' end;
  end if;
  return new;
end $$;
create trigger lignes_statut before insert or update of statut on lignes_vendues
  for each row execute function tg_ligne_statut();

-- Ligne modifiée -> passages régénérés
create or replace function tg_ligne_passages() returns trigger language plpgsql as $$
begin
  perform generer_passages(new.id);
  return null;
end $$;
create trigger lignes_passages after insert or update of
  statut, type_vente, inclut_playoffs, date_debut, date_fin, un_match_sur, regle_rotation, contrat_id
  on lignes_vendues for each row execute function tg_ligne_passages();

create or replace function tg_lignes_matchs() returns trigger language plpgsql as $$
begin
  perform generer_passages(coalesce(new.ligne_id, old.ligne_id));
  return null;
end $$;
create trigger lignes_matchs_passages after insert or delete on lignes_matchs
  for each row execute function tg_lignes_matchs();

-- Contrat prolongé -> passages régénérés
create or replace function tg_contrat_passages() returns trigger language plpgsql as $$
begin
  perform generer_passages(l.id) from lignes_vendues l where l.contrat_id = new.id;
  return null;
end $$;
create trigger contrats_passages after update of saison_debut_id, saison_fin_id on contrats
  for each row execute function tg_contrat_passages();

-- Nouveau match au calendrier -> passages des lignes à la saison
create or replace function tg_match_passages() returns trigger language plpgsql as $$
begin
  perform generer_passages(l.id)
  from lignes_vendues l
  where l.type_vente = 'saison' and l.statut not in ('brouillon', 'annule');
  return null;
end $$;
create trigger matchs_passages after insert or update of date_heure, type, numero on matchs
  for each row execute function tg_match_passages();

-- Asset : contrôle au dépôt, droits de validation, effets sur la ligne
create or replace function tg_asset_avant() returns trigger
language plpgsql security definer set search_path = public as $$
declare r role_app;
begin
  select role into r from profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    select coalesce(max(version), 0) + 1 into new.version
    from assets where ligne_id = new.ligne_id and coalesce(variante, '') = coalesce(new.variante, '');
    new.statut := 'a_valider';
  end if;

  if tg_op = 'UPDATE' and new.statut is distinct from old.statut then
    if new.statut in ('valide', 'refuse') and coalesce(r::text, '') not in ('regie', 'admin') then
      raise exception 'Seule la Régie peut valider ou refuser un fichier';
    end if;
    if new.statut = 'refuse' and coalesce(new.motif_refus, '') = '' then
      raise exception 'Un motif est obligatoire pour refuser un fichier';
    end if;
    if new.statut in ('valide', 'refuse') then
      new.valide_par := auth.uid();
      new.valide_le  := now();
    end if;
  end if;

  new.conformite := controler_asset(new);
  return new;
end $$;
create trigger assets_avant before insert or update on assets
  for each row execute function tg_asset_avant();

create or replace function tg_asset_apres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'valide' then
    -- l'ancienne version de la même variante est archivée
    update assets set statut = 'archive'
    where ligne_id = new.ligne_id and id <> new.id and statut = 'valide'
      and coalesce(variante, '') = coalesce(new.variante, '')
      and coalesce(match_id::text, '') = coalesce(new.match_id::text, '');
  end if;

  update lignes_vendues l set statut = case
      when exists (select 1 from assets a where a.ligne_id = l.id and a.statut = 'valide') then 'programme'
      when exists (select 1 from assets a where a.ligne_id = l.id and a.statut = 'a_valider') then 'a_valider'
      else 'fichiers_attendus' end::statut_ligne
  where l.id = new.ligne_id and l.statut in ('fichiers_attendus', 'a_valider', 'valide', 'programme');

  perform generer_passages(new.ligne_id);
  return null;
end $$;
create trigger assets_apres after insert or update of statut on assets
  for each row execute function tg_asset_apres();

-- Demande traitée : horodatage
create or replace function tg_demande_traitee() returns trigger language plpgsql as $$
begin
  if new.statut = 'traitee' and old.statut is distinct from 'traitee' then
    new.traite_par := coalesce(new.traite_par, auth.uid());
    new.traite_le  := now();
  end if;
  return new;
end $$;
create trigger demandes_traitee before update on demandes
  for each row execute function tg_demande_traitee();

-- =====================================================================
-- 7. Vues
-- =====================================================================

-- Tout ce qui passe, à plat : alimente la vue produit, la vue match, les exports
create or replace view v_diffusions with (security_invoker = true) as
select
  p.id                  as passage_id,
  m.id                  as match_id,
  m.numero              as match_numero,
  m.date_heure,
  m.adversaire,
  m.type                as match_type,
  pr.id                 as produit_id,
  pr.nom                as produit,
  pr.categorie,
  pr.famille,
  pr.support,
  coalesce(l.moment, pr.moment_defaut) as moment,
  l.tiers,
  s.id                  as sponsor_id,
  s.nom                 as sponsor,
  s.origine,
  l.id                  as ligne_id,
  l.type_vente,
  coalesce(a.duree_s, l.duree_s) as duree_s,
  l.occurrences,
  coalesce(a.avec_son, l.avec_son) as avec_son,
  l.consignes,
  l.suspendue,
  a.id                  as asset_id,
  a.nom_visuel,
  a.variante,
  a.storage_path,
  p.ordre,
  p.statut              as statut_passage,
  p.saisi_colosseo,
  (select string_agg(e.anneau || '-' || e.zone || '-' || e.position, ', ' order by e.anneau, e.position)
     from lignes_emplacements le join emplacements e on e.id = le.emplacement_id
    where le.ligne_id = l.id) as emplacements
from passages p
join matchs m          on m.id = p.match_id
join lignes_vendues l  on l.id = p.ligne_id
join produits pr       on pr.id = l.produit_id
join contrats c        on c.id = l.contrat_id
join sponsors s        on s.id = c.sponsor_id
left join assets a     on a.id = p.asset_id;

-- Occupation par produit et par match
create or replace view v_capacite with (security_invoker = true) as
with temps as (
  -- temps vendu directement sur le produit
  select pr.id as produit_id, p.match_id,
         sum(coalesce(a.duree_s, l.duree_s, 0) * l.occurrences) as utilise
  from passages p
  join lignes_vendues l on l.id = p.ligne_id and not l.suspendue
  join produits pr on pr.id = l.produit_id and pr.famille = 'temps'
  left join assets a on a.id = p.asset_id
  where p.statut <> 'suspendu'
  group by 1, 2
),
slides as (
  -- les slides consomment du temps dans le produit où elles sont diffusées
  select pr.diffuse_dans_produit_id as produit_id, p.match_id,
         ceil(count(*)::numeric / pr.logos_par_slide) * coalesce(pr.duree_par_slide_s, 0) as utilise
  from passages p
  join lignes_vendues l on l.id = p.ligne_id and not l.suspendue
  join produits pr on pr.id = l.produit_id and pr.famille = 'slide'
  where pr.diffuse_dans_produit_id is not null
  group by pr.id, pr.diffuse_dans_produit_id, pr.logos_par_slide, pr.duree_par_slide_s, p.match_id
),
compte as (
  select l.produit_id, p.match_id, count(*) as nb
  from passages p join lignes_vendues l on l.id = p.ligne_id
  group by 1, 2
),
empl as (
  select p.match_id, count(distinct le.emplacement_id) as nb
  from passages p join lignes_emplacements le on le.ligne_id = p.ligne_id
  group by 1
),
empl_dispo as (
  select count(*) filter (where not reserve_club) as nb from emplacements
)
select
  pr.id as produit_id, pr.nom as produit, pr.famille, pr.support,
  m.id as match_id, m.numero as match_numero, m.date_heure,
  case pr.famille
    when 'temps'       then pr.capacite_s
    when 'exclusif'    then 1
    when 'emplacement' then (select nb from empl_dispo)
    else null end                                          as capacite,
  case pr.famille
    when 'temps'       then coalesce(t.utilise, 0) + coalesce((select sum(utilise) from slides sl
                                                               where sl.produit_id = pr.id and sl.match_id = m.id), 0)
    when 'emplacement' then coalesce(e.nb, 0)
    else coalesce(c.nb, 0) end                             as utilise,
  case pr.famille when 'temps' then 'secondes'
                  when 'emplacement' then 'emplacements (toutes bandes)'
                  when 'slide' then 'logos'
                  else 'sponsors' end                      as unite,
  case when pr.famille = 'slide'
       then ceil(coalesce(c.nb, 0)::numeric / pr.logos_par_slide) end as nb_slides
from produits pr
cross join matchs m
left join temps  t on t.produit_id = pr.id and t.match_id = m.id
left join compte c on c.produit_id = pr.id and c.match_id = m.id
left join empl   e on e.match_id = m.id and pr.famille = 'emplacement'
where pr.actif;

-- Alertes (la capacité ne bloque pas, elle signale)
create or replace view v_alertes with (security_invoker = true) as
select 'capacite_depassee' as type, produit || ' — match ' || match_numero as objet,
       format('%s / %s %s', round(utilise), capacite, unite) as detail, match_id, produit_id, null::uuid as emplacement_id
from v_capacite
where capacite is not null and utilise > capacite and famille <> 'emplacement'
union all
select 'emplacement_double', e.anneau || '-' || e.zone || '-' || e.position || ' — match ' || m.numero,
       count(distinct le.ligne_id) || ' lignes sur le même emplacement', p.match_id, null, e.id
from lignes_emplacements le
join emplacements e on e.id = le.emplacement_id
join passages p on p.ligne_id = le.ligne_id
join matchs m on m.id = p.match_id
group by e.id, e.anneau, e.zone, e.position, p.match_id, m.numero
having count(distinct le.ligne_id) > 1
union all
select 'emplacements_manquants', pr.nom || ' — ' || s.nom,
       format('%s emplacement(s) attribué(s) sur %s', count(le.emplacement_id), pr.emplacements_requis),
       null, pr.id, null
from lignes_vendues l
join produits pr on pr.id = l.produit_id and pr.famille = 'emplacement'
join contrats c on c.id = l.contrat_id
join sponsors s on s.id = c.sponsor_id
left join lignes_emplacements le on le.ligne_id = l.id
where l.statut not in ('brouillon', 'annule', 'termine')
group by l.id, pr.id, pr.nom, s.nom, pr.emplacements_requis
having count(le.emplacement_id) < pr.emplacements_requis;

-- Préparation Colosseo : playlist d'un match, son d'abord, avec les changements.
-- Les logos sur slides sont regroupés en une seule entrée par produit (la vidéo des slides).
create or replace view v_preparation_colosseo with (security_invoker = true) as
with precedent as (
  select m.id as match_id,
         (select m2.id from matchs m2
           where m2.saison_id = m.saison_id and m2.date_heure < m.date_heure
           order by m2.date_heure desc limit 1) as match_precedent_id
  from matchs m
),
lignes as (
  -- diffusions individuelles (hors slides)
  select d.match_id, d.match_numero, d.date_heure, d.adversaire, d.support, d.produit,
         d.moment, d.tiers, d.sponsor, d.nom_visuel, d.variante, d.duree_s, d.occurrences,
         d.avec_son, d.emplacements, d.consignes, d.suspendue, d.saisi_colosseo, d.passage_id,
         d.ordre,
         case
           when prev.passage_id is null                   then 'ajout'
           when prev.asset_id is distinct from d.asset_id then 'nouveau_visuel'
         end as changement
  from v_diffusions d
  join precedent pc on pc.match_id = d.match_id
  left join v_diffusions prev
         on prev.match_id = pc.match_precedent_id and prev.ligne_id = d.ligne_id
  where d.famille <> 'slide'
  union all
  -- une entrée par produit « slides » : durée = nombre de slides x durée d'une slide
  select d.match_id, d.match_numero, d.date_heure, d.adversaire,
         coalesce(cible.support, d.support), d.produit, coalesce(cible.moment_defaut, d.moment), null,
         'HCFG', d.produit || ' (' || ceil(count(*)::numeric / pr.logos_par_slide) || ' slides, '
                 || count(*) || ' logos)',
         null, ceil(count(*)::numeric / pr.logos_par_slide) * coalesce(pr.duree_par_slide_s, 0), 1,
         false, null, null, false, bool_and(d.saisi_colosseo), null, null,
         case when count(*) filter (where prev.passage_id is null) > 0
              then 'logos_modifies' end
  from v_diffusions d
  join produits pr on pr.id = d.produit_id
  left join produits cible on cible.id = pr.diffuse_dans_produit_id
  join precedent pc on pc.match_id = d.match_id
  left join v_diffusions prev
         on prev.match_id = pc.match_precedent_id and prev.ligne_id = d.ligne_id
  where d.famille = 'slide' and not d.suspendue
  group by d.match_id, d.match_numero, d.date_heure, d.adversaire, cible.support, d.support,
           d.produit, cible.moment_defaut, d.moment, pr.logos_par_slide, pr.duree_par_slide_s
)
select match_id, match_numero, date_heure, adversaire, support, produit, moment, tiers,
       row_number() over (partition by match_id, support
                          order by avec_son desc, ordre nulls last, sponsor, produit) as ordre_saisie,
       sponsor, nom_visuel, variante, duree_s, occurrences, avec_son, emplacements, consignes,
       suspendue, saisi_colosseo, passage_id, changement
from lignes;

-- Ce qui passait au match précédent et ne passe plus
create or replace view v_colosseo_retraits with (security_invoker = true) as
with precedent as (
  select m.id as match_id,
         (select m2.id from matchs m2
           where m2.saison_id = m.saison_id and m2.date_heure < m.date_heure
           order by m2.date_heure desc limit 1) as match_precedent_id
  from matchs m
)
select pc.match_id, prev.support, prev.produit, prev.sponsor, prev.nom_visuel
from precedent pc
join v_diffusions prev on prev.match_id = pc.match_precedent_id
where not exists (select 1 from passages p
                  where p.match_id = pc.match_id and p.ligne_id = prev.ligne_id);

-- Occupation des emplacements LED (plan de la patinoire)
create or replace view v_plan_emplacements with (security_invoker = true) as
select e.id as emplacement_id, e.bande, e.anneau, e.zone, e.position, e.reserve_club,
       s.nom as sponsor, pr.nom as produit, l.id as ligne_id, l.statut,
       sd.libelle as saison_debut, sf.libelle as saison_fin
from emplacements e
left join lignes_emplacements le on le.emplacement_id = e.id
left join lignes_vendues l on l.id = le.ligne_id and l.statut not in ('annule', 'termine')
left join produits pr on pr.id = l.produit_id
left join contrats c on c.id = l.contrat_id
left join sponsors s on s.id = c.sponsor_id
left join saisons sd on sd.id = c.saison_debut_id
left join saisons sf on sf.id = c.saison_fin_id;


-- #####################################################################
-- 02_securite.sql
-- #####################################################################
-- =====================================================================
-- Outil Sponsoring <-> Régie — 02_securite.sql
-- Comptes, rôles, règles d'accès (RLS) et stockage des fichiers
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Création automatique du profil à la première connexion
--    Seules les adresses @fribourg-gotteron.ch sont acceptées.
--    Le rôle reste vide : un admin l'attribue avant tout accès.
-- ---------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) not like '%@fribourg-gotteron.ch' then
    raise exception 'Adresse non autorisée : %', new.email;
  end if;
  insert into profiles (id, email) values (new.id, lower(new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Fonctions d'aide (security definer pour éviter la récursion RLS)
-- ---------------------------------------------------------------------
create or replace function mon_role() returns role_app
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role is not null)
$$;

create or replace function a_role(variadic roles role_app[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = any (roles) from profiles where id = auth.uid()), false)
$$;

-- Un utilisateur ne peut pas changer son propre rôle
create or replace function tg_profil_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() est vide dans le SQL Editor / service role : utile pour nommer le premier admin
  if new.role is distinct from old.role and auth.uid() is not null and not a_role('admin') then
    raise exception 'Seul un admin peut modifier un rôle';
  end if;
  return new;
end $$;
create trigger profiles_role before update on profiles
  for each row execute function tg_profil_role();

-- ---------------------------------------------------------------------
-- 3. RLS : tout le monde (membre actif) lit tout ;
--    l'écriture dépend du rôle.
-- ---------------------------------------------------------------------
alter table profiles            enable row level security;
alter table saisons             enable row level security;
alter table matchs              enable row level security;
alter table produits            enable row level security;
alter table emplacements        enable row level security;
alter table sponsors            enable row level security;
alter table contrats            enable row level security;
alter table demandes            enable row level security;
alter table demandes_produits   enable row level security;
alter table lignes_vendues      enable row level security;
alter table lignes_matchs       enable row level security;
alter table lignes_emplacements enable row level security;
alter table assets              enable row level security;
alter table passages            enable row level security;
alter table journal             enable row level security;

-- Profils : chacun voit son profil ; les membres voient l'équipe ; l'admin gère
create policy profiles_lecture on profiles for select to authenticated
  using (id = auth.uid() or est_membre());
create policy profiles_maj_soi on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on profiles for all to authenticated
  using (a_role('admin')) with check (a_role('admin'));

-- Lecture pour tous les membres actifs
do $$
declare t text;
begin
  foreach t in array array['saisons','matchs','produits','emplacements','sponsors','contrats',
                           'demandes','demandes_produits','lignes_vendues','lignes_matchs',
                           'lignes_emplacements','assets','passages','journal']
  loop
    execute format('create policy %1$s_lecture on %1$I for select to authenticated using (est_membre())', t);
  end loop;
end $$;

-- Référentiels : admin uniquement
do $$
declare t text;
begin
  foreach t in array array['saisons','matchs','produits','emplacements']
  loop
    execute format('create policy %1$s_admin on %1$I for all to authenticated
                    using (a_role(''admin'')) with check (a_role(''admin''))', t);
  end loop;
end $$;

-- Données commerciales : Sponsoring, Régie et admin créent et modifient ;
-- seul l'admin supprime (on préfère « annulé » / « terminé » à la suppression).
do $$
declare t text;
begin
  foreach t in array array['sponsors','contrats','demandes','demandes_produits',
                           'lignes_vendues','lignes_matchs','lignes_emplacements','assets']
  loop
    execute format('create policy %1$s_insert on %1$I for insert to authenticated
                    with check (a_role(''sponsoring'',''regie'',''admin''))', t);
    execute format('create policy %1$s_update on %1$I for update to authenticated
                    using (a_role(''sponsoring'',''regie'',''admin''))
                    with check (a_role(''sponsoring'',''regie'',''admin''))', t);
    execute format('create policy %1$s_delete on %1$I for delete to authenticated
                    using (a_role(''admin''))', t);
  end loop;
end $$;

-- Les liaisons produits / matchs / emplacements d'une demande ou d'une ligne
-- doivent pouvoir être décochées par les équipes.
create policy demandes_produits_delete_equipe on demandes_produits for delete to authenticated
  using (a_role('sponsoring', 'regie'));
create policy lignes_matchs_delete_equipe on lignes_matchs for delete to authenticated
  using (a_role('sponsoring', 'regie'));
create policy lignes_emplacements_delete_equipe on lignes_emplacements for delete to authenticated
  using (a_role('sponsoring', 'regie'));

-- Passages : générés automatiquement ; la Régie ordonne, pointe et coche Colosseo
create policy passages_update on passages for update to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));
create policy passages_admin on passages for all to authenticated
  using (a_role('admin')) with check (a_role('admin'));

-- Journal : écrit uniquement par les triggers (security definer), jamais à la main

-- Valider / refuser un fichier : contrôlé dans le trigger assets_avant (Régie ou admin).

-- ---------------------------------------------------------------------
-- 4. Stockage des fichiers : bucket privé « assets »
--    Chemin conseillé : <sponsor_id>/<ligne_id>/<nom_du_fichier>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

create policy assets_fichiers_lecture on storage.objects for select to authenticated
  using (bucket_id = 'assets' and est_membre());
create policy assets_fichiers_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and a_role('sponsoring', 'regie', 'admin'));
create policy assets_fichiers_maj on storage.objects for update to authenticated
  using (bucket_id = 'assets' and a_role('regie', 'admin'));
create policy assets_fichiers_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and a_role('admin'));


-- #####################################################################
-- 03_donnees_depart.sql
-- #####################################################################
-- =====================================================================
-- Outil Sponsoring <-> Régie — 03_donnees_depart.sql
-- Saison, catalogue produits et emplacements LED, d'après Airtable
-- et les réponses du cahier des charges (septembre 2026).
-- Les valeurs marquées « À CONFIRMER » sont des estimations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Saison
-- ---------------------------------------------------------------------
insert into saisons (libelle, debut, fin, active)
values ('2026-27', '2026-08-01', '2027-04-30', true);

-- ---------------------------------------------------------------------
-- Temps d'antenne
-- ---------------------------------------------------------------------
insert into produits (nom, categorie, famille, support, mode_vente, moment_defaut,
                      capacite_s, largeur_px, hauteur_px, formats)
values
  ('Anneau LED',            'Anneau LED', 'temps', 'Anneau LED',    'les_deux', 'pendant_jeu',
     null, null, 80, '{png,jpg,mp4,mov}'),           -- capacité variable ; largeur À CONFIRMER
  ('Pub pause tiers',       'Vidéotron',  'temps', 'Vidéotron',     'les_deux', 'pause_tiers',
     17 * 60, 1920, 1080, '{mp4,mov}'),              -- 17 min maximum
  ('Pub après warm-up',     'Vidéotron',  'temps', 'Vidéotron',     'saison',   'apres_echauffement',
     null, 1920, 1080, '{mp4,mov}'),
  ('Pub arrêt de jeu',      'Vidéotron',  'temps', 'Vidéotron',     'les_deux', 'arret_de_jeu',
     null, 1920, 1080, '{mp4,mov}'),
  ('Pub warm-up',           'Vidéotron',  'temps', 'Vidéotron',     'les_deux', 'echauffement',
     null, 1920, 1080, '{mp4,mov}'),
  ('Angles match',          'Angles',     'temps', 'Angles',        'les_deux', 'continu',
     20 * 60, 256, 558, '{png,jpg,mp4,mov}'),        -- 20 min maximum
  ('LED Sportcafé (9M)',    'Sportcafé',  'temps', 'LED Sportcafé', 'les_deux', 'pendant_jeu',
     null, 1344, 96, '{png,jpg,mp4,mov}');

-- vidéotron <-> anneau LED (couplage inclus ou non selon la ligne vendue)
update produits set lie_a_produit_id = (select id from produits where nom = 'Anneau LED')
where nom = 'Pub pause tiers';

-- ---------------------------------------------------------------------
-- Emplacements fixes (bandes LED)
-- ---------------------------------------------------------------------
insert into produits (nom, categorie, famille, support, mode_vente, emplacements_requis, formats)
values
  ('LED 3M', 'LED bandes', 'emplacement', 'Bande LED', 'les_deux', 1, '{png,jpg}'),
  ('LED 6M', 'LED bandes', 'emplacement', 'Bande LED', 'les_deux', 2, '{png,jpg}');

-- ---------------------------------------------------------------------
-- Logos sur slides (diffusées dans la pub pause tiers)
-- duree_par_slide_s = 5 s : estimé d'après Airtable (Honorary ≈ 1 min 50) — À CONFIRMER
-- ---------------------------------------------------------------------
insert into produits (nom, categorie, famille, support, mode_vente, logos_par_slide, duree_par_slide_s,
                      formats, diffuse_dans_produit_id)
select v.nom, v.cat, 'slide', 'Vidéotron', 'saison', v.logos, 5,
       '{png,jpg,svg,eps,ai,pdf}', (select id from produits where nom = 'Pub pause tiers')
from (values
  ('Young Dragons Golden',          'Young Dragons', 4),
  ('Young Dragons Active',          'Young Dragons', 6),
  ('Young Dragons Honorary',        'Young Dragons', 12),
  ('Young Dragons Club de soutien', 'Young Dragons', 4),
  ('Ladies Legend Members',         'Ladies',        4),
  ('Ladies Ailes du Dragon',        'Ladies',        6),
  ('Ladies Founder Members',        'Ladies',        12)
) as v(nom, cat, logos);

-- ---------------------------------------------------------------------
-- Moments exclusifs
-- ---------------------------------------------------------------------
insert into produits (nom, categorie, famille, support, mode_vente, moment_defaut, formats)
values
  ('Sponsor du match', 'Sponsor du match', 'exclusif', 'Multi-supports', 'match',  null,      '{png,jpg,mp4,mov}'),
  ('Top Ring',         'Rings',            'exclusif', 'Top Ring',       'saison', 'continu', '{png,jpg,mp4,mov}'),
  ('Bottom Ring',      'Rings',            'exclusif', 'Bottom Ring',    'saison', 'continu', '{png,jpg,mp4,mov}');

-- Action scenes : un produit exclusif par scène (liste Airtable)
insert into produits (nom, categorie, famille, support, mode_vente, moment_defaut, formats)
select 'Action scene – ' || s, 'Action scenes', 'exclusif', 'Vidéotron', 'saison', 'pendant_jeu', '{mp4,mov,png}'
from unnest(array[
  'BCF Pregame','Boxplay','Challenge','Classement','Dernière minute','Echauffement',
  'Entrée Joueurs (Pause)','Faites du bruit','Fermeture Restos','Goal Home','Goal Neutre',
  'Goal Visitor','Logo','Match du jour','Merci et à bientôt','MVP','Pénalité Home',
  'Pénalité Visitor','Powerplay','Prochain Match','Puck de match','Reprise du match','Roster',
  'Spectateurs','Sponsor du match','Statistiques','Timeout','TopScorer','Totomat',
  'Totomat Young','Video Review','Shootout','Overtime','Goal SON','Son Entrée','Speed',
  'Efforts','Distance','NL - Jingle']) as s;

-- ---------------------------------------------------------------------
-- 148 emplacements LED de 300 x 80 px
--   bande 3M : anneaux A et B ; bande 6M : anneaux C et D ; 74 emplacements par bande.
--   Répartition par zone reprise des feuilles LED 3M / LED 6M d'Airtable.
--   Les 5 emplacements NORD-OUEST de chaque bande sont réservés au club (Banner HCFG).
--   À CONFIRMER : « 74 espaces en tout » = par bande (comme dans Airtable) ou au total.
-- ---------------------------------------------------------------------
insert into emplacements (bande, anneau, zone, position, reserve_club)
select z.bande, z.anneau, z.zone, z.debut + g - 1, z.zone = 'NORD-OUEST'
from (values
  ('3M', 'A', 'OUEST',       1,  9), ('3M', 'A', 'NORD-OUEST', 10, 5),
  ('3M', 'A', 'NORD',       15, 18), ('3M', 'A', 'NORD-EST',   33, 5),
  ('3M', 'B', 'EST',         1,  9), ('3M', 'B', 'SUD-EST',    10, 5),
  ('3M', 'B', 'SUD',        15, 18), ('3M', 'B', 'SUD-OUEST',  33, 5),
  ('6M', 'C', 'OUEST',       1,  9), ('6M', 'C', 'NORD-OUEST', 10, 5),
  ('6M', 'C', 'NORD',       15, 18), ('6M', 'C', 'NORD-EST',   33, 5),
  ('6M', 'D', 'EST',         1,  9), ('6M', 'D', 'SUD-EST',    10, 5),
  ('6M', 'D', 'SUD',        15, 18), ('6M', 'D', 'SUD-OUEST',  33, 5)
) as z(bande, anneau, zone, debut, nb)
cross join lateral generate_series(1, z.nb) as g;

-- ---------------------------------------------------------------------
-- Sponsor « club » pour le contenu HCFG (Banner, Fanshop, WhatsApp…)
-- ---------------------------------------------------------------------
insert into sponsors (nom, origine, alias) values
  ('HCFG', 'club', '{"Banner HCFG","HC Fribourg-Gottéron","Gottéron"}'),
  ('National League', 'ligue', '{"NationalLeague","NL"}');

-- ---------------------------------------------------------------------
-- Premier admin : remplacer l'adresse, après sa première connexion
-- ---------------------------------------------------------------------
-- update profiles set role = 'admin', nom = 'Léa Talon'
-- where email = 'lea.talon@fribourg-gotteron.ch';


-- #####################################################################
-- 04_temps_reel.sql
-- #####################################################################
-- =====================================================================
-- Outil Sponsoring <-> Régie — 04_temps_reel.sql
-- Active la mise à jour en direct de la liste des demandes
-- (quand un collègue crée ou traite une demande, l'écran se rafraîchit seul).
-- =====================================================================
alter publication supabase_realtime add table demandes;


-- #####################################################################
-- 05_demandes_saison_ou_matchs.sql
-- #####################################################################
-- =====================================================================
-- 05 — Demandes : « Saison » ou « Au match » (une ou plusieurs dates)
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 04.
-- =====================================================================
-- Remplace, pour les nouvelles demandes, le choix « dès que possible /
-- à partir d'un match / à partir d'une date ». Les anciennes colonnes
-- date_effet et match_effet_id restent pour les demandes déjà saisies.

alter table demandes
  add column if not exists type_vente   type_vente,                          -- 'saison' ou 'match'
  add column if not exists saison_id    uuid references saisons (id),
  add column if not exists dates_matchs date[];                              -- jours de match choisis (vente au match)

alter table demandes drop constraint if exists demandes_dates_si_match;
alter table demandes add constraint demandes_dates_si_match
  check (type_vente is distinct from 'match' or coalesce(cardinality(dates_matchs), 0) > 0);

-- Saison active par défaut
create or replace function tg_demande_saison() returns trigger language plpgsql as $$
begin
  if new.saison_id is null and new.type_vente is not null then
    select id into new.saison_id from saisons where active limit 1;
  end if;
  return new;
end $$;

drop trigger if exists demandes_saison on demandes;
create trigger demandes_saison before insert on demandes
  for each row execute function tg_demande_saison();


-- #####################################################################
-- 06_calendrier.sql
-- #####################################################################
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


-- #####################################################################
-- 07_demandes_details_produits.sql
-- #####################################################################
-- =====================================================================
-- 07 — Demandes : détails par produit
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 06.
-- =====================================================================
-- Chaque produit d'une demande a son propre « Quand ? » (saison ou
-- certains matchs), une durée de spot facultative et deux remarques :
-- celle du Sponsoring et celle de la Régie.
-- Le « Quand ? » global de la demande (migration 05) n'est plus rempli
-- par le formulaire ; il reste pour les demandes déjà saisies.

alter table demandes_produits
  add column if not exists type_vente          type_vente not null default 'saison',
  add column if not exists dates_matchs        date[],          -- jours de match (vente au match)
  add column if not exists duree_s             int check (duree_s is null or duree_s > 0),
  add column if not exists remarque_sponsoring text,
  add column if not exists remarque_regie      text;

alter table demandes_produits drop constraint if exists demandes_produits_dates_si_match;
alter table demandes_produits add constraint demandes_produits_dates_si_match
  check (type_vente <> 'match' or coalesce(cardinality(dates_matchs), 0) > 0);

-- La saison active est rattachée à toute nouvelle demande
create or replace function tg_demande_saison() returns trigger language plpgsql as $$
begin
  if new.saison_id is null then
    select id into new.saison_id from saisons where active limit 1;
  end if;
  return new;
end $$;


-- #####################################################################
-- 08_produits_au_match.sql
-- #####################################################################
-- =====================================================================
-- 08 — Produits proposés « au match » par défaut
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 07.
-- =====================================================================
-- Tout produit peut être pris à la saison OU pour un ou plusieurs matchs
-- (le choix se fait dans la demande). produits.mode_vente ne sert plus
-- qu'à pré-cocher le choix : 'match' = « Seulement certains matchs ».
-- Les Action scenes se prennent en principe à la saison, sauf celles qui
-- se prennent pour un match, comme le Sponsor du match.

update produits set mode_vente = 'match'
where nom in ('Sponsor du match', 'Action scene – Sponsor du match');


-- #####################################################################
-- 09_demandes_son_anneau.sql
-- #####################################################################
-- =====================================================================
-- 09 — Demandes : son et anneau LED pour les pubs vidéotron
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 08.
-- =====================================================================
-- Pub pause tiers : vidéotron avec ou sans son, avec ou sans anneau LED
-- (4 combinaisons). Le son est demandé pour toutes les pubs vidéotron ;
-- l'anneau pour les produits reliés à l'anneau (produits.lie_a_produit_id).
-- Au traitement, « avec anneau » créera une ligne Anneau LED couplée
-- (lignes_vendues.ligne_couplee_id) et avec_son alimentera la ligne vendue.

alter table demandes_produits
  add column if not exists avec_son    boolean,   -- null = sans objet pour ce produit
  add column if not exists avec_anneau boolean;   -- null = sans objet pour ce produit


-- #####################################################################
-- 10_noms_categories.sql
-- #####################################################################
-- =====================================================================
-- 10 — Noms des catégories de produits (vocabulaire de la Régie)
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 09.
-- =====================================================================
-- Les catégories servent à regrouper les produits dans le formulaire de demande.

update produits set categorie = 'Anneau LED 3M & 6M'   where categorie = 'LED bandes';
update produits set categorie = 'LED Sportcafé'        where categorie = 'Sportcafé';
update produits set categorie = 'Slides Ladies'        where categorie = 'Ladies';
update produits set categorie = 'Slides Young Dragons' where categorie = 'Young Dragons';
update produits set categorie = 'Vidéotron pub (warm-up, après warm-up, pause tiers, arrêt de jeu)'
where categorie = 'Vidéotron';


-- #####################################################################
-- 11_traiter_demande.sql
-- #####################################################################
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


-- #####################################################################
-- 12_ordre_produits.sql
-- #####################################################################
-- =====================================================================
-- 12 — Ordre des produits par importance
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 11.
-- =====================================================================
-- produits.ordre : plus petit = plus important. Sert au menu, à la vue
-- d'ensemble des produits et au formulaire de demande. Une catégorie se
-- place selon son produit le plus important ; à égalité (100), ordre
-- alphabétique.

alter table produits add column if not exists ordre int not null default 100;

update produits set ordre = 100;
update produits set ordre = 1 where categorie = 'Action scenes';
update produits set ordre = 2 where nom = 'Angles match';
update produits set ordre = 3 where nom = 'Anneau LED';
update produits set ordre = 4 where nom in ('LED 3M', 'LED 6M');
update produits set ordre = 5 where nom = 'Pub pause tiers';
update produits set ordre = 6 where nom like 'LED Sportcaf%';
update produits set ordre = 7 where categorie in ('Slides Young Dragons', 'Young Dragons');
update produits set ordre = 8 where categorie in ('Slides Ladies', 'Ladies');


-- #####################################################################
-- 13_ajouter_valide_visuel.sql
-- #####################################################################
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


-- #####################################################################
-- 14_ordre_diffusion.sql
-- #####################################################################
-- =====================================================================
-- 14 — Ordre de diffusion des sponsors dans chaque produit
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 13.
-- =====================================================================
-- lignes_vendues.priorite = rang de diffusion dans le produit (1, 2, 3…).
-- L'import Airtable a créé les diffusions dans l'ordre des feuilles Airtable
-- (= ordre de diffusion) ; cet ordre est retrouvé grâce au journal (numéro
-- d'enregistrement croissant). Les nouvelles diffusions se placent à la fin.

-- 1) Ordre actuel, retrouvé dans le journal (ordre de création)
with ordre as (
  select l.id,
         row_number() over (partition by l.produit_id
                            order by coalesce(j.premier, 9223372036854775807), l.created_at, l.id) as rang
  from lignes_vendues l
  left join (select ligne_id, min(id) as premier
             from journal where table_nom = 'lignes_vendues' and action = 'insert'
             group by ligne_id) j on j.ligne_id = l.id
)
update lignes_vendues l set priorite = o.rang
from ordre o
where o.id = l.id and l.priorite is distinct from o.rang;

-- 2) Toute nouvelle diffusion se place à la fin de son produit
create or replace function tg_ligne_priorite() returns trigger language plpgsql as $$
begin
  if new.priorite is null then
    select coalesce(max(priorite), 0) + 1 into new.priorite
    from lignes_vendues where produit_id = new.produit_id;
  end if;
  return new;
end $$;

drop trigger if exists lignes_priorite on lignes_vendues;
create trigger lignes_priorite before insert on lignes_vendues
  for each row execute function tg_ligne_priorite();

select 'Ordre de diffusion enregistré pour ' || count(*) || ' diffusions.' as "Résultat"
from lignes_vendues where priorite is not null;


-- #####################################################################
-- 16_diffusion_validee.sql
-- #####################################################################
-- =====================================================================
-- 16 — Case « Validé » sur chaque diffusion
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 15.
-- =====================================================================
-- « Validé » = la diffusion passe à l'écran cette saison (colonne « Validation
-- saison 26/27 » d'Airtable). Quand un nouveau visuel est attendu, la diffusion
-- reste validée et l'ancien visuel est diffusé en attendant.
-- La Régie / l'admin cochent ou décochent directement dans la fiche produit.

alter table lignes_vendues
  add column if not exists validee    boolean not null default true,
  add column if not exists validee_le timestamptz,
  add column if not exists validee_par uuid references profiles (id);

-- Import Airtable : « ⚠ Non validé saison 26/27 » devient la case décochée
update lignes_vendues
set validee = false,
    consignes = nullif(trim(both E'\n ' from replace(consignes, '⚠ Non validé saison 26/27 dans Airtable', '')), '')
where consignes like '%⚠ Non validé saison 26/27 dans Airtable%';

-- Qui a coché / décoché, et quand
create or replace function tg_ligne_validee() returns trigger language plpgsql as $$
begin
  if new.validee is distinct from old.validee then
    new.validee_le  := now();
    new.validee_par := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists lignes_validee on lignes_vendues;
create trigger lignes_validee before update of validee on lignes_vendues
  for each row execute function tg_ligne_validee();

select count(*) filter (where validee) || ' diffusions validées, '
       || count(*) filter (where not validee) || ' non validées.' as "Résultat"
from lignes_vendues;


-- #####################################################################
-- 17_anneau_pause_tiers.sql
-- #####################################################################
-- =====================================================================
-- 17 — « Anneau LED pause tiers » séparé de l'« Anneau LED » (pendant le match)
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 16.
-- =====================================================================
-- Deux choses différentes :
--   - Anneau LED = bandeaux pendant le match (feuille « LED match » d'Airtable), un produit à part ;
--   - l'anneau de la Pub pause tiers = COMPRIS dans la Pub pause tiers (option « Avec anneau LED »).
-- Pour la base, l'anneau de la pause tiers garde sa propre ligne couplée (son visuel, son temps),
-- rattachée à un produit technique « Anneau LED pause tiers » INACTIF : il n'apparaît ni dans le
-- menu, ni dans les produits, ni dans le formulaire ; il s'affiche dans la fiche Pub pause tiers.
-- Peut être exécuté plusieurs fois.

do $anneau$
declare
  v_anneau  uuid := (select id from produits where nom = 'Anneau LED');
  v_ppt     uuid := (select id from produits where nom = 'Pub pause tiers');
  v_nouveau uuid;
begin
  -- 1) Le produit technique, inactif (mêmes formats que l'Anneau LED)
  insert into produits (nom, categorie, famille, support, mode_vente, moment_defaut,
                        largeur_px, hauteur_px, formats, ordre, actif)
  select 'Anneau LED pause tiers', ppt.categorie, 'temps', 'Anneau LED', 'saison', 'pause_tiers',
         a.largeur_px, a.hauteur_px, a.formats, ppt.ordre, false
  from produits ppt, produits a
  where ppt.id = v_ppt and a.id = v_anneau
    and not exists (select 1 from produits where nom = 'Anneau LED pause tiers');
  update produits set actif = false where nom = 'Anneau LED pause tiers';
  select id into v_nouveau from produits where nom = 'Anneau LED pause tiers';

  -- 2) La Pub pause tiers est désormais couplée à ce produit
  update produits set lie_a_produit_id = v_nouveau where id = v_ppt;

  -- 3) Les anneaux couplés aux Pub pause tiers changent de produit (ordre conservé)
  update lignes_vendues a set produit_id = v_nouveau
  from lignes_vendues p
  where a.produit_id = v_anneau
    and p.id = a.ligne_couplee_id and p.produit_id = v_ppt;

  -- 4) Renumérotation de l'ordre de diffusion dans les deux produits
  with rangs as (
    select id, row_number() over (partition by produit_id order by priorite nulls last, created_at, id) as rang
    from lignes_vendues where produit_id in (v_anneau, v_nouveau)
  )
  update lignes_vendues l set priorite = r.rang
  from rangs r where r.id = l.id and l.priorite is distinct from r.rang;
end $anneau$;

select p.nom as "Produit", count(l.id) as "Diffusions"
from produits p left join lignes_vendues l on l.produit_id = p.id
where p.nom in ('Anneau LED', 'Anneau LED pause tiers')
group by p.nom order by p.nom;


-- #####################################################################
-- 18_visuel_attendu.sql
-- #####################################################################
-- =====================================================================
-- 18 — « Nouveau visuel attendu » sur une diffusion
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 17.
-- =====================================================================
-- Ce que la Régie doit voir d'une diffusion : passe-t-elle à l'écran ? est-elle
-- désactivée ? attend-on un nouveau visuel ? Ce dernier point est une information
-- à part : l'ancien visuel continue souvent de passer en attendant.
-- La case s'enlève toute seule dès qu'un nouveau visuel est validé.

alter table lignes_vendues add column if not exists visuel_attendu boolean not null default false;

-- Reprise des remarques d'Airtable (« en attente de nouvelle vidéo », « nouveaux visuels à mettre »…)
update lignes_vendues set visuel_attendu = true
where not visuel_attendu
  and (consignes ~* 'en attente|en attende|nouveaux? visuels? a mettre|nouveau arrive|modifier logo|changer logo');

-- Un visuel validé sur la ligne (ou sur son anneau couplé) = plus rien d'attendu
create or replace function tg_asset_visuel_recu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'valide' and (tg_op = 'INSERT' or old.statut is distinct from 'valide') then
    update lignes_vendues set visuel_attendu = false
    where id = new.ligne_id and visuel_attendu;
  end if;
  return null;
end $$;

drop trigger if exists assets_visuel_recu on assets;
create trigger assets_visuel_recu after insert or update of statut on assets
  for each row execute function tg_asset_visuel_recu();

select count(*) filter (where visuel_attendu) || ' diffusions en attente d''un nouveau visuel.' as "Résultat"
from lignes_vendues;


-- #####################################################################
-- 19_dossiers_sponsors.sql
-- #####################################################################
-- =====================================================================
-- 19 — Dossier par sponsor : tous les documents reçus pour une entreprise
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 18.
-- =====================================================================
-- Chaque fichier reçu (joint à une demande, ou déposé directement sur la page
-- du sponsor) est inscrit ici : on garde une trace de qui l'a donné et quand.
-- Les fichiers restent dans le bucket « assets » (pas de copie) :
--   demandes/<demande_id>/<produit_id>/<role>__<fichier>   (joints à une demande)
--   demandes/<demande_id>/<fichier>                         (autres fichiers d'une demande)
--   sponsors/<sponsor_id>/<horodatage>__<fichier>          (déposés sur la page du sponsor)

create table if not exists documents_sponsors (
  id             uuid primary key default gen_random_uuid(),
  sponsor_id     uuid references sponsors (id) on delete cascade,  -- null tant qu'un nouveau sponsor n'est pas créé
  demande_id     uuid references demandes (id) on delete set null,
  produit_id     uuid references produits (id),
  role           text not null default 'autre',   -- visuel | anneau | autre
  nom            text not null,                   -- nom du fichier tel que reçu
  storage_path   text not null unique,
  mime           text,
  taille_octets  bigint,
  notes          text,
  depose_par     uuid references profiles (id) default auth.uid(),
  depose_le      timestamptz not null default now(),
  check (sponsor_id is not null or demande_id is not null)
);
create index if not exists documents_sponsors_sponsor on documents_sponsors (sponsor_id);
create index if not exists documents_sponsors_demande on documents_sponsors (demande_id);

alter table documents_sponsors enable row level security;
drop policy if exists documents_sponsors_lecture on documents_sponsors;
drop policy if exists documents_sponsors_insert on documents_sponsors;
drop policy if exists documents_sponsors_update on documents_sponsors;
drop policy if exists documents_sponsors_delete on documents_sponsors;
create policy documents_sponsors_lecture on documents_sponsors for select to authenticated using (est_membre());
create policy documents_sponsors_insert on documents_sponsors for insert to authenticated
  with check (a_role('sponsoring', 'regie', 'admin'));
create policy documents_sponsors_update on documents_sponsors for update to authenticated
  using (a_role('sponsoring', 'regie', 'admin')) with check (a_role('sponsoring', 'regie', 'admin'));
create policy documents_sponsors_delete on documents_sponsors for delete to authenticated using (a_role('admin'));

-- Nouveau sponsor : quand la demande est rattachée au sponsor créé, ses documents le suivent
create or replace function tg_demande_sponsor_documents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sponsor_id is not null and new.sponsor_id is distinct from old.sponsor_id then
    update documents_sponsors set sponsor_id = new.sponsor_id where demande_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists demandes_sponsor_documents on demandes;
create trigger demandes_sponsor_documents after update of sponsor_id on demandes
  for each row execute function tg_demande_sponsor_documents();

-- Reprise des fichiers déjà joints aux demandes
insert into documents_sponsors (sponsor_id, demande_id, produit_id, role, nom, storage_path,
                                mime, taille_octets, depose_par, depose_le)
select d.sponsor_id, d.id,
       case when array_length(p.parts, 1) = 4 and p.parts[3] ~ '^[0-9a-f-]{36}$'
            then p.parts[3]::uuid end,
       case when p.fichier ~ '^(visuel|anneau)__' then split_part(p.fichier, '__', 1) else 'autre' end,
       regexp_replace(p.fichier, '^(visuel|anneau)__', ''),
       o.name, o.metadata->>'mimetype', (o.metadata->>'size')::bigint, d.cree_par, o.created_at
from storage.objects o
cross join lateral (select string_to_array(o.name, '/') as parts,
                           (string_to_array(o.name, '/'))[array_length(string_to_array(o.name, '/'), 1)] as fichier) p
join demandes d on d.id::text = p.parts[2]
where o.bucket_id = 'assets' and p.parts[1] = 'demandes'
  and array_length(p.parts, 1) in (3, 4)
  and p.fichier <> '.emptyFolderPlaceholder'
on conflict (storage_path) do nothing;

select count(*) || ' documents dans les dossiers sponsors ('
       || count(*) filter (where sponsor_id is null) || ' en attente d''un nouveau sponsor).' as "Résultat"
from documents_sponsors;


-- #####################################################################
-- 20_emplacements_liberes.sql
-- #####################################################################
-- =====================================================================
-- 20 — Emplacements LED 3M / 6M libérés quand un sponsor est retiré
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 19.
-- =====================================================================
-- Un emplacement LED existe toujours : quand le sponsor est retiré, il redevient
-- libre (Banner HCFG) et peut être revendu.
--   • « Retirer de ce produit » (fiche produit) : diffusion terminée -> libre tout de suite ;
--   • demande « Suppression » traitée (date de fin) : libre dès le lendemain de la date de fin.
-- Correction : un emplacement libéré puis revendu n'apparaît plus deux fois sur le plan
-- (une fois « libre » + une fois avec le nouveau sponsor).

create or replace view v_plan_emplacements with (security_invoker = true) as
select e.id as emplacement_id, e.bande, e.anneau, e.zone, e.position, e.reserve_club,
       s.nom as sponsor, pr.nom as produit, l.id as ligne_id, l.statut,
       sd.libelle as saison_debut, sf.libelle as saison_fin
from emplacements e
left join (lignes_emplacements le
           join lignes_vendues l on l.id = le.ligne_id
                                and l.statut not in ('annule', 'termine')
                                and (l.date_fin is null or l.date_fin >= current_date))
       on le.emplacement_id = e.id
left join produits pr on pr.id = l.produit_id
left join contrats c on c.id = l.contrat_id
left join sponsors s on s.id = c.sponsor_id
left join saisons sd on sd.id = c.saison_debut_id
left join saisons sf on sf.id = c.saison_fin_id;

select count(*) filter (where sponsor is null and not reserve_club) || ' emplacements libres (Banner HCFG) sur '
       || count(distinct emplacement_id) || '.' as "Résultat"
from v_plan_emplacements;


-- #####################################################################
-- 21_led_a_l_ecran.sql
-- #####################################################################
-- =====================================================================
-- 21 — LED 3M / 6M : tous les sponsors « À l'écran », sauf ce qui est réservé au club
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 20.
-- =====================================================================
-- Décidé par Léa le 28.09.2026 : dans Airtable, la case « Validation saison 26/27 »
-- n'était pas cochée partout, alors que les logos LED passent. On met donc « À l'écran »
-- toutes les diffusions LED 3M / 6M en cours, SAUF :
--   • celles placées sur un emplacement réservé au club (NORD-OUEST) ;
--   • le contenu du club (sponsors d'origine « club », ex. HCFG) ;
--   • celles désactivées (⏸), qui gardent leur état.

update lignes_vendues l
set validee = true
from produits p, contrats c, sponsors s
where p.id = l.produit_id and p.famille = 'emplacement'
  and c.id = l.contrat_id and s.id = c.sponsor_id and s.origine <> 'club'
  and l.statut not in ('annule', 'termine')
  and not l.validee
  and not l.suspendue
  and not exists (select 1 from lignes_emplacements le
                  join emplacements e on e.id = le.emplacement_id
                  where le.ligne_id = l.id and e.reserve_club);

select p.nom as "Produit",
       count(*) filter (where l.validee and not l.suspendue) as "À l'écran",
       count(*) filter (where not l.validee and not l.suspendue) as "Pas à l'écran",
       count(*) filter (where l.suspendue) as "Désactivé"
from lignes_vendues l join produits p on p.id = l.produit_id
where p.famille = 'emplacement' and l.statut not in ('annule', 'termine')
group by p.nom order by p.nom;


-- #####################################################################
-- 22_match_du_jour.sql
-- #####################################################################
-- =====================================================================
-- 22 — « Match du jour » : ce que la Régie doit changer dans Colosseo
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 21.
-- =====================================================================
-- Les playlists Colosseo restent d'un match à l'autre : le jour du match, la Régie
-- ne fait que les CHANGEMENTS depuis le match précédent (ajouter, enlever, nouveau visuel).
--
-- 1. Les passages (une diffusion x un match) suivent maintenant l'état de la diffusion :
--    « À l'écran » et pas désactivée -> 'prevu' ; sinon -> 'suspendu'.
--    Seuls les matchs à venir changent : les matchs passés gardent ce qui a vraiment passé
--    (c'est ce qui permet de comparer avec le match précédent).
-- 2. Table colosseo_fait : les cases « Fait dans Colosseo » cochées par la Régie, par match.

-- 1. Passages ---------------------------------------------------------------
create or replace function generer_passages(p_ligne uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut statut_ligne;
  v_passe  boolean;
begin
  select statut, (validee and not suspendue) into v_statut, v_passe from lignes_vendues where id = p_ligne;

  -- ligne pas (ou plus) active : on retire les passages futurs non pointés
  if v_statut in ('brouillon', 'annule') then
    delete from passages p using matchs m
    where p.ligne_id = p_ligne and m.id = p.match_id
      and p.statut in ('prevu', 'suspendu') and m.date_heure >= now();
    return;
  end if;

  -- retirer les passages futurs de matchs qui ne sont plus couverts
  delete from passages p using matchs m
  where p.ligne_id = p_ligne and m.id = p.match_id
    and p.statut in ('prevu', 'suspendu') and m.date_heure >= now()
    and p.match_id not in (select match_id from matchs_de_ligne(p_ligne));

  -- créer les passages manquants
  insert into passages (ligne_id, match_id, asset_id, statut)
  select p_ligne, x.match_id, choisir_asset(p_ligne, x.match_id),
         case when v_passe then 'prevu' else 'suspendu' end::statut_passage
  from matchs_de_ligne(p_ligne) x
  on conflict (ligne_id, match_id) do nothing;

  -- matchs à venir : visuel à jour et état « passe / ne passe pas »
  update passages p
  set asset_id = case when p.saisi_colosseo then p.asset_id else choisir_asset(p.ligne_id, p.match_id) end,
      statut   = case when v_passe then 'prevu' else 'suspendu' end::statut_passage
  from matchs m
  where p.ligne_id = p_ligne and m.id = p.match_id
    and p.statut in ('prevu', 'suspendu') and m.date_heure >= now();
end $$;

-- « À l'écran » / désactivée changent aussi les passages
drop trigger if exists lignes_passages on lignes_vendues;
create trigger lignes_passages after insert or update of
  statut, type_vente, inclut_playoffs, date_debut, date_fin, un_match_sur, regle_rotation, contrat_id,
  validee, suspendue
  on lignes_vendues for each row execute function tg_ligne_passages();

-- Point de départ : tous les passages non pointés (y compris les matchs passés) prennent l'état actuel,
-- pour que la première comparaison ne signale pas de faux changements.
update passages p
set statut = case when l.validee and not l.suspendue then 'prevu' else 'suspendu' end::statut_passage
from lignes_vendues l
where l.id = p.ligne_id and p.statut in ('prevu', 'suspendu');

-- 2. Cases « Fait dans Colosseo » ---------------------------------------------
create table if not exists colosseo_fait (
  match_id  uuid not null references matchs (id) on delete cascade,
  ligne_id  uuid not null references lignes_vendues (id) on delete cascade,
  action    text not null,                -- ajouter | enlever | visuel
  fait_par  uuid references profiles (id) default auth.uid(),
  fait_le   timestamptz not null default now(),
  primary key (match_id, ligne_id, action)
);

alter table colosseo_fait enable row level security;
drop policy if exists colosseo_fait_lecture on colosseo_fait;
drop policy if exists colosseo_fait_insert on colosseo_fait;
drop policy if exists colosseo_fait_delete on colosseo_fait;
create policy colosseo_fait_lecture on colosseo_fait for select to authenticated using (est_membre());
create policy colosseo_fait_insert on colosseo_fait for insert to authenticated with check (a_role('regie', 'admin'));
create policy colosseo_fait_delete on colosseo_fait for delete to authenticated using (a_role('regie', 'admin'));

select count(*) filter (where statut = 'prevu') || ' passages à l''écran, '
       || count(*) filter (where statut = 'suspendu') || ' qui ne passent pas.' as "Résultat"
from passages;


-- #####################################################################
-- 24_droits_sponsoring.sql
-- #####################################################################
-- =====================================================================
-- 24 — Rôle Sponsoring : faire des demandes et consulter, rien d'autre
-- À exécuter une fois dans Supabase > SQL Editor (après 01 → 22 ; 23 = remise à zéro, facultative).
-- =====================================================================
-- Décidé par Léa : le Sponsoring peut
--   • créer ses demandes, y joindre des fichiers, répondre aux questions de la Régie ;
--   • CONSULTER tous les onglets (produits, sponsors, match du jour…).
-- Il ne peut plus modifier directement ce qui est diffusé : sponsors, contrats, diffusions,
-- matchs / emplacements des diffusions, visuels, dossiers sponsors. C'est la Régie (ou l'admin)
-- qui le fait, en traitant les demandes.
-- Peut être exécuté plusieurs fois.

do $droits$
declare t text;
begin
  foreach t in array array['sponsors', 'contrats', 'lignes_vendues', 'lignes_matchs', 'lignes_emplacements', 'assets']
  loop
    execute format('drop policy if exists %1$s_insert on %1$I', t);
    execute format('drop policy if exists %1$s_update on %1$I', t);
    execute format('create policy %1$s_insert on %1$I for insert to authenticated
                    with check (a_role(''regie'', ''admin''))', t);
    execute format('create policy %1$s_update on %1$I for update to authenticated
                    using (a_role(''regie'', ''admin'')) with check (a_role(''regie'', ''admin''))', t);
  end loop;
end $droits$;

-- Décocher un match / un emplacement d'une diffusion : Régie seulement
drop policy if exists lignes_matchs_delete_equipe on lignes_matchs;
drop policy if exists lignes_emplacements_delete_equipe on lignes_emplacements;
create policy lignes_matchs_delete_equipe on lignes_matchs for delete to authenticated using (a_role('regie'));
create policy lignes_emplacements_delete_equipe on lignes_emplacements for delete to authenticated using (a_role('regie'));

-- Dossiers sponsors : le Sponsoring y inscrit les fichiers de SES demandes (automatique à l'envoi) ;
-- déposer un document hors demande ou modifier le dossier = Régie / admin
drop policy if exists documents_sponsors_insert on documents_sponsors;
drop policy if exists documents_sponsors_update on documents_sponsors;
create policy documents_sponsors_insert on documents_sponsors for insert to authenticated
  with check (a_role('regie', 'admin') or (a_role('sponsoring') and demande_id is not null));
create policy documents_sponsors_update on documents_sponsors for update to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));

-- Inchangé : demandes et produits des demandes (créer, compléter, répondre), dépôt de fichiers
-- dans le stockage, lecture de tout.

select coalesce(role::text, 'en attente') as "Rôle", count(*) as "Comptes"
from profiles group by role order by role;


-- #####################################################################
-- 25_regie_egal_admin.sql
-- #####################################################################
-- =====================================================================
-- 25 — Régie et admin : les mêmes droits
-- À exécuter une fois dans Supabase > SQL Editor, après 24.
-- =====================================================================
-- Décidé par Léa : « régie et admin, c'est les mêmes droits en vrai ».
-- Toutes les règles de sécurité passent par a_role(...) : on la redéfinit pour que
-- « regie » et « admin » soient interchangeables (calendrier, produits, emplacements,
-- suppressions… aussi pour la Régie). Le Sponsoring ne change pas.
-- Les deux rôles restent affichés séparément (Léa = admin), mais ouvrent les mêmes portes.

create or replace function a_role(variadic roles role_app[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = any (roles)
        or (role in ('regie', 'admin') and roles && array['regie', 'admin']::role_app[])
    from profiles where id = auth.uid()), false)
$$;

select coalesce(role::text, 'en attente') as "Rôle", count(*) as "Comptes"
from profiles group by role order by role;


-- #####################################################################
-- 26_notes_match.sql
-- #####################################################################
-- =====================================================================
-- 26 — « Pour ce soir » : infos générales et tâches d'un match (hors sponsors)
-- À exécuter une fois dans Supabase > SQL Editor, après 25.
-- =====================================================================
-- Dans Match du jour, la Régie note pour l'équipe :
--   • des infos (« match télévisé, pause tiers raccourcie », « arrivée 17h ») ;
--   • des tâches à cocher (« tester le micro », « charger la vidéo de l'hommage »).
-- Écrire / cocher : Régie et admin. Lire : tous les membres.

create table if not exists notes_match (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matchs (id) on delete cascade,
  type       text not null default 'info' check (type in ('info', 'tache')),
  texte      text not null check (length(trim(texte)) > 0),
  fait       boolean not null default false,
  fait_par   uuid references profiles (id),
  fait_le    timestamptz,
  cree_par   uuid references profiles (id) default auth.uid(),
  cree_le    timestamptz not null default now()
);
create index if not exists notes_match_match on notes_match (match_id);

-- Qui a coché la tâche, et quand
create or replace function tg_note_faite() returns trigger language plpgsql as $$
begin
  if new.fait is distinct from old.fait then
    new.fait_par := case when new.fait then auth.uid() end;
    new.fait_le  := case when new.fait then now() end;
  end if;
  return new;
end $$;
drop trigger if exists notes_match_fait on notes_match;
create trigger notes_match_fait before update of fait on notes_match
  for each row execute function tg_note_faite();

alter table notes_match enable row level security;
drop policy if exists notes_match_lecture on notes_match;
drop policy if exists notes_match_ecriture on notes_match;
create policy notes_match_lecture on notes_match for select to authenticated using (est_membre());
create policy notes_match_ecriture on notes_match for all to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));

select 'Table notes_match prête.' as "Résultat";


-- #####################################################################
-- 27_comptes_externes.sql
-- #####################################################################
-- =====================================================================
-- 27 — Comptes pour des personnes hors @fribourg-gotteron.ch
-- À exécuter sur LES DEUX bases (test puis vraie base), dans Supabase > SQL Editor, après 26.
-- =====================================================================
-- Décidé par Léa (30.09.2026) : on peut créer un compte pour quelqu'un d'extérieur au club.
-- La sécurité reste la même :
--   • les comptes sont créés par un admin (Authentication > Users) — l'inscription publique doit
--     rester DÉSACTIVÉE dans Authentication > Sign In / Providers (« Allow new users to sign up » : off) ;
--   • un nouveau compte n'a AUCUN rôle : il ne voit rien tant qu'un admin ne lui a pas donné
--     sponsoring / regie / admin (update profiles set role = …).

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, lower(new.email));
  return new;
end $$;

select 'Toutes les adresses e-mail sont acceptées (compte sans rôle tant qu''un admin ne l''a pas activé).' as "Résultat";


-- #####################################################################
-- 28_fichier_ajoute_apres.sql
-- #####################################################################
-- =====================================================================
-- 28 — Le Sponsoring complète sa demande avec un fichier arrivé plus tard
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Décidé par Léa (01.10.2026) : quand le visuel arrive après la demande, le Sponsoring l'ajoute
-- lui-même dans la demande (« Ajouter un fichier » sur le produit). Le fichier va dans le dossier
-- de la demande (demandes/<demande>/<produit>/<role>__<nom>), puis cette fonction :
--   • produit déjà ajouté par la Régie : il revient « à traiter » (la Régie voit « Mettre le nouveau
--     visuel » sur la diffusion déjà créée, ligne_id gardé) ;
--   • demande déjà traitée : elle repasse en « Nouvelle » (la Régie la voit dans « À traiter ») ;
--   • une ligne « Fichier ajouté le … » est ajoutée à la remarque (historique de la demande).

create or replace function fichier_ajoute_demande(p_demande uuid, p_produit uuid, p_fichier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produit text;
begin
  if not a_role('sponsoring', 'regie', 'admin') then
    raise exception 'Accès refusé';
  end if;
  if not exists (select 1 from demandes_produits where demande_id = p_demande and produit_id = p_produit) then
    raise exception 'Ce produit ne fait pas partie de la demande';
  end if;
  select nom into v_produit from produits where id = p_produit;

  -- déjà ajouté sur la fiche : à retraiter (nouveau visuel sur la même diffusion)
  update demandes_produits
  set traite_le = null, traite_par = null, suite = null
  where demande_id = p_demande and produit_id = p_produit
    and suite in ('ajoute', 'visuel') and ligne_id is not null;

  update demandes
  set statut = case when statut = 'traitee' then 'nouvelle'::statut_demande else statut end,
      remarque_sponsoring = concat_ws(E'\n\n', remarque_sponsoring,
        '— Fichier ajouté le ' || to_char(now() at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI')
        || ' : ' || coalesce(nullif(trim(p_fichier), ''), 'fichier') || ' (' || coalesce(v_produit, '?') || ')')
  where id = p_demande;
end $$;

grant execute on function fichier_ajoute_demande(uuid, uuid, text) to authenticated;

select 'Migration 28 OK : fichier_ajoute_demande()' as "Résultat";


-- Après avoir créé ton compte dans Authentication > Users, lance ceci séparément :
-- update profiles set role = 'admin', nom = 'Léa Talon' where email = 'lea.talon@fribourg-gotteron.ch';
select 'Installation terminée : 26 fichiers.' as "Résultat";
