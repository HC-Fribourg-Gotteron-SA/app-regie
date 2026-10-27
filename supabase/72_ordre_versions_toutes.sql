-- =====================================================================
-- 72 — Versions à tour de rôle : TOUTES les diffusions dans l'ordre V1 → V2 → V3 → V4…
-- À exécuter sur la base de TEST puis sur la VRAIE base, APRÈS la 71. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (27.10.2026) : « c'est V1, V2, V3, etc. et on recommence ». La 71 ne corrigeait qu'AHG Cars ; ECAB (Pub pause
-- tiers) restait V2 → V1 → V3 → V4. Pour chaque diffusion qui alterne 3 versions ou plus : versions triées
-- (V1, V2, V3…), le cycle commence par la version DÉJÀ prévue au prochain match (rien ne change ce soir), puis
-- continue dans l'ordre. Les diffusions à 2 versions (FR / DE) ne sont pas touchées.

do $x$
declare
  r         record;
  v_tri     text[];
  v_prochain uuid;
  v_version text;
  v_i       int;
begin
  for r in select l.id, l.ordre_variantes from lignes_vendues l
           where l.regle_rotation = 'alterner' and coalesce(array_length(l.ordre_variantes, 1), 0) >= 3
             and l.statut not in ('annule', 'termine')
  loop
    -- V1, V2, … V10 dans l'ordre des chiffres (puis le reste par ordre alphabétique)
    select array_agg(x order by nullif(regexp_replace(x, '\D', '', 'g'), '')::int nulls last, x) into v_tri
    from unnest(r.ordre_variantes) x;

    select x.match_id into v_prochain from matchs_de_ligne(r.id) x join matchs m on m.id = x.match_id
    where m.date_heure >= date_trunc('day', now()) order by m.date_heure limit 1;

    -- version prévue au prochain match (son passage) ; sinon la première du cycle actuel
    select a.variante into v_version from passages p join assets a on a.id = p.asset_id
    where p.ligne_id = r.id and p.match_id = v_prochain;
    v_i := coalesce(array_position(v_tri, v_version), array_position(v_tri, r.ordre_variantes[1]), 1);

    update lignes_vendues set ordre_variantes = v_tri[v_i:] || v_tri[:v_i - 1], alternance_depart = v_prochain
    where id = r.id;
  end loop;
end $x$;

select s.nom as sponsor, p.nom as produit, array_to_string(l.ordre_variantes, ' → ') as "cycle (à partir du prochain match)",
       to_char(m.date_heure at time zone 'Europe/Zurich', 'DD.MM.YYYY') as prochain_match,
       a.variante as version_au_prochain_match
from lignes_vendues l
join produits p on p.id = l.produit_id
join contrats c on c.id = l.contrat_id join sponsors s on s.id = c.sponsor_id
left join matchs m on m.id = l.alternance_depart
left join passages ps on ps.ligne_id = l.id and ps.match_id = l.alternance_depart
left join assets a on a.id = ps.asset_id
where l.regle_rotation = 'alterner' and coalesce(array_length(l.ordre_variantes, 1), 0) >= 3
  and l.statut not in ('annule', 'termine')
order by s.nom, p.nom;
