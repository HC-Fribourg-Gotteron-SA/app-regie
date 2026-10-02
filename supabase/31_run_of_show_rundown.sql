-- =====================================================================
-- 31 — Run of show comme le rundown de la Régie + modèle « NL Regular Season 26/27 »
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 30, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois (le modèle n'est créé qu'une fois).
-- =====================================================================
-- Revu avec Léa le 02.10.2026 d'après le rundown du dernier match (Excel « Rundown 2026/27 NL Regular Season ») :
--   • avant le match, chaque élément a une HEURE réelle (18:00, 19:05…) ; le compte à rebours se calcule.
--     L'heure est gardée comme un décalage par rapport au face-off (decalage_s) : si le face-off change, tout suit ;
--   • pendant le match, « quand » = texte libre (arrêt de jeu, 00:01:00, 0:18:00, à la suite…) : decalage_s vide ;
--   • des sections (1er tiers, 1ère pause…) ; des lignes importantes (face-off) en rouge ;
--   • colonnes : Durée, Action, Cube, Light, Audio, Speaker, Instructions.
-- Fichier généré (script dans le scratchpad de Claude) à partir de la capture du rundown envoyée par Léa.

alter table ros_lignes alter column decalage_s drop not null;
alter table ros_lignes alter column decalage_s drop default;
alter table ros_lignes add column if not exists quand text;
alter table ros_lignes add column if not exists light text;
alter table ros_lignes add column if not exists important boolean not null default false;
alter table ros_lignes add column if not exists est_section boolean not null default false;

-- Lignes créées avec la 1re version (repères pause / fin / à la suite) : plus d'heure, le repère devient le texte « quand »
update ros_lignes
set quand = coalesce(quand, case repere when 'suite' then 'à la suite' when 'pause1' then 'Pause 1'
                                       when 'pause2' then 'Pause 2' when 'fin_match' then 'Fin du match' end),
    decalage_s = null, repere = 'face_off'
where repere <> 'face_off';

-- Modèle « NL Regular Season 26/27 » (rundown du dernier match, face-off 19:45)
do $modele$
declare m uuid;
begin
  if exists (select 1 from ros_modeles where nom = 'NL Regular Season 26/27') then return; end if;
  insert into ros_modeles (nom) values ('NL Regular Season 26/27') returning id into m;
  insert into ros_lignes (modele_id, rang, est_section, important, decalage_s, quand, duree_s,
                          action, video, light, audio, speaker, instructions)
  select m, v.rang, v.est_section, v.important, v.decalage_s, v.quand, v.duree_s,
         v.action, v.cube, v.light, v.audio, v.speaker, v.instructions
  from (values
    (10, true, false, null, null, null, 'AVANT-MATCH', null, null, null, null, null),
    (20, false, false, -6300, null, 3900, 'Ouverture des portes de la patinoire', 'PUB AVANT MATCH', 'GLACE FULL', 'SPOTIFY', null, null),
    (30, false, false, -2400, null, 20, 'Début du Warm-Up', 'ÉCHAUFFEMENT', null, 'DJ', null, null),
    (40, false, false, null, 'à la suite', null, 'Warm-Up', 'LIVE FEED', null, 'DJ', null, null),
    (50, false, false, -1313, null, 113, 'Pub Durant Warm-Up', 'PUB DURANT WARMUP', null, 'VIDEO / DJ', null, 'La dernière PUB n''a pas de musique, le DJ peut mettre de la musique'),
    (60, false, false, -1200, null, 203, 'Pub Après Warm-Up', 'PUBS WARMUP', 'PAUSE', 'VIDEO', null, 'Allumer les lumières en mode pause lorsque tous les joueurs sont sortis'),
    (70, false, false, null, 'à la suite', null, 'Présentation du Match du Jour', 'MATCH DU JOUR', null, 'SPEAKER', 'TEXTE', 'Présentation de l''équipe adverse par le speaker'),
    (80, false, false, null, 'à la suite', null, 'Logo', 'LOGO', null, 'DJ', null, null),
    (90, false, false, -780, null, 90, 'Démarrage Procédure Roster', null, 'LIGHTS OFF', 'DJ', null, 'Couloir West OFF + Réduire la lumière Couloir 1ère Equipe'),
    (100, false, false, -660, null, 9, 'Vidéo UpperView', 'UPPERVIEW', null, 'VIDEO', null, null),
    (110, false, false, null, 'à la suite', 14, 'Vidéo BCF Pregame', 'BCF PREGAME', null, 'VIDEO', null, null),
    (120, false, false, null, 'à la suite', 37, 'Vidéo Roster / ByTheWay', 'ROSTER', null, 'DECO', 'DECO', '"Bonsoir Fribourg" de DECO à partir du Logo ByTheWay'),
    (130, false, false, null, 'à la suite', 150, 'Présentation des Joueurs HCFG (timing approx.)', 'PRÉSENTATION ÉQUIPE', null, 'DJ / DECO', 'DECO', 'Présentation de l''équipe de Gottéron avec les visuels présentation des joueurs / Fond Sonore DJ / Armement des Lasers'),
    (140, false, false, -450, null, 210, 'Début du Show Avant-Match', 'SHOW AVANT MATCH 26-27', null, 'VIDEO', null, null),
    (150, false, false, null, 'à la suite', null, 'Attente Entrée des Joueurs', 'ÉTINCELLES SHOW AVANT MATCH', null, 'DJ', null, 'Lancement d''un musique d''attente avant l''entrée des joueurs s''ils ne sont pas prêt'),
    (160, false, false, null, 'à la suite', null, 'Caméra Couloir Joueurs', 'CAM MOBILE TOP', null, 'DJ', null, null),
    (170, false, false, -240, null, null, 'Entrée des Joueurs (timing approx.)', 'SON ENTREE', 'ENTREE', 'SON COLOSSEO', 'DECO', 'Annonce "Bienvenue aux Dragons" par Deco'),
    (180, false, false, null, 'à la suite', null, 'Caméra Couloir Joueurs OFF', 'STOP CAM TOP', null, null, null, 'Modifier le positionnement de la caméra'),
    (190, false, false, null, 'à la suite', null, 'Caméra Couloir Joueurs', 'CAM MOBILE TOP', null, null, null, null),
    (200, false, false, null, 'à la suite', null, 'Caméra Couloir Joueurs OFF', 'STOP CAM TOP', null, null, null, null),
    (210, false, false, -165, null, null, 'Fin Entrée des Joueurs / Début Top Scorer (timing approx.)', 'TOPSCORER', 'ENTREE / LIGHTS ON', 'DJ / POSTFINANCE', 'TEXTE', 'Début de présentation des PostFinances TopScorer'),
    (220, false, false, null, 'à la suite', null, 'Stop Son Entrée', 'STOP ENTREE', null, null, null, 'Couper le Son Entrée une fois que le son PostFinances Top Scorer est lancé'),
    (230, false, false, null, 'à la suite', null, 'Présentation des Arbitres', 'ARBITRES', null, null, 'TEXTE', null),
    (240, false, false, null, 'à la suite', 20, 'National League Jingle', 'NL-JINGLE', null, 'VIDEO', null, null),
    (250, false, false, null, 'à la suite', null, 'Sponsor du Match', 'SPONSOR DU MATCH', null, 'VIDEO / SPEAKER', 'TEXTE', 'Présentation du Sponsor du Match par le Speaker si la PUB à du SON attendre la fin du Speaker avant de lancer la vidéo'),
    (260, false, false, null, 'à la suite', null, 'Attente Début du Match', 'FULLSCREEN TV FEED', null, 'DJ', null, null),
    (270, false, false, -16, null, 16, 'Puck de Match (timing approx.)', 'MTL / POLYGRAVIA', null, 'VIDEO', null, null),
    (280, false, true, 0, null, null, 'Face-Off (Début 1er Tiers)', 'LIVE FEED', null, 'SPEAKER', 'TEXTE', 'Présentation par le Speaker du Puck de Match (Polygravia)'),
    (290, true, false, null, null, null, '1er TIERS', null, null, null, null, null),
    (300, false, false, null, 'arrêt de jeu', 10, 'Publicité Bellarena', 'BELLARENA', null, 'VIDEO', null, null),
    (310, false, false, null, 'arrêt de jeu', 20, 'Totomat Ladies Junior', 'TOTOMATLADIESJUNIORS', null, 'DJ', null, null),
    (320, false, false, null, 'arrêt de jeu', 28, 'Totomat', 'TOTOMAT', null, 'VIDEO / DJ', null, null),
    (330, false, false, null, 'arrêt de jeu', null, 'Sponsor du Match', 'SPONSOR DU MATCH', null, 'VIDEO / SPEAKER', 'TEXTE', 'Présentation du Sponsor du Match par le Speaker si la PUB à du SON attendre la fin du Speaker avant de lancer la vidéo'),
    (340, false, false, null, 'arrêt de jeu', 12, 'Speed (Statistiques)', 'SPEED', null, 'DJ', null, null),
    (350, false, false, null, 'arrêt de jeu', 28, 'Totomat', 'TOTOMAT', null, 'VIDEO / DJ', null, null),
    (360, false, false, null, '00:01:00', 15, 'Dernière Minute', 'DERNIERE MINUTES', null, 'SPEAKER', 'TEXTE', 'Durant le match'),
    (370, true, false, null, null, null, 'FIN DU 1er TIERS / 1ère PAUSE', null, null, null, null, null),
    (380, false, false, null, '0:18:00', 900, 'Publicités pour la pause', 'FULL PUB', 'PAUSE / GRADIN ON', 'VIDEO / DJ', null, 'Allumer les lumières en mode pause lorsque tous les joueurs sont sortis / Première parties des Publicités avec du SON et ensuite DJ'),
    (390, false, false, null, '0:03:00', null, 'Reprise du Match (timing approx.)', 'REPRISE DE MATCH', 'PAUSE', 'DJ', null, null),
    (400, false, false, null, 'à la suite', null, 'Attente Retour des Joueurs', 'LOGO', null, 'DJ', null, null),
    (410, false, false, null, 'à la suite', 90, 'Retour des Joueurs (Caméra Vestiaire, Décompte 10 / 9 / 8 / …)', 'ENTRER JOUEURS', null, 'VIDEO / DJ', null, 'Musique de la vidéo, directement reprise par les DJ dès que le 1er joueurs est sur la glace'),
    (420, false, false, null, 'à la suite', 30, 'Sponsor du Match', 'SPONSOR DU MATCH', null, 'VIDEO / SPEAKER', 'TEXTE', 'Présentation du Sponsor du Match par le Speaker si la PUB à du SON attendre la fin du Speaker avant de lancer la vidéo'),
    (430, false, false, null, '00:00:16', 16, 'Puck de Match (timing approx.)', 'MTL / POLYGRAVIA', null, 'VIDEO', null, null),
    (440, false, true, null, '00:00:00', null, 'Face-Off (Début 2ème Tiers)', 'LIVE FEED', 'GRADIN OFF', 'SPEAKER', 'TEXTE', 'Présentation par le Speaker du Puck de Match (Polygravia)'),
    (450, true, false, null, null, null, '2ème TIERS', null, null, null, null, null),
    (460, false, false, null, '1er arrêt de jeu', 21, 'Statistiques', 'STATISTIQUES', null, 'VIDEO', null, '1er Arrêt de Jeu du Tiers'),
    (470, false, false, null, 'arrêt de jeu', 10, 'Publicité Bellarena', 'BELLARENA', null, 'VIDEO', null, null),
    (480, false, false, null, 'arrêt de jeu', 20, 'Totomat Ladies Junior', 'TOTOMATLADIESJUNIORS', null, 'DJ', null, null),
    (490, false, false, null, 'arrêt de jeu', 28, 'Totomat', 'TOTOMAT', null, 'VIDEO / DJ', null, null),
    (500, false, false, null, 'arrêt de jeu', null, 'Sponsor du Match', 'SPONSOR DU MATCH', null, 'VIDEO / SPEAKER', 'TEXTE', 'Présentation du Sponsor du Match par le Speaker si la PUB à du SON attendre la fin du Speaker avant de lancer la vidéo'),
    (510, false, false, null, 'arrêt de jeu', 24, 'Effort (Statistiques)', 'EFFORT', null, 'VIDEO', null, null),
    (520, false, false, null, 'arrêt de jeu', 28, 'Totomat', 'TOTOMAT', null, 'VIDEO / DJ', null, null),
    (530, false, false, null, '00:01:00', 15, 'Dernière Minute', 'DERNIERE MINUTES', null, 'SPEAKER', 'TEXTE', 'Durant le match'),
    (540, true, false, null, null, null, 'FIN DU 2ème TIERS / 2ème PAUSE', null, null, null, null, null),
    (550, false, false, null, '0:18:00', 900, 'Publicités pour la pause', 'FULL PUB', 'PAUSE / GRADIN ON', 'VIDEO / DJ', null, 'Allumer les lumières en mode pause lorsque tous les joueurs sont sortis / Première parties des Publicités avec du SON et ensuite DJ'),
    (560, false, false, null, 'durant la pause', null, 'Canon à T-Shirt Groupe E', 'GROUPEE-TSHIRT', null, 'DJ', 'DECO', 'Dès que les publicités n''ont plus de SON'),
    (570, false, false, null, 'à la suite', null, 'Stop de l''anneau LED Groupe E T-Shirt', 'STOP GROUPE-TSHIRT', null, 'DJ', null, null),
    (580, false, false, null, '0:03:00', null, 'Reprise du Match (timing approx.)', 'REPRISE DE MATCH', 'PAUSE', 'DJ', null, null),
    (590, false, false, null, 'à la suite', null, 'Attente Retour des Joueurs', 'LOGO', null, 'DJ', null, null),
    (600, false, false, null, 'à la suite', 90, 'Retour des Joueurs (Caméra Vestiaire, Décompte 10 / 9 / 8 / …)', 'ENTRER JOUEURS', null, 'VIDEO / DJ', null, 'Musique de la vidéo, directement reprise par les DJ dès que le 1er joueurs est sur la glace'),
    (610, false, false, null, 'à la suite', 30, 'Sponsor du Match', 'SPONSOR DU MATCH', null, 'VIDEO / SPEAKER', 'TEXTE', 'Présentation du Sponsor du Match par le Speaker si la PUB à du SON attendre la fin du Speaker avant de lancer la vidéo'),
    (620, false, false, null, '00:00:16', 16, 'Puck de Match (timing approx.)', 'MTL / POLYGRAVIA', null, 'VIDEO', null, null),
    (630, false, true, null, '00:00:00', null, 'Face-Off (Début 3ème Tiers)', 'LIVE FEED', 'GRADIN OFF', 'SPEAKER', 'TEXTE', 'Présentation par le Speaker du Puck de Match (Polygravia)'),
    (640, true, false, null, null, null, '3ème TIERS', null, null, null, null, null),
    (650, false, false, null, '1er arrêt de jeu', 21, 'Statistiques', 'STATISTIQUES', null, 'VIDEO', null, '1er Arrêt de Jeu du Tiers'),
    (660, false, false, null, 'arrêt de jeu', 10, 'Publicité Bellarena', 'BELLARENA', null, 'VIDEO', null, null),
    (670, false, false, null, 'arrêt de jeu', 20, 'Totomat Ladies Junior', 'TOTOMATLADIESJUNIORS', null, 'DJ', null, null),
    (680, false, false, null, 'arrêt de jeu', 28, 'Totomat', 'TOTOMAT', null, 'VIDEO / DJ', null, null),
    (690, false, false, null, 'arrêt de jeu', null, 'Sponsor du Match', 'SPONSOR DU MATCH', null, 'VIDEO / SPEAKER', 'TEXTE', 'Présentation du Sponsor du Match par le Speaker si la PUB à du SON attendre la fin du Speaker avant de lancer la vidéo'),
    (700, false, false, null, '00:10:00', 23, 'Affichage du nombre de spectateurs', 'SPECTATEURS', null, 'SPEAKER', 'TEXTE', 'Présentation du nombre de spectateurs par le Speaker'),
    (710, false, false, null, 'arrêt de jeu suivant', 21, 'Prochain Match', 'PROCHAIN MATCH', null, 'DJ', null, null),
    (720, false, false, null, 'arrêt de jeu', 24, 'Distance (Statistiques)', 'DISTANCE', null, 'DJ', null, null),
    (730, false, false, null, 'arrêt de jeu', 28, 'Totomat', 'TOTOMAT', null, 'VIDEO / DJ', null, null),
    (740, false, false, null, '00:01:00', 15, 'Dernière Minute', 'DERNIERE MINUTES', null, null, 'TEXTE', 'Durant le match'),
    (750, true, false, null, null, null, 'FIN DU MATCH', null, null, null, null, null),
    (760, false, false, null, 'à la suite', null, 'Début de la Cérémonie MVP (timing approx.)', 'MVP', 'MVP / GRADIN ON', 'VIDEO', null, 'Dès que les joueurs sont en places sur les lignes bleues'),
    (770, false, false, null, 'à la suite', null, 'Présentation du MVP', 'PRÉSENTATION MVP', null, 'SPEAKER', 'TEXTE', 'Présentation du MVP adverse suivi du MVP HCFG avec image au vidéotron'),
    (780, false, false, null, 'à la suite', null, 'Fin Cérémonie MVP', 'LIVE FEED', 'MVP', 'SPEAKER', 'TEXTE', 'Le speaker clôture le match'),
    (790, false, false, null, 'à la suite', 21, 'Annonce du prochain match à domicile', 'PROCHAIN MATCH', null, 'SPEAKER', 'TEXTE', 'Annonce du prochain match par le speaker'),
    (800, false, false, null, 'à la suite', 20, 'Publicité des TPF (2x)', 'TPF', null, 'DJ', null, 'S''il n''y pas d''interview passé directement à "Merci et à Bientôt"'),
    (810, false, false, null, 'à la suite', null, 'Attente Interview Joueurs HCFG (Si Victoire)', 'LOGO', null, 'DJ', null, null),
    (820, false, false, null, 'à la suite', null, 'Interview Joueur HCFG (Si Victoire)', 'FULLSCREEN CAM MOBILE', null, 'DECO', 'DECO', 'Stopper l''action avant le "Merci et à Bientôt"'),
    (830, false, false, null, 'à la suite', null, 'Clôture du Match', 'MERCI ET À BIENTÔT', null, 'SPOTIFY', null, 'Laisser léger un fond sonore durant les interviews TV'),
    (840, true, false, null, null, null, 'OVERTIME', null, null, null, null, null),
    (850, false, false, null, 'avant début overtime', 20, 'Début Overtime Redbull (timing approx.)', 'OVERTIME', null, 'VIDEO', null, null),
    (860, false, false, null, 'à la suite', null, 'Durant l''Overtime', 'LIVE FEED', null, null, null, 'En cas d''arrêt de jeu, le DJ gère le son'),
    (870, false, false, null, 'fin overtime', null, 'Fin Overtime RedBull (Si Victoire)', 'REDBULL FIN OVERTIME', null, 'DJ', null, 'En cas de victoire afficher le visuel, en cas de défaite passer directement à la procédure de fin du match'),
    (880, true, false, null, null, null, 'SHOOTOUT', null, null, null, null, null),
    (890, false, false, null, 'avant début overtime', null, 'Passer le Scoreboard en mode Shootout (timing approx.)', 'SHOOTOUT', null, 'DJ', null, null),
    (900, false, false, null, 'avant début overtime', null, 'Début Shootout (timing approx.)', 'SHOOTOUT(2)', null, 'DJ', null, null),
    (910, false, false, null, 'à la suite', null, 'Durant le Shootout', 'LIVE FEED', null, 'DJ', null, 'Le DJ gère le son durant le shootout'),
    (920, false, false, null, 'fin shootout', null, 'Passer à la procédure de fin du match', null, null, null, null, null)
  ) as v(rang, est_section, important, decalage_s, quand, duree_s, action, cube, light, audio, speaker, instructions);
end $modele$;

select m.nom as "Modèle", count(l.id) as "Lignes"
from ros_modeles m left join ros_lignes l on l.modele_id = m.id
group by m.nom order by m.nom;
