-- =====================================================================
-- 40 — Modèle de run of show « CHL Regular Season 26/27 »
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 31, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois (le modèle n'est créé qu'une fois).
-- =====================================================================
-- Transcrit le 05.10.2026 du « Jumbotron Operator Rundown - 2026/27 CHL Regular Season - Fribourg Gottéron -
-- HC Pilsen » collé par Léa (face-off 19:45). Textes laissés en anglais (rundown officiel de la CHL).
--   • REAL TIME → heure liée au face-off (decalage_s) ; « following » → quand = « à la suite » ;
--   • pendant le match : « +0:06:00 » (power break, temps de jeu) et « 0:18:00 » (temps restant de la pause) → quand ;
--   • sections en français (1ER TIERS, 1ÈRE PAUSE…) pour le bouton « Lancer » et l'avance automatique des pauses ;
--   • DOWNLOAD LINK → colonne Lien ; CUBE → colonne Cube (video) ; lignes « Timing is fix! » et face-off en rouge.
-- Lignes propres au 1er match (cérémonie 100 CHL Games, « For GD1 ») gardées : à adapter dans le run of show du match.

do $modele$
declare m uuid;
begin
  if exists (select 1 from ros_modeles where nom = 'CHL Regular Season 26/27') then return; end if;
  insert into ros_modeles (nom) values ('CHL Regular Season 26/27') returning id into m;
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
    (100, false, false, -1350, null, 90, 'CHL Fan activity - Intermission game (Match-it)', 'GRAPHIC', 'SPEAKER / CLUB DJ', 'TEXT 1', 'Please show the Match-it Call to Action graphic during which the speaker makes the announcement according to Speaker Text 1', 'https://chl-club-hub.com/brand?cat=56131'),
    (110, false, false, -1260, null, null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'VIDEO', 'VIDEO', null, 'To be played out right after warm-up is finished; Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (120, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB CONTENT', 'SPEAKER / VIDEO', null, 'after commercial video loop is finished (if applicable)', null),
    (130, false, false, -1200, null, 1200, 'Countdown to Face-Off on clock', null, null, null, null, null),
    (140, false, false, null, 'à la suite', 60, 'CHL club promotion video away team', 'VIDEO', 'VIDEO', 'TEXT 2', 'MANDATORY: To be announced by speaker --> introduction of away team; to be obtained from CHL Club Hub', 'https://chl-club-hub.com/brand?cat=16245'),
    (150, false, false, null, 'à la suite', null, 'PA Speaker to announce roster of both teams - Right after CHL club promotion video of away team', 'According Player Cards', 'SPEAKER / CLUB DJ', 'TEXT 3', 'Incl. showing the player cards of both teams on the jumbotron; to be obtained from CHL Club Hub. If Home team roster announcement is part of Club Intro Show, it can also be done then.', 'https://chl-club-hub.com/brand?cat=16229 (Choose Respective Club Folder)'),
    (160, false, false, null, 'à la suite', null, 'PA Speaker to announce TopScorer of both teams - Right after roster of both teams', 'CHL TOP SCORER GRAPHIC', 'SPEAKER', 'TEXT 4', 'Plese show the respective graphic on the jumbotron (provided by CHL on Game Day); Speaker to announce Top Scorers according to Speaker Text 4', 'Provided by CHL on Game Day!'),
    (170, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'VIDEO', 'VIDEO', null, '--> For GD1: Team captains will wear the CHL TopScorer jersey!', 'https://chl-club-hub.com/brand?cat=56171'),
    (180, false, false, -600, null, 75, 'CHL Intro Video', 'VIDEO', 'VIDEO', null, null, 'https://chl-club-hub.com/brand?cat=16243'),
    (190, false, false, -525, null, null, 'Intro Home Club', 'CLUB CONTENT', 'CLUB CONTENT', null, 'The Intro Home Club timing can vary between -07:45 and -04:45, depending on whether the player entrance is included. If the Intro Video before the player entrance (-06:30) is longer than 01:15, adjust the rundown accordingly and start the CHL Fan Activity on the Jumbotron (-21:30) earlier to ensure players are on the blue line by -04:45.', null),
    (200, false, false, -480, null, null, 'PA Speaker to announce Game Officials (approx. timing only)', 'LIVE FEED', 'SPEAKER', 'TEXT 5', 'If home team intro duration does not allow for proper intro of Game Officials at this stage, please do so between FO -2:00 and face-off', null),
    (210, false, false, -450, null, 105, 'Players depart on ice; intro home club (approx. timing only)', 'Club Intro', null, null, 'Timing of the intro to be adapted according to the duration of the intro show of the home team! The home team is allowed to do his regular intro show, NO regulations for this except: No helmets!', null),
    (220, false, true, -345, null, null, 'Players to line up on blue lines', null, null, null, 'Timing is fix! All players to be lined up on their respective blue line at FO -4:45! No helmets! Please avoid completely dark arenas. Players shall be visible in broadcasting.', null),
    (230, false, false, -345, null, 15, 'Award Ceremony 100 CHL Games Roger Rönnberg', 'GRAPHIC 100 CHL GAMES', 'SPEAKER', 'TEXT 6a', 'Introduction of Award Ceremony by speaker according to Text 6a. During Speaker Announcement please show the Graphic on the Jumbotron.', null),
    (240, false, false, -330, null, 15, 'Award Ceremony: highlight video', 'VIDEO 100 CHL Games', 'VIDEO', null, 'Video "100 CHL Games_Roger-Rönnberg Highlight Video" to be played on Jumbotron', null),
    (250, false, false, -315, null, 30, 'Award Ceremony: handover', 'GRAPHIC 100 CHL GAMES', 'SPEAKER', 'TEXT 6b', 'Speaker to announce handover of Award presented by John Gobbi and Gerd Zenhäusern according to Speaker Text 6b. Afterwards big applause and everyone leaving the ice', null),
    (260, false, true, -285, null, 38, 'CHL anthem to be played via jumbotron/video sreens OR PA system.', 'VIDEO', 'SPEAKER / VIDEO', 'TEXT 7', 'Timing is fix! All players to be lined up on their respective blue line at FO -4:45! Speaker to Announce CHL Anthem', 'https://chl-club-hub.com/brand?cat=16286'),
    (270, false, false, -240, null, 60, 'National anthem of away team to be played out via jumbotron/video sreens OR PA system', 'VIDEO', 'SPEAKER / VIDEO', 'TEXT 8', 'Speaker to Announce both National Anthems according To Speaker Text 7. After announcement both anthems to be played one after another.', 'https://chl-club-hub.com/brand?cat=16288'),
    (280, false, false, -180, null, 60, 'National anthem of home team to be played out via jumbotron/video sreens OR PA system', 'VIDEO', 'VIDEO', null, null, null),
    (290, false, false, -120, null, null, 'Lights on full power (if lights need some time to be on full power: timing to be adapted so the lights are on full power at FO -2:00)', null, 'CLUB DJ', null, null, null),
    (300, false, false, -60, null, 10, 'Starting Six Graphic of Away Team followed by Home Team', 'GRAPHIC', 'SPEAKER', 'TEXT 9', 'PA Speaker to announce Starting Six with Starting Six graphic on video screen/jumbotron (to be obtained from CHL Club Hub); Teams to huddle around goalie --> Players NOT to line-up again', 'https://chl-club-hub.com/brand?cat=16273'),
    (310, false, false, -10, null, null, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),
    (320, false, true, 0, null, null, 'Face-Off (1st Period)', null, null, null, null, null),

    (330, true, false, null, null, null, '1ER TIERS', null, null, null, null, null),
    (340, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (350, false, false, null, 'à la suite', 33, '1st power break: CHL Rules Explainer Video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, 'About 5 Seconds into the PB, please show the CHL Rules Explainer Video', 'https://chl-club-hub.com/brand?cat=56171'),
    (360, false, false, null, 'à la suite', 20, '1st power break: CHL Top Scorer', 'CHL TOP SCORER GRAPHIC', 'SPEAKER', 'TEXT 10', 'Plese show the respective graphic on the jumbotron (provided by CHL on Game Day); Speaker to announce Top Scorers according to Speaker Text 9', 'Provided by CHL on Game Day!'),
    (370, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (380, false, false, null, 'à la suite', 40, '2nd power break: CHL Predictor Promo', 'CHL PREDICTOR PROMO', 'VIDEO', null, 'About 5 Seconds into the PB, please show the CHL Predictor Game promotion video', 'https://chl-club-hub.com/brand?cat=33005'),
    (390, false, false, null, 'à la suite', 26, '2nd power break: CHL TikTok Promo', 'CHL TIKTOK PROMO', 'VIDEO', null, 'After CHL Predictor Game promotion video, show the CHL TikTok promotion video', 'https://chl-club-hub.com/brand?cat=33937'),

    (400, true, false, null, null, null, '1ÈRE PAUSE', null, null, null, null, null),
    (410, false, false, null, '0:18:00', 10, 'CHL Intermission Video on jumbotron/video screens', 'INTERMISSION VIDEO', 'VIDEO', null, 'Please show the CHL Intermission Video', 'https://chl-club-hub.com/brand?cat=16267'),
    (420, false, false, null, '0:17:50', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (430, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (440, false, false, null, 'à la suite', 90, 'CHL Fan activity - Intermission game (Match-it)', 'GRAPHIC', 'SPEAKER / CLUB DJ', 'TEXT 11', 'Please show the Match-it Call to Action graphic during which the speaker makes the announcement according to Speaker Text 10', 'https://chl-club-hub.com/brand?cat=56131'),
    (450, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, 'Please show the Rule Innovations Explainer Video', 'https://chl-club-hub.com/brand?cat=56171'),
    (460, false, false, null, '0:03:00', 180, 'Arena to full-lights', null, 'CLUB DJ', null, 'Arena lights on full power for player entrance!', null),
    (470, false, false, null, '0:00:10', 10, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),

    (480, true, false, null, null, null, '2E TIERS', null, null, null, null, null),
    (490, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (500, false, false, null, 'à la suite', 33, '1st power break: CHL Live Scores', 'CHL LIVE SCORES', 'URL', null, 'About 5 Seconds into the PB, Please show the live scores. DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE LIVE SCORES ARE SHOWN! Once on the URL, click anywhere on the screen to start the sound, which is in a loop.', 'https://www.chl-fan-challenge.com/live-scores'),
    (510, false, false, null, 'à la suite', 20, '1st power break: CHL Stats Video', 'CHL STATS VIDEO', 'VIDEO', null, 'Please show the CHL Stats Promotion Video', 'https://chl-club-hub.com/brand?cat=51954'),
    (520, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (530, false, false, null, 'à la suite', 40, '2nd power break: CHL Win Prediction Widget', 'CHL WIN PREDICTION WIDGET', 'URL', 'TEXT 12', 'About 5 Seconds into the PB, Please show the win prediction graphic through the URL. DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE WIN PREDICTION GRAPHIC IS SHOWN! Speaker to make the announcement according to Speaker Text 11.', 'https://chlstats.esports.cz/prediction/ (CLICK ON YOUR GAME)'),
    (540, false, false, null, 'à la suite', 26, '2nd power break: Warrior CHL Webshop', 'WARRIOR CHL WEBSHOP', 'Club DJ', null, 'Please show the CHL Warrior Webshop Video. Currently the file has no sound, why we ask your Club DJ to play some music while showing it.', 'https://chl-club-hub.com/brand?cat=48637'),

    (550, true, false, null, null, null, '2E PAUSE', null, null, null, null, null),
    (560, false, false, null, '0:18:00', 10, 'CHL Intermission Video on jumbotron/video screens', 'INTERMISSION VIDEO', 'VIDEO', null, 'Please show the CHL Intermission Video', 'https://chl-club-hub.com/brand?cat=16267'),
    (570, false, false, null, '0:17:50', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'COMMERCIAL VIDEO LOOP', 'VIDEO', null, 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (580, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB SPONSORS', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),
    (590, false, false, null, 'à la suite', 90, 'CHL Fan activity - Intermission game (Match-it)', 'GRAPHIC', 'SPEAKER', 'TEXT 13', 'Please show the Match-it Call to Action graphic during which the speaker makes the announcement according to Speaker Text 12', 'https://chl-club-hub.com/brand?cat=56131'),
    (600, false, false, null, 'à la suite', 30, 'CHL on-ice rule innovations - Explainer video', 'CHL RULES EXPLAINER VIDEO', 'VIDEO', null, 'Please show the Rule Innovations Explainer Video', 'https://chl-club-hub.com/brand?cat=56171'),
    (610, false, false, null, '0:03:00', 180, 'Arena to full-lights', null, 'CLUB DJ', null, 'Arena lights on full power for player entrance!', null),
    (620, false, false, null, '0:00:10', 10, 'CHL Key Visual on jumbotron/video screens', 'GRAPHIC', 'CLUB DJ', null, 'Please see the CHL Jumbotron Guidelines Pages 7-8 for more information', 'https://chl-club-hub.com/brand?cat=16267'),

    (630, true, false, null, null, null, '3E TIERS', null, null, null, null, null),
    (640, false, false, null, '+0:06:00', 5, '1ST POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (650, false, false, null, 'à la suite', 40, '1st power break: CHL Predictor Promo', 'CHL PREDICTOR PROMO', 'VIDEO', null, 'About 5 Seconds into the PB, please show the CHL Predictor Game promotion video', 'https://chl-club-hub.com/brand?cat=33005'),
    (660, false, false, null, 'à la suite', 26, '1st power break: CHL TikTok Promo', 'CHL TIKTOK PROMO', 'VIDEO', null, 'After CHL Predictor Game promotion video, show the CHL TikTok promotion video', 'https://chl-club-hub.com/brand?cat=33937'),
    (670, false, false, null, '+0:12:00', 5, '2ND POWER BREAK', 'POWER BREAK VIDEO CLIP', 'VIDEO', null, 'Show the first five seconds of the power break video clip, which lasts 70 seconds. See Jumbotron Guidelines Page 27 for detailed instructions', 'https://chl-club-hub.com/brand?cat=16267'),
    (680, false, false, null, 'à la suite', 30, '2nd power break: Win Prediction Widget', 'WIN PREDICTION WIDGET', 'URL', 'TEXT 14', 'About 5 sec into the PB, please show the Win Prediction graphic through the URL. DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE WIN PREDICTION GRAPHIC IS SHOWN! Speaker to make the announcement according to Seaker Text 13', 'https://chlstats.esports.cz/prediction/ (CLICK ON YOUR GAME)'),
    (690, false, false, null, 'à la suite', 30, '2nd power break: CHL Live Scores', 'CHL LIVE SCORES', 'URL', null, 'Please show the live scores. DO NOT FORGET TO UPDATE THE URL EVERY TIME BEFORE THE LIVE SCORES ARE SHOWN! Once on the URL, click anywhere on the screen to start the sound, which is in a loop.', 'https://www.chl-fan-challenge.com/live-scores'),

    (700, true, false, null, null, null, 'FIN DU MATCH', null, null, null, null, null),
    (710, false, false, null, '+0:05:00', null, 'CHL commercial and club sponsor video loop on jumbotron/video screen', 'VIDEO', 'VIDEO', 'From Club', 'Club sponsor video loop to be played AFTER CHL commercial video loop', 'Provided by Infront'),
    (720, false, false, null, 'à la suite', null, 'Club sponsor arena announcement (if applicable)', 'CLUB CONTENT', 'CLUB CONTENT', null, 'Max. 6 club sponsors/partners', null),

    (730, true, false, null, null, null, 'OVERTIME', null, null, null, null, null),
    (740, false, false, null, '0:00:00', 60, 'OT "NO RETURN" RULE', 'NO RETURN RULE GRAPHIC', 'CLUB DJ', null, 'If a game goes into overtime, please display the OT No Return Rule Graphic for 60 seconds during the short 70-second intermission between the end of regulation and the start of OT', 'https://chl-club-hub.com/brand?cat=29578'),
    (750, false, false, null, '0:01:00', 10, 'CHL Overtime Video', 'CHL OVERTIME VIDEO', 'VIDEO', null, 'Show the video 10 seconds before the overtime starts. Show the animated LED board file simultaneously with the Jumbotron File', 'https://chl-club-hub.com/brand?cat=16267')
  ) as v(rang, est_section, important, decalage_s, quand, duree_s, action, cube, audio, speaker, instructions, lien);
end $modele$;

select m.nom as "Modèle", count(l.id) as "Lignes"
from ros_modeles m left join ros_lignes l on l.modele_id = m.id
group by m.nom order by m.nom;
