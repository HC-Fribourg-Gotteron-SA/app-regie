-- =====================================================================
-- 76 — Action scenes et Sponsor du match : même format que le vidéotron (1920 × 1080, ou toute autre taille en 16:9)
-- À exécuter une fois dans Supabase > SQL Editor, sur la base de TEST puis sur la vraie base.
-- Peut être exécuté plusieurs fois.
-- =====================================================================
-- Léa (17.11.2026) : Spot_Gotteron.mp4 en 2560 × 1440 était « juste » sur une Action scene et « faux » sur la Pub
-- pause tiers. La migration 32 n'avait mis les dimensions que sur les pubs vidéotron (famille temps) : les produits
-- « un seul sponsor » du vidéotron (Action scenes, Sponsor du match) n'avaient rien → aucun contrôle des dimensions.
-- Même règle partout maintenant : 1920 × 1080 attendu, tout fichier en 16:9 accepté (2560 × 1440, 4K…), le reste signalé (alerte, jamais bloquant).
-- Seulement les produits sans dimension (une dimension déjà réglée avec « ✏️ Format » est gardée).

update produits set largeur_px = 1920, hauteur_px = 1080
where support = 'Vidéotron' and famille = 'exclusif' and largeur_px is null;

select nom as "Produit", largeur_px || ' × ' || hauteur_px || ' px' as "Dimension",
       array_to_string(formats, ', ') as "Formats"
from produits
where support = 'Vidéotron' and actif and espace is distinct from 'digital'
order by ordre, nom;
