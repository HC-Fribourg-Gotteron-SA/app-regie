-- =====================================================================
-- 65 — Digital : « Réseaux sociaux » (posts sponsorisés : GAMEDAY, MVP, STATISTIQUES, FIN DE TIERS, LINEUP)
-- À exécuter sur la base de TEST puis sur la VRAIE base (après la 55). Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (22.10.2026, capture d'Airtable) : à chaque match, des types de posts ; chacun peut avoir un sponsor (ou rester
-- libre), vendu à la saison (Alloboissons GAMEDAY, Rouvinez MVP) ou pour certains matchs. Traité par une personne hors
-- Régie : pas dans Match du jour. Accès « reseaux » (profiles.espaces) : voit la page et coche « Publié ».

-- 1. Le produit ------------------------------------------------------------------------
insert into produits (nom, categorie, famille, support, mode_vente, ordre, espace, formats)
select 'Réseaux sociaux', 'Digital', 'exclusif', 'Réseaux sociaux', 'saison'::mode_vente, 203, 'digital',
       '{png,jpg,jpeg,svg,pdf,ai,eps}'::text[]
where not exists (select 1 from produits where nom = 'Réseaux sociaux');
update produits set espace = 'digital' where nom = 'Réseaux sociaux';

-- 2. Types de posts (réglables) -----------------------------------------------------------
create table if not exists types_posts (
  id     uuid primary key default gen_random_uuid(),
  nom    text not null unique,
  ordre  int not null default 100,
  actif  boolean not null default true
);
alter table types_posts enable row level security;
drop policy if exists types_posts_lecture on types_posts;
drop policy if exists types_posts_ecriture on types_posts;
create policy types_posts_lecture on types_posts for select to authenticated using (est_membre());
create policy types_posts_ecriture on types_posts for all to authenticated
  using (a_role('regie', 'admin')) with check (a_role('regie', 'admin'));
insert into types_posts (nom, ordre) values
  ('GAMEDAY', 10), ('MVP', 20), ('STATISTIQUES', 30), ('FIN DE TIERS', 40), ('LINEUP', 50)
on conflict (nom) do nothing;

-- 3. Colonnes : type de post d'un élément, types demandés -------------------------------------
alter table digital_elements add column if not exists type_post text;
alter table demandes_produits add column if not exists types_posts text[];
-- (publication par match : digital_elements.fait = { "<match_id>": { le, par, lien } })

-- 4. Qui a l'accès « Réseaux sociaux » : les admins (à ajouter à la personne qui publie) ---------
update profiles set espaces = array_append(espaces, 'reseaux')
where role::text = 'admin' and not ('reseaux' = any (espaces));

-- 5. Cocher « Publié » (Régie, admin, accès « reseaux ») ---------------------------------------
create or replace function publier_post(p_element uuid, p_match uuid, p_publie boolean, p_lien text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not (a_role('regie', 'admin')
          or exists (select 1 from profiles where id = auth.uid() and 'reseaux' = any (espaces))) then
    raise exception 'Accès refusé';
  end if;
  update digital_elements
  set fait = case when p_publie
                  then coalesce(fait, '{}'::jsonb) || jsonb_build_object(p_match::text, jsonb_build_object(
                         'le', now(), 'par', (select coalesce(nom, split_part(email, '@', 1)) from profiles where id = auth.uid()),
                         'lien', nullif(trim(coalesce(p_lien, '')), '')))
                  else coalesce(fait, '{}'::jsonb) - p_match::text end
  where id = p_element
  returning fait into v;
  if not found then raise exception 'Post introuvable'; end if;
  return v;
end $$;
grant execute on function publier_post(uuid, uuid, boolean, text) to authenticated;

-- 6. Traiter une demande « Réseaux sociaux » : un élément par type de post (saison : sans match ; au match : par match)
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
  v_reseaux  boolean;
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
  v_reseaux := pr.nom ilike 'r_seaux%';

  if p_suite = 'ajoute' then
    v_sponsor := sponsor_de_demande(p_demande);
    if v_reseaux then
      if coalesce(array_length(dp.types_posts, 1), 0) = 0 then raise exception 'Aucun type de post dans la demande'; end if;
      if dp.type_vente = 'match' then
        insert into digital_elements (produit_id, sponsor_id, demande_id, match_id, type_post, fichiers, remarque)
        select pr.id, v_sponsor, p_demande, m.id, t, p_fichiers,
               nullif(concat_ws(E'\n', dp.remarque_sponsoring, dp.remarque_regie), '')
        from matchs m, unnest(dp.types_posts) t
        where (m.date_heure at time zone 'Europe/Zurich')::date = any (dp.dates_matchs);
      else
        insert into digital_elements (produit_id, sponsor_id, demande_id, type_post, fichiers, remarque)
        select pr.id, v_sponsor, p_demande, t, p_fichiers,
               nullif(concat_ws(E'\n', dp.remarque_sponsoring, dp.remarque_regie), '')
        from unnest(dp.types_posts) t;
      end if;
    elsif dp.type_vente = 'match' then
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
        fait     = case when p_suite = 'visuel' and not v_reseaux then '{}'::jsonb else e.fait end,
        statut   = case when p_suite = 'retire' then 'retire' else e.statut end
    where e.produit_id = pr.id and e.sponsor_id = v_sponsor and e.statut = 'actif'
      and (not v_reseaux or coalesce(array_length(dp.types_posts, 1), 0) = 0 or e.type_post = any (dp.types_posts))
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

-- 7. Ce qui existe déjà (capture Airtable) : Alloboissons GAMEDAY et Rouvinez MVP, à la saison (vraie base)
do $x$
declare
  v_pr uuid := (select id from produits where nom = 'Réseaux sociaux');
  r record;
  v_sponsor uuid;
begin
  for r in select * from (values ('Alloboissons', 'GAMEDAY'), ('Rouvinez', 'MVP')) as v(sponsor, type_post) loop
    select id into v_sponsor from sponsors where lower(sans_accent(nom)) like lower(sans_accent(r.sponsor)) || '%' order by created_at limit 1;
    continue when v_sponsor is null;                                          -- base de test : rien
    insert into digital_elements (produit_id, sponsor_id, type_post, remarque)
    select v_pr, v_sponsor, r.type_post, 'Repris d''Airtable'
    where not exists (select 1 from digital_elements where produit_id = v_pr and sponsor_id = v_sponsor
                        and type_post = r.type_post and statut = 'actif');
  end loop;
end $x$;

select t.nom as "Type de post",
       coalesce(string_agg(s.nom || case when e.match_id is null then ' (saison)' else '' end, ', '), 'libre') as "Sponsors"
from types_posts t
left join digital_elements e on e.type_post = t.nom and e.statut = 'actif'
  and e.produit_id = (select id from produits where nom = 'Réseaux sociaux')
left join sponsors s on s.id = e.sponsor_id
group by t.nom, t.ordre order by t.ordre;
