-- =====================================================================
-- DONNÉES FICTIVES pour faire tester l'outil aux collègues
-- À exécuter dans Supabase > SQL Editor de la BASE DE TEST, sur une base vide (installation ou 23_remise_a_zero.sql).
-- S'il n'y a aucun match passé au calendrier, un match fictif « HC Démo (match passé fictif) » est créé 3 jours avant.
-- =====================================================================
-- Tous les sponsors se terminent par « (démo) ». Rien de réel : on peut tout casser.
-- Après les tests : 23_remise_a_zero.sql, puis le vrai import.
--
-- Ce qu'on trouve :
--   • des sponsors sur LED 3M / 6M (avec Banner HCFG libres), Pub pause tiers (avec / sans son,
--     avec / sans anneau LED), Angles match, Anneau LED, LED Sportcafé, Action scenes, Slides,
--     Pub après warm-up ;
--   • des états : À l'écran, Pas à l'écran, ⏸ Désactivé, ⏳ visuel attendu ;
--   • Match du jour (prochain match) : des changements à faire dans Colosseo (ajouter, enlever,
--     nouveau visuel, désactivé) + « Pour ce soir » (1 info, 2 tâches) ;
--   • 5 demandes : nouveau sponsor, ajout, changement de visuel, suppression, question en attente.

-- Petite fonction d'aide (supprimée à la fin) : crée une diffusion complète
create or replace function demo_ligne(
  p_sponsor text, p_produit text, p_type type_vente default 'saison',
  p_son boolean default false, p_duree int default null, p_visuel text default null,
  p_empl text[] default '{}', p_anneau text default null, p_consignes text default null,
  p_matchs uuid[] default null, p_debut date default null, p_fin date default null
) returns uuid language plpgsql set search_path = public as $$
declare
  v_saison uuid := (select id from saisons where active);
  v_sponsor uuid; v_contrat uuid; v_produit uuid; v_ligne uuid; v_anneau uuid; e text;
begin
  select id into v_produit from produits where nom = p_produit;
  if v_produit is null then raise exception 'Produit introuvable : %', p_produit; end if;

  select id into v_sponsor from sponsors where nom = p_sponsor;
  if v_sponsor is null then
    insert into sponsors (nom, notes) values (p_sponsor, 'Donnée de démonstration') returning id into v_sponsor;
  end if;
  select id into v_contrat from contrats where sponsor_id = v_sponsor and saison_debut_id = v_saison;
  if v_contrat is null then
    insert into contrats (sponsor_id, saison_debut_id, saison_fin_id) values (v_sponsor, v_saison, v_saison)
    returning id into v_contrat;
  end if;

  insert into lignes_vendues (contrat_id, produit_id, type_vente, avec_son, duree_s, consignes, statut, date_debut, date_fin)
  values (v_contrat, v_produit, p_type, p_son, p_duree, p_consignes, 'vendu', p_debut, p_fin)
  returning id into v_ligne;

  if p_matchs is not null then
    insert into lignes_matchs (ligne_id, match_id) select v_ligne, unnest(p_matchs);
  end if;
  foreach e in array p_empl loop
    insert into lignes_emplacements (ligne_id, emplacement_id)
    select v_ligne, id from emplacements where anneau = split_part(e, ':', 1) and position = split_part(e, ':', 2)::int;
  end loop;
  if p_visuel is not null then
    insert into assets (ligne_id, nom_visuel, statut, avec_son, depose_le)
    values (v_ligne, p_visuel, 'valide', p_son, now() - interval '30 days');
  end if;

  -- Pub pause tiers « avec anneau LED » : l'anneau fait partie de la pub (ligne couplée, produit technique)
  if p_anneau is not null then
    insert into lignes_vendues (contrat_id, produit_id, type_vente, duree_s, statut, date_debut, date_fin, ligne_couplee_id)
    values (v_contrat, (select id from produits where nom = 'Anneau LED pause tiers'), p_type, p_duree, 'vendu',
            p_debut, p_fin, v_ligne)
    returning id into v_anneau;
    update lignes_vendues set ligne_couplee_id = v_anneau where id = v_ligne;
    if p_matchs is not null then
      insert into lignes_matchs (ligne_id, match_id) select v_anneau, unnest(p_matchs);
    end if;
    insert into assets (ligne_id, nom_visuel, statut, avec_son, depose_le)
    values (v_anneau, p_anneau, 'valide', false, now() - interval '30 days');
  end if;
  return v_ligne;
end $$;

do $demo$
declare
  v_saison    uuid := (select id from saisons where active);
  v_admin     uuid := (select id from profiles where role in ('admin', 'regie') order by created_at limit 1);
  v_prochain  matchs;
  v_precedent matchs;
  l uuid; d uuid; pas_ecran uuid;
begin
  if exists (select 1 from lignes_vendues) or exists (select 1 from demandes) then
    raise exception 'La base n''est pas vide : exécutez d''abord 23_remise_a_zero.sql.';
  end if;
  if v_saison is null then raise exception 'Aucune saison active.'; end if;
  select * into v_prochain  from matchs where saison_id = v_saison and date_heure >= date_trunc('day', now()) order by date_heure limit 1;
  select * into v_precedent from matchs where saison_id = v_saison and date_heure <  date_trunc('day', now()) order by date_heure desc limit 1;
  if v_prochain.id is null then
    raise exception 'Il faut au moins un match à venir dans le calendrier (importer le .ics dans l''outil).';
  end if;
  -- Pas de match passé (le .ics ne contient souvent que les matchs à venir) : un match fictif 3 jours avant,
  -- pour que Match du jour ait un « match précédent » à comparer
  if v_precedent.id is null then
    insert into matchs (saison_id, numero, date_heure, adversaire, type)
    values (v_saison, (select coalesce(min(numero), 1) - 1 from matchs where saison_id = v_saison),
            date_trunc('day', now()) - interval '3 days' + interval '19 hours 45 minutes',
            'HC Démo (match passé fictif)', 'saison')
    returning * into v_precedent;
  end if;

  alter table assets disable trigger assets_avant;   -- visuels créés directement « validés »

  -- LED 3M (bande A / B ; 10–14 = NORD-OUEST réservé club)
  perform demo_ligne('Boulangerie du Bourg (démo)', 'LED 3M', p_visuel => 'Boulangerie_LED.png', p_empl => '{A:1}');
  perform demo_ligne('Garage du Lac (démo)',        'LED 3M', p_visuel => 'GarageLac_LED.png',   p_empl => '{A:2}');
  l := demo_ligne('Pharmacie Centrale (démo)',      'LED 3M', p_visuel => 'Pharmacie_LED.png',   p_empl => '{A:3}',
                  p_consignes => 'Nouveau logo promis par le Sponsoring pour la fin du mois');
  update lignes_vendues set visuel_attendu = true where id = l;
  perform demo_ligne('Fiduciaire Alpha (démo)',     'LED 3M', p_visuel => 'Alpha_LED.png',       p_empl => '{A:4}');
  perform demo_ligne('Menuiserie Dupont (démo)',    'LED 3M', p_visuel => 'Dupont_LED.png',      p_empl => '{B:1}');
  perform demo_ligne('Café de la Gare (démo)',      'LED 3M', p_visuel => 'CafeGare_LED.png',    p_empl => '{B:2}');
  -- nouveau depuis le dernier match -> « Mettre le logo » dans Match du jour
  perform demo_ligne('Imprimerie Nouvelle (démo)',  'LED 3M', p_visuel => 'Imprimerie_LED.png',  p_empl => '{A:5}',
                     p_debut => current_date);
  -- a passé au dernier match seulement -> « Enlever le logo · remettre Banner HCFG »
  perform demo_ligne('Agence Voyages Soleil (démo)', 'LED 3M', p_visuel => 'Soleil_LED.png',     p_empl => '{A:6}',
                     p_fin => (v_precedent.date_heure at time zone 'Europe/Zurich')::date);

  -- LED 6M (2 emplacements) + une LED 3M posée sur la bande 6M
  perform demo_ligne('Banque Régionale (démo)',     'LED 6M', p_visuel => 'Banque_LED6M.png',    p_empl => '{C:1,C:2}');
  perform demo_ligne('Assurances Horizon (démo)',   'LED 6M', p_visuel => 'Horizon_LED6M.png',   p_empl => '{C:3,C:4}');
  perform demo_ligne('Traiteur Gourmand (démo)',    'LED 3M', p_visuel => 'Traiteur_LED.png',    p_empl => '{D:1}');

  -- Pub pause tiers : avec / sans son, avec / sans anneau LED
  perform demo_ligne('Banque Régionale (démo)',     'Pub pause tiers', p_son => true,  p_duree => 30,
                     p_visuel => 'Banque_spot_30s.mp4',   p_anneau => 'Banque_anneau.mp4');
  l := demo_ligne('Assurances Horizon (démo)',      'Pub pause tiers', p_son => true,  p_duree => 20,
                  p_visuel => 'Horizon_spot_v1.mp4',     p_anneau => 'Horizon_anneau.mp4');
  perform demo_ligne('Garage du Lac (démo)',        'Pub pause tiers', p_son => false, p_duree => 15,
                     p_visuel => 'GarageLac_15s.mp4',     p_anneau => 'GarageLac_anneau.mp4');
  perform demo_ligne('Pharmacie Centrale (démo)',   'Pub pause tiers', p_son => false, p_duree => 15,
                     p_visuel => 'Pharmacie_15s.mp4');
  d := demo_ligne('Café de la Gare (démo)',         'Pub pause tiers', p_son => false, p_duree => 10,
                  p_visuel => 'CafeGare_10s.mp4');
  -- vendu pour le prochain match seulement -> « Ajouter à la playlist »
  perform demo_ligne('Restaurant du Port (démo)',   'Pub pause tiers', 'match', p_son => true, p_duree => 20,
                     p_visuel => 'Port_spot_20s.mp4', p_matchs => array[v_prochain.id],
                     p_consignes => 'Soirée spéciale au restaurant, à passer seulement ce soir');

  -- Autres produits
  perform demo_ligne('Fiduciaire Alpha (démo)',     'Angles match', p_visuel => 'Alpha_angle.png');
  perform demo_ligne('Menuiserie Dupont (démo)',    'Angles match', p_visuel => 'Dupont_angle.png');
  perform demo_ligne('Boulangerie du Bourg (démo)', 'Angles match', p_visuel => 'Boulangerie_angle.mp4');
  perform demo_ligne('Banque Régionale (démo)',     'Anneau LED',   p_visuel => 'Banque_bandeau.mp4');
  perform demo_ligne('Garage du Lac (démo)',        'Anneau LED',   p_visuel => 'GarageLac_bandeau.png');
  perform demo_ligne('Café de la Gare (démo)',      'LED Sportcafé (9M)', p_visuel => 'CafeGare_sportcafe.png');
  perform demo_ligne('Banque Régionale (démo)',     'Action scene – Goal Home', p_visuel => 'Banque_goal.mp4');
  perform demo_ligne('Assurances Horizon (démo)',   'Action scene – Timeout',   p_visuel => 'Horizon_timeout.mp4');
  perform demo_ligne('Garage du Lac (démo)',        'Action scene – Powerplay', p_visuel => 'GarageLac_powerplay.mp4');
  perform demo_ligne('Restaurant du Port (démo)',   'Action scene – Sponsor du match', 'match',
                     p_visuel => 'Port_sponsor_match.mp4', p_matchs => array[v_prochain.id]);
  perform demo_ligne('Boulangerie du Bourg (démo)', 'Young Dragons Golden',  p_visuel => 'Boulangerie_logo.png');
  perform demo_ligne('Pharmacie Centrale (démo)',   'Young Dragons Golden',  p_visuel => 'Pharmacie_logo.png');
  perform demo_ligne('Menuiserie Dupont (démo)',    'Young Dragons Golden',  p_visuel => 'Dupont_logo.png');
  perform demo_ligne('Fiduciaire Alpha (démo)',     'Ladies Legend Members', p_visuel => 'Alpha_logo.png');
  perform demo_ligne('Café de la Gare (démo)',      'Ladies Legend Members', p_visuel => 'CafeGare_logo.png');
  -- « Pas à l'écran » (case décochée)
  pas_ecran := demo_ligne('Imprimerie Nouvelle (démo)', 'Pub après warm-up', p_son => false, p_duree => 15,
                          p_visuel => 'Imprimerie_warmup.mp4');
  update lignes_vendues set validee = false where id = pas_ecran;

  -- Chaque match (passé compris) retient son visuel : point de départ de la comparaison
  update passages set asset_id = choisir_asset(ligne_id, match_id) where asset_id is null;

  -- Nouveau visuel depuis le dernier match -> « Remplacer le visuel » (l'ancien est archivé automatiquement)
  insert into assets (ligne_id, nom_visuel, statut, avec_son) values (l, 'Horizon_spot_v2.mp4', 'valide', true);

  -- Désactivé depuis le dernier match -> « Enlever de la playlist (désactivé : trop de pub) »
  update lignes_vendues set suspendue = true, motif_suspension = 'Trop de pub en pause tiers' where id = d;
  update passages set statut = 'prevu' where ligne_id = d and match_id = v_precedent.id;

  alter table assets enable trigger assets_avant;

  -- Demandes à traiter
  insert into demandes (sponsor_nom_saisi, type, remarque_sponsoring, cree_par)
  values ('Fromagerie des Alpes (démo)', 'nouveau_sponsor', 'Nouveau partenaire, contrat signé hier.', v_admin)
  returning id into d;
  insert into demandes_produits (demande_id, produit_id, type_vente, avec_son, avec_anneau, duree_s, remarque_sponsoring)
  select d, id, 'saison', true, true, 20, 'Vidéo avec son, anneau LED aux couleurs de la fromagerie'
  from produits where nom = 'Pub pause tiers';
  insert into demandes_produits (demande_id, produit_id, type_vente)
  select d, id, 'saison' from produits where nom = 'LED 3M';

  insert into demandes (sponsor_id, type, remarque_sponsoring, cree_par)
  select id, 'ajout_produit', 'Ils prennent aussi une action scene.', v_admin from sponsors where nom = 'Garage du Lac (démo)'
  returning id into d;
  insert into demandes_produits (demande_id, produit_id, type_vente)
  select d, id, 'saison' from produits where nom = 'Action scene – Challenge';

  insert into demandes (sponsor_id, type, remarque_sponsoring, cree_par)
  select id, 'changement_visuel', 'Nouveau logo (changement de charte).', v_admin from sponsors where nom = 'Fiduciaire Alpha (démo)'
  returning id into d;
  insert into demandes_produits (demande_id, produit_id, type_vente)
  select d, id, 'saison' from produits where nom = 'Angles match';

  insert into demandes (sponsor_id, type, remarque_sponsoring, cree_par)
  select id, 'suppression', 'Ils arrêtent le Sportcafé.', v_admin from sponsors where nom = 'Café de la Gare (démo)'
  returning id into d;
  insert into demandes_produits (demande_id, produit_id, type_vente)
  select d, id, 'saison' from produits where nom = 'LED Sportcafé (9M)';

  insert into demandes (sponsor_id, type, remarque_sponsoring, reponse_regie, statut, cree_par)
  select id, 'ajout_produit', 'Spot en arrêt de jeu.', 'Quelle durée pour le spot : 10 ou 15 secondes ?', 'question', v_admin
  from sponsors where nom = 'Menuiserie Dupont (démo)'
  returning id into d;
  insert into demandes_produits (demande_id, produit_id, type_vente, avec_son)
  select d, id, 'saison', false from produits where nom = 'Pub arrêt de jeu';

  -- « Pour ce soir » (si la migration 26 est faite)
  if to_regclass('public.notes_match') is not null then
    execute 'insert into notes_match (match_id, type, texte, cree_par) values
      ($1, ''info'',  ''Match télévisé : pause tiers raccourcie à 15 min (démo)'', $2),
      ($1, ''tache'', ''Tester le micro du speaker (démo)'', $2),
      ($1, ''tache'', ''Charger la vidéo de la soirée Ladies (démo)'', $2)'
    using v_prochain.id, v_admin;
  end if;
end $demo$;

drop function if exists demo_ligne(text, text, type_vente, boolean, int, text, text[], text, text, uuid[], date, date);

select (select count(*) from sponsors where nom like '%(démo)')  as "Sponsors démo",
       (select count(*) from lignes_vendues)                      as "Diffusions",
       (select count(*) from demandes)                            as "Demandes",
       (select adversaire || ' · ' || to_char(date_heure at time zone 'Europe/Zurich', 'DD.MM HH24:MI')
          from matchs where date_heure >= date_trunc('day', now()) order by date_heure limit 1) as "Match du jour";
