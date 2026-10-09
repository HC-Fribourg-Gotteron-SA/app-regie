-- =====================================================================
-- 47 — Fritennis = Restaurant l'Agy (Pub pause tiers jusqu'au 27.10.2026)
-- À exécuter dans Supabase > SQL Editor, sur la VRAIE base (sur la base de test, rien ne se passe), APRÈS la 45.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Airtable avait deux noms : « Fritennis » (Emplacement au match, Pub pause tiers, remarque « Restaurant Agy c'est
-- pareil ») et « Restaurant l'Agy » (feuille Pub pause tiers, 11 s, avec son, sans anneau). L'import en a fait
-- deux sponsors. Léa (09.10.2026) : c'est le même, nommé « Fritennis (Restaurant l'Agy) » ; contrat attendu, mais
-- d'après ce qu'elle voit : diffusion UNIQUEMENT jusqu'au 27 octobre compris.
--   1. Restaurant l'Agy fusionné dans Fritennis, renommé « Fritennis (Restaurant l'Agy) » (anciens noms = autres noms) ;
--   2. sa diffusion à la saison dans la Pub pause tiers s'arrête après le 27.10.2026 (date_fin, + anneau couplé) ;
--   3. ses diffusions au match de janvier : 11 s, avec son (feuille Pub pause tiers), mais décochées « À l'écran »
--      (raison : en attente du contrat) — rien n'est effacé, il suffit de recocher si le contrat les prévoit ;
--   4. tâche « Pour ce soir » au premier match après le 27.10 : l'enlever de Colosseo (un changement à la saison
--      n'apparaît pas dans « À changer dans Colosseo »). « Centre Tennis Agy » (slides Honorary) : pas touché.

do $fritennis$
declare
  v_f     uuid;
  v_a     uuid;
  v_pause uuid;
  v_match uuid;
begin
  select id into v_f from sponsors where lower(trim(nom)) in ('fritennis', 'fritennis (restaurant l''agy)');
  select id into v_a from sponsors where nom ilike 'restaurant%agy%';
  if v_f is null and v_a is null then return; end if;             -- base de test
  if v_f is null then
    v_f := v_a;
  elsif v_a is not null then
    perform fusionner_sponsors(v_f, v_a);
  end if;
  -- nom choisi par Léa ; l'ancien nom reste un « autre nom » pour la recherche
  update sponsors set alias = (select coalesce(array_agg(distinct x), '{}') from unnest(alias || nom) x
                               where x <> 'Fritennis (Restaurant l''Agy)'),
                      nom = 'Fritennis (Restaurant l''Agy)'
  where id = v_f and nom <> 'Fritennis (Restaurant l''Agy)';

  select id into v_pause from produits where nom = 'Pub pause tiers';

  -- 2. à la saison : jusqu'au 27.10 (la ligne et son anneau couplé)
  update lignes_vendues l set date_fin = date '2026-10-27'
  from contrats c
  where c.id = l.contrat_id and c.sponsor_id = v_f and l.type_vente = 'saison'
    and l.statut not in ('annule', 'termine')
    and (l.produit_id = v_pause
         or l.id in (select ligne_couplee_id from lignes_vendues where produit_id = v_pause and ligne_couplee_id is not null));

  -- 3. au match : durée et son de la feuille Pub pause tiers ; après le 27.10 : pas à l'écran (en attente du contrat)
  update lignes_vendues l set duree_s = coalesce(l.duree_s, 11), avec_son = true
  from contrats c
  where c.id = l.contrat_id and c.sponsor_id = v_f and l.produit_id = v_pause and l.type_vente = 'match'
    and l.statut not in ('annule', 'termine');
  update lignes_vendues l set validee = false, suspendue = false,
         motif_suspension = 'Diffusion jusqu''au 27.10 : en attente du contrat (recocher si le contrat prévoit ces matchs)'
  from contrats c
  where c.id = l.contrat_id and c.sponsor_id = v_f and l.produit_id = v_pause and l.type_vente = 'match'
    and l.statut not in ('annule', 'termine') and l.validee
    and not exists (select 1 from lignes_matchs lm join matchs m on m.id = lm.match_id
                    where lm.ligne_id = l.id and (m.date_heure at time zone 'Europe/Zurich')::date <= date '2026-10-27'
                      and m.date_heure >= now());

  -- 4. tâche au premier match de saison après le 27.10
  select id into v_match from matchs
  where (date_heure at time zone 'Europe/Zurich')::date > date '2026-10-27' and type = 'saison'
  order by date_heure limit 1;
  if v_match is not null and to_regclass('public.notes_match') is not null
     and not exists (select 1 from notes_match where match_id = v_match and texte like 'Enlever Fritennis%') then
    insert into notes_match (match_id, type, texte)
    values (v_match, 'tache', 'Enlever Fritennis (Restaurant l''Agy) de la Pub pause tiers dans Colosseo : fini le 27.10 (vérifier le contrat)');
  end if;
end $fritennis$;

select s.nom as "Sponsor", array_to_string(s.alias, ', ') as "Aussi appelé", p.nom as "Produit",
       l.type_vente as "Quand", l.date_fin as "Jusqu'au", l.duree_s as "Durée (s)", l.avec_son as "Son",
       l.validee as "À l'écran"
from sponsors s
join contrats c on c.sponsor_id = s.id
join lignes_vendues l on l.contrat_id = c.id and l.statut not in ('annule', 'termine')
join produits p on p.id = l.produit_id
where s.nom ilike 'fritennis%'
order by p.nom, l.type_vente;
