-- =====================================================================
-- 56 — Parrainages joueurs actuels (capture d'Airtable envoyée par Léa le 16.10.2026)
-- À exécuter APRÈS la 55, sur la base de TEST puis sur la vraie base. Peut être exécuté plusieurs fois.
-- =====================================================================
-- Sponsor repris s'il existe déjà (nom ou alias, sans accents ni majuscules), sinon créé.
-- Cases « c'est mis » laissées vides : à cocher sur la page Parrainages joueurs.
do $x$
declare
  r          record;
  v_sponsor  uuid;
  v_joueur   uuid;
  v_produit  uuid := (select id from produits where nom = 'Parrainage joueur');
begin
  if v_produit is null then raise exception 'Exécutez d''abord la migration 55'; end if;
  for r in select * from (values
    ('Solsystems', 39), ('Kingnature', 37), ('Laiterie-Fromagerie d''Arconciel', 97),
    ('Net26', 23), ('Marmy', 9), ('HKM', 93)
  ) as v(sponsor, numero) loop
    select id into v_sponsor from sponsors s
    where lower(sans_accent(s.nom)) = lower(sans_accent(r.sponsor))
       or exists (select 1 from unnest(s.alias) a where lower(sans_accent(a)) = lower(sans_accent(r.sponsor)))
    order by s.created_at limit 1;
    if v_sponsor is null then
      insert into sponsors (nom) values (r.sponsor) returning id into v_sponsor;
    end if;
    select id into v_joueur from joueurs where numero = r.numero and actif;
    if v_joueur is null then raise exception 'Joueur n° % introuvable', r.numero; end if;
    insert into digital_elements (produit_id, sponsor_id, joueur_id, remarque)
    select v_produit, v_sponsor, v_joueur, 'Repris d''Airtable'
    where not exists (select 1 from digital_elements e
                      where e.produit_id = v_produit and e.joueur_id = v_joueur and e.sponsor_id = v_sponsor);
  end loop;
end $x$;

select j.numero as "N°", j.prenom || ' ' || j.nom as "Joueur", s.nom as "Parrain"
from digital_elements e join joueurs j on j.id = e.joueur_id join sponsors s on s.id = e.sponsor_id
where e.produit_id = (select id from produits where nom = 'Parrainage joueur') and e.statut = 'actif'
order by j.numero;
