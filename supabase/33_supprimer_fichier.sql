-- =====================================================================
-- 33 — Supprimer un fichier qui n'est pas le bon (mauvais visuel envoyé par le Sponsoring)
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa le 02.10.2026 : on supprime LE FICHIER, pas la demande.
-- Bouton « Supprimer » à côté du fichier (Match du jour, détail d'une demande, fiche produit).
-- L'outil enlève le fichier du stockage (Storage API) ; cette fonction nettoie la base avant :
--   • visuel mis sur une diffusion avec ce fichier : refusé (« Mauvais fichier »), sans fichier ;
--     s'il était le visuel en cours, l'ancien visuel revient (s'il y en avait un) et la diffusion
--     passe en « ⏳ visuel attendu » ;
--   • ligne du dossier sponsor (documents_sponsors) supprimée.
-- Le bon fichier s'ajoute ensuite avec « + Ajouter un fichier » (migration 28 : le produit revient
-- « à traiter » → « Mettre le nouveau visuel »).

create or replace function supprimer_fichier(p_chemin text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ancien uuid;
  v_lignes uuid[] := '{}';
begin
  if not a_role('regie', 'admin') then
    raise exception 'Seule la Régie peut supprimer un fichier';
  end if;
  if coalesce(trim(p_chemin), '') = '' then
    raise exception 'Fichier manquant';
  end if;

  for r in select id, ligne_id, variante, match_id, statut from assets
           where storage_path = p_chemin and statut <> 'archive'
  loop
    update assets set statut = 'refuse', motif_refus = 'Mauvais fichier : supprimé', storage_path = null
    where id = r.id;
    -- c'était le visuel en cours : l'ancien revient en attendant le bon
    if r.statut = 'valide' then
      select id into v_ancien from assets
      where ligne_id = r.ligne_id and id <> r.id and statut = 'archive'
        and coalesce(variante, '') = coalesce(r.variante, '')
        and coalesce(match_id::text, '') = coalesce(r.match_id::text, '')
      order by version desc limit 1;
      if v_ancien is not null then
        update assets set statut = 'valide' where id = v_ancien;
      end if;
    end if;
    v_lignes := v_lignes || r.ligne_id;
  end loop;

  -- anciennes versions qui pointaient sur ce fichier : plus de fichier
  update assets set storage_path = null where storage_path = p_chemin;

  -- après le retour éventuel de l'ancien visuel (qui enlève « visuel attendu »)
  update lignes_vendues set visuel_attendu = true where id = any (v_lignes);

  delete from documents_sponsors where storage_path = p_chemin;

  return coalesce(array_length(v_lignes, 1), 0);
end $$;

grant execute on function supprimer_fichier(text) to authenticated;

select 'Migration 33 OK : supprimer_fichier()' as "Résultat";
