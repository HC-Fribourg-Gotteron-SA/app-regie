-- =====================================================================
-- 70 — Digital : une demande « Suppression » traitée supprime vraiment le produit
-- À exécuter sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (27.10.2026, Solsystems sur Jamiro Reber) : « quand il y a une suppression et que tu mets demande traitée, il
-- faut que ça supprime ; on garde juste l'historique sur le sponsor ». Avant : « Marquer comme traitée » ne touchait
-- pas aux éléments Digital (le sponsor restait), et « Retirer » les laissait affichés « retiré : à enlever ».
-- Maintenant : quand une demande « Suppression » passe en « Traitée » (bouton « Supprimer le produit » ou « Marquer
-- comme traitée »), ses produits Digital pas encore traités sont retirés (statut = retire, plus affichés dans les
-- pages Digital ; toujours dans le dossier du sponsor). Les suppressions déjà traitées sont rattrapées ci-dessous.

create or replace function retirer_digital_demande(p_demande uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  d  demandes;
  dp record;
  n  int := 0;
  k  int;
begin
  select * into d from demandes where id = p_demande;
  if not found or d.type <> 'suppression' or d.sponsor_id is null then return 0; end if;
  for dp in
    select x.* from demandes_produits x join produits p on p.id = x.produit_id
    where x.demande_id = p_demande and x.traite_le is null and p.espace = 'digital'
  loop
    update digital_elements e set statut = 'retire'
    where e.produit_id = dp.produit_id and e.sponsor_id = d.sponsor_id and e.statut = 'actif'
      and (dp.type_vente is distinct from 'match' or e.match_id is null
           or e.match_id in (select m.id from matchs m
                             where (m.date_heure at time zone 'Europe/Zurich')::date = any (dp.dates_matchs)));
    get diagnostics k = row_count;
    n := n + k;
    update demandes_produits set suite = 'retire', traite_le = now(), traite_par = auth.uid()
    where demande_id = p_demande and produit_id = dp.produit_id;
  end loop;
  return n;
end $$;

create or replace function tg_demande_suppression_traitee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform retirer_digital_demande(new.id);
  return new;
end $$;

drop trigger if exists demande_suppression_traitee on demandes;
create trigger demande_suppression_traitee
  after update of statut on demandes
  for each row when (new.statut = 'traitee' and old.statut is distinct from 'traitee' and new.type = 'suppression')
  execute function tg_demande_suppression_traitee();

-- rattrapage : suppressions déjà marquées « Traitée » sans avoir retiré le produit (ex. Solsystems · Jamiro Reber)
do $x$
declare r record;
begin
  for r in select distinct d.id from demandes d
           join demandes_produits x on x.demande_id = d.id join produits p on p.id = x.produit_id
           where d.type = 'suppression' and d.statut = 'traitee' and x.traite_le is null and p.espace = 'digital'
  loop
    perform retirer_digital_demande(r.id);
  end loop;
end $x$;

select count(*) || ' élément(s) Digital retiré(s) au total' as "Résultat" from digital_elements where statut = 'retire';
