-- =====================================================================
-- 22 — « Match du jour » : ce que la Régie doit changer dans Colosseo
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 21.
-- =====================================================================
-- Les playlists Colosseo restent d'un match à l'autre : le jour du match, la Régie
-- ne fait que les CHANGEMENTS depuis le match précédent (ajouter, enlever, nouveau visuel).
--
-- 1. Les passages (une diffusion x un match) suivent maintenant l'état de la diffusion :
--    « À l'écran » et pas désactivée -> 'prevu' ; sinon -> 'suspendu'.
--    Seuls les matchs à venir changent : les matchs passés gardent ce qui a vraiment passé
--    (c'est ce qui permet de comparer avec le match précédent).
-- 2. Table colosseo_fait : les cases « Fait dans Colosseo » cochées par la Régie, par match.

-- 1. Passages ---------------------------------------------------------------
create or replace function generer_passages(p_ligne uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut statut_ligne;
  v_passe  boolean;
begin
  select statut, (validee and not suspendue) into v_statut, v_passe from lignes_vendues where id = p_ligne;

  -- ligne pas (ou plus) active : on retire les passages futurs non pointés
  if v_statut in ('brouillon', 'annule') then
    delete from passages p using matchs m
    where p.ligne_id = p_ligne and m.id = p.match_id
      and p.statut in ('prevu', 'suspendu') and m.date_heure >= now();
    return;
  end if;

  -- retirer les passages futurs de matchs qui ne sont plus couverts
  delete from passages p using matchs m
  where p.ligne_id = p_ligne and m.id = p.match_id
    and p.statut in ('prevu', 'suspendu') and m.date_heure >= now()
    and p.match_id not in (select match_id from matchs_de_ligne(p_ligne));

  -- créer les passages manquants
  insert into passages (ligne_id, match_id, asset_id, statut)
  select p_ligne, x.match_id, choisir_asset(p_ligne, x.match_id),
         case when v_passe then 'prevu' else 'suspendu' end::statut_passage
  from matchs_de_ligne(p_ligne) x
  on conflict (ligne_id, match_id) do nothing;

  -- matchs à venir : visuel à jour et état « passe / ne passe pas »
  update passages p
  set asset_id = case when p.saisi_colosseo then p.asset_id else choisir_asset(p.ligne_id, p.match_id) end,
      statut   = case when v_passe then 'prevu' else 'suspendu' end::statut_passage
  from matchs m
  where p.ligne_id = p_ligne and m.id = p.match_id
    and p.statut in ('prevu', 'suspendu') and m.date_heure >= now();
end $$;

-- « À l'écran » / désactivée changent aussi les passages
drop trigger if exists lignes_passages on lignes_vendues;
create trigger lignes_passages after insert or update of
  statut, type_vente, inclut_playoffs, date_debut, date_fin, un_match_sur, regle_rotation, contrat_id,
  validee, suspendue
  on lignes_vendues for each row execute function tg_ligne_passages();

-- Point de départ : tous les passages non pointés (y compris les matchs passés) prennent l'état actuel,
-- pour que la première comparaison ne signale pas de faux changements.
update passages p
set statut = case when l.validee and not l.suspendue then 'prevu' else 'suspendu' end::statut_passage
from lignes_vendues l
where l.id = p.ligne_id and p.statut in ('prevu', 'suspendu');

-- 2. Cases « Fait dans Colosseo » ---------------------------------------------
create table if not exists colosseo_fait (
  match_id  uuid not null references matchs (id) on delete cascade,
  ligne_id  uuid not null references lignes_vendues (id) on delete cascade,
  action    text not null,                -- ajouter | enlever | visuel
  fait_par  uuid references profiles (id) default auth.uid(),
  fait_le   timestamptz not null default now(),
  primary key (match_id, ligne_id, action)
);

alter table colosseo_fait enable row level security;
drop policy if exists colosseo_fait_lecture on colosseo_fait;
drop policy if exists colosseo_fait_insert on colosseo_fait;
drop policy if exists colosseo_fait_delete on colosseo_fait;
create policy colosseo_fait_lecture on colosseo_fait for select to authenticated using (est_membre());
create policy colosseo_fait_insert on colosseo_fait for insert to authenticated with check (a_role('regie', 'admin'));
create policy colosseo_fait_delete on colosseo_fait for delete to authenticated using (a_role('regie', 'admin'));

select count(*) filter (where statut = 'prevu') || ' passages à l''écran, '
       || count(*) filter (where statut = 'suspendu') || ' qui ne passent pas.' as "Résultat"
from passages;
