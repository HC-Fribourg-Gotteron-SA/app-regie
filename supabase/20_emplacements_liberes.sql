-- =====================================================================
-- 20 — Emplacements LED 3M / 6M libérés quand un sponsor est retiré
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 19.
-- =====================================================================
-- Un emplacement LED existe toujours : quand le sponsor est retiré, il redevient
-- libre (Banner HCFG) et peut être revendu.
--   • « Retirer de ce produit » (fiche produit) : diffusion terminée -> libre tout de suite ;
--   • demande « Suppression » traitée (date de fin) : libre dès le lendemain de la date de fin.
-- Correction : un emplacement libéré puis revendu n'apparaît plus deux fois sur le plan
-- (une fois « libre » + une fois avec le nouveau sponsor).

create or replace view v_plan_emplacements with (security_invoker = true) as
select e.id as emplacement_id, e.bande, e.anneau, e.zone, e.position, e.reserve_club,
       s.nom as sponsor, pr.nom as produit, l.id as ligne_id, l.statut,
       sd.libelle as saison_debut, sf.libelle as saison_fin
from emplacements e
left join (lignes_emplacements le
           join lignes_vendues l on l.id = le.ligne_id
                                and l.statut not in ('annule', 'termine')
                                and (l.date_fin is null or l.date_fin >= current_date))
       on le.emplacement_id = e.id
left join produits pr on pr.id = l.produit_id
left join contrats c on c.id = l.contrat_id
left join sponsors s on s.id = c.sponsor_id
left join saisons sd on sd.id = c.saison_debut_id
left join saisons sf on sf.id = c.saison_fin_id;

select count(*) filter (where sponsor is null and not reserve_club) || ' emplacements libres (Banner HCFG) sur '
       || count(distinct emplacement_id) || '.' as "Résultat"
from v_plan_emplacements;
