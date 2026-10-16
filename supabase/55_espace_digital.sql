-- =====================================================================
-- 55 — Espace « Digital » : Programme de match, Bannière app, Parrainage joueur
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (16.10.2026) : en plus de la Régie, Léa gère le digital (avant dans Airtable), toujours reçu du Sponsoring.
-- Le Sponsoring passe par la MÊME demande ; les 3 produits Digital ont leurs propres questions :
--   • Programme de match : un ou plusieurs matchs, page pleine / demi-page, visuel (alerte au-delà de 3 pubs par
--     programme, quelle que soit la taille) ;
--   • Bannière app : du … au …, visuel / logo ;
--   • Parrainage joueur : joueur (liste des joueurs), logo — toute la saison ; puis cases Vidéotron / App / Site /
--     Programme cochées par Léa quand c'est mis.
-- La Régie ne voit pas ces produits (fiches, onglets, Match du jour, Par match). Ajouter un produit Digital ne crée
-- AUCUNE diffusion (pas de passages) : une ligne dans digital_elements, une par match pour le programme.

-- 1. Produits : espace « regie » (par défaut) ou « digital » ----------------------------
alter table produits add column if not exists espace text not null default 'regie' check (espace in ('regie', 'digital'));

insert into produits (nom, categorie, famille, support, mode_vente, ordre, espace, formats)
select v.nom, 'Digital', 'exclusif', v.support, v.mode, v.ordre, 'digital', v.formats::text[]
from (values
  ('Programme de match', 'Programme', 'match', 200, '{pdf,png,jpg,jpeg}'),
  ('Bannière app',       'App',       'saison', 201, '{png,jpg,jpeg,gif}'),
  ('Parrainage joueur',  'Joueur',    'saison', 202, '{png,jpg,jpeg,pdf,svg,eps,ai}')
) as v(nom, support, mode, ordre, formats)
where not exists (select 1 from produits p where p.nom = v.nom);
update produits set espace = 'digital' where nom in ('Programme de match', 'Bannière app', 'Parrainage joueur');

-- 2. Joueurs (contingent 26/27, site du club) --------------------------------------------
create table if not exists joueurs (
  id          uuid primary key default gen_random_uuid(),
  numero      int,
  prenom      text not null,
  nom         text not null,
  position    text,                       -- gardien / défenseur / attaquant
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (prenom, nom)
);
alter table joueurs enable row level security;
drop policy if exists joueurs_lecture on joueurs;
drop policy if exists joueurs_ecriture on joueurs;
create policy joueurs_lecture on joueurs for select to authenticated using (est_membre());
create policy joueurs_ecriture on joueurs for all to authenticated using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));

insert into joueurs (numero, prenom, nom, position) values
  (1, 'Loic', 'Galley', 'gardien'), (35, 'Ludovic', 'Waeber', 'gardien'), (81, 'Elijah', 'Neuenschwander', 'gardien'),
  (3, 'Michael', 'Kapla', 'défenseur'), (5, 'Simon', 'Seiler', 'défenseur'), (7, 'Benoit', 'Jecker', 'défenseur'),
  (12, 'Patrik', 'Nemeth', 'défenseur'), (26, 'Alessio', 'Guignard', 'défenseur'), (27, 'Yannick', 'Rathgeb', 'défenseur'),
  (33, 'Ludvig', 'Johnson', 'défenseur'), (77, 'Maximilian', 'Streule', 'défenseur'), (96, 'Andrea', 'Glauser', 'défenseur'),
  (9, 'Marcus', 'Sörensen', 'attaquant'), (11, 'Lucas', 'Hedlund', 'attaquant'), (21, 'Henrik', 'Borgström', 'attaquant'),
  (22, 'Christoph', 'Bertschy', 'attaquant'), (23, 'Samuel', 'Walser', 'attaquant'), (29, 'Anthony', 'Richard', 'attaquant'),
  (37, 'Kevin', 'Nicolet', 'attaquant'), (39, 'Jamiro', 'Reber', 'attaquant'), (40, 'Jonas', 'Taibel', 'attaquant'),
  (45, 'Yannik', 'Boppart', 'attaquant'), (73, 'Sandro', 'Schmid', 'attaquant'), (88, 'Thierry', 'Schild', 'attaquant'),
  (93, 'Jan', 'Dorthe', 'attaquant'), (95, 'Jacob', 'De la Rose', 'attaquant'), (97, 'Nathan', 'Marchon', 'attaquant')
on conflict (prenom, nom) do nothing;

-- 3. Ce que le Sponsoring remplit dans la demande ------------------------------------------
alter table demandes_produits
  add column if not exists format    text check (format is null or format in ('pleine', 'demi')),   -- programme
  add column if not exists du        date,                                                         -- bannière app
  add column if not exists au        date,
  add column if not exists joueur_id uuid references joueurs (id);                                  -- parrainage

-- 4. Ce que Léa gère (créé quand elle « ajoute » le produit de la demande) -----------------
create table if not exists digital_elements (
  id           uuid primary key default gen_random_uuid(),
  produit_id   uuid not null references produits (id),
  sponsor_id   uuid references sponsors (id) on delete set null,
  demande_id   uuid references demandes (id) on delete set null,
  match_id     uuid references matchs (id) on delete cascade,   -- programme : une ligne par match
  format       text,                                            -- programme : pleine / demi
  du           date, au date,                                   -- bannière app
  joueur_id    uuid references joueurs (id),                    -- parrainage
  fichiers     jsonb not null default '[]',                     -- [{ chemin, nom, taille }]
  remarque     text,
  -- « c'est mis » : { "programme": {le, par}, "app": …, "site": …, "videotron": …, "retiree": … }
  fait         jsonb not null default '{}',
  statut       text not null default 'actif' check (statut in ('actif', 'retire')),
  created_by   uuid references profiles (id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists digital_elements_produit on digital_elements (produit_id);
alter table digital_elements enable row level security;
drop policy if exists digital_elements_lecture on digital_elements;
drop policy if exists digital_elements_ecriture on digital_elements;
create policy digital_elements_lecture on digital_elements for select to authenticated using (est_membre());
create policy digital_elements_ecriture on digital_elements for all to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));

-- 5. Qui voit l'espace Digital : admin + Sponsoring (la Régie seule ne le voit pas) -------
alter table profiles add column if not exists espaces text[] not null default '{regie}';
update profiles set espaces = '{regie,digital}' where role::text in ('admin', 'sponsoring') and not ('digital' = any (espaces));

-- 6. Traiter un produit Digital d'une demande (comme traiter_produit, mais sans diffusion ni passages) --------
--   ajoute : un élément (programme : un par match coché) · visuel : nouveaux fichiers sur ses éléments en cours
--   (« c'est mis » remis à zéro) · retire : éléments passés en « retire » (à enlever) · ignore : rien
--   p_fichiers : [{ chemin, nom, taille }] (fichiers de la demande, pas de copie)
create or replace function traiter_digital(p_demande uuid, p_produit uuid, p_suite text, p_fichiers jsonb default '[]')
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  d          demandes;
  dp         demandes_produits;
  pr         produits;
  v_sponsor  uuid;
  n          int := 0;
  v_traitee  boolean := false;
begin
  if not a_role('regie', 'admin') then raise exception 'Seule la Régie / l''admin peut traiter une demande'; end if;
  select * into d from demandes where id = p_demande for update;
  if not found then raise exception 'Demande introuvable'; end if;
  select * into dp from demandes_produits where demande_id = p_demande and produit_id = p_produit;
  if not found then raise exception 'Ce produit ne fait pas partie de la demande'; end if;
  if dp.traite_le is not null then raise exception 'Ce produit a déjà été traité pour cette demande'; end if;
  select * into pr from produits where id = p_produit and espace = 'digital';
  if not found then raise exception 'Ce n''est pas un produit Digital'; end if;
  p_fichiers := coalesce(p_fichiers, '[]'::jsonb);

  if p_suite = 'ajoute' then
    v_sponsor := sponsor_de_demande(p_demande);
    if dp.type_vente = 'match' then
      insert into digital_elements (produit_id, sponsor_id, demande_id, match_id, format, fichiers, remarque)
      select pr.id, v_sponsor, p_demande, m.id, dp.format, p_fichiers,
             nullif(concat_ws(E'\n', dp.remarque_sponsoring, dp.remarque_regie), '')
      from matchs m where (m.date_heure at time zone 'Europe/Zurich')::date = any (dp.dates_matchs);
    else
      insert into digital_elements (produit_id, sponsor_id, demande_id, du, au, joueur_id, fichiers, remarque)
      values (pr.id, v_sponsor, p_demande, dp.du, dp.au, dp.joueur_id, p_fichiers,
              nullif(concat_ws(E'\n', dp.remarque_sponsoring, dp.remarque_regie), ''));
    end if;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Aucun match du calendrier ne correspond aux dates de la demande'; end if;

  elsif p_suite in ('visuel', 'retire') then
    v_sponsor := d.sponsor_id;
    update digital_elements e
    set fichiers = case when p_suite = 'visuel' then p_fichiers else e.fichiers end,
        fait     = case when p_suite = 'visuel' then '{}'::jsonb else e.fait end,
        statut   = case when p_suite = 'retire' then 'retire' else e.statut end
    where e.produit_id = pr.id and e.sponsor_id = v_sponsor and e.statut = 'actif'
      and (dp.type_vente <> 'match' or e.match_id is null
           or e.match_id in (select m.id from matchs m
                             where (m.date_heure at time zone 'Europe/Zurich')::date = any (dp.dates_matchs)));
    get diagnostics n = row_count;
    if n = 0 then raise exception '% n''a pas « % » en cours (ou pas pour ces matchs)', coalesce((select nom from sponsors where id = v_sponsor), 'Ce sponsor'), pr.nom; end if;

  elsif p_suite <> 'ignore' then
    raise exception 'Action inconnue : %', p_suite;
  end if;

  update demandes_produits set suite = p_suite, traite_le = now(), traite_par = auth.uid()
  where demande_id = p_demande and produit_id = p_produit;

  if d.statut <> 'traitee'
     and not exists (select 1 from demandes_produits where demande_id = p_demande and traite_le is null) then
    update demandes set statut = 'traitee' where id = p_demande;
    v_traitee := true;
  end if;
  return jsonb_build_object('elements', n, 'demande_traitee', v_traitee);
end $$;

select (select count(*) from produits where espace = 'digital') as "Produits Digital",
       (select count(*) from joueurs where actif) as "Joueurs",
       (select count(*) from profiles where 'digital' = any (espaces)) as "Comptes avec l'espace Digital";
