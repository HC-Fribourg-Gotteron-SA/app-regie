-- =====================================================================
-- 18 — « Nouveau visuel attendu » sur une diffusion
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 17.
-- =====================================================================
-- Ce que la Régie doit voir d'une diffusion : passe-t-elle à l'écran ? est-elle
-- désactivée ? attend-on un nouveau visuel ? Ce dernier point est une information
-- à part : l'ancien visuel continue souvent de passer en attendant.
-- La case s'enlève toute seule dès qu'un nouveau visuel est validé.

alter table lignes_vendues add column if not exists visuel_attendu boolean not null default false;

-- Reprise des remarques d'Airtable (« en attente de nouvelle vidéo », « nouveaux visuels à mettre »…)
update lignes_vendues set visuel_attendu = true
where not visuel_attendu
  and (consignes ~* 'en attente|en attende|nouveaux? visuels? a mettre|nouveau arrive|modifier logo|changer logo');

-- Un visuel validé sur la ligne (ou sur son anneau couplé) = plus rien d'attendu
create or replace function tg_asset_visuel_recu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'valide' and (tg_op = 'INSERT' or old.statut is distinct from 'valide') then
    update lignes_vendues set visuel_attendu = false
    where id = new.ligne_id and visuel_attendu;
  end if;
  return null;
end $$;

drop trigger if exists assets_visuel_recu on assets;
create trigger assets_visuel_recu after insert or update of statut on assets
  for each row execute function tg_asset_visuel_recu();

select count(*) filter (where visuel_attendu) || ' diffusions en attente d''un nouveau visuel.' as "Résultat"
from lignes_vendues;
