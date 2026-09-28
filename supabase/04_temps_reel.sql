-- =====================================================================
-- Outil Sponsoring <-> Régie — 04_temps_reel.sql
-- Active la mise à jour en direct de la liste des demandes
-- (quand un collègue crée ou traite une demande, l'écran se rafraîchit seul).
-- =====================================================================
alter publication supabase_realtime add table demandes;
