-- =====================================================================
-- 61 — Anneau LED : tout ce qui passe dans Colosseo est « À l'écran »
-- À exécuter sur la VRAIE base (après la 60). Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (20.10.2026) : la playlist Colosseo dure 14:30, l'outil n'en comptait que ~8:40. Cause : 9 lignes de la feuille
-- Airtable « LED match » n'avaient pas « Validation saison 26/27 » cochée → importées « Pas à l'écran » (LED_3M / LED_6M
-- HCFG ×4, BCF, TCS, BLS, UPCF, BCF Arena location de salles), alors qu'elles passent toutes dans Colosseo.
-- Version 2 (même jour) : visées par le nom de leur visuel (la 1re version cherchait « ⚠ Non validé » dans les
-- remarques et ne trouvait rien). Les désactivées (La Berra, Dieci, Fischer) ne bougent pas.
-- Les passages des matchs à venir suivent (trigger sur validee).
update lignes_vendues l
set validee = true,
    consignes = nullif(trim(both E' \n' from replace(coalesce(l.consignes, ''), '⚠ Non validé', '')), '')
where l.produit_id = (select id from produits where nom = 'Anneau LED')
  and l.statut not in ('annule', 'termine')
  and not l.suspendue
  and not l.validee
  and exists (select 1 from assets a where a.ligne_id = l.id and a.statut <> 'archive'
              and a.nom_visuel in ('LED_3M', 'LED_6M', 'BCF-Ribbon-SA', 'TCS_Ribbon-SA',
                                   'BLS-Kampagne-Hockey-26-LED-Ribbon-FR', 'UPCFxGotteron_frise_complete',
                                   '260310_v3_BCFArena_Ring_LocationSalles_FR-DE'));

select l.priorite as "Ordre", s.nom as "Sponsor",
       case when l.suspendue then 'désactivé' when l.validee then 'à l''écran' else 'PAS à l''écran' end as "État",
       l.duree_s as "Durée (s)", l.occurrences as "×"
from lignes_vendues l join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
where l.produit_id = (select id from produits where nom = 'Anneau LED') and l.statut not in ('annule', 'termine')
order by l.priorite nulls last;
