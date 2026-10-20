-- =====================================================================
-- 60 — Anneau LED : durée d'UN passage + nombre de passages, comme dans Colosseo (« Play Count »)
-- À exécuter sur la VRAIE base (sur la base de test : ne trouve rien, sans danger). Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (20.10.2026, playlist Colosseo) : « garde comme dans Colosseo ». Airtable notait 0:30 « 2 x 15 s » ;
-- Colosseo : 15 s joué 2 fois. ITS : Airtable « 3 x 10 sec », Colosseo 10 s joué 1 fois.
-- duree_s = durée d'un passage ; occurrences = nombre de passages par match (la durée totale fait duree × occurrences).
do $x$
declare
  v_produit uuid := (select id from produits where nom = 'Anneau LED');
begin
  update lignes_vendues l set duree_s = 15, occurrences = 2
  where l.produit_id = v_produit and l.statut not in ('annule', 'termine')
    and exists (select 1 from assets a where a.ligne_id = l.id
                and (a.nom_visuel ilike 'FRAPP-2025-LED%' or a.nom_visuel ilike 'LL_2026_Play_off_Ribbon%'));

  update lignes_vendues l set duree_s = 10, occurrences = 1
  where l.produit_id = v_produit and l.statut not in ('annule', 'termine')
    and exists (select 1 from assets a where a.ligne_id = l.id
                and (a.nom_visuel ilike 'LED-ITS%' or a.nom_visuel ilike 'ITS-LED%'));
end $x$;

select s.nom as "Sponsor", a.nom_visuel as "Visuel", l.duree_s as "Durée (s)", l.occurrences as "Passages"
from lignes_vendues l join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
join assets a on a.ligne_id = l.id and a.statut <> 'archive'
where l.produit_id = (select id from produits where nom = 'Anneau LED')
  and (a.nom_visuel ilike 'FRAPP%' or a.nom_visuel ilike 'LL_2026%' or a.nom_visuel ilike '%ITS%');
