-- =====================================================================
-- 68 — Sponsor du match : vidéo vidéotron + anneau LED complet (facultatif), comme la Pub pause tiers
-- À exécuter APRÈS la 67, sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (27.10.2026) : le sponsor du match a une vidéo sur le vidéotron, plus l'anneau LED complet (pas obligatoire),
-- « comme pour la Pub pause tiers ». Le produit était « Multi-supports » : la migration 35 (avec / sans anneau LED
-- pour tout le vidéotron) ne l'avait pas pris. Il devient « Vidéotron » (question du son, durée lue dans la vidéo)
-- et propose « Avec / sans anneau LED » dans la demande, avec le visuel de l'anneau (produit technique inactif
-- « Anneau LED couplé », jamais affiché). L'action scene « Sponsor du match » n'est pas touchée.

-- 1. Le produit ------------------------------------------------------------------------------
update produits
set support = 'Vidéotron',
    lie_a_produit_id = (select id from produits where nom = 'Anneau LED couplé'),
    formats = '{png,jpg,jpeg,mp4,mov}'::text[]
where nom = 'Sponsor du match'
  and exists (select 1 from produits where nom = 'Anneau LED couplé');

-- 2. Visuels manquants (67) : visuel de l'anneau LED déposé → la tâche « Pour ce soir » et le dossier du sponsor
--    parlent du produit de base (« Sponsor du match · anneau LED »), jamais du produit technique de l'anneau
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
  v_prod_id uuid;
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
  -- anneau couplé (produit inactif) : on nomme le produit de base
  select case when p.actif then p.nom else coalesce(b.nom || ' · anneau LED', 'Anneau LED') end,
         case when p.actif then p.id else b.produit_id end
  into v_produit, v_prod_id
  from produits p
  left join lateral (select pb.nom, lb.produit_id from lignes_vendues lb join produits pb on pb.id = lb.produit_id
                     where lb.id = l.ligne_couplee_id) b on true
  where p.id = l.produit_id;
  begin
    insert into documents_sponsors (sponsor_id, produit_id, role, nom, storage_path, mime, taille_octets, notes)
    values (v_sponsor, coalesce(v_prod_id, l.produit_id), 'visuel', p_nom, p_chemin, p_mime, p_taille,
            'Visuel manquant déposé');
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

-- 3. Téléverbier : sponsor du match vendredi, avec l'anneau LED (Léa, 27.10.2026) → anneau couplé créé sur ses
--    Sponsor du match à venir qui n'en ont pas ; son visuel se dépose ensuite dans Demandes → « Visuels manquants »
do $x$
declare
  v_anneau_pr uuid := (select id from produits where nom = 'Anneau LED couplé');
  r record;
  v_anneau uuid;
begin
  if v_anneau_pr is null then return; end if;
  for r in
    select lv.* from lignes_vendues lv
    join contrats c on c.id = lv.contrat_id join sponsors s on s.id = c.sponsor_id
    where lower(sans_accent(s.nom)) like '%verbier%'
      and lv.produit_id = (select id from produits where nom = 'Sponsor du match')
      and lv.statut not in ('annule', 'termine') and lv.ligne_couplee_id is null
      and exists (select 1 from lignes_matchs lm join matchs m on m.id = lm.match_id
                  where lm.ligne_id = lv.id and m.date_heure >= date_trunc('day', now()))
  loop
    insert into lignes_vendues (contrat_id, produit_id, type_vente, duree_s, avec_son, consignes, statut,
                                ligne_couplee_id, validee)
    values (r.contrat_id, v_anneau_pr, r.type_vente, r.duree_s, false, 'Couplé à : Sponsor du match', 'vendu',
            r.id, true)
    returning id into v_anneau;
    insert into lignes_matchs (ligne_id, match_id) select v_anneau, match_id from lignes_matchs where ligne_id = r.id;
    update lignes_vendues set ligne_couplee_id = v_anneau where id = r.id;
  end loop;
end $x$;

select p.nom as "Produit", p.support as "Écran",
       (select nom from produits a where a.id = p.lie_a_produit_id) as "Anneau LED",
       (select string_agg(s.nom || ' · ' || to_char(m.date_heure at time zone 'Europe/Zurich', 'DD.MM')
                          || case when lv.ligne_couplee_id is not null then ' · avec anneau LED' else '' end, ', ')
        from lignes_vendues lv join contrats c on c.id = lv.contrat_id join sponsors s on s.id = c.sponsor_id
        join lignes_matchs lm on lm.ligne_id = lv.id join matchs m on m.id = lm.match_id
        where lv.produit_id = p.id and lv.statut not in ('annule', 'termine')
          and m.date_heure >= date_trunc('day', now())) as "Sponsors du match à venir"
from produits p where p.nom = 'Sponsor du match';
