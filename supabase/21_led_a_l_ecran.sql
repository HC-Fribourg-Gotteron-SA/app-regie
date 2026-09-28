-- =====================================================================
-- 21 — LED 3M / 6M : tous les sponsors « À l'écran », sauf ce qui est réservé au club
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 20.
-- =====================================================================
-- Décidé par Léa le 28.09.2026 : dans Airtable, la case « Validation saison 26/27 »
-- n'était pas cochée partout, alors que les logos LED passent. On met donc « À l'écran »
-- toutes les diffusions LED 3M / 6M en cours, SAUF :
--   • celles placées sur un emplacement réservé au club (NORD-OUEST) ;
--   • le contenu du club (sponsors d'origine « club », ex. HCFG) ;
--   • celles désactivées (⏸), qui gardent leur état.

update lignes_vendues l
set validee = true
from produits p, contrats c, sponsors s
where p.id = l.produit_id and p.famille = 'emplacement'
  and c.id = l.contrat_id and s.id = c.sponsor_id and s.origine <> 'club'
  and l.statut not in ('annule', 'termine')
  and not l.validee
  and not l.suspendue
  and not exists (select 1 from lignes_emplacements le
                  join emplacements e on e.id = le.emplacement_id
                  where le.ligne_id = l.id and e.reserve_club);

select p.nom as "Produit",
       count(*) filter (where l.validee and not l.suspendue) as "À l'écran",
       count(*) filter (where not l.validee and not l.suspendue) as "Pas à l'écran",
       count(*) filter (where l.suspendue) as "Désactivé"
from lignes_vendues l join produits p on p.id = l.produit_id
where p.famille = 'emplacement' and l.statut not in ('annule', 'termine')
group by p.nom order by p.nom;
