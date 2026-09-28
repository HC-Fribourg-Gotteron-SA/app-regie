-- =====================================================================
-- 19 — Dossier par sponsor : tous les documents reçus pour une entreprise
-- À exécuter une fois dans Supabase > SQL Editor, après 01 → 18.
-- =====================================================================
-- Chaque fichier reçu (joint à une demande, ou déposé directement sur la page
-- du sponsor) est inscrit ici : on garde une trace de qui l'a donné et quand.
-- Les fichiers restent dans le bucket « assets » (pas de copie) :
--   demandes/<demande_id>/<produit_id>/<role>__<fichier>   (joints à une demande)
--   demandes/<demande_id>/<fichier>                         (autres fichiers d'une demande)
--   sponsors/<sponsor_id>/<horodatage>__<fichier>          (déposés sur la page du sponsor)

create table if not exists documents_sponsors (
  id             uuid primary key default gen_random_uuid(),
  sponsor_id     uuid references sponsors (id) on delete cascade,  -- null tant qu'un nouveau sponsor n'est pas créé
  demande_id     uuid references demandes (id) on delete set null,
  produit_id     uuid references produits (id),
  role           text not null default 'autre',   -- visuel | anneau | autre
  nom            text not null,                   -- nom du fichier tel que reçu
  storage_path   text not null unique,
  mime           text,
  taille_octets  bigint,
  notes          text,
  depose_par     uuid references profiles (id) default auth.uid(),
  depose_le      timestamptz not null default now(),
  check (sponsor_id is not null or demande_id is not null)
);
create index if not exists documents_sponsors_sponsor on documents_sponsors (sponsor_id);
create index if not exists documents_sponsors_demande on documents_sponsors (demande_id);

alter table documents_sponsors enable row level security;
drop policy if exists documents_sponsors_lecture on documents_sponsors;
drop policy if exists documents_sponsors_insert on documents_sponsors;
drop policy if exists documents_sponsors_update on documents_sponsors;
drop policy if exists documents_sponsors_delete on documents_sponsors;
create policy documents_sponsors_lecture on documents_sponsors for select to authenticated using (est_membre());
create policy documents_sponsors_insert on documents_sponsors for insert to authenticated
  with check (a_role('sponsoring', 'regie', 'admin'));
create policy documents_sponsors_update on documents_sponsors for update to authenticated
  using (a_role('sponsoring', 'regie', 'admin')) with check (a_role('sponsoring', 'regie', 'admin'));
create policy documents_sponsors_delete on documents_sponsors for delete to authenticated using (a_role('admin'));

-- Nouveau sponsor : quand la demande est rattachée au sponsor créé, ses documents le suivent
create or replace function tg_demande_sponsor_documents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sponsor_id is not null and new.sponsor_id is distinct from old.sponsor_id then
    update documents_sponsors set sponsor_id = new.sponsor_id where demande_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists demandes_sponsor_documents on demandes;
create trigger demandes_sponsor_documents after update of sponsor_id on demandes
  for each row execute function tg_demande_sponsor_documents();

-- Reprise des fichiers déjà joints aux demandes
insert into documents_sponsors (sponsor_id, demande_id, produit_id, role, nom, storage_path,
                                mime, taille_octets, depose_par, depose_le)
select d.sponsor_id, d.id,
       case when array_length(p.parts, 1) = 4 and p.parts[3] ~ '^[0-9a-f-]{36}$'
            then p.parts[3]::uuid end,
       case when p.fichier ~ '^(visuel|anneau)__' then split_part(p.fichier, '__', 1) else 'autre' end,
       regexp_replace(p.fichier, '^(visuel|anneau)__', ''),
       o.name, o.metadata->>'mimetype', (o.metadata->>'size')::bigint, d.cree_par, o.created_at
from storage.objects o
cross join lateral (select string_to_array(o.name, '/') as parts,
                           (string_to_array(o.name, '/'))[array_length(string_to_array(o.name, '/'), 1)] as fichier) p
join demandes d on d.id::text = p.parts[2]
where o.bucket_id = 'assets' and p.parts[1] = 'demandes'
  and array_length(p.parts, 1) in (3, 4)
  and p.fichier <> '.emptyFolderPlaceholder'
on conflict (storage_path) do nothing;

select count(*) || ' documents dans les dossiers sponsors ('
       || count(*) filter (where sponsor_id is null) || ' en attente d''un nouveau sponsor).' as "Résultat"
from documents_sponsors;
