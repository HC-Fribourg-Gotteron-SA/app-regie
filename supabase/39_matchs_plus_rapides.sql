-- =====================================================================
-- 39 — Enregistrer un match sans « statement timeout »
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 38, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Signalé par Léa (05.10.2026) : « Enregistrement impossible : canceling statement due to statement timeout » en
-- ajoutant un match de Champions League. Cause : chaque match ajouté / modifié relançait le calcul des passages de
-- TOUTES les diffusions à la saison (600+), puis la renumérotation des matchs (renumeroter_matchs) le relançait
-- encore une fois PAR match renuméroté (2 mises à jour par match) → des dizaines de milliers de calculs.
-- Désormais :
--   • numéro seul changé (renumérotation) : seulement les diffusions « 1 match sur N » et l'ancienne rotation par
--     numéro (le reste ne dépend pas du numéro) ;
--   • match qui n'est ni « saison » ni « playoffs » (Champions League, amical), avant comme après : rien à faire,
--     aucune diffusion à la saison n'y passe ;
--   • match de playoffs : seulement les diffusions qui incluent les playoffs.

create or replace function tg_match_passages() returns trigger
language plpgsql
as $$
begin
  -- renumérotation : la date et le type n'ont pas changé
  if tg_op = 'UPDATE' and new.date_heure = old.date_heure and new.type = old.type then
    perform generer_passages(l.id)
    from lignes_vendues l
    where l.type_vente = 'saison' and l.statut not in ('brouillon', 'annule')
      and (l.un_match_sur > 1 or l.regle_rotation in ('alterner', 'equilibrer'));
    return null;
  end if;

  -- Champions League, amical… : pas concerné par les diffusions à la saison
  if new.type not in ('saison', 'playoffs')
     and (tg_op = 'INSERT' or old.type not in ('saison', 'playoffs')) then
    return null;
  end if;

  perform generer_passages(l.id)
  from lignes_vendues l
  where l.type_vente = 'saison' and l.statut not in ('brouillon', 'annule')
    and (new.type = 'saison'
         or (tg_op = 'UPDATE' and old.type = 'saison')
         or l.inclut_playoffs);
  return null;
end $$;

select 'Migration 39 OK : enregistrer un match ne recalcule plus que le nécessaire' as "Résultat";
