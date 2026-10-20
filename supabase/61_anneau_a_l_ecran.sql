-- =====================================================================
-- 61 — Anneau LED : tout ce qui passe dans Colosseo est « À l'écran »
-- À exécuter sur la VRAIE base (après la 60). Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (20.10.2026) : la playlist Colosseo dure 14:30, l'outil n'en comptait que ~8:26. Cause : 9 lignes de la feuille
-- Airtable « LED match » n'avaient pas « Validation saison 26/27 » cochée → importées « Pas à l'écran » (LED_3M / LED_6M
-- HCFG ×4, BCF, TCS, BLS, UPCF, BCF Arena location de salles), alors qu'elles passent toutes dans Colosseo.
-- → À l'écran pour toutes les lignes de l'Anneau LED, SAUF celles désactivées (La Berra, Dieci, Fischer : suspendue),
--   et « ⚠ Non validé » retiré des remarques. Les passages des matchs à venir suivent (trigger).
update lignes_vendues l
set validee = true,
    consignes = nullif(trim(both E' \n' from replace(coalesce(l.consignes, ''), '⚠ Non validé', '')), '')
where l.produit_id = (select id from produits where nom = 'Anneau LED')
  and l.statut not in ('annule', 'termine')
  and not l.suspendue
  and l.consignes like '%⚠ Non validé%';      -- seulement l'import (une ligne décochée à la main dans l'outil ne bouge pas)

select s.nom as "Sponsor", case when l.suspendue then 'désactivé' when l.validee then 'à l''écran' else 'pas à l''écran' end as "État",
       l.duree_s as "Durée (s)", l.occurrences as "Passages", l.priorite as "Ordre"
from lignes_vendues l join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
where l.produit_id = (select id from produits where nom = 'Anneau LED') and l.statut not in ('annule', 'termine')
order by l.priorite nulls last;
