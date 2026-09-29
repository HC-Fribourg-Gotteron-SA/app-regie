-- =====================================================================
-- Demandes encore à faire, reprises de la feuille Airtable « Nouveaux Sponsors »
-- (lignes pas cochées « Ajouté ») — à exécuter UNE fois, APRÈS import_airtable_2026-27.sql.
-- =====================================================================
-- Elles arrivent comme de vraies demandes « Nouvelle » : page Demandes, « À ajouter » sur les
-- fiches produit, Match du jour. Les fichiers joints dans Airtable ne suivent pas (liens
-- temporaires) : leurs noms sont notés dans la remarque, à récupérer dans Airtable.
-- Swiss Cheese Awards (29.09) n'est pas repris : déjà importé depuis « Emplacement au match ».

create table if not exists imports_donnees (nom text primary key, le timestamptz not null default now());

-- Aide : un produit d'une demande (supprimée à la fin)
create or replace function import_demande_produit(p_demande uuid, p_produit text, p_type type_vente default 'saison',
                                                  p_dates date[] default null, p_son boolean default null,
                                                  p_anneau boolean default null, p_remarque text default null)
returns void language plpgsql as $$
declare v_produit uuid := (select id from produits where nom = p_produit);
begin
  if v_produit is null then raise exception 'Produit introuvable : %', p_produit; end if;
  insert into demandes_produits (demande_id, produit_id, type_vente, dates_matchs, avec_son, avec_anneau, remarque_sponsoring)
  values (p_demande, v_produit, p_type, p_dates, p_son, p_anneau, p_remarque);
end $$;

-- Aide : la demande (sponsor retrouvé par son nom, sinon « nouveau sponsor »)
create or replace function import_demande(p_nom text, p_type type_demande, p_remarque text)
returns uuid language plpgsql as $$
declare
  v_sponsor uuid;
  v_id uuid;
begin
  select id into v_sponsor from sponsors
  where lower(nom) = lower(p_nom) or lower(p_nom) = any (select lower(a) from unnest(alias) a)
  limit 1;
  if v_sponsor is null then
    select id into v_sponsor from sponsors where nom ilike p_nom || '%' order by length(nom) limit 1;
  end if;
  insert into demandes (sponsor_id, sponsor_nom_saisi, type, remarque_sponsoring, statut, cree_par)
  values (v_sponsor, case when v_sponsor is null then p_nom end,
          case when v_sponsor is null then 'nouveau_sponsor'::type_demande else p_type end,
          p_remarque || E'\n(Reprise d''Airtable « Nouveaux Sponsors »)', 'nouvelle',
          (select id from profiles where role = 'admin' order by created_at limit 1))
  returning id into v_id;
  return v_id;
end $$;

do $demandes$
declare d uuid;
begin
  if exists (select 1 from imports_donnees where nom = 'Demandes en attente Airtable') then
    raise exception 'Déjà fait : ces demandes ont déjà été créées.';
  end if;
  if not exists (select 1 from lignes_vendues) then
    raise exception 'Lancez d''abord import_airtable_2026-27.sql (les sponsors doivent exister).';
  end if;
  insert into imports_donnees (nom) values ('Demandes en attente Airtable');

  -- BLS : nouvelle campagne (anneau, angle, vidéotron)
  d := import_demande('BLS', 'changement_visuel',
    'Saison 2026-2027. Fichiers dans Airtable : BLS_Hockey_DOOH_1920x1080_FR_Herbst.jpg, BLS_Hockey_DOOH_1920x1080_FR_Winter.jpg, '
    || 'BLS-Kampagne-Hockey-26-16x9-Herbst-D15-v01-A_FR_10sec_Vertont.mp4, BLS-Kampagne-Hockey-26-16x9-Herbst-D15-v01-A_FR_15sec_Vertont.mp4, '
    || 'BLS-Kampagne-Hockey-26-Fribourg-LED-Ribbon-FR-FINAL-Segment-A.mp4, …-Segment-B.mp4');
  perform import_demande_produit(d, 'Anneau LED');
  perform import_demande_produit(d, 'Angles match');
  perform import_demande_produit(d, 'Pub pause tiers', p_son => true, p_anneau => true);

  -- Verbier : ajout LED 6M + pub pendant le warm-up
  d := import_demande('Verbier', 'ajout_produit', 'Saison 26/27. En attente de visuel (MAB).');
  perform import_demande_produit(d, 'LED 6M');
  perform import_demande_produit(d, 'Pub warm-up', p_son => false);

  -- Leguriviera : nouvelle vidéo + anneau LED pour tous les matchs, sauf la venue du grand chef
  d := import_demande('leguriviera', 'changement_visuel',
    'Nouvelle vidéo + anneau LED pour tous les matchs sauf lors de la venue du grand chef. '
    || 'Fichiers dans Airtable : transfer-01a0d760.zip (2 fois).');
  perform import_demande_produit(d, 'Pub pause tiers', p_son => false, p_anneau => true);

  -- Leguriviera : vidéo « grand chef » pour le match du 29.09 contre Berne
  d := import_demande('leguriviera', 'changement_visuel',
    'Vidéo grand chef pour le 29.09 contre Berne. Fichier dans Airtable : LEG26_Video_SkyBox_Ravet.mp4');
  perform import_demande_produit(d, 'Pub pause tiers', 'match', array['2026-09-29']::date[], p_son => false, p_anneau => true);

  -- Gainerie Moderne : nouveau logo
  d := import_demande('Gainerie Moderne', 'changement_visuel',
    'Saison 26-27. Fichiers dans Airtable : LOGO_GM_COULEUR.jpg, LOGO_GM_COULEUR.png');
  perform import_demande_produit(d, 'Young Dragons Honorary');

  -- UPCF : LED 3M (même fichier qu'une demande déjà faite : peut-être un doublon)
  d := import_demande('UPCF', 'changement_visuel',
    'Saison 26-27. Peut-être un doublon d''une demande déjà faite (même fichier). '
    || 'Fichiers dans Airtable : Gotteron_Bandeau_UPCF_3000x800mm (jpg, pdf, png)');
  perform import_demande_produit(d, 'LED 3M');

  -- Mérat : anneau LED + action scene (laquelle ?)
  d := import_demande('Mérat', 'ajout_produit',
    'Saison 26-27. Échauffement : diffusion 2x. Action scene demandée aussi : LAQUELLE ? (à demander au Sponsoring). '
    || 'Fichiers dans Airtable : Banner_Fribourg-Gotteron_alt_12512x80px.mp4, Videowürfel_Fribourg-Gotteron_alt_1920x1080px_3.mp4');
  perform import_demande_produit(d, 'Anneau LED');
end $demandes$;

drop function if exists import_demande_produit(uuid, text, type_vente, date[], boolean, boolean, text);
drop function if exists import_demande(text, type_demande, text);

select coalesce(s.nom, d.sponsor_nom_saisi || ' (nouveau)') as "Sponsor", d.type as "Type",
       string_agg(p.nom, ', ') as "Produits"
from demandes d
left join sponsors s on s.id = d.sponsor_id
join demandes_produits dp on dp.demande_id = d.id
join produits p on p.id = dp.produit_id
where d.remarque_sponsoring like '%Reprise d''Airtable%'
group by s.nom, d.sponsor_nom_saisi, d.type, d.created_at
order by d.created_at;
