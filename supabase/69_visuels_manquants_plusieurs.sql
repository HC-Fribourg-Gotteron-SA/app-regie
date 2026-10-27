-- =====================================================================
-- 69 — Visuels manquants : plusieurs fichiers d'un coup (une version par fichier)
-- À exécuter APRÈS la 68, sur la base de TEST puis sur la VRAIE base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (27.10.2026) : pouvoir glisser plusieurs fichiers dans « Visuels manquants » (ex. vidéo FR + DE). Valider un
-- visuel archive l'ancien de la MÊME version (tg_asset_apres) : chaque fichier reçoit donc sa version (FR / DE lue
-- dans le nom, sinon V1, V2…) pour qu'ils restent tous. Un seul fichier : pas de version (comme avant).
-- Nouvelle signature (p_variante) : l'ancienne est supprimée pour éviter deux fonctions du même nom.

drop function if exists deposer_visuel_manquant(uuid, text, text, text, bigint, int, int, numeric, boolean);

create or replace function deposer_visuel_manquant(p_ligne uuid, p_chemin text, p_nom text,
                                                   p_mime text default null, p_taille bigint default null,
                                                   p_largeur int default null, p_hauteur int default null,
                                                   p_duree numeric default null, p_son boolean default null,
                                                   p_variante text default null)
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

  insert into assets (ligne_id, nom_visuel, variante, storage_path, mime, taille_octets, largeur_px, hauteur_px,
                      duree_s, avec_son)
  values (p_ligne, regexp_replace(p_nom, '\.[^.]+$', ''), nullif(trim(p_variante), ''), p_chemin, p_mime, p_taille,
          p_largeur, p_hauteur, p_duree, coalesce(p_son, l.avec_son))
  returning id into v_asset;
  perform set_config('outil.depot_video_match', 'oui', true);     -- le temps de cette transaction seulement
  update assets set statut = 'valide' where id = v_asset;          -- archive l'ancien de cette version
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

  -- passe déjà : tâche « Pour ce soir » au prochain match (une seule par diffusion et par match)
  if exists (select 1 from passages p join matchs m on m.id = p.match_id
             where p.ligne_id = p_ligne and m.date_heure < now() and p.statut in ('prevu', 'diffuse')) then
    select m.id into v_match from passages p join matchs m on m.id = p.match_id
    where p.ligne_id = p_ligne and m.date_heure >= date_trunc('day', now()) and p.statut in ('prevu', 'diffuse')
    order by m.date_heure limit 1;
    if v_match is not null then
      begin
        insert into notes_match (match_id, type, texte)
        select v_match, 'tache', 'Nouveau visuel reçu : ' || coalesce(v_nom_sp, '?') || ' · ' || coalesce(v_produit, '?')
               || ' — à mettre dans Colosseo (fichier(s) sur la fiche du produit)'
        where not exists (select 1 from notes_match n where n.match_id = v_match and not n.fait
                          and n.texte = 'Nouveau visuel reçu : ' || coalesce(v_nom_sp, '?') || ' · ' || coalesce(v_produit, '?')
                                        || ' — à mettre dans Colosseo (fichier(s) sur la fiche du produit)');
      exception when others then null;                                -- « Pour ce soir » : facultatif
      end;
    end if;
  end if;
  return v_asset;
end $$;
grant execute on function deposer_visuel_manquant(uuid, text, text, text, bigint, int, int, numeric, boolean, text) to authenticated;

select 'deposer_visuel_manquant : plusieurs fichiers possibles' as "Résultat";
