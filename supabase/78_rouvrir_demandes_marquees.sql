-- =====================================================================
-- 78 — Demandes « marquées traitées » sans que le produit ait été ajouté : on fait le travail du bouton
-- À exécuter sur la VRAIE base (la base de test n'a pas ces demandes ; sans effet si rien ne correspond).
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (23.11.2026) : l'ancien bouton « Marquer comme traitée » (bas de la demande) changeait seulement le statut :
-- rien dans l'outil (JPF, Red Bull…). 45 produits dans ce cas, contrôlés un par un. Léa : « tu peux pas mettre toi
-- comme traité ? » → la migration fait ce que fait le bouton « ✓ Marquer comme traitée » (RPC traiter_produit) :
--   · déjà en ordre dans l'outil (12) → produit simplement noté traité (« Ajouté », « Nouveau visuel mis », « Retiré ») ;
--   · nouveau sponsor / ajout (11) → ajouté au produit (fichiers de la demande = visuels validés ; LED : « à placer »,
--     emplacement à choisir ensuite dans le détail → « Emplacement », migration 75) ;
--   · changement de visuel (20) → les fichiers de la demande deviennent les visuels de la diffusion en cours ;
--   · suppression (2) → diffusion arrêtée (dernier jour = hier).
-- Fait au nom du compte admin de Léa (dans le SQL Editor personne n'est connecté : traiter_produit le refuserait).
-- Durée / son ne sont pas relus dans les vidéos (fait par le navigateur) : ceux de la demande sont gardés.
-- Une erreur sur un produit n'arrête pas les autres : elle est notée dans sa « Remarque Régie » et listée à la fin.

do $x$
declare
  r        record;
  v_moi    uuid;
  v_ligne  uuid;
  v_ok     boolean;
  v_suite  text;
  v_fich   jsonb;
begin
  -- se connecter « comme Léa » (admin) le temps de la migration : auth.uid() lit ces réglages
  select id into v_moi from profiles where role = 'admin' order by coalesce(nom ilike 'Léa%' or email ilike 'lea.%', false) desc, created_at limit 1;
  if v_moi is null then raise exception 'Aucun compte admin trouvé'; end if;
  perform set_config('request.jwt.claim.sub', v_moi::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_moi, 'role', 'authenticated')::text, true);

  for r in
    select d.id as demande_id, d.type::text as type, d.created_at, d.traite_le, d.traite_par,
           dp.produit_id, dp.avec_anneau, pr.lie_a_produit_id,
           (select array_agg(sp.id) from sponsors sp
             where sp.id = d.sponsor_id or lower(sp.nom) = lower(coalesce(s.nom, d.sponsor_nom_saisi))) as sps
    from demandes d
    join demandes_produits dp on dp.demande_id = d.id and dp.traite_le is null
    join produits pr on pr.id = dp.produit_id and pr.espace is distinct from 'digital'
    left join sponsors s on s.id = d.sponsor_id
    where d.statut = 'traitee'
    order by d.created_at
  loop
    -- diffusion en cours de ce sponsor sur ce produit
    v_ligne := null;
    select lv.id into v_ligne
    from lignes_vendues lv join contrats c on c.id = lv.contrat_id
    where lv.produit_id = r.produit_id and c.sponsor_id = any (coalesce(r.sps, '{}'))
      and lv.statut not in ('annule', 'termine') and (lv.date_fin is null or lv.date_fin >= current_date)
    order by lv.created_at desc limit 1;

    v_ok := case
      when r.type = 'suppression' then v_ligne is null
      when r.type = 'changement_visuel' then v_ligne is not null and exists (
        select 1 from assets a where a.ligne_id = v_ligne and a.depose_le >= r.created_at)
      else v_ligne is not null
    end;

    if v_ok then
      -- déjà en ordre : on note seulement le produit comme traité
      update demandes_produits
      set traite_le = coalesce(r.traite_le, now()), traite_par = coalesce(r.traite_par, v_moi),
          suite = case r.type when 'suppression' then 'retire' when 'changement_visuel' then 'visuel' else 'ajoute' end,
          ligne_id = coalesce(ligne_id, v_ligne)
      where demande_id = r.demande_id and produit_id = r.produit_id;
      continue;
    end if;

    -- fichiers de la demande pour ce produit (« <role>__<nom> »), pas encore utilisés comme visuel
    select coalesce(jsonb_agg(jsonb_build_object(
             'role', case when position('__' in f.nom) > 0 then split_part(f.nom, '__', 1) else 'visuel' end,
             'storage_path', o.name,
             'nom_visuel', regexp_replace(case when position('__' in f.nom) > 0
                                               then substr(f.nom, position('__' in f.nom) + 2) else f.nom end,
                                          '\.[^.]+$', ''),
             'mime', o.metadata->>'mimetype',
             'taille_octets', (o.metadata->>'size')::bigint)), '[]'::jsonb)
    into v_fich
    from storage.objects o
    cross join lateral (select substr(o.name, length('demandes/' || r.demande_id || '/' || r.produit_id || '/') + 1) as nom) f
    where o.bucket_id = 'assets'
      and o.name like 'demandes/' || r.demande_id || '/' || r.produit_id || '/%'
      and not exists (select 1 from assets a where a.storage_path = o.name)
      and (position('__' in f.nom) = 0 or split_part(f.nom, '__', 1) <> 'anneau'
           or (r.avec_anneau and r.lie_a_produit_id is not null));

    v_suite := case
      when r.type = 'suppression' then case when v_ligne is null then 'ignore' else 'retire' end
      when r.type = 'changement_visuel' then 'visuel'
      else 'ajoute' end;

    begin
      perform traiter_produit(r.demande_id, r.produit_id, v_suite, jsonb_build_object(
        'ligne_id', v_ligne,
        'date_fin', (current_date - 1)::text,
        'emplacements', '[]'::jsonb,
        'fichiers', v_fich));
    exception when others then
      update demandes_produits
      set remarque_regie = concat_ws(E'\n', remarque_regie, 'Migration 78 : pas fait automatiquement (' || sqlerrm || ')')
      where demande_id = r.demande_id and produit_id = r.produit_id;
    end;
  end loop;
end $x$;

-- Résultat : ce qui a été fait (dernière heure) et ce qui reste à faire à la main
select coalesce(s.nom, d.sponsor_nom_saisi) as "Sponsor", pr.nom as "Produit", d.type as "Demande",
       case when dp.traite_le is null then '⚠ À FAIRE À LA MAIN : ' || coalesce(dp.remarque_regie, '')
            when dp.suite = 'ajoute' then '✓ ajouté' || case when pr.famille = 'emplacement'
                 and not exists (select 1 from lignes_emplacements le where le.ligne_id = dp.ligne_id)
                 then ' · LED à placer (détail → Emplacement)' else '' end
            when dp.suite = 'visuel' then '✓ nouveau visuel mis ('
                 || (select count(*) from assets a where a.ligne_id = dp.ligne_id and a.demande_id = d.id) || ' fichier(s))'
            when dp.suite = 'retire' then '✓ retiré'
            else '✓ rien à faire (' || dp.suite || ')' end as "Fait"
from demandes_produits dp
join demandes d on d.id = dp.demande_id
join produits pr on pr.id = dp.produit_id and pr.espace is distinct from 'digital'
left join sponsors s on s.id = d.sponsor_id
where (dp.traite_le > now() - interval '1 hour')
   or (d.statut = 'traitee' and dp.traite_le is null)
order by dp.traite_le is not null, pr.nom, 1;
