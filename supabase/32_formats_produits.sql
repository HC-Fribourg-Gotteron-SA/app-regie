-- =====================================================================
-- 32 — Formats des produits (media kit HCFG sur brandboard)
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Formats donnés par Léa le 02.10.2026 (media kit https://hcfg.brandboard.app/media-kit-hcfg) :
--   Vidéotron (full screen)  1920 × 1080 px · PNG, JPEG · MP4, MOV
--   Angles                     256 × 558 px · PNG, JPEG · MP4, MOV
--   Anneau LED               12512 × 80 px  · MP4, JPEG
--   LED 3M                     300 × 80 px  · PNG, JPEG   (souvent un logo seul : accepté, la Régie adapte)
--   LED 6M                     600 × 80 px  · PNG, JPEG   (idem)
--   LED Sportcafé (9M)        1344 × 96 px  · PNG, JPEG
-- Les colonnes existaient déjà (largeur_px, hauteur_px, formats, duree_max_s) ; on ajoute une remarque.
-- Le contrôle reste une ALERTE (jamais un blocage), dans la demande et dans la fenêtre de traitement.
-- La Régie peut ensuite modifier les formats sur la fiche de chaque produit (« ✏️ Format »).

alter table produits add column if not exists remarque_format text;

update produits set largeur_px = 1920, hauteur_px = 1080, formats = '{png,jpg,jpeg,mp4,mov}'
where famille = 'temps' and support = 'Vidéotron';

update produits set largeur_px = 256, hauteur_px = 558, formats = '{png,jpg,jpeg,mp4,mov}'
where nom = 'Angles match';

update produits set largeur_px = 12512, hauteur_px = 80, formats = '{mp4,jpg,jpeg}'
where nom in ('Anneau LED', 'Anneau LED pause tiers');

update produits set largeur_px = 300 * coalesce(emplacements_requis, 1), hauteur_px = 80, formats = '{png,jpg,jpeg}',
       remarque_format = 'Souvent un logo seul : accepté, la Régie l''adapte au format.'
where nom in ('LED 3M', 'LED 6M');

update produits set largeur_px = 1344, hauteur_px = 96, formats = '{png,jpg,jpeg}'
where nom like 'LED Sportcaf%';

select nom as "Produit", largeur_px || ' × ' || hauteur_px || ' px' as "Dimension",
       array_to_string(formats, ', ') as "Formats", coalesce(remarque_format, '') as "Remarque"
from produits
where largeur_px is not null and actif
order by ordre, nom;
