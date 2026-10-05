-- =====================================================================
-- 37 — « Fichier à refaire » : le fichier reçu n'est pas utilisable (ex. LED au mauvais format)
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Demandé par Léa (03.10.2026, idée A) : dans la carte de traitement, la Régie clique « Fichier à refaire… » à côté
-- du fichier, avec un motif (pré-rempli avec l'alerte de format). En une fois :
--   • le fichier est marqué refusé (pas effacé : on garde la trace) et ne sera pas ajouté ;
--   • le produit est « à corriger » (motif, affiché en rouge sur le produit), la demande passe en « Question »
--     chez le Sponsoring ;
--   • quand le Sponsoring dépose le bon fichier (« + Ajouter un fichier »), le produit n'est plus à corriger et la
--     demande revient « Nouvelle » chez la Régie (s'il ne reste rien à corriger).
-- Pas d'e-mail : le Sponsoring le voit dans l'outil (onglet Questions / sa liste de demandes).

-- 1. Colonnes ------------------------------------------------------------------
alter table demandes_produits
  add column if not exists a_corriger       text,                       -- motif ; null = rien à corriger
  add column if not exists a_corriger_le    timestamptz,
  add column if not exists a_corriger_par   uuid references profiles (id),
  add column if not exists fichiers_refuses text[] not null default '{}'; -- chemins des fichiers refusés (bucket assets)

-- 2. La Régie demande un nouveau fichier ------------------------------------------
create or replace function fichier_a_refaire(p_demande uuid, p_produit uuid, p_chemin text, p_motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motif   text := coalesce(nullif(trim(p_motif), ''), 'Fichier à refaire');
begin
  if not a_role('regie', 'admin') then
    raise exception 'Seule la Régie peut demander un nouveau fichier';
  end if;

  update demandes_produits
  set a_corriger = v_motif, a_corriger_le = now(), a_corriger_par = auth.uid(),
      fichiers_refuses = case when nullif(p_chemin, '') is null or p_chemin = any (fichiers_refuses)
                              then fichiers_refuses else array_append(fichiers_refuses, p_chemin) end
  where demande_id = p_demande and produit_id = p_produit;
  if not found then raise exception 'Ce produit ne fait pas partie de la demande'; end if;

  -- (05.10.2026 : plus rien dans « reponse_regie », remplacée par la Remarque Régie par produit ; le motif
  --  s'affiche sur le produit via a_corriger)
  update demandes set statut = 'question' where id = p_demande;
end $$;

grant execute on function fichier_a_refaire(uuid, uuid, text, text) to authenticated;

-- 3. Fichier ajouté après la demande (reprend 28) : le bon fichier arrive -------------
create or replace function fichier_ajoute_demande(p_demande uuid, p_produit uuid, p_fichier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produit  text;
  v_corrige  boolean;
begin
  if not a_role('sponsoring', 'regie', 'admin') then
    raise exception 'Accès refusé';
  end if;
  if not exists (select 1 from demandes_produits where demande_id = p_demande and produit_id = p_produit) then
    raise exception 'Ce produit ne fait pas partie de la demande';
  end if;
  select nom into v_produit from produits where id = p_produit;

  -- c'était un fichier à refaire : le produit n'est plus « à corriger » (les fichiers refusés restent notés)
  select a_corriger is not null into v_corrige from demandes_produits where demande_id = p_demande and produit_id = p_produit;
  update demandes_produits set a_corriger = null
  where demande_id = p_demande and produit_id = p_produit and a_corriger is not null;

  -- déjà ajouté sur la fiche : à retraiter (nouveau visuel sur la même diffusion)
  update demandes_produits
  set traite_le = null, traite_par = null, suite = null
  where demande_id = p_demande and produit_id = p_produit
    and suite in ('ajoute', 'visuel') and ligne_id is not null;

  update demandes
  set statut = case
        when statut = 'traitee' then 'nouvelle'::statut_demande
        when statut = 'question' and v_corrige
             and not exists (select 1 from demandes_produits where demande_id = p_demande and a_corriger is not null)
          then 'nouvelle'::statut_demande
        else statut end,
      remarque_sponsoring = concat_ws(E'\n\n', remarque_sponsoring,
        '— Fichier ajouté le ' || to_char(now() at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI')
        || ' : ' || coalesce(nullif(trim(p_fichier), ''), 'fichier') || ' (' || coalesce(v_produit, '?') || ')')
  where id = p_demande;
end $$;

grant execute on function fichier_ajoute_demande(uuid, uuid, text) to authenticated;

select 'Migration 37 OK : « Fichier à refaire »' as "Résultat";
