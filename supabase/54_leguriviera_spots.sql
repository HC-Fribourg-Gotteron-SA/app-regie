-- =====================================================================
-- 54 — Leguriviera : « Spot chef » / « Spot normal » visibles dans Match du jour
-- À exécuter dans Supabase > SQL Editor, sur la VRAIE base (sur la base de test, rien ne se passe).
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (15.10.2026, option A) : Leguriviera a deux diffusions « au match » dans la Pub pause tiers (dates du chef,
-- dates normales, feuille « Emplacement au match » d'Airtable). L'import ne leur a donné aucun nom de visuel : Match du
-- jour affichait « ➕ Ajouter · leguriviera » / « ➖ Enlever · leguriviera » sans dire lequel est le chef.
-- Chaque diffusion reçoit un visuel (sans fichier, comme l'import) : « Spot chef » ou « Spot normal », reconnue par
-- sa remarque (« … dates spot chef » / « … dates spot normal »). Les matchs à venir l'affichent tout de suite.

do $leguriviera$
declare
  l record;
  v_nom text;
begin
  -- visuel validé directement (dans le SQL Editor il n'y a pas d'utilisateur « Régie » : contrôle désactivé le temps
  -- de l'ajout, comme pour l'import Airtable)
  alter table assets disable trigger assets_avant;
  for l in
    select lv.id, lv.consignes
    from lignes_vendues lv
    join contrats c on c.id = lv.contrat_id
    join sponsors s on s.id = c.sponsor_id
    join produits p on p.id = lv.produit_id
    where s.nom ilike '%leguriviera%' and p.nom = 'Pub pause tiers' and lv.type_vente = 'match'
      and lv.statut not in ('annule', 'termine')
  loop
    v_nom := case when l.consignes ilike '%chef%' then 'Spot chef'
                  when l.consignes ilike '%normal%' then 'Spot normal' end;
    continue when v_nom is null
      or exists (select 1 from assets where ligne_id = l.id and nom_visuel = v_nom and statut = 'valide');
    insert into assets (ligne_id, nom_visuel, statut, valide_le, version)
    values (l.id, v_nom, 'valide', now(),
            coalesce((select max(version) from assets where ligne_id = l.id and variante is null), 0) + 1);
  end loop;
  alter table assets enable trigger assets_avant;
end $leguriviera$;

select s.nom as "Sponsor", lv.consignes as "Remarque", a.nom_visuel as "Visuel", count(lm.match_id) as "Matchs"
from lignes_vendues lv
join contrats c on c.id = lv.contrat_id
join sponsors s on s.id = c.sponsor_id
join produits p on p.id = lv.produit_id and p.nom = 'Pub pause tiers'
left join assets a on a.ligne_id = lv.id and a.statut = 'valide'
left join lignes_matchs lm on lm.ligne_id = lv.id
where s.nom ilike '%leguriviera%' and lv.type_vente = 'match'
group by s.nom, lv.consignes, a.nom_visuel;
