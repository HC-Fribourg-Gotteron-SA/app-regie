-- =====================================================================
-- 62 — Pub pause tiers : comme la playlist Colosseo (captures de Léa du 20.10.2026)
-- À exécuter sur la VRAIE base, en un seul bloc. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa : « ça doit correspondre à Colosseo ». Groupes et ordre déjà justes, sauf :
--   Payerneland après Gysi · Aligro avec anneau LED (fin du groupe 1) · Téléverbier sans son + anneau (tête du
--   groupe 3, 11 s) · à l'écran : Bluefactory, Everpearl, La Liberté, BCF Arena, Respect the Ice FR / DE (16 s) ·
--   MySport pas à l'écran (désactivé dans Colosseo) · doublon BLS sans visuel retiré · Enfin-Endlich ajouté
--   (avec son, sans anneau, 10 s, après Villars).
do $x$
declare
  v_pt      uuid := (select id from produits where nom = 'Pub pause tiers');
  v_anneau  uuid := (select lie_a_produit_id from produits where nom = 'Pub pause tiers');
  v_saison  uuid := (select id from saisons where active limit 1);
  l         record;
  v_id      uuid;
  v_sponsor uuid;
begin
  if v_pt is null or v_anneau is null then raise exception 'Pub pause tiers ou son anneau introuvable'; end if;

  -- lignes de la Pub pause tiers d'un sponsor (encore actives)
  create or replace function pt_ligne(p_sponsor text) returns setof lignes_vendues language sql as $f$
    select l.* from lignes_vendues l join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
    where l.produit_id = (select id from produits where nom = 'Pub pause tiers')
      and l.statut not in ('annule', 'termine') and lower(sans_accent(s.nom)) = lower(sans_accent(p_sponsor))
  $f$;

  -- 1. Payerneland juste après Gysi (70)
  update lignes_vendues set priorite = 75 where id in (select id from pt_ligne('payerneland'));

  -- 2. Aligro et Téléverbier : anneau LED couplé (comme une demande « avec anneau »), s'ils n'en ont pas encore
  for l in select * from pt_ligne('Aligro') union all select * from pt_ligne('Téléverbier') loop
    continue when l.ligne_couplee_id is not null;
    insert into lignes_vendues (contrat_id, produit_id, type_vente, duree_s, avec_son, consignes, statut, validee, ligne_couplee_id)
    values (l.contrat_id, v_anneau, l.type_vente, l.duree_s, false,
            'Couplé à : Pub pause tiers · anneau Colosseo : '
              || case when l.id in (select id from pt_ligne('Aligro')) then 'ALIGRO_Gotteron_LED_12512x80' else 'anneau_mv0pdypv-Verbier_Video' end,
            'vendu', true, l.id)
    returning id into v_id;
    update lignes_vendues set ligne_couplee_id = v_id where id = l.id;
  end loop;
  update lignes_vendues set priorite = 265 where id in (select id from pt_ligne('Aligro'));            -- après TCS (260)
  update lignes_vendues set priorite = 405, duree_s = 11, avec_son = false
  where id in (select id from pt_ligne('Téléverbier'));                                                  -- avant La Liberté (410)
  update lignes_vendues set duree_s = 11 where produit_id = v_anneau
    and ligne_couplee_id in (select id from pt_ligne('Téléverbier'));

  -- 3. À l'écran comme dans Colosseo
  update lignes_vendues set validee = true, suspendue = false, motif_suspension = null,
         consignes = nullif(trim(both E' \n' from replace(coalesce(consignes, ''), '⚠ Non validé', '')), '')
  where id in (select id from pt_ligne('Bluefactory') union all select id from pt_ligne('Everpearl')
               union all select id from pt_ligne('La Liberté') union all select id from pt_ligne('BCF Arena'));
  update lignes_vendues set validee = true, suspendue = false, motif_suspension = null, duree_s = 16
  where id in (select p.id from pt_ligne('HCFG') p
               where exists (select 1 from assets a where a.ligne_id = p.id and a.nom_visuel ilike 'RESPECT_THE_ICE%'));

  -- 4. MySport : désactivé dans Colosseo
  update lignes_vendues set validee = false, suspendue = false, motif_suspension = 'désactivé dans Colosseo'
  where id in (select id from pt_ligne('MySport'));

  -- 5. Doublon BLS : la ligne sans visuel ni durée (celle d'Airtable reste)
  update lignes_vendues set statut = 'termine', date_fin = current_date - 1
  where id in (select p.id from pt_ligne('BLS') p
               where p.duree_s is null and not exists (select 1 from assets a where a.ligne_id = p.id and a.statut <> 'archive'))
    and (select count(*) from pt_ligne('BLS')) > 1;

  -- 6. Enfin-Endlich : avec son, sans anneau, 10 s, après Villars (370)
  if not exists (select 1 from lignes_vendues lv join contrats c on c.id = lv.contrat_id join sponsors s on s.id = c.sponsor_id
                 where lv.produit_id = v_pt and lv.statut not in ('annule', 'termine')
                   and replace(lower(sans_accent(s.nom)), '-', ' ') like '%enfin endlich%') then
    select id into v_sponsor from sponsors where replace(lower(sans_accent(nom)), '-', ' ') like '%enfin endlich%' limit 1;
    if v_sponsor is null then insert into sponsors (nom) values ('Enfin-Endlich') returning id into v_sponsor; end if;
    insert into lignes_vendues (contrat_id, produit_id, type_vente, duree_s, avec_son, consignes, statut, validee, priorite)
    values (contrat_pour(v_sponsor, v_saison), v_pt, 'saison', 10, true,
            'Visuel Colosseo : Enfin-Endlich_Video_16-9_SON_OK (ajouté d''après la playlist Colosseo)', 'vendu', true, 375);
  end if;

  drop function pt_ligne(text);
end $x$;

-- Résultat : la liste dans l'ordre de la fiche (groupes son / anneau, puis ordre de diffusion)
select l.priorite as "Ordre", s.nom as "Sponsor",
       case when l.avec_son then 'son' else '-' end as "Son",
       case when l.ligne_couplee_id is not null then 'anneau' else '-' end as "Anneau",
       case when l.suspendue then 'désactivé' when l.validee then 'à l''écran' else 'PAS à l''écran' end as "État",
       l.type_vente as "Quand", l.duree_s as "Durée"
from lignes_vendues l join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
where l.produit_id = (select id from produits where nom = 'Pub pause tiers') and l.statut not in ('annule', 'termine')
order by l.avec_son desc, (l.ligne_couplee_id is null), l.priorite nulls last;
