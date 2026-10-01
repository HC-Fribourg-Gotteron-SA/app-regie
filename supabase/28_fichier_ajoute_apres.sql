-- =====================================================================
-- 28 — Le Sponsoring complète sa demande avec un fichier arrivé plus tard
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Décidé par Léa (01.10.2026) : quand le visuel arrive après la demande, le Sponsoring l'ajoute
-- lui-même dans la demande (« Ajouter un fichier » sur le produit). Le fichier va dans le dossier
-- de la demande (demandes/<demande>/<produit>/<role>__<nom>), puis cette fonction :
--   • produit déjà ajouté par la Régie : il revient « à traiter » (la Régie voit « Mettre le nouveau
--     visuel » sur la diffusion déjà créée, ligne_id gardé) ;
--   • demande déjà traitée : elle repasse en « Nouvelle » (la Régie la voit dans « À traiter ») ;
--   • une ligne « Fichier ajouté le … » est ajoutée à la remarque (historique de la demande).

create or replace function fichier_ajoute_demande(p_demande uuid, p_produit uuid, p_fichier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produit text;
begin
  if not a_role('sponsoring', 'regie', 'admin') then
    raise exception 'Accès refusé';
  end if;
  if not exists (select 1 from demandes_produits where demande_id = p_demande and produit_id = p_produit) then
    raise exception 'Ce produit ne fait pas partie de la demande';
  end if;
  select nom into v_produit from produits where id = p_produit;

  -- déjà ajouté sur la fiche : à retraiter (nouveau visuel sur la même diffusion)
  update demandes_produits
  set traite_le = null, traite_par = null, suite = null
  where demande_id = p_demande and produit_id = p_produit
    and suite in ('ajoute', 'visuel') and ligne_id is not null;

  update demandes
  set statut = case when statut = 'traitee' then 'nouvelle'::statut_demande else statut end,
      remarque_sponsoring = concat_ws(E'\n\n', remarque_sponsoring,
        '— Fichier ajouté le ' || to_char(now() at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI')
        || ' : ' || coalesce(nullif(trim(p_fichier), ''), 'fichier') || ' (' || coalesce(v_produit, '?') || ')')
  where id = p_demande;
end $$;

grant execute on function fichier_ajoute_demande(uuid, uuid, text) to authenticated;

select 'Migration 28 OK : fichier_ajoute_demande()' as "Résultat";
