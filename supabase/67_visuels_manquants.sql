-- =====================================================================
-- 67 — Visuels manquants : le Sponsoring dépose le visuel d'une diffusion qui n'en a pas
-- À exécuter sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (26.10.2026, option B) : des diffusions importées d'Airtable n'ont jamais reçu leur visuel (ex. Garage Klaus,
-- Sponsor du match). La page Demandes liste ces « visuels manquants » ; le Sponsoring y dépose le fichier sans faire
-- de demande. Le visuel est validé tout de suite (comme le Spot chef, migration 64 : même réglage de transaction
-- `outil.depot_video_match` lu par tg_asset_avant), rangé dans le dossier du sponsor, et si la diffusion passe déjà
-- (à la saison), une tâche « Pour ce soir » prévient la Régie au prochain match (sinon : son « Ajouter » de Match du
-- jour montre déjà le visuel).

create or replace function deposer_visuel_manquant(p_ligne uuid, p_chemin text, p_nom text,
                                                   p_mime text default null, p_taille bigint default null,
                                                   p_largeur int default null, p_hauteur int default null,
                                                   p_duree numeric default null, p_son boolean default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l         lignes_vendues;
  v_asset   uuid;
  v_sponsor uuid;
  v_nom_sp  text;
  v_produit text;
  v_match   uuid;
begin
  if not a_role('sponsoring', 'regie', 'admin') then raise exception 'Accès refusé'; end if;
  select * into l from lignes_vendues where id = p_ligne;
  if not found or l.statut in ('annule', 'termine') then raise exception 'Cette diffusion n''est plus en cours'; end if;
  if coalesce(p_chemin, '') = '' then raise exception 'Fichier manquant'; end if;

  insert into assets (ligne_id, nom_visuel, storage_path, mime, taille_octets, largeur_px, hauteur_px, duree_s, avec_son)
  values (p_ligne, regexp_replace(p_nom, '\.[^.]+$', ''), p_chemin, p_mime, p_taille, p_largeur, p_hauteur, p_duree,
          coalesce(p_son, l.avec_son))
  returning id into v_asset;
  perform set_config('outil.depot_video_match', 'oui', true);     -- le temps de cette transaction seulement
  update assets set statut = 'valide' where id = v_asset;          -- archive l'ancien, enlève « visuel attendu »
  perform set_config('outil.depot_video_match', '', true);

  -- durée / son lus dans la vidéo : repris sur la diffusion s'ils n'étaient pas connus
  update lignes_vendues set duree_s = coalesce(duree_s, p_duree), avec_son = coalesce(avec_son, p_son)
  where id = p_ligne and (duree_s is null or avec_son is null);

  select c.sponsor_id, s.nom into v_sponsor, v_nom_sp
  from contrats c join sponsors s on s.id = c.sponsor_id where c.id = l.contrat_id;
  select nom into v_produit from produits where id = l.produit_id;
  begin
    insert into documents_sponsors (sponsor_id, produit_id, role, nom, storage_path, mime, taille_octets, notes)
    values (v_sponsor, l.produit_id, 'visuel', p_nom, p_chemin, p_mime, p_taille, 'Visuel manquant déposé');
  exception when others then null;                                  -- dossier sponsor : facultatif
  end;

  -- passe déjà (un match passé où il était prévu / diffusé) : la Régie doit le changer dans Colosseo → tâche
  -- au prochain match (aujourd'hui compris) où cette diffusion passe
  if exists (select 1 from passages p join matchs m on m.id = p.match_id
             where p.ligne_id = p_ligne and m.date_heure < now() and p.statut in ('prevu', 'diffuse')) then
    select m.id into v_match from passages p join matchs m on m.id = p.match_id
    where p.ligne_id = p_ligne and m.date_heure >= date_trunc('day', now()) and p.statut in ('prevu', 'diffuse')
    order by m.date_heure limit 1;
    if v_match is not null then
      begin
        insert into notes_match (match_id, type, texte)
        values (v_match, 'tache', 'Nouveau visuel reçu : ' || coalesce(v_nom_sp, '?') || ' · ' || coalesce(v_produit, '?')
                || ' (« ' || p_nom || ' ») — à mettre dans Colosseo (fichier sur la fiche du produit)');
      exception when others then null;                                -- « Pour ce soir » : facultatif
      end;
    end if;
  end if;
  return v_asset;
end $$;
grant execute on function deposer_visuel_manquant(uuid, text, text, text, bigint, int, int, numeric, boolean) to authenticated;

select 'deposer_visuel_manquant installée' as "Résultat";
