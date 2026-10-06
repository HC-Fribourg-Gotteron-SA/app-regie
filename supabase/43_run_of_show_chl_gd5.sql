-- =====================================================================
-- 43 — Modèle « CHL Regular Season 26/27 » remplacé par le bon rundown (Game Day 5)
-- À exécuter dans Supabase > SQL Editor, APRÈS la 40, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois (les lignes du modèle sont remplacées à chaque fois).
-- =====================================================================
-- Léa (06.10.2026) : la 40 venait du rundown du 1er match (HC Pilsen, cérémonie 100 CHL Games). Bon rundown =
-- « Jumbotron Operator Rundown - 2026/27 CHL Regular Season - Game Day 5 - Fribourg-Gottéron - HK Nitra » (FO 19:45).
-- Changements principaux : plus de cérémonie, heures avant le match décalées (Fan activity -21:30, vidéo en boucle
-- -20:00, Intro -9:00, alignement sur la ligne bleue -4:45), numéros des textes du speaker (TEXT 1 à 12),
-- pauses : vidéo en boucle des sponsors à -8:00 (nouveau), 3e tiers : CHL Live Standings.
-- Colonnes Cube / Instructions / Lien : pas dans la capture, reprises de la 40 quand la ligne est la même.
-- Seul le MODÈLE change : un run of show de match déjà créé garde ses lignes (le supprimer puis le recréer).

do $modele$
declare m uuid;
begin
  select id into m from ros_modeles where nom = 'CHL Regular Season 26/27';
  if m is null then
    insert into ros_modeles (nom) values ('CHL Regular Season 26/27') returning id into m;
  end if;
  delete from ros_lignes where modele_id = m;

  insert into ros_lignes (modele_id, rang, est_section, important, decalage_s, quand, duree_s,
                          action, video, audio, speaker, instructions, lien)
  select m, v.rang, v.est_section, v.important, v.decalage_s, v.quand, v.duree_s,
         v.action, v.cube, v.audio, v.speaker, v.instructions, v.lien
  from (values
    (10, true, false, null::int, null::text, null::int, 'AVANT-MATCH', null::text, null::text, null::text, null::text, null::text),
    (20, false, false, null, 'dès l''ouverture', null, 'From Arena Opening until the specified content starts as outlined below, please use the CHL Key Visuals on Jumbotron and LED Boards according to the Jumbotron Guidelines Pages 7-11', 'CHL KEY VISUALS', 'CLUB DJ', null, null, 'https://chl-club-hub.com/brand?cat=16267'),
    (30, false, false, -3600, null, null, 'Lights on full strength', null, null, null, null, null),
    (40, false, false, -3600, null, 1200, 'Countdown to warm-up on clock', null, 'CLUB DJ', null, null, null),
    (50, false, false, -3000, null, null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'VIDEO', 'VIDEO', 'From Club', 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (60, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB CONTENT', 'CLUB CONTENT', null, 'after commercial video loop is finished (if applicable)', null),
    (70, false, false, -2520, null, 75, 'CHL Intro Video', 'VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=16243'),
    (80, false, false, -2400, null, 1200, 'Countdown warm-up on clock; warm-up music played', 'LIVE FEED / KEY VISUALS', 'CLUB DJ', null, 'Warm-up duration: 20min', null),
    (90, false, false, -2400, null, 1200, 'Warm-up players', 'LIVE FEED / KEY VISUALS', 'CLUB DJ', null, null, null),
    (100, false, false, -1290, null, 90, 'CHL Fan activity - Intermission game (Match-it)', 'GRAPHIC', 'SPEAKER / CLUB DJ', 'TEXT 1', 'Please show the Match-it Call to Action graphic during which the speaker makes the announcement according to Speaker Text 1', 'https://chl-club-hub.com/brand?cat=56131'),
    (110, false, false, -1200, null, 1200, 'Countdown to Face-Off on clock', null, null, null, null, null),
    (120, false, false, -1200, null, null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'VIDEO', 'VIDEO', null, 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (130, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB CONTENT', 'SPEAKER / VIDEO', null, 'after commercial video loop is finished (if applicable)', null),
    (140, false, false, null, 'à la suite', 60, 'CHL club promotion video away team', 'VIDEO', 'VIDEO', 'TEXT 2', 'MANDATORY: To be announced by speaker --> introduction of away team; to be obtained from CHL Club Hub', 'https://chl-club-hub.com/brand?cat=16245'),
    (150, false, false, null, 'à la suite', null, 'Right after CHL club promotion video of away team. PA Speaker to announce roster of both teams while showing Player Cards on the Jumbotron', 'According Player Cards', 'SPEAKER / CLUB DJ', 'TEXT 3', 'Player cards of both teams to be obtained from CHL Club Hub. If Home team roster announcement is part of Club Intro Show, it can also be done then.', 'https://chl-club-hub.com/brand?cat=16229 (Choose Respective Club Folder)'),
    (160, false, false, null, 'à la suite', null, 'PA Speaker to announce TopScorer of both teams - Right after roster of both teams', 'CHL TOP SCORER GRAPHIC', 'SPEAKER', 'TEXT 4', 'Please show the respective graphic on the jumbotron (provided by CHL on Game Day); Speaker to announce Top Scorers according to Speaker Text 4', 'Provided by CHL on Game Day!'),
    (170, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=56171'),
    (180, false, false, -540, null, 75, 'CHL Intro Video', 'VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=16243'),
    (190, false, false, -465, null, null, 'Intro Home Club', 'CLUB CONTENT', 'CLUB CONTENT', null, 'Players must be on the blue line by -04:45: adjust the start of the Fan Activity (-21:30) if the intro is longer.', null),
    (200, false, false, -420, null, null, 'PA Speaker to announce Game Officials (approx. timing only)', 'LIVE FEED', 'SPEAKER', 'TEXT 5', 'If home team intro duration does not allow for proper intro of Game Officials at this stage, please do so between FO -2:00 and face-off', null),
    (210, false, false, -390, null, 105, 'Players depart on ice; intro home club (approx. timing only)', 'Club Intro', null, null, 'Timing of the intro to be adapted according to the duration of the intro show of the home team. No helmets!', null),
    (220, false, true, -285, null, null, 'Players to line up on blue lines', null, null, null, 'Timing is fix! All players to be lined up on their respective blue line at FO -4:45! No helmets!', null),
    (230, false, false, -285, null, 38, 'CHL anthem to be played via jumbotron/video sreens OR PA system.', 'VIDEO', 'SPEAKER / VIDEO', 'TEXT 6', 'Speaker to announce CHL Anthem according to Speaker Text 6', 'https://chl-club-hub.com/brand?cat=16286'),
    (240, false, false, -240, null, 60, 'National anthem of away team to be played out via jumbotron/video sreens OR PA system', 'VIDEO', 'SPEAKER / VIDEO', 'TEXT 7', 'Speaker to announce both National Anthems according to Speaker Text 7. After announcement both anthems to be played one after another.', 'https://chl-club-hub.com/brand?cat=16288'),
    (250, false, false, -180, null, 60, 'National anthem of home team to be played out via jumbotron/video sreens OR PA system', 'VIDEO', 'VIDEO', 'TEXT 7', null, null),
    (260, false, false, -120, null, null, 'Lights on full power (if lights need some time to be on full power: timing to be adapted so the lights are on full power at FO -2:00)', null, 'CLUB DJ', null, null, null),
    (270, false, false, -60, null, 10, 'Starting Six Graphic of Away Team followed by Home Team', 'GRAPHIC', 'SPEAKER', 'TEXT 8', 'PA Speaker to announce Starting Six with Starting Six graphic on video screen/jumbotron (to be obtained from CHL Club Hub); Teams to huddle around goalie --> Players NOT to line-up again', 'https://chl-club-hub.com/brand?cat=16273'),
    (280, false, false, -10, null, null, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),
    (290, false, true, 0, null, null, 'Face-Off (1st Period)', null, null, null, null, null),

    (300, true, false, null, null, null, '1ER TIERS', null, null, null, null, null),
    (310, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (320, false, false, null, 'à la suite', 33, '1st power break: CHL Rules Explainer Video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, 'About 5 Seconds into the PB, please show the CHL Rules Explainer Video', 'https://chl-club-hub.com/brand?cat=56171'),
    (330, false, false, null, 'à la suite', 20, '1st power break: CHL Top Scorer Graphic', 'CHL TOP SCORER GRAPHIC', 'SPEAKER', 'TEXT 9', 'Please show the respective graphic on the jumbotron (provided by CHL on Game Day); Speaker to announce Top Scorers according to Speaker Text 9', 'Provided by CHL on Game Day!'),
    (340, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (350, false, false, null, 'à la suite', 40, '2nd power break: CHL Predictor Promo Video', 'CHL PREDICTOR PROMO', 'VIDEO', null, 'About 5 Seconds into the PB, please show the CHL Predictor Game promotion video', 'https://chl-club-hub.com/brand?cat=33005'),
    (360, false, false, null, 'à la suite', 26, '2nd power break: CHL TikTok Promo Video', 'CHL TIKTOK PROMO', 'VIDEO', null, 'After CHL Predictor Game promotion video, show the CHL TikTok promotion video', 'https://chl-club-hub.com/brand?cat=33937'),

    (370, true, false, null, null, null, '1ÈRE PAUSE', null, null, null, null, null),
    (380, false, false, null, '0:18:00', 10, 'CHL Intermission Video on jumbotron/video screens', 'INTERMISSION VIDEO', 'VIDEO', null, 'Please show the CHL Intermission Video', 'https://chl-club-hub.com/brand?cat=16267'),
    (390, false, false, null, 'à la suite', 90, 'CHL Fan activity - Intermission game (Match-it)', 'GRAPHIC', 'SPEAKER / CLUB DJ', 'TEXT 10', 'Please show the Match-it Call to Action graphic during which the speaker makes the announcement according to Speaker Text 10', 'https://chl-club-hub.com/brand?cat=56131'),
    (400, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, 'Please show the Rule Innovations Explainer Video', 'https://chl-club-hub.com/brand?cat=56171'),
    (410, false, false, null, '0:08:00', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'New at -8:00! Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (420, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (430, false, false, null, '0:03:00', 180, 'Arena to full-lights', null, 'CLUB DJ', null, 'Arena lights on full power for player entrance!', null),
    (440, false, false, null, '0:00:10', 10, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),

    (450, true, false, null, null, null, '2E TIERS', null, null, null, null, null),
    (460, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (470, false, false, null, 'à la suite', 30, '1st power break: CHL Live Scores', 'CHL LIVE SCORES', 'URL', null, 'About 5 Seconds into the PB, please show the live scores. DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE LIVE SCORES ARE SHOWN! Once on the URL, click anywhere on the screen to start the sound, which is in a loop.', 'https://www.chl-fan-challenge.com/live-scores'),
    (480, false, false, null, 'à la suite', 32, '1st power break: CHL Stats Video', 'CHL STATS VIDEO', 'VIDEO', null, 'Please show the CHL Stats Promotion Video', 'https://chl-club-hub.com/brand?cat=51954'),
    (490, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (500, false, false, null, 'à la suite', 30, '2nd power break: CHL Win Prediction Widget (click on your game)', 'CHL WIN PREDICTION WIDGET', 'SPEAKER', 'TEXT 11', 'About 5 Seconds into the PB, please show the win prediction graphic through the URL. DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE WIN PREDICTION GRAPHIC IS SHOWN! Speaker to make the announcement according to Speaker Text 11.', 'https://chlstats.esports.cz/prediction/ (CLICK ON YOUR GAME)'),
    (510, false, false, null, 'à la suite', 30, '2nd power break: Warrior CHL Webshop', 'WARRIOR CHL WEBSHOP', 'Club DJ', null, 'Please show the CHL Warrior Webshop Video. The file has no sound: Club DJ to play some music while showing it.', 'https://chl-club-hub.com/brand?cat=48637'),

    (520, true, false, null, null, null, '2E PAUSE', null, null, null, null, null),
    (530, false, false, null, '0:18:00', 10, 'CHL Intermission Video on jumbotron/video screens', 'INTERMISSION VIDEO', 'VIDEO', null, 'Please show the CHL Intermission Video', 'https://chl-club-hub.com/brand?cat=16267'),
    (540, false, false, null, 'à la suite', 90, 'CHL Fan activity - Intermission game (Match-it)', 'GRAPHIC', 'SPEAKER', 'TEXT 12', 'Please show the Match-it Call to Action graphic during which the speaker makes the announcement according to Speaker Text 12', 'https://chl-club-hub.com/brand?cat=56131'),
    (550, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, 'Please show the Rule Innovations Explainer Video', 'https://chl-club-hub.com/brand?cat=56171'),
    (560, false, false, null, '0:08:00', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'New at -08:00! Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (570, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (580, false, false, null, '0:03:00', 180, 'Arena to full-lights', null, 'CLUB DJ', null, 'Arena lights on full power for player entrance!', null),
    (590, false, false, null, '0:00:10', 10, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),

    (600, true, false, null, null, null, '3E TIERS', null, null, null, null, null),
    (610, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (620, false, false, null, 'à la suite', 40, '1st power break: CHL Predictor Promo', 'CHL PREDICTOR PROMO', 'VIDEO', null, 'About 5 Seconds into the PB, please show the CHL Predictor Game promotion video', 'https://chl-club-hub.com/brand?cat=33005'),
    (630, false, false, null, 'à la suite', 26, '1st power break: CHL TikTok Promo', 'CHL TIKTOK PROMO', 'VIDEO', null, 'After CHL Predictor Game promotion video, show the CHL TikTok promotion video', 'https://chl-club-hub.com/brand?cat=33937'),
    (640, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (650, false, false, null, 'à la suite', 45, '2nd power break: CHL Live Standings', 'CHL LIVE STANDINGS', 'CLUB DJ OR PB VIDEO CLIP', null, 'Please show the CHL live standings (link in the CHL rundown).', null),

    (660, true, false, null, null, null, 'FIN DU MATCH', null, null, null, null, null),
    (670, false, false, null, '+0:05:00', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'VIDEO', 'VIDEO', 'From Club', 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (680, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB CONTENT', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),

    (690, true, false, null, null, null, 'OVERTIME', null, null, null, null, null),
    (700, false, false, null, '0:00:00', 60, 'OT "NO RETURN" RULE', 'NO RETURN RULE GRAPHIC', 'CLUB DJ', null, 'If a game goes into overtime, please display the OT No Return Rule Graphic for 60 seconds during the short 70-second intermission between the end of regulation and the start of OT', 'https://chl-club-hub.com/brand?cat=29578'),
    (710, false, false, null, '0:01:00', 10, 'CHL Overtime Video', 'CHL OVERTIME VIDEO', 'VIDEO', null, 'Show the video 10 seconds before the overtime starts. Show the animated LED board file simultaneously with the Jumbotron File', 'https://chl-club-hub.com/brand?cat=16267')
  ) as v(rang, est_section, important, decalage_s, quand, duree_s, action, cube, audio, speaker, instructions, lien);
end $modele$;

select m.nom as "Modèle", count(l.id) as "Lignes"
from ros_modeles m left join ros_lignes l on l.modele_id = m.id
group by m.nom order by m.nom;
