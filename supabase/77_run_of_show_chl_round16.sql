-- =====================================================================
-- 77 — Modèle de run of show « CHL Round of 16 – Return game 26/27 »
-- À exécuter dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois (les lignes du modèle sont remplacées à chaque fois).
-- =====================================================================
-- Léa (17.11.2026) : capture du « Jumbotron Operator Rundown - 2026/27 CHL Round of 16 - SEYU,
-- Fribourg-Gottéron - Genève-Servette » (FO 19:00, 70 éléments). Différences avec le modèle Game Day 5 (43) :
-- SEYU CTA + SEYU URL (TEXT 1, 11, 12, 14, 16, 18), Fan activity « Tricky Cups », un seul hymne national
-- (deux équipes suisses), boucle sponsors dès 0:17:50 dans les pauses, Warrior Webshop au 3e tiers.
-- Heures avant le match = écart avec le face-off (suit le face-off du match). Liens / instructions repris de la 43
-- quand la ligne est la même ; liens SEYU : pas dans la capture (à ajouter en mode Modifier).
-- La capture s'arrête à l'élément 70 (Overtime) : s'il y a une suite (tirs au but), l'ajouter en mode Modifier.

do $modele$
declare m uuid;
begin
  select id into m from ros_modeles where nom = 'CHL Round of 16 – Return game 26/27';
  if m is null then
    insert into ros_modeles (nom) values ('CHL Round of 16 – Return game 26/27') returning id into m;
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
    (100, false, false, -1330, null, 10, 'SEYU CTA', null, 'SPEAKER', 'TEXT 1', null, null),
    (105, false, false, null, 'à la suite', 30, 'SEYU URL', 'SEYU URL', 'CLUB DJ', null, null, null),
    (110, false, false, -1290, null, 90, 'CHL Fan activity - Intermission game (Tricky Cups)', 'GRAPHIC', 'SPEAKER / CLUB DJ', 'TEXT 2', null, null),
    (120, false, false, -1200, null, 1200, 'Countdown to Face-Off on clock', null, null, null, null, null),
    (130, false, false, -1200, null, null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'VIDEO', 'VIDEO', null, 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (140, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB CONTENT', 'SPEAKER / VIDEO', null, 'after commercial video loop is finished (if applicable)', null),
    (150, false, false, null, 'à la suite', 60, 'CHL club promotion video away team', 'VIDEO', 'VIDEO', 'TEXT 3', 'MANDATORY: To be announced by speaker --> introduction of away team; to be obtained from CHL Club Hub', 'https://chl-club-hub.com/brand?cat=16245'),
    (160, false, false, null, 'à la suite', null, 'Right after CHL club promotion video of away team. PA Speaker to announce roster of both teams while showing Player Cards on the Jumbotron', 'According Player Cards', 'SPEAKER / CLUB DJ', 'TEXT 4', 'Player cards of both teams to be obtained from CHL Club Hub. If Home team roster announcement is part of Club Intro Show, it can also be done then.', 'https://chl-club-hub.com/brand?cat=16229 (Choose Respective Club Folder)'),
    (170, false, false, null, 'à la suite', null, 'Right after roster of both teams: PA Speaker to announce TopScorer of both teams - while showing Top Scorer Graphic on the Jumbotron', 'CHL TOP SCORER GRAPHIC', 'SPEAKER', 'TEXT 5', 'Please show the respective graphic on the jumbotron (provided by CHL on Game Day)', 'Provided by CHL on Game Day!'),
    (180, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=56171'),
    (190, false, false, -540, null, 75, 'CHL Intro Video', 'VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=16243'),
    (200, false, false, -465, null, null, 'Intro Home Club', 'CLUB CONTENT', 'CLUB CONTENT', null, null, null),
    (210, false, false, -360, null, null, 'PA Speaker to announce Game Officials (approx. timing only)', 'LIVE FEED', 'SPEAKER', 'TEXT 6', 'If home team intro duration does not allow for proper intro of Game Officials at this stage, please do so between FO -2:00 and face-off', null),
    (220, false, false, -330, null, 105, 'Players depart on ice; intro home club (approx. timing only)', 'Club Intro', null, null, 'Timing of the intro to be adapted according to the duration of the intro show of the home team. No helmets!', null),
    (230, false, true, -225, null, null, 'Players to line up on blue lines', null, null, null, 'Timing is fix! All players to be lined up on their respective blue line at FO -3:45! No helmets!', null),
    (240, false, false, -225, null, 38, 'CHL anthem to be played via jumbotron/video sreens OR PA system.', 'VIDEO', 'SPEAKER / VIDEO', 'TEXT 7', null, 'https://chl-club-hub.com/brand?cat=16286'),
    (250, false, false, -180, null, 60, 'Swiss National anthem to be played out via jumbotron/video sreens OR PA system', 'VIDEO', 'SPEAKER / VIDEO', 'TEXT 8', null, 'https://chl-club-hub.com/brand?cat=16288'),
    (260, false, false, -120, null, null, 'Lights on full power (if lights need some time to be on full power: timing to be adapted so the lights are on full power at FO -2:00)', null, 'CLUB DJ', null, null, null),
    (270, false, false, -60, null, 10, 'Starting Six Graphic on Jumbotron of Away Team followed by Home Team', 'GRAPHIC', 'SPEAKER', 'TEXT 9', 'Starting Six graphic to be obtained from CHL Club Hub; Teams to huddle around goalie --> Players NOT to line-up again', 'https://chl-club-hub.com/brand?cat=16273'),
    (280, false, false, -10, null, null, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),
    (290, false, true, 0, null, null, 'Face-Off (1st Period)', null, null, null, null, null),

    (300, true, false, null, null, null, '1ER TIERS', null, null, null, null, null),
    (310, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (320, false, false, null, 'à la suite', 40, '1st power break: CHL Predictor Promo', 'CHL PREDICTOR PROMO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=33005'),
    (330, false, false, null, 'à la suite', 20, '1st power break: CHL Top Scorer Graphic', 'CHL TOP SCORER GRAPHIC', 'SPEAKER', 'TEXT 10', 'Please show the respective graphic on the jumbotron (provided by CHL on Game Day)', 'Provided by CHL on Game Day!'),
    (340, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (350, false, false, null, 'à la suite', 26, '2nd power break: CHL TikTok Promo', 'CHL TIKTOK PROMO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=33937'),
    (360, false, false, null, 'à la suite', 10, '2nd power break: SEYU CTA', 'SEYU CTA', 'SPEAKER', 'TEXT 11', null, null),
    (365, false, false, null, 'à la suite', 30, '2nd power break: SEYU URL', 'SEYU URL', 'CLUB DJ', null, null, null),

    (370, true, false, null, null, null, '1ÈRE PAUSE', null, null, null, null, null),
    (380, false, false, null, '0:18:00', 10, 'CHL Intermission Video on jumbotron/video screens', 'INTERMISSION VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=16267'),
    (390, false, false, null, '0:17:50', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (400, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (410, false, false, null, 'à la suite', 10, 'SEYU CTA', 'SEYU CTA', 'SPEAKER', 'TEXT 12', null, null),
    (415, false, false, null, 'à la suite', 30, 'SEYU URL', 'SEYU URL', 'CLUB DJ', null, null, null),
    (420, false, false, null, 'à la suite', 90, 'CHL Fan activity - Intermission game (Tricky Cups)', 'GRAPHIC', 'SPEAKER / CLUB DJ', 'TEXT 13', null, null),
    (430, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=56171'),
    (440, false, false, null, '0:08:00', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'New at -8:00! Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (450, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (460, false, false, null, '0:03:00', 180, 'Arena to full-lights', null, 'CLUB DJ', null, 'Arena lights on full power for player entrance!', null),
    (470, false, false, null, '0:00:10', 10, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),

    (480, true, false, null, null, null, '2E TIERS', null, null, null, null, null),
    (490, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (500, false, false, null, 'à la suite', 32, '1st power break: CHL Stats Video', 'CHL STATS VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=51954'),
    (510, false, false, null, 'à la suite', 30, '1st power break: CHL Live Scores', 'CHL LIVE SCORES', 'URL', null, 'DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE LIVE SCORES ARE SHOWN! Once on the URL, click anywhere on the screen to start the sound, which is in a loop.', 'https://www.chl-fan-challenge.com/live-scores'),
    (520, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (530, false, false, null, 'à la suite', 10, '2nd power break: SEYU CTA', 'SEYU CTA', 'SPEAKER', 'TEXT 14', null, null),
    (535, false, false, null, 'à la suite', 20, '2nd power break: SEYU URL', 'SEYU URL', 'CLUB DJ', null, null, null),
    (540, false, false, null, 'à la suite', 30, '2nd power break: CHL Win Prediction Widget (click on your game)', 'CHL WIN PREDICTION WIDGET', 'URL', 'TEXT 15', 'DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE WIN PREDICTION GRAPHIC IS SHOWN!', 'https://chlstats.esports.cz/prediction/ (CLICK ON YOUR GAME)'),

    (550, true, false, null, null, null, '2E PAUSE', null, null, null, null, null),
    (560, false, false, null, '0:18:00', 10, 'CHL Intermission Video on jumbotron/video screens', 'INTERMISSION VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=16267'),
    (570, false, false, null, '0:17:50', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (580, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (590, false, false, null, 'à la suite', 10, 'SEYU CTA', 'SEYU CTA', 'SPEAKER', 'TEXT 16', null, null),
    (595, false, false, null, 'à la suite', 30, 'SEYU URL', 'SEYU URL', 'CLUB DJ', null, null, null),
    (600, false, false, null, 'à la suite', 90, 'CHL Fan activity - Intermission game (Tricky Cups)', 'GRAPHIC', 'SPEAKER', 'TEXT 17', null, null),
    (610, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=56171'),
    (620, false, false, null, '0:08:00', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'New at -8:00! Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (630, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (640, false, false, null, '0:03:00', 180, 'Arena to full-lights', null, 'CLUB DJ', null, 'Arena lights on full power for player entrance!', null),
    (650, false, false, null, '0:00:10', 10, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),

    (660, true, false, null, null, null, '3E TIERS', null, null, null, null, null),
    (670, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (680, false, false, null, 'à la suite', 30, '1st power break: Warrior CHL Webshop', 'WARRIOR CHL WEBSHOP', 'VIDEO', null, 'The file has no sound: Club DJ to play some music while showing it.', 'https://chl-club-hub.com/brand?cat=48637'),
    (690, false, false, null, 'à la suite', 30, '1st power break: CHL Live Scores', 'CHL LIVE SCORES', 'URL', null, 'DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE LIVE SCORES ARE SHOWN! Once on the URL, click anywhere on the screen to start the sound, which is in a loop.', 'https://www.chl-fan-challenge.com/live-scores'),
    (700, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (710, false, false, null, 'à la suite', 10, '2nd power break: SEYU CTA', 'SEYU CTA', 'SPEAKER', 'TEXT 18', null, null),
    (715, false, false, null, 'à la suite', 20, '2nd power break: SEYU URL', 'SEYU URL', 'CLUB DJ', null, null, null),
    (720, false, false, null, 'à la suite', 30, '2nd power break: CHL Win Prediction Widget (click on your game)', 'CHL WIN PREDICTION WIDGET', 'URL', 'TEXT 19', 'DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE WIN PREDICTION GRAPHIC IS SHOWN!', 'https://chlstats.esports.cz/prediction/ (CLICK ON YOUR GAME)'),

    (730, true, false, null, null, null, 'FIN DU MATCH', null, null, null, null, null),
    (740, false, false, null, '+0:05:00', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'VIDEO', 'VIDEO', 'From Club', 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (750, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB CONTENT', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),

    (760, true, false, null, null, null, 'OVERTIME', null, null, null, null, null),
    (770, false, false, null, '0:00:00', 60, 'OT "NO RETURN" RULE', 'NO RETURN RULE GRAPHIC', 'CLUB DJ', null, 'If a game goes into overtime, please display the OT No Return Rule Graphic for 60 seconds during the short 70-second intermission between the end of regulation and the start of OT', 'https://chl-club-hub.com/brand?cat=29578'),
    (780, false, false, null, '0:01:00', 10, 'CHL Overtime Video', 'CHL OVERTIME VIDEO', 'VIDEO', null, 'Show the video 10 seconds before the overtime starts. Show the animated LED board file simultaneously with the Jumbotron File', 'https://chl-club-hub.com/brand?cat=16267')
  ) as v(rang, est_section, important, decalage_s, quand, duree_s, action, cube, audio, speaker, instructions, lien);
end $modele$;

select m.nom as "Modèle", count(l.id) as "Lignes"
from ros_modeles m left join ros_lignes l on l.modele_id = m.id
group by m.nom order by m.nom;
