-- =====================================================================
-- 79 — Spot chef (vidéo par match) : on peut aussi déposer l'ANNEAU LED du match avec la vidéo
-- À exécuter sur la base de TEST puis sur la VRAIE base (APRÈS la 64). Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (24.11.2026) : « pour Leguriviera il faut aussi que le Sponsoring puisse mettre un anneau LED avec la vidéo ».
-- La carte « 🎬 Spot chef » (Demandes / Match du jour) a une 2e zone « anneau LED ». Le fichier va sur l'anneau LED
-- couplé à la diffusion (créé s'il n'existe pas), lui aussi « un visuel par match » (regle_rotation = par_match) :
-- choisir_asset prend l'anneau de CE match. Facultatif : sans anneau déposé, rien ne change.

-- 1. RPC : même dépôt, + p_role ('visuel' = vidéo, 'anneau' = anneau LED du match)
drop function if exists deposer_video_match(uuid, uuid, text, text, text, bigint, numeric, boolean);

create or replace function deposer_video_match(p_ligne uuid, p_match uuid, p_chemin text, p_nom text,
                                               p_mime text default null, p_taille bigint default null,
                                               p_duree numeric default null, p_son boolean default null,
                                               p_role text default 'visuel')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l         lignes_vendues;
  v_cible   uuid;
  v_anneau  uuid;
  v_lie     uuid;
  v_asset   uuid;
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

  v_cible := p_ligne;
  if p_role = 'anneau' then
    v_anneau := l.ligne_couplee_id;
    if v_anneau is null then
      -- pas encore d'anneau couplé : on le crée (produit technique lié au produit de la diffusion)
      select lie_a_produit_id into v_lie from produits where id = l.produit_id;
      if v_lie is null then raise exception 'Ce produit n''a pas d''anneau LED'; end if;
      insert into lignes_vendues (contrat_id, produit_id, demande_id, type_vente, duree_s, avec_son, consignes,
                                  statut, ligne_couplee_id, regle_rotation, validee)
      select l.contrat_id, v_lie, l.demande_id, l.type_vente, l.duree_s, false,
             'Couplé à : ' || (select nom from produits where id = l.produit_id), 'vendu', l.id, 'par_match', l.validee
      returning id into v_anneau;
      insert into lignes_matchs (ligne_id, match_id) select v_anneau, match_id from lignes_matchs where ligne_id = l.id;
      update lignes_vendues set ligne_couplee_id = v_anneau where id = l.id;
    elsif (select regle_rotation from lignes_vendues where id = v_anneau) <> 'par_match' then
      update lignes_vendues set regle_rotation = 'par_match' where id = v_anneau;
    end if;
    v_cible := v_anneau;
  end if;

  insert into assets (ligne_id, match_id, nom_visuel, storage_path, mime, taille_octets, duree_s, avec_son)
  values (v_cible, p_match, regexp_replace(p_nom, '\.[^.]+$', ''), p_chemin, p_mime, p_taille, p_duree,
          case when p_role = 'anneau' then false else coalesce(p_son, l.avec_son) end)
  returning id into v_asset;
  perform set_config('outil.depot_video_match', 'oui', true);     -- le temps de cette transaction seulement
  update assets set statut = 'valide' where id = v_asset;          -- archive le fichier précédent de CE match
  perform set_config('outil.depot_video_match', '', true);

  select c.sponsor_id into v_sponsor from contrats c where c.id = l.contrat_id;
  begin
    insert into documents_sponsors (sponsor_id, produit_id, role, nom, storage_path, mime, taille_octets, notes)
    values (v_sponsor, l.produit_id, case when p_role = 'anneau' then 'anneau' else 'visuel' end, p_nom, p_chemin,
            p_mime, p_taille,
            case when p_role = 'anneau' then 'Anneau LED du match du ' else 'Vidéo du match du ' end
            || (select to_char(date_heure at time zone 'Europe/Zurich', 'DD.MM.YYYY') from matchs where id = p_match));
  exception when others then null;                                  -- dossier sponsor : facultatif
  end;
  return v_asset;
end $$;
grant execute on function deposer_video_match(uuid, uuid, text, text, text, bigint, numeric, boolean, text) to authenticated;

-- 2. Anneau LED déjà couplé à une diffusion « par match » : lui aussi un visuel par match
update lignes_vendues a set regle_rotation = 'par_match'
from lignes_vendues l
where l.regle_rotation = 'par_match' and l.statut not in ('annule', 'termine')
  and a.id = l.ligne_couplee_id and a.regle_rotation <> 'par_match';

select s.nom as "Sponsor", lv.consignes as "Diffusion",
       case when lv.ligne_couplee_id is null then 'sera créé au 1er dépôt' else 'oui' end as "Anneau LED"
from lignes_vendues lv join contrats c on c.id = lv.contrat_id join sponsors s on s.id = c.sponsor_id
join produits pr on pr.id = lv.produit_id and pr.actif
where lv.regle_rotation = 'par_match' and lv.statut not in ('annule', 'termine');
