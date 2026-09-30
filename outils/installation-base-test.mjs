// Fichier d'installation complet d'une base NEUVE (ex. la base de test) :
//   node outils/installation-base-test.mjs  ->  supabase/installation_base_test.sql
// = toutes les migrations numérotées dans l'ordre, sauf celles liées aux vraies données :
//   15 (ordre de l'ancien import Airtable) et 23 (remise à zéro).
// À relancer quand une nouvelle migration est ajoutée.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'supabase');
const EXCLUES = new Set(['15', '23']);

const fichiers = fs.readdirSync(DOSSIER)
  .filter(f => /^\d{2}_.*\.sql$/.test(f) && !EXCLUES.has(f.slice(0, 2)))
  .sort();

const morceaux = fichiers.map(f => `
-- #####################################################################
-- ${f}
-- #####################################################################
${fs.readFileSync(path.join(DOSSIER, f), 'utf8').replace(/^﻿/, '')}`);

fs.writeFileSync(path.join(DOSSIER, 'installation_base_test.sql'), `-- =====================================================================
-- INSTALLATION COMPLÈTE d'une base neuve (base de TEST) — généré par outils/installation-base-test.mjs
-- À exécuter UNE fois dans le SQL Editor du projet de test (jamais sur la vraie base).
-- Contient : ${fichiers.map(f => f.slice(0, 2)).join(', ')}.
-- Ensuite : créer son compte (Authentication > Users), se mettre admin (voir en bas),
-- importer le calendrier dans l'outil (.ics), puis lancer supabase/demo_donnees_test.sql.
-- =====================================================================
${morceaux.join('\n')}

-- Après avoir créé ton compte dans Authentication > Users, lance ceci séparément :
-- update profiles set role = 'admin', nom = 'Léa Talon' where email = 'lea.talon@fribourg-gotteron.ch';
select 'Installation terminée : ${fichiers.length} fichiers.' as "Résultat";
`, 'utf8');

console.log(`supabase/installation_base_test.sql : ${fichiers.length} migrations (${fichiers.join(', ')})`);
