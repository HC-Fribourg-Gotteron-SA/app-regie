-- =====================================================================
-- 50 — Langue du prochain match (un match sur deux) : la Régie la choisit directement
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS la 49, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (09.10.2026) : la Mobilière était annoncée en allemand au prochain match alors que c'est la VF, sans moyen
-- de corriger. langue_au_prochain_match(ligne, langue) : la langue donnée passe au prochain match de la diffusion,
-- puis les autres à tour de rôle (ordre_variantes réordonné, alternance_depart = prochain match).

create or replace function langue_au_prochain_match(p_ligne uuid, p_variante text)
returns text
language plpgsql
set search_path = public
as $$
declare
  l       lignes_vendues;
  v_ordre text[];
  v_prochain uuid;
begin
  if not a_role('regie', 'admin') then raise exception 'Seule la Régie peut changer la langue d''une diffusion'; end if;
  select * into l from lignes_vendues where id = p_ligne;
  if not found then raise exception 'Diffusion introuvable'; end if;
  if l.regle_rotation <> 'alterner' or coalesce(array_length(l.ordre_variantes, 1), 0) < 2 then
    raise exception 'Cette diffusion ne change pas de langue un match sur deux';
  end if;
  if not upper(trim(p_variante)) = any (l.ordre_variantes) then
    raise exception 'Langue inconnue pour cette diffusion : %', p_variante;
  end if;

  -- même cycle, en commençant par la langue choisie
  select array_agg(l.ordre_variantes[1 + ((i - 1 + array_position(l.ordre_variantes, upper(trim(p_variante))) - 1)
                                          % array_length(l.ordre_variantes, 1))] order by i)
  into v_ordre
  from generate_series(1, array_length(l.ordre_variantes, 1)) i;

  select x.match_id into v_prochain
  from matchs_de_ligne(p_ligne) x join matchs m on m.id = x.match_id
  where m.date_heure >= date_trunc('day', now()) order by m.date_heure limit 1;

  update lignes_vendues set ordre_variantes = v_ordre, alternance_depart = v_prochain where id = p_ligne;
  return format('%s au prochain match, puis un match sur deux', v_ordre[1]);
end $$;

select 'Migration 50 OK : langue du prochain match réglable' as "Résultat";
