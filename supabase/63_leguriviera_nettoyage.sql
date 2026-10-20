-- =====================================================================
-- 63 — Leguriviera (Pub pause tiers) : seulement « Spot chef » et « Spot normal »
-- À exécuter sur la VRAIE base, en un seul bloc. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (20.10.2026) : « leguriviera c'est soit spot chef soit spot normal ». Il y avait 4 lignes :
--   · au match, 10 matchs, « dates spot chef »    → gardée, visuel « Spot chef »
--   · au match, 13 matchs, « dates spot normal »  → gardée, visuel « Spot normal »
--   · au match, 1 match (29.09, passé), sans durée, venue d'une demande → retirée
--   · saison, pas à l'écran, aucun match, venue d'une demande          → retirée
-- Retirée = comme « Retirer de ce produit » (terminée, reste dans l'historique ; la demande n'est pas touchée).
-- Les noms de visuels reprennent la migration 54 (pas exécutée ou sans effet : les lignes n'avaient aucun visuel).
do $x$
declare
  l record;
  v_nom text;
begin
  -- 1. lignes en trop : ni « chef » ni « normal » dans les remarques
  update lignes_vendues lv set statut = 'termine', date_fin = least(coalesce(lv.date_fin, current_date - 1), current_date - 1)
  from contrats c, sponsors s
  where c.id = lv.contrat_id and s.id = c.sponsor_id and s.nom ilike '%leguriviera%'
    and lv.produit_id = (select id from produits where nom = 'Pub pause tiers')
    and lv.statut not in ('annule', 'termine')
    and coalesce(lv.consignes, '') not ilike '%spot chef%' and coalesce(lv.consignes, '') not ilike '%spot normal%';

  -- 2. visuels « Spot chef » / « Spot normal » (sans fichier, validés : contrôle désactivé le temps de l'ajout)
  alter table assets disable trigger assets_avant;
  for l in
    select lv.id, lv.consignes from lignes_vendues lv
    join contrats c on c.id = lv.contrat_id join sponsors s on s.id = c.sponsor_id
    where s.nom ilike '%leguriviera%' and lv.produit_id = (select id from produits where nom = 'Pub pause tiers')
      and lv.statut not in ('annule', 'termine')
  loop
    v_nom := case when l.consignes ilike '%spot chef%' then 'Spot chef' when l.consignes ilike '%spot normal%' then 'Spot normal' end;
    continue when v_nom is null
      or exists (select 1 from assets where ligne_id = l.id and nom_visuel = v_nom and statut = 'valide');
    insert into assets (ligne_id, nom_visuel, statut, valide_le, version)
    values (l.id, v_nom, 'valide', now(),
            coalesce((select max(version) from assets where ligne_id = l.id and variante is null), 0) + 1);
  end loop;
  alter table assets enable trigger assets_avant;
end $x$;

select l.priorite as "Ordre", a.nom_visuel as "Visuel", l.duree_s as "Durée",
       (select count(*) from lignes_matchs lm where lm.ligne_id = l.id) as "Matchs"
from lignes_vendues l
join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
left join assets a on a.ligne_id = l.id and a.statut = 'valide'
where s.nom ilike '%leguriviera%' and l.produit_id = (select id from produits where nom = 'Pub pause tiers')
  and l.statut not in ('annule', 'termine')
order by l.priorite;
