-- =====================================================================
-- 78 — Demandes « marquées traitées » sans que le produit ait été ajouté : on les remet à traiter
-- À exécuter sur la VRAIE base (la base de test n'a pas ces demandes ; sans effet si rien ne correspond).
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (23.11.2026) : l'ancien bouton « Marquer comme traitée » (bas de la demande) changeait seulement le statut :
-- rien dans l'outil (JPF · Sponsor du match, Red Bull · Pub pause tiers…). 45 produits dans ce cas, contrôlés un par un :
--   · déjà en ordre dans l'outil (12 : sponsor sur la fiche / visuel mis après la demande / diffusion arrêtée)
--     → le produit est noté traité (« Ajouté », « Nouveau visuel mis », « Retiré ») ; la demande reste traitée ;
--   · pas fait (33 : 11 ajouts, 20 nouveaux visuels, 2 suppressions) → la demande est ROUVERTE (« En cours ») :
--     elle revient dans « À ajouter » sur la fiche du produit et dans Match du jour ; la Régie clique
--     « ✓ Marquer comme traitée » sur chaque produit (qui ajoute / met le visuel / retire vraiment).
-- Digital : pas concerné (« Marquer comme traitée » y était voulu).

do $x$
declare
  r        record;
  v_ligne  uuid;
  v_ok     boolean;
  v_rouv   int := 0;
  v_ok_nb  int := 0;
begin
  for r in
    select d.id as demande_id, d.type::text as type, d.created_at, d.traite_le, d.traite_par, dp.produit_id,
           (select array_agg(sp.id) from sponsors sp
             where sp.id = d.sponsor_id or lower(sp.nom) = lower(coalesce(s.nom, d.sponsor_nom_saisi))) as sps
    from demandes d
    join demandes_produits dp on dp.demande_id = d.id and dp.traite_le is null
    join produits pr on pr.id = dp.produit_id and pr.espace is distinct from 'digital'
    left join sponsors s on s.id = d.sponsor_id
    where d.statut = 'traitee'
  loop
    -- diffusion en cours de ce sponsor sur ce produit
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
      update demandes_produits
      set traite_le = coalesce(r.traite_le, now()), traite_par = r.traite_par,
          suite = case r.type when 'suppression' then 'retire' when 'changement_visuel' then 'visuel' else 'ajoute' end,
          ligne_id = coalesce(ligne_id, v_ligne)
      where demande_id = r.demande_id and produit_id = r.produit_id;
      v_ok_nb := v_ok_nb + 1;
    else
      update demandes set statut = 'en_cours', traite_le = null, traite_par = null
      where id = r.demande_id and statut = 'traitee';
      v_rouv := v_rouv + 1;
    end if;
  end loop;
  raise notice 'Produits déjà en ordre : %, produits à reprendre : %', v_ok_nb, v_rouv;
end $x$;

-- Résultat : les demandes rouvertes, à traiter (fiche du produit → « À ajouter », ou Match du jour)
select coalesce(s.nom, d.sponsor_nom_saisi) as "Sponsor", pr.nom as "Produit", d.type as "Type",
       to_char(d.created_at, 'DD.MM') as "Reçue"
from demandes d
join demandes_produits dp on dp.demande_id = d.id and dp.traite_le is null
join produits pr on pr.id = dp.produit_id
left join sponsors s on s.id = d.sponsor_id
where d.statut = 'en_cours'
order by pr.nom, 1;
