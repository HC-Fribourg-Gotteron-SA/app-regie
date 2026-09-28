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
