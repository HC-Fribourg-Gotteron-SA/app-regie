-- =====================================================================
-- 52 — Matchs Ladies : type de match « Ladies » + modèle de run of show « Ladies 26/27 »
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois (le modèle est remplacé à chaque fois).
-- =====================================================================
-- Léa (13.10.2026) : la Régie fait aussi les matchs Ladies ; on n'y change aucun visuel, il faut surtout le run of show.
-- Menu Jour de match → « Ladies » : Match du jour (Ladies) = le match + « Pour ce soir » ; Run of show (Ladies).
-- Les matchs Ladies n'apparaissent JAMAIS dans le Match du jour NL / CHL (ni Par match, demandes, fiches produit) ;
-- aucune diffusion à la saison n'y passe (matchs_de_ligne ne prend que « saison » / playoffs ; tg_match_passages ne
-- recalcule rien pour un type autre que saison / playoffs, comme la CHL).
-- Modèle transcrit de la capture du « Rundown - 2026/27 Ladies - HC Fribourg Gottéron SA » (face-off 14:45, 38 éléments).

alter type type_match add value if not exists 'ladies';

do $modele$
declare m uuid;
begin
  select id into m from ros_modeles where nom = 'Ladies 26/27';
  if m is null then insert into ros_modeles (nom) values ('Ladies 26/27') returning id into m; end if;
  delete from ros_lignes where modele_id = m;

  insert into ros_lignes (modele_id, rang, est_section, important, decalage_s, quand, duree_s,
                          action, video, light, audio, speaker, instructions)
  select m, v.rang, v.est_section, v.important, v.decalage_s, v.quand, v.duree_s,
         v.action, v.cube, v.light, v.audio, v.speaker, v.instructions
  from (values
    (10, true, false, null::int, null::text, null::int, 'AVANT-MATCH', null::text, null::text, null::text, null::text, null::text),
    (20, false, false, -5400, null, 3900, 'Ouverture des portes de la patinoire', 'SCOREBOARD MATCH LADIES', 'GLACE FULL / GRADIN ON', 'DJ', null, null),
    (30, false, false, -2400, null, 20, 'Début du Warm-Up', 'WARM-UP LADIES', null, 'DJ', null, null),
    (40, false, false, null, 'à la suite', null, 'Warm-Up', 'PUB LADIES (SCOREBOARD)', null, 'DJ', null, null),
    (50, false, false, -1200, null, null, 'Présentation du Match du Jour (timing approx.)', 'LOGO', 'PAUSE', 'SPEAKER', null, null),
    (60, false, false, null, 'à la suite', null, 'Logo', 'LOGO', null, 'DJ', 'TEXTE', null),
    (70, false, false, -780, null, 14, 'Vidéo BCF Pregame', 'BCF PREGAME', null, 'VIDEO', null, null),
    (80, false, false, null, 'à la suite', 10, 'Vidéo Roster / ByTheWay', 'ROSTER LADIES', null, 'SPEAKER', 'TEXTE', null),
    (90, false, false, null, 'à la suite', 90, 'Présentation des Joueuses HCFG (timing approx.)', 'PRÉSENTATION ÉQUIPE LADIES', null, 'SPEAKER', 'TEXTE', 'Présentation du Roster HCFG Ladies avec les visuels présentation des joueuses'),
    (100, false, false, null, 'à la suite', null, 'Attente Début du Show Avant-Match', 'LOGO', 'GRADIN OFF', 'DJ', null, null),
    (110, false, false, -565, null, 210, 'Début du Show Avant-Match', 'SHOW AVANT MATCH 26-27 LADIES', null, 'VIDEO', null, null),
    (120, false, false, null, 'à la suite', null, 'Attente Entrée des Joueuses', 'ÉTINCELLES SHOW AVANT MATCH LADIES', null, 'DJ', null, 'Lancement d''une musique d''attente avant l''entrée des joueuses si elles ne sont pas prêtes'),
    (130, false, false, -360, null, null, 'Entrée des Joueuses (timing approx.)', 'SON ENTREE', 'ENTREE BANC', 'SON COLOSSEO', 'TEXTE', 'Annonce « Bienvenue aux Ladies » par Speaker'),
    (140, false, false, -300, null, null, 'Fin Entrée des Joueuses / Début Top Scorer (timing approx.)', 'TOPSCORER LADIES', 'ENTREE BANC', 'DJ / POSTFINANCE', 'TEXTE', 'Début de présentation des PostFinance TopScorer'),
    (150, false, false, null, 'à la suite', null, 'Stop Son Entrée', 'STOP SON', null, null, null, 'Couper le Son Entrée une fois que le son PostFinance Top Scorer est lancé par DJ'),
    (160, false, false, null, 'à la suite', null, 'Attente Début du Match', 'PUB LADIES (SCOREBOARD)', null, 'DJ', null, null),
    (170, false, true, 0, null, null, 'Face-Off (Début 1er Tiers)', 'PUB LADIES (SCOREBOARD)', 'GRADIN OFF', null, null, null),

    (180, true, false, null, null, null, '1ER TIERS', null, null, null, null, null),
    (190, false, false, null, '0:01:00', 15, 'Dernière Minute', 'DERNIERE MINUTES LADIES', null, 'SPEAKER', 'TEXTE', 'Durant le match'),

    (200, true, false, null, null, null, '1ÈRE PAUSE', null, null, null, null, null),
    (210, false, false, null, '0:18:00', 900, 'Début de la pause', 'PUB LADIES (SCOREBOARD)', 'PAUSE / GRADIN ON', 'DJ', null, 'Allumer les lumières en mode pause lorsque toutes les joueuses sont sorties'),
    (220, false, false, null, '0:03:00', null, 'Allumage de la Glace', null, 'PAUSE', 'DJ', null, null),
    (230, false, false, null, '0:01:30', null, 'Reprise du Match (timing approx.)', 'REPRISE DE MATCH LADIES', null, 'DJ', null, null),
    (240, false, true, null, '0:00:00', null, 'Face-Off (Début 2ème Tiers)', 'PUB LADIES (SCOREBOARD)', 'GRADIN OFF', null, null, null),

    (250, true, false, null, null, null, '2E TIERS', null, null, null, null, null),
    (260, false, false, null, '0:01:00', 15, 'Dernière Minute', 'DERNIERE MINUTES LADIES', null, 'SPEAKER', 'TEXTE', 'Durant le match'),

    (270, true, false, null, null, null, '2E PAUSE', null, null, null, null, null),
    (280, false, false, null, '0:18:00', 900, 'Début de la pause', 'PUB LADIES (SCOREBOARD)', 'PAUSE / GRADIN ON', 'DJ', null, 'Allumer les lumières en mode pause lorsque toutes les joueuses sont sorties'),
    (290, false, false, null, '0:03:00', null, 'Allumage de la Glace', null, 'PAUSE', 'DJ', null, null),
    (300, false, false, null, '0:01:30', null, 'Reprise du Match (timing approx.)', 'REPRISE DE MATCH LADIES', null, 'DJ', null, null),
    (310, false, true, null, '0:00:00', null, 'Face-Off (Début 3ème Tiers)', 'PUB LADIES (SCOREBOARD)', 'GRADIN OFF', null, null, null),

    (320, true, false, null, null, null, '3E TIERS', null, null, null, null, null),
    (330, false, false, null, '0:01:00', 15, 'Dernière Minute', 'DERNIERE MINUTES LADIES', null, null, null, 'Durant le match'),

    (340, true, false, null, null, null, 'FIN DU MATCH', null, null, null, null, null),
    (350, false, false, null, 'à la suite', null, 'Début de la Cérémonie MVP (timing approx.)', null, 'GRADIN ON', null, null, null),
    (360, false, false, null, 'à la suite', null, 'Présentation du MVP', 'PRÉSENTATION ÉQUIPE LADIES', null, 'SPEAKER', 'TEXTE', 'Présentation de la MVP adverse suivie de la MVP HCFG avec image au vidéotron'),
    (370, false, false, null, 'à la suite', null, 'Fin Cérémonie MVP', 'PUB LADIES (SCOREBOARD)', null, 'SPEAKER', 'TEXTE', 'Le speaker clôture le match'),
    (380, false, false, null, 'à la suite', null, 'Clôture du Match', 'MERCI ET À BIENTÔT LADIES', null, 'DJ / SPOTIFY', null, null),

    (390, true, false, null, null, null, 'PROLONGATION (OVERTIME)', null, null, null, null, null),
    (400, false, false, null, 'avant début overtime', 20, 'Début Overtime (timing approx.)', 'OVERTIME', null, 'VIDEO', null, null),
    (410, false, false, null, 'à la suite', null, 'Durant l''Overtime', 'PUB LADIES (SCOREBOARD)', null, null, null, 'En cas d''arrêt de jeu, le DJ gère le son'),
    (420, false, false, null, 'fin overtime', null, 'Fin Overtime', 'PUB LADIES (SCOREBOARD)', null, null, null, null),

    (430, true, false, null, null, null, 'TIRS AU BUT (SHOOTOUT)', null, null, null, null, null),
    (440, false, false, null, 'avant début shootout', null, 'Passer le Scoreboard en mode Shootout (timing approx.)', 'SCOREBOARD SHOOTOUT LADIES', null, 'DJ', null, null),
    (450, false, false, null, 'avant début shootout', null, 'Début Shootout (timing approx.)', 'SHOOTOUT(2)', null, 'DJ', null, null),
    (460, false, false, null, 'à la suite', null, 'Durant le Shootout', 'LIVE FEED', null, 'DJ', null, 'Le DJ gère le son durant le shootout'),
    (470, false, false, null, 'fin shootout', null, 'Passer à la procédure de fin du match', null, null, null, null, null)
  ) as v(rang, est_section, important, decalage_s, quand, duree_s, action, cube, light, audio, speaker, instructions);
end $modele$;

select m.nom as "Modèle", count(l.id) as "Lignes"
from ros_modeles m left join ros_lignes l on l.modele_id = m.id
where m.nom = 'Ladies 26/27' group by m.nom;
