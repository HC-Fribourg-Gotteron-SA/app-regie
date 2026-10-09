-- =====================================================================
-- 48 — Fritennis (Restaurant l'Agy) : Pub pause tiers « au match », chaque match jusqu'au 27.10.2026 compris
-- À exécuter dans Supabase > SQL Editor, sur la VRAIE base, APRÈS la 47 (sur la base de test, rien ne se passe).
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (09.10.2026) : Fritennis n'est PAS « toute la saison » dans la Pub pause tiers ; il passe à chaque match
-- jusqu'au 27 octobre compris (contrat attendu). L'import l'avait mis « à la saison » (ligne « Restaurant l'Agy »).
--   1. sa diffusion « à la saison » devient « au match », rattachée à chaque match de saison jusqu'au 27.10 compris
--      (matchs passés compris : historique cohérent) → visible dans « Par match », et Match du jour affiche tout seul
--      « ➖ Enlever » au premier match après le 27.10 ;
--   2. sa diffusion « au match » de janvier (en attente du contrat, migration 47) ne garde que ses matchs après le
--      27.10 (les 29.09 et 03.10 sont maintenant sur la ligne ci-dessus) ;
--   3. la tâche « Enlever Fritennis… » ajoutée par la 47 est retirée (Match du jour le fait maintenant).

do $fritennis$
declare
  v_f     uuid;
  v_pause uuid;
  l       record;
begin
  select id into v_f from sponsors where nom ilike 'fritennis%' order by length(nom) desc limit 1;
  if v_f is null then return; end if;                              -- base de test
  select id into v_pause from produits where nom = 'Pub pause tiers';

  -- 1. « à la saison » → « au match », chaque match de saison jusqu'au 27.10 compris (+ son anneau s'il en a un)
  for l in
    select lv.id, lv.ligne_couplee_id from lignes_vendues lv join contrats c on c.id = lv.contrat_id
    where c.sponsor_id = v_f and lv.produit_id = v_pause and lv.type_vente = 'saison'
      and lv.statut not in ('annule', 'termine')
  loop
    update lignes_vendues set type_vente = 'match', date_fin = null
    where id in (l.id, l.ligne_couplee_id);
    insert into lignes_matchs (ligne_id, match_id)
    select x.ligne, m.id
    from matchs m
    cross join (select l.id as ligne union all select l.ligne_couplee_id where l.ligne_couplee_id is not null) x
    join saisons s on s.id = m.saison_id and s.active
    where m.type = 'saison' and (m.date_heure at time zone 'Europe/Zurich')::date <= date '2026-10-27'
    on conflict do nothing;
  end loop;

  -- 2. la ligne « au match » de janvier ne garde que ses matchs après le 27.10
  delete from lignes_matchs lm
  using lignes_vendues lv, contrats c, matchs m
  where lm.ligne_id = lv.id and c.id = lv.contrat_id and m.id = lm.match_id
    and c.sponsor_id = v_f and lv.produit_id = v_pause and lv.type_vente = 'match'
    and lv.validee = false                                           -- celle « en attente du contrat » (47)
    and (m.date_heure at time zone 'Europe/Zurich')::date <= date '2026-10-27';

  -- 3. tâche manuelle de la 47 : plus utile
  if to_regclass('public.notes_match') is not null then
    delete from notes_match where texte like 'Enlever Fritennis%' and not fait;
  end if;
end $fritennis$;

select p.nom as "Produit", l.type_vente as "Quand", l.validee as "À l'écran", l.duree_s as "Durée (s)", l.avec_son as "Son",
       count(m.id) as "Matchs",
       string_agg(to_char(m.date_heure at time zone 'Europe/Zurich', 'DD.MM'), ', ' order by m.date_heure) as "Dates"
from sponsors s
join contrats c on c.sponsor_id = s.id
join lignes_vendues l on l.contrat_id = c.id and l.statut not in ('annule', 'termine')
join produits p on p.id = l.produit_id
left join lignes_matchs lm on lm.ligne_id = l.id
left join matchs m on m.id = lm.match_id
where s.nom ilike 'fritennis%'
group by p.nom, l.id, l.type_vente, l.validee, l.duree_s, l.avec_son
order by l.validee desc;
