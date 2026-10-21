-- =====================================================================
-- 64 — Vidéo différente à chaque match (Spot chef de Leguriviera), déposée le jour même
-- À exécuter sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (21.10.2026) : « spot chef, il nous donne le spot le jour même et il change selon les chefs » ; c'est le
-- Sponsoring qui transmet la vidéo. Une diffusion en `regle_rotation = 'par_match'` reçoit UNE vidéo par match
-- (assets.match_id) : choisir_asset la prend pour ce match (sinon le visuel général, ex. « Spot chef »).
-- Le Sponsoring (page Demandes) et la Régie (Match du jour) la déposent via la RPC deposer_video_match :
-- seulement sur une diffusion « par match », pour un de SES matchs. Validée tout de suite (la Régie la voit et la
-- met dans Colosseo), aussi dans le dossier du sponsor.

-- 1. Validation d'un visuel : aussi permise quand c'est la RPC deposer_video_match qui le fait
create or replace function tg_asset_avant() returns trigger
language plpgsql security definer set search_path = public as $$
declare r role_app;
begin
  select role into r from profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    select coalesce(max(version), 0) + 1 into new.version
    from assets where ligne_id = new.ligne_id and coalesce(variante, '') = coalesce(new.variante, '');
    new.statut := 'a_valider';
  end if;

  if tg_op = 'UPDATE' and new.statut is distinct from old.statut then
    if new.statut in ('valide', 'refuse') and coalesce(r::text, '') not in ('regie', 'admin')
       and coalesce(current_setting('outil.depot_video_match', true), '') <> 'oui' then
      raise exception 'Seule la Régie peut valider ou refuser un fichier';
    end if;
    if new.statut = 'refuse' and coalesce(new.motif_refus, '') = '' then
      raise exception 'Un motif est obligatoire pour refuser un fichier';
    end if;
    if new.statut in ('valide', 'refuse') then
      new.valide_par := auth.uid();
      new.valide_le  := now();
    end if;
  end if;

  new.conformite := controler_asset(new);
  return new;
end $$;

-- 2. Déposer la vidéo d'un match (Sponsoring, Régie, admin)
create or replace function deposer_video_match(p_ligne uuid, p_match uuid, p_chemin text, p_nom text,
                                               p_mime text default null, p_taille bigint default null,
                                               p_duree numeric default null, p_son boolean default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l       lignes_vendues;
  v_asset uuid;
  v_sponsor uuid;
begin
  if not a_role('sponsoring', 'regie', 'admin') then raise exception 'Accès refusé'; end if;
  select * into l from lignes_vendues where id = p_ligne;
  if not found or l.regle_rotation <> 'par_match' then
    raise exception 'Cette diffusion n''a pas de vidéo par match';
  end if;
  if not exists (select 1 from matchs_de_ligne(p_ligne) x where x.match_id = p_match) then
    raise exception 'Ce match ne fait pas partie de cette diffusion';
  end if;
  if coalesce(p_chemin, '') = '' then raise exception 'Fichier manquant'; end if;

  insert into assets (ligne_id, match_id, nom_visuel, storage_path, mime, taille_octets, duree_s, avec_son)
  values (p_ligne, p_match, regexp_replace(p_nom, '\.[^.]+$', ''), p_chemin, p_mime, p_taille, p_duree,
          coalesce(p_son, l.avec_son))
  returning id into v_asset;
  perform set_config('outil.depot_video_match', 'oui', true);     -- le temps de cette transaction seulement
  update assets set statut = 'valide' where id = v_asset;          -- archive la vidéo précédente de CE match
  perform set_config('outil.depot_video_match', '', true);

  select c.sponsor_id into v_sponsor from contrats c where c.id = l.contrat_id;
  begin
    insert into documents_sponsors (sponsor_id, produit_id, role, nom, storage_path, mime, taille_octets, notes)
    values (v_sponsor, l.produit_id, 'visuel', p_nom, p_chemin, p_mime, p_taille,
            'Vidéo du match du ' || (select to_char(date_heure at time zone 'Europe/Zurich', 'DD.MM.YYYY') from matchs where id = p_match));
  exception when others then null;                                  -- dossier sponsor : facultatif
  end;
  return v_asset;
end $$;
grant execute on function deposer_video_match(uuid, uuid, text, text, text, bigint, numeric, boolean) to authenticated;

-- 3. Leguriviera « Spot chef » : une vidéo par match
update lignes_vendues lv set regle_rotation = 'par_match'
from contrats c, sponsors s
where c.id = lv.contrat_id and s.id = c.sponsor_id and s.nom ilike '%leguriviera%'
  and lv.produit_id = (select id from produits where nom = 'Pub pause tiers')
  and lv.statut not in ('annule', 'termine') and lv.consignes ilike '%spot chef%'
  and lv.regle_rotation <> 'par_match';

select s.nom as "Sponsor", lv.consignes as "Remarque", lv.regle_rotation as "Règle",
       (select count(*) from lignes_matchs lm where lm.ligne_id = lv.id) as "Matchs"
from lignes_vendues lv join contrats c on c.id = lv.contrat_id join sponsors s on s.id = c.sponsor_id
where lv.regle_rotation = 'par_match' and lv.statut not in ('annule', 'termine');
