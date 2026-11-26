-- =====================================================================
-- 80 — LED 3M / 6M : l'outil remis comme ce qui passe sur les LED (PNG du 26.11.2026)
-- À exécuter sur la VRAIE base (sans effet sur la base de test). Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (26.11.2026) a donné les PNG des 4 anneaux ; comparaison case par case avec l'outil :
-- 144 emplacements identiques, 5 différents (4 sponsors mal placés dans l'outil) :
--   A-9   outil RM Montage            → LED media f imprimerie
--   C-24  outil UPCF                  → LED Sagérime (1re case)
--   C-26  outil Sagérime (2e case)    → LED RM Montage
--   C-27  outil media f imprimerie    → LED libre (Banner HCFG)
--   UPCF est aussi en B-36 (juste) : son lien C-24 est un doublon, retiré. Si sa diffusion n'a plus aucun emplacement,
--   elle est arrêtée (hier) comme « Retirer de ce produit » ; elle reste dans l'historique.
-- Résultat : A-9 media f · C-24 + C-25 Sagérime (LED 6M) · C-26 RM Montage · C-27 libre.

do $x$
declare
  v_media uuid; v_rm uuid; v_sag uuid; v_upcf uuid;
  e_a9 uuid; e_c24 uuid; e_c25 uuid; e_c26 uuid;
  -- diffusion en cours d'un sponsor sur un produit LED, qui occupe l'emplacement donné
  q text := $q$
    select lv.id from lignes_vendues lv
    join contrats c on c.id = lv.contrat_id join sponsors s on s.id = c.sponsor_id
    join lignes_emplacements le on le.ligne_id = lv.id join emplacements e on e.id = le.emplacement_id
    where s.nom ilike $1 and e.anneau || '-' || e.position = $2
      and lv.statut not in ('annule', 'termine') limit 1 $q$;
begin
  select id into e_a9  from emplacements where anneau = 'A' and position = 9;
  select id into e_c24 from emplacements where anneau = 'C' and position = 24;
  select id into e_c25 from emplacements where anneau = 'C' and position = 25;
  select id into e_c26 from emplacements where anneau = 'C' and position = 26;

  execute q into v_media using 'media f%', 'C-27';
  execute q into v_rm    using 'RM Montage%', 'A-9';
  execute q into v_sag   using 'Sag%rime%', 'C-25';
  execute q into v_upcf  using 'UPCF%', 'C-24';

  if v_media is null and v_rm is null and v_sag is null and v_upcf is null then
    raise notice 'Rien à corriger (déjà fait ?)';
    return;
  end if;

  -- 1. on libère les emplacements concernés de ces 4 diffusions
  delete from lignes_emplacements
  where (ligne_id = v_media) or (ligne_id = v_rm) or (ligne_id = v_sag)
     or (ligne_id = v_upcf and emplacement_id = e_c24);

  -- 2. on remet chacun à sa place sur la LED
  if v_media is not null then insert into lignes_emplacements values (v_media, e_a9) on conflict do nothing; end if;
  if v_rm    is not null then insert into lignes_emplacements values (v_rm, e_c26) on conflict do nothing; end if;
  if v_sag   is not null then
    insert into lignes_emplacements values (v_sag, e_c24) on conflict do nothing;
    insert into lignes_emplacements values (v_sag, e_c25) on conflict do nothing;
  end if;

  -- 3. UPCF : plus d'emplacement du tout → diffusion arrêtée (doublon de B-36)
  if v_upcf is not null and not exists (select 1 from lignes_emplacements where ligne_id = v_upcf) then
    update lignes_vendues set statut = 'termine', date_fin = current_date - 1,
           consignes = concat_ws(E'\n', consignes, 'Doublon retiré le 26.11.2026 (UPCF est en B-36)')
    where id = v_upcf;
  end if;
end $x$;

-- Contrôle : les cases corrigées
select e.anneau || '-' || e.position as "Empl", coalesce(v.sponsor, 'Banner HCFG') as "Sponsor", coalesce(v.produit, '') as "Produit"
from emplacements e
left join lateral (select * from v_plan_emplacements p where p.emplacement_id = e.id and p.ligne_id is not null limit 1) v on true
where (e.anneau, e.position) in (('A', 9), ('B', 36), ('C', 24), ('C', 25), ('C', 26), ('C', 27))
order by e.anneau, e.position;
