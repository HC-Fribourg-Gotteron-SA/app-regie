-- =====================================================================
-- 66 — Digital : « Jeux et onglets app » (Jeu MVP, Pronostics, Quiz, Sondage… sponsorisés dans l'app)
-- À exécuter APRÈS la 65, sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (22.10.2026, option A) : comme les Réseaux sociaux — des emplacements dans l'app, un sponsor chacun, vendus
-- plutôt à la saison (ou pour certains matchs). Rouvinez a le Jeu MVP à la saison (en plus de son post MVP).
-- La liste réglable `types_posts` sert aux deux produits : colonne `liste` = 'reseaux' ou 'app'.

-- 1. Le produit ------------------------------------------------------------------------------
insert into produits (nom, categorie, famille, support, mode_vente, ordre, espace, formats)
select 'Jeux et onglets app', 'Digital', 'exclusif', 'App', 'saison'::mode_vente, 204, 'digital',
       '{png,jpg,jpeg,svg,pdf,ai,eps}'::text[]
where not exists (select 1 from produits where nom = 'Jeux et onglets app');
update produits set espace = 'digital' where nom = 'Jeux et onglets app';

-- 2. Une liste par produit -------------------------------------------------------------------
alter table types_posts add column if not exists liste text not null default 'reseaux';
insert into types_posts (nom, ordre, liste) values
  ('Jeu MVP', 10, 'app'), ('Pronostics', 20, 'app'), ('Quiz', 30, 'app'), ('Sondage', 40, 'app')
on conflict (nom) do nothing;

-- 3. traiter_digital : « Jeux et onglets app » se traite comme les Réseaux sociaux (un élément par emplacement)
do $x$
declare src text;
begin
  select pg_get_functiondef('traiter_digital(uuid, uuid, text, jsonb)'::regprocedure) into src;
  if position('jeux%' in src) = 0 then
    src := replace(src, $r$v_reseaux := pr.nom ilike 'r_seaux%';$r$,
                        $r$v_reseaux := pr.nom ilike 'r_seaux%' or pr.nom ilike 'jeux%';$r$);
    execute src;
  end if;
end $x$;

-- 4. Rouvinez : Jeu MVP à la saison (vraie base ; base de test : rien)
do $x$
declare
  v_pr uuid := (select id from produits where nom = 'Jeux et onglets app');
  v_sponsor uuid := (select id from sponsors where lower(sans_accent(nom)) like 'rouvinez%' order by created_at limit 1);
begin
  if v_sponsor is not null then
    insert into digital_elements (produit_id, sponsor_id, type_post, remarque)
    select v_pr, v_sponsor, 'Jeu MVP', 'Repris (Léa, 22.10.2026)'
    where not exists (select 1 from digital_elements where produit_id = v_pr and sponsor_id = v_sponsor
                        and type_post = 'Jeu MVP' and statut = 'actif');
  end if;
end $x$;

select t.liste as "Liste", t.nom as "Emplacement",
       coalesce(string_agg(s.nom || case when e.match_id is null then ' (saison)' else '' end, ', '), 'libre') as "Sponsors"
from types_posts t
left join digital_elements e on e.type_post = t.nom and e.statut = 'actif'
left join sponsors s on s.id = e.sponsor_id
group by t.liste, t.nom, t.ordre order by t.liste, t.ordre;
