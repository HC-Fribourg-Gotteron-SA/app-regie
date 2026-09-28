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
