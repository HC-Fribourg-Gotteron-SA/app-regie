-- =====================================================================
-- 49 — « Un match sur deux » réglable par la Régie : présence (Villars) et langue FR / DE (la Mobilière)
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (09.10.2026) : Villars doit passer un match sur deux (pas au prochain match) ; la Mobilière change de langue
-- un match sur deux (VF au prochain match). Dans Airtable, c'était écrit en remarque : l'import ne l'a pas compris.
--   1. lignes_vendues.un_match_sur_depart = 1er match où une diffusion « un match sur N » passe. matchs_de_ligne
--      compte alors les matchs de SAISON à partir de là (les matchs CHL / amicaux ne décalent rien). Sans départ :
--      ancienne règle (numéro du match).
--   2. RPC un_match_sur_deux(ligne, actif, passe_au_prochain) : règle la présence un match sur deux (+ anneau couplé).
--   3. RPC langue_un_match_sur_deux(ligne, cible, versions, premiere) : la vidéo ou l'anneau LED alterne ses versions
--      (noms des visuels dans Colosseo) ; Match du jour affiche alors « 🔁 Activer DE · désactiver FR ».

-- 1. Colonne + matchs couverts --------------------------------------------------
alter table lignes_vendues add column if not exists un_match_sur_depart uuid references matchs (id) on delete set null;

create or replace function matchs_de_ligne(p_ligne uuid)
returns table (match_id uuid)
language sql stable
set search_path = public
as $$
  with l as (
    select lv.*, c.saison_debut_id, c.saison_fin_id
    from lignes_vendues lv join contrats c on c.id = lv.contrat_id
    where lv.id = p_ligne
  ),
  bornes as (
    select l.*, sd.debut as contrat_debut, sf.fin as contrat_fin,
           (select count(*) from matchs x where x.type = 'saison'
              and x.date_heure < (select date_heure from matchs where id = l.un_match_sur_depart)) as rang_depart
    from l
    join saisons sd on sd.id = l.saison_debut_id
    join saisons sf on sf.id = l.saison_fin_id
  )
  -- vente par match : les matchs cochés
  select lm.match_id
  from bornes b join lignes_matchs lm on lm.ligne_id = b.id
  where b.type_vente = 'match'
  union
  -- vente à la saison : tous les matchs à domicile de la période
  select m.id
  from bornes b
  join matchs m on m.date_heure::date between b.contrat_debut and b.contrat_fin
  where b.type_vente = 'saison'
    and (m.type = 'saison' or (m.type = 'playoffs' and b.inclut_playoffs))
    and (b.date_debut is null or m.date_heure::date >= b.date_debut)
    and (b.date_fin   is null or m.date_heure::date <= b.date_fin)
    and (b.un_match_sur <= 1
         or (b.un_match_sur_depart is null and ((m.numero - 1) % b.un_match_sur) = 0)
         or (b.un_match_sur_depart is not null
             and ((((select count(*) from matchs x where x.type = 'saison' and x.date_heure < m.date_heure)
                    - b.rang_depart) % b.un_match_sur) + b.un_match_sur) % b.un_match_sur = 0))
$$;

drop trigger if exists lignes_passages on lignes_vendues;
create trigger lignes_passages after insert or update of
  statut, type_vente, inclut_playoffs, date_debut, date_fin, un_match_sur, regle_rotation, contrat_id,
  validee, suspendue, ordre_variantes, alternance_depart, un_match_sur_depart
  on lignes_vendues for each row execute function tg_ligne_passages();

-- 2. Présence un match sur deux -----------------------------------------------------
create or replace function un_match_sur_deux(p_ligne uuid, p_actif boolean, p_passe_au_prochain boolean default true)
returns text
language plpgsql
set search_path = public
as $$
declare
  l       lignes_vendues;
  v_dep   uuid;
begin
  if not a_role('regie', 'admin') then raise exception 'Seule la Régie peut changer la fréquence d''une diffusion'; end if;
  select * into l from lignes_vendues where id = p_ligne;
  if not found then raise exception 'Diffusion introuvable'; end if;
  if l.type_vente <> 'saison' then
    raise exception 'Diffusion vendue pour certains matchs : cochez / décochez plutôt ses matchs';
  end if;
  if p_actif then
    -- 1er match où elle passe : le prochain match de saison, ou celui d'après
    select id into v_dep from matchs
    where type = 'saison' and date_heure >= date_trunc('day', now())
    order by date_heure offset case when p_passe_au_prochain then 0 else 1 end limit 1;
    if v_dep is null then raise exception 'Plus de match de saison au calendrier'; end if;
  end if;
  update lignes_vendues set un_match_sur = case when p_actif then 2 else 1 end,
                            un_match_sur_depart = case when p_actif then v_dep end
  where id = p_ligne or id = l.ligne_couplee_id;
  return case when not p_actif then 'Passe de nouveau à chaque match'
              when p_passe_au_prochain then 'Un match sur deux : passe au prochain match'
              else 'Un match sur deux : ne passe pas au prochain match' end;
end $$;

-- 3. Langue un match sur deux (versions déjà dans Colosseo) ------------------------
-- p_cible = 'video' (la diffusion) | 'anneau' (son anneau LED couplé)
-- p_versions = [{ "variante": "FR", "nom": "La Mobilière VF" }, { "variante": "DE", "nom": "La Mobilière DE" }] ;
-- null ou [] = arrêter l'alternance. p_premiere = version du prochain match.
create or replace function langue_un_match_sur_deux(p_ligne uuid, p_cible text, p_versions jsonb, p_premiere text)
returns text
language plpgsql
set search_path = public
as $$
declare
  l       lignes_vendues;
  v_cible uuid;
  v       jsonb;
  v_asset uuid;
  v_ordre text[];
begin
  if not a_role('regie', 'admin') then raise exception 'Seule la Régie peut régler les versions d''une diffusion'; end if;
  select * into l from lignes_vendues where id = p_ligne;
  if not found then raise exception 'Diffusion introuvable'; end if;
  v_cible := case when p_cible = 'anneau' then l.ligne_couplee_id else p_ligne end;
  if v_cible is null then raise exception 'Cette diffusion n''a pas d''anneau LED'; end if;

  if p_versions is null or jsonb_array_length(p_versions) < 2 then
    update lignes_vendues set regle_rotation = 'unique', ordre_variantes = null, alternance_depart = null where id = v_cible;
    return 'Plus d''alternance de langue';
  end if;

  for v in select * from jsonb_array_elements(p_versions) loop
    if coalesce(trim(v->>'variante'), '') = '' or coalesce(trim(v->>'nom'), '') = '' then
      raise exception 'Chaque version a besoin d''une langue et d''un nom';
    end if;
    -- visuel déjà connu sous ce nom : il reçoit la langue ; sinon on le crée (sans fichier, comme l'import)
    select id into v_asset from assets
    where ligne_id = v_cible and lower(trim(nom_visuel)) = lower(trim(v->>'nom')) and statut in ('valide', 'archive')
    order by (statut = 'valide') desc, version desc limit 1;
    if v_asset is null then
      insert into assets (ligne_id, nom_visuel, variante) values (v_cible, trim(v->>'nom'), upper(trim(v->>'variante')))
      returning id into v_asset;
    else
      update assets set variante = upper(trim(v->>'variante')) where id = v_asset;
    end if;
    update assets set statut = 'valide' where id = v_asset and statut <> 'valide';
  end loop;

  select array_agg(x order by (x = upper(trim(p_premiere))) desc, n)
  into v_ordre
  from (select upper(trim(e->>'variante')) as x, n from jsonb_array_elements(p_versions) with ordinality t(e, n)) s;

  update lignes_vendues set
    regle_rotation = 'alterner', ordre_variantes = v_ordre,
    alternance_depart = (select x.match_id from matchs_de_ligne(v_cible) x join matchs m on m.id = x.match_id
                         where m.date_heure >= date_trunc('day', now()) order by m.date_heure limit 1)
  where id = v_cible;
  return format('Un match sur deux : %s au prochain match', v_ordre[1]);
end $$;

select 'Migration 49 OK : un match sur deux (présence et langue) réglable par la Régie' as "Résultat";
