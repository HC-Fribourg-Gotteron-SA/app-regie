// Lettre de slide (A, B, C…) des sponsors des slides, reprise des feuilles Airtable (19.10.2026, demandé par Léa).
//   node outils/lettres-slides.mjs  →  supabase/58_lettres_slides.sql
// Mêmes noms de sponsors que l'import (outils/import-airtable.mjs : nettoyage + ALIAS recopiés ici).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'import-airtable');

function lireCsv(nom) {
  const texte = fs.readFileSync(path.join(DOSSIER, nom), 'utf8').replace(/^﻿/, '');
  const lignes = [];
  let champ = '', ligne = [], guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [entete, ...donnees] = lignes.filter(l => l.some(v => v.trim()));
  return donnees.map(l => Object.fromEntries(entete.map((h, i) => [h.trim(), (l[i] ?? '').replace(/\s+/g, ' ').trim()])));
}

// --- recopié de import-airtable.mjs (même nom de sponsor que dans la base) ---
const cle = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)/g, ' ').replace(/\b(sa|sarl|ag|gmbh|s a)\b/g, ' ').replace(/[^a-z0-9]/g, '');
const ALIAS = {
  net: 'Net+', netplus: 'Net+', mediaparcfrapp: 'Media Parc Frapp', frapp: 'Media Parc Frapp',
  zurichassurance: 'Zurich Assurances', zurichassurances: 'Zurich Assurances',
  xxlgroup: 'XXL Group', xxlartprint: 'XXL Group',
  interprogruyere: 'Interprofession du Gruyère', inteprofgruyere: 'Interprofession du Gruyère',
  radiofr: 'Radio Fribourg', radiofribourg: 'Radio Fribourg',
  hcfg: 'HCFG', hcfgbcfarena: 'HCFG', nationalleague: 'National League',
  winiger: 'Winiger', winniger: 'Winiger', dubeyconstruction: 'Dubey Constructions', dubeyconstructions: 'Dubey Constructions',
  lacilla: 'Garage Lacilla', garagelacilla: 'Garage Lacilla', azmvente: 'AZM Ventes', azmventes: 'AZM Ventes',
  propaysage: 'Pro Paysages', propaysages: 'Pro Paysages',
  lespetitesbulloises: 'Les Petites Bulloises (KDB Buchs)', lespetitesbulloisekdbbuchs: 'Les Petites Bulloises (KDB Buchs)',
  mcdonald: "McDonald's", mcdonalds: "McDonald's", berset: 'Garage Berset', garageberset: 'Garage Berset',
  meublekolly: 'Meubles Kolly', meubleskolly: 'Meubles Kolly', morand: 'Morand Constructions', morandconstructions: 'Morand Constructions',
  mslaser: 'MS Laser Technologie', mslasertechnologie: 'MS Laser Technologie',
  ams: 'AMS Construction Métallique', amsconsutructionmetallique: 'AMS Construction Métallique',
  volery: 'Volery Frères', voleryfreres: 'Volery Frères', jouezsport: 'Jouez Sport',
  sanitastroesch: 'Sanitas Troesch', protectservice: "Protect'Service", gyso: 'Gyso', infoteam: 'InfoTeam',
  lamobiliere: 'La Mobilière', frienergie: 'Frienergie', bh: 'BH Sàrl', ochsnerhockey: 'Ochsner Hockey',
};
function nomSponsor(brut) {
  let nom = brut.replace(/\((logo ok|logo route)[^)]*\)/gi, '').replace(/^\s*-\s*/, '').trim();
  if (nom.includes('->')) nom = nom.split('->').pop().trim();
  const k = cle(nom);
  return k ? ALIAS[k] || nom : null;
}
// ---------------------------------------------------------------------------

const PRODUITS = [
  ['Slide Ladies.csv', 'Slide Ladies', { legend: 'Ladies Legend Members', ailes: 'Ladies Ailes du Dragon', founder: 'Ladies Founder Members' }],
  ['Slide Young Dragons.csv', 'Slides Young Dragons', { golden: 'Young Dragons Golden', active: 'Young Dragons Active',
    honorary: 'Young Dragons Honorary', soutien: 'Young Dragons Club de soutien' }],
];
const valeurs = new Map();   // produit|sponsor -> lettre (la 1re trouvée)
for (const [fichier, col, table] of PRODUITS) {
  for (const r of lireCsv(fichier)) {
    if (!r.Entreprise || /banner\s*hcfg/i.test(r.Entreprise)) continue;
    const produit = Object.entries(table).find(([motif]) => new RegExp(motif, 'i').test(`${r[col]} ${r.Type}`))?.[1];
    const lettre = (r.Type.match(/^([A-Z])\s/) || [])[1];
    const nom = nomSponsor(r.Entreprise);
    if (!produit || !lettre || !nom) continue;
    const k = `${produit}|${nom}`;
    if (!valeurs.has(k)) valeurs.set(k, { produit, nom, lettre });
  }
}
const q = (t) => `'${t.replace(/'/g, "''")}'`;
const sql = `-- =====================================================================
-- 58 — Slides : lettre de la slide (A, B, C…) de chaque sponsor, comme dans Airtable (19.10.2026, option A de Léa)
-- À exécuter sur la base de TEST puis sur la vraie base. Peut être exécuté plusieurs fois.
-- (Généré par node outils/lettres-slides.mjs depuis les feuilles Airtable Slide Ladies / Slide Young Dragons.)
-- =====================================================================
-- La Régie choisit la slide sur la fiche (colonne « Slide ») ; nouveau sponsor = « à placer » (vide).
alter table lignes_vendues add column if not exists slide text;

-- Lettres d'Airtable : seulement les diffusions encore sans lettre (ne remplace pas un choix fait dans l'outil)
update lignes_vendues l
set slide = v.lettre
from (values
${[...valeurs.values()].map(v => `  (${q(v.produit)}, ${q(v.nom)}, ${q(v.lettre)})`).join(',\n')}
) as v(produit, sponsor, lettre), produits p, contrats c, sponsors s
where p.id = l.produit_id and p.nom = v.produit
  and c.id = l.contrat_id and s.id = c.sponsor_id
  and (lower(sans_accent(s.nom)) = lower(sans_accent(v.sponsor))
       or exists (select 1 from unnest(s.alias) a where lower(sans_accent(a)) = lower(sans_accent(v.sponsor))))
  and l.slide is null and l.statut not in ('annule', 'termine');

-- Résultat : logos par slide (et ceux encore « à placer »)
select p.nom as "Produit", coalesce(l.slide, 'à placer') as "Slide", count(*) as "Logos",
       string_agg(s.nom, ', ' order by s.nom) as "Sponsors"
from lignes_vendues l join produits p on p.id = l.produit_id join contrats c on c.id = l.contrat_id
join sponsors s on s.id = c.sponsor_id
where p.famille = 'slide' and l.statut not in ('annule', 'termine')
group by p.ordre, p.nom, l.slide
order by p.ordre, p.nom, l.slide nulls last;
`;
fs.writeFileSync(path.join(RACINE, 'supabase', '58_lettres_slides.sql'), sql);
console.log(`supabase/58_lettres_slides.sql : ${valeurs.size} sponsors avec une lettre`);
