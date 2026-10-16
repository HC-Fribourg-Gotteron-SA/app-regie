-- =====================================================================
-- 57 — Programme de match : pubs actuelles (capture d'Airtable envoyée par Léa le 16.10.2026)
-- À exécuter APRÈS la 55 et la 56, sur la base de TEST puis sur la vraie base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Une pub = un match du calendrier (même jour, pas Ladies). Date sans match → sautée, listée en haut du résultat.
-- « Ajouté » coché dans Airtable → case « Mis dans le programme » cochée. Visuels : pas repris (restés dans Airtable).
-- Bellarena « jusqu'au 7 nov » : tous les matchs de la saison jusqu'au 07.11.2026 compris.
-- Laiterie-Fromagerie d'Arconciel : pas de format dans Airtable → format vide.
do $x$
declare
  r          record;
  m          record;
  v_sponsor  uuid;
  v_match    uuid;
  v_produit  uuid := (select id from produits where nom = 'Programme de match');
  v_saison   uuid := (select id from saisons where active limit 1);
begin
  if v_produit is null then raise exception 'Exécutez d''abord la migration 55'; end if;
  for r in select * from (values
    ('Balmat Immobilier SA',            'demi',   date '2026-10-03', true),
    ('Balmat Immobilier SA',            'demi',   date '2026-11-24', false),
    ('Balmat Immobilier SA',            'demi',   date '2027-02-04', false),
    ('Rouvinez',                        'pleine', date '2026-09-18', true),
    ('Rouvinez',                        'pleine', date '2026-09-26', true),
    ('Rouvinez',                        'pleine', date '2026-09-29', true),
    ('Laiterie-Fromagerie d''Arconciel', null,    date '2026-10-03', true),
    ('Laiterie-Fromagerie d''Arconciel', null,    date '2026-10-08', true),
    ('Laiterie-Fromagerie d''Arconciel', null,    date '2026-10-17', false),
    ('BSH Electroménager',              'pleine', date '2026-10-30', false),
    ('BSH Electroménager',              'pleine', date '2026-12-18', false),
    ('BSH Electroménager',              'pleine', date '2027-01-29', false),
    ('BSH Electroménager',              'pleine', date '2027-02-20', false)
  ) as v(sponsor, format, jour, ajoute)
  union all
  -- Bellarena, demi-page, jusqu'au 7 novembre : chaque match de la saison jusque-là
  select 'Bellarena', 'demi', (mm.date_heure at time zone 'Europe/Zurich')::date, true
  from matchs mm
  where mm.saison_id = v_saison and mm.type::text <> 'ladies'
    and (mm.date_heure at time zone 'Europe/Zurich')::date <= date '2026-11-07'
  loop
    -- sponsor : même nom ou alias (sans accents ni majuscules, « SA » ignoré), sinon créé
    select id into v_sponsor from sponsors s
    where regexp_replace(lower(sans_accent(s.nom)), '\s+sa$', '') = regexp_replace(lower(sans_accent(r.sponsor)), '\s+sa$', '')
       or exists (select 1 from unnest(s.alias) a where lower(sans_accent(a)) = lower(sans_accent(r.sponsor)))
    order by s.created_at limit 1;
    if v_sponsor is null then
      insert into sponsors (nom) values (r.sponsor) returning id into v_sponsor;
    end if;

    select mm.id into v_match from matchs mm
    where (mm.date_heure at time zone 'Europe/Zurich')::date = r.jour and mm.type::text <> 'ladies'
    limit 1;
    if v_match is null then continue; end if;      -- pas de match ce jour-là : sauté (listé à la fin)

    insert into digital_elements (produit_id, sponsor_id, match_id, format, remarque, fait)
    select v_produit, v_sponsor, v_match, r.format, 'Repris d''Airtable',
           case when r.ajoute then jsonb_build_object('programme', jsonb_build_object('le', now(), 'par', 'Airtable'))
                else '{}'::jsonb end
    where not exists (select 1 from digital_elements e
                      where e.produit_id = v_produit and e.sponsor_id = v_sponsor and e.match_id = v_match);
  end loop;
end $x$;

-- Résultat : ce qui est importé, puis les dates SANS match dans le calendrier (pas importées)
select x.jour as "Match", x.contre as "Contre", x.sponsor as "Sponsor", x.format as "Format", x.mis as "Mis"
from (
  select mm.date_heure as tri, to_char(mm.date_heure at time zone 'Europe/Zurich', 'DD.MM.YYYY') as jour, mm.adversaire as contre,
         s.nom as sponsor, coalesce(e.format, '—') as format, case when e.fait ? 'programme' then 'oui' else '' end as mis
  from digital_elements e join matchs mm on mm.id = e.match_id join sponsors s on s.id = e.sponsor_id
  where e.produit_id = (select id from produits where nom = 'Programme de match')
  union all
  select null, to_char(v.jour, 'DD.MM.YYYY'), '⚠ PAS DE MATCH CE JOUR : pas importé', v.sponsor, '', ''
  from (values ('Balmat Immobilier SA', date '2026-10-03'), ('Balmat Immobilier SA', date '2026-11-24'),
               ('Balmat Immobilier SA', date '2027-02-04'), ('Rouvinez', date '2026-09-18'), ('Rouvinez', date '2026-09-26'),
               ('Rouvinez', date '2026-09-29'), ('Laiterie-Fromagerie d''Arconciel', date '2026-10-03'),
               ('Laiterie-Fromagerie d''Arconciel', date '2026-10-08'), ('Laiterie-Fromagerie d''Arconciel', date '2026-10-17'),
               ('BSH Electroménager', date '2026-10-30'), ('BSH Electroménager', date '2026-12-18'),
               ('BSH Electroménager', date '2027-01-29'), ('BSH Electroménager', date '2027-02-20')) as v(sponsor, jour)
  where not exists (select 1 from matchs mm where (mm.date_heure at time zone 'Europe/Zurich')::date = v.jour
                                              and mm.type::text <> 'ladies')
) x
order by x.tri nulls first, x.sponsor;
