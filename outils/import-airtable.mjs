// Import des feuilles Airtable (CSV) -> fichier SQL à exécuter dans Supabase > SQL Editor.
//   node outils/import-airtable.mjs
// Lit import-airtable/*.csv, écrit supabase/import_airtable_2026-27.sql (+ import_airtable_annuler.sql)
// et affiche un résumé (sponsors regroupés, lignes ignorées).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'import-airtable');
const MARQUE = 'Import Airtable 26/27';

// ---------------------------------------------------------------------
// CSV (guillemets, virgules et retours à la ligne dans les champs)
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Sponsors : nettoyage des noms et regroupement des variantes
// ---------------------------------------------------------------------
const cle = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)/g, ' ').replace(/\b(sa|sarl|ag|gmbh|s a)\b/g, ' ').replace(/[^a-z0-9]/g, '');

// variantes connues -> nom retenu
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

const sponsors = new Map();   // clé -> { nom, variantes: Set }
function sponsor(brut) {
  let nom = brut.replace(/\((logo ok|logo route)[^)]*\)/gi, '').replace(/^\s*-\s*/, '').trim();
  if (nom.includes('->')) nom = nom.split('->').pop().trim();          // « macmac -> Camping Muntelier »
  if (!nom) return null;
  const k = cle(nom);
  if (!k) return null;
  const retenu = ALIAS[k] || nom;
  const kr = cle(retenu) || k;
  if (!sponsors.has(kr)) sponsors.set(kr, { nom: retenu, variantes: new Set() });
  if (brut.trim() !== sponsors.get(kr).nom) sponsors.get(kr).variantes.add(brut.trim());
  return sponsors.get(kr).nom;
}
const estBanner = (t) => /banner\s*hcfg/i.test(t || '');

// ---------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------
const secondes = (t) => {
  const p = (t || '').split(':').map(Number);
  if (!t || p.some(isNaN)) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
};
const oui = (t) => /^oui$/i.test((t || '').trim());
const valide = (t) => /checked/i.test(t || '');
const MOIS = { janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8,
               septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12 };
function dateDe(t) {
  let m = (t || '').match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i);
  if (m && MOIS[m[2].toLowerCase()]) return `${m[3]}-${String(MOIS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = (t || '').match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const lignes = [];     // diffusions à créer
const ignores = [];    // ce qui n'est pas importé (pour le résumé)
// « ordre » = clé de l'ordre de diffusion dans le produit = ordre des lignes dans les feuilles Airtable
let compteur = 0;
const APRES = 1e6;     // placé après les lignes de la feuille du produit
function ajouter(l) {
  const consignes = [...new Set((l.consignes || []).filter(Boolean))];
  lignes.push({ type: 'saison', dates: [], empl: [], visuels: [], son: false, anneau: false, occ: 1, valide: true,
                ordre: ++compteur, ...l, consignes });
}
// « ⏳ Nouveau visuel attendu » : repéré dans les remarques (comme la migration 18)
const sansAccent = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const attendu = (consignes) => /en attente|en attende|nouveaux? visuels? a mettre|nouveau arrive|modifier logo|changer logo/i
  .test(sansAccent(consignes.join(' ')));
// Emplacements réservés au club : NORD-OUEST = positions 10 à 14 des anneaux A (bande 3M) et C (bande 6M)
const reserveClub = (anneau, position) => ['A', 'C'].includes(anneau) && position >= 10 && position <= 14;

// ---------------------------------------------------------------------
// LED 3M / LED 6M : une ligne CSV = un emplacement (ordre = position dans l'anneau)
// ---------------------------------------------------------------------
function led(fichier, colZone, bande6M) {
  const rows = lireCsv(fichier);
  const pos = {};
  const cases = rows.map(r => {
    const anneau = (Object.values(r)[0].match(/LED\s+([A-D])/i) || [])[1];
    pos[anneau] = (pos[anneau] || 0) + 1;
    const vide = !r.Entreprise || estBanner(r.Entreprise);
    return { anneau, position: pos[anneau], zone: r[colZone], nom: vide ? null : sponsor(r.Entreprise),
             remarques: [r.Remarques || r.Remarque, r['Copie de Remarques'] || r['Copie de Remarque']], valide: valide(r['Validation saison 26/27']) };
  });
  for (const [a, n] of Object.entries(pos)) if (n !== 37) ignores.push(`${fichier} : anneau ${a} a ${n} lignes (37 attendues) — positions à vérifier`);
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!c.nom) continue;
    const suivante = cases[i + 1];
    const paire = bande6M && suivante && suivante.nom === c.nom && suivante.anneau === c.anneau;
    // LED : toutes « À l'écran » (décidé par Léa, migration 21), sauf le contenu du club et les emplacements
    // réservés au club, qui gardent la case « Validation saison 26/27 » d'Airtable
    ajouter({ sponsor: c.nom, produit: paire ? 'LED 6M' : 'LED 3M',
              empl: paire ? [`${c.anneau}:${c.position}`, `${c.anneau}:${suivante.position}`] : [`${c.anneau}:${c.position}`],
              valide: c.valide || (c.nom !== 'HCFG' && !reserveClub(c.anneau, c.position)),
              consignes: c.remarques });
    if (paire) i++;
  }
}
led('LED 3M.csv', 'LED 3M emplacement', false);
led('LED 6M.csv', 'Emplacement patinoire', true);

// ---------------------------------------------------------------------
// Emplacement au match (lu avant la Pub pause tiers : ces sponsors n'ont pas de ligne « saison »)
// ---------------------------------------------------------------------
const auMatch = new Set();
for (const r of lireCsv('Emplacement au match.csv')) {
  if (!r.Entreprise) continue;
  const produit = /sponsor/i.test(r.Produits) ? 'Sponsor du match' : /pause/i.test(r.Produits) ? 'Pub pause tiers' : null;
  if (!produit) { ignores.push(`Emplacement au match : produit inconnu « ${r.Produits} » (${r.Entreprise})`); continue; }
  const nom = sponsor(r.Entreprise);
  auMatch.add(`${nom}|${produit}`);
  const cellules = Object.entries(r).filter(([k]) => /^match|playoff/i.test(k)).map(([, v]) => v).filter(Boolean);
  const dates = [], precisions = new Set();
  for (const v of cellules) {
    const d = dateDe(v);
    if (d) dates.push(d); else ignores.push(`Emplacement au match : date illisible « ${v} » (${nom})`);
    const spot = v.split(' - ').slice(1).join(' ').replace(/^-\s*/, '').trim();
    if (spot) precisions.add(spot);
  }
  if (!dates.length) { ignores.push(`Emplacement au match : aucune date pour ${nom}`); continue; }
  // au match : après les lignes de la feuille du produit, sauf s'il y a une place dans cette feuille (voir Pub pause tiers)
  ajouter({ sponsor: nom, produit, type: 'match', dates, consignes: [r.Remarques, ...precisions], ordre: APRES + ++compteur });
}

// ---------------------------------------------------------------------
// Pub pause tiers (les « Youngs … / Ladies … » sont les vidéos des slides : calculées par l'outil)
// ---------------------------------------------------------------------
for (const r of lireCsv('Pub pause tiers.csv')) {
  if (!r.Entreprise) continue;
  if (/^(youngs|ladies|ydc)/i.test(r.Visuels)) { ignores.push(`Pub pause tiers : « ${r.Visuels} » = vidéo des slides (calculée par l'outil)`); continue; }
  const nom = sponsor(r.Entreprise);
  if (auMatch.has(`${nom}|Pub pause tiers`)) {
    // sponsor au match : on reporte durée / son / anneau (et le visuel s'il n'y a qu'une diffusion) sur ses lignes au match
    const auxMatchs = lignes.filter(l => l.sponsor === nom && l.produit === 'Pub pause tiers' && l.type === 'match');
    const place = ++compteur;   // sa position dans la feuille Pub pause tiers
    for (const l of auxMatchs) {
      Object.assign(l, { duree: secondes(r['Durée (h:mm:ss)']), son: oui(r.Son), anneau: oui(r['Anneau Led']), ordre: place });
      if (auxMatchs.length === 1) l.visuels = [r.Visuels];
    }
    ignores.push(`Pub pause tiers : ${nom} est au match (feuille Emplacement au match) — durée, son et anneau reportés sur ses matchs`);
    continue;
  }
  const desactive = /d[ée]sactiv/i.test(r['Validation régie']);
  ajouter({ sponsor: nom, produit: 'Pub pause tiers', duree: secondes(r['Durée (h:mm:ss)']), son: oui(r.Son),
            anneau: oui(r['Anneau Led']), visuels: [r.Visuels], suspendue: desactive,
            motif: desactive ? [r['Validation régie'], r.Remarques].filter(Boolean).join(' — ') : null,
            valide: valide(r['Validation saison 26/27']), consignes: [desactive ? null : r.Remarques] });
}

// ---------------------------------------------------------------------
// Autres produits « temps »
// ---------------------------------------------------------------------
for (const r of lireCsv('LED match.csv')) {
  if (!r.Entreprise) continue;
  const desactive = /d[ée]sactiv/i.test(r['Validation régie']);
  ajouter({ sponsor: sponsor(r.Entreprise), produit: 'Anneau LED', duree: secondes(r['Durée']), visuels: [r.Visuels],
            suspendue: desactive, motif: desactive ? [r['Validation régie'], r.Remarques].filter(Boolean).join(' — ') : null,
            valide: valide(r['Validation saison 26/27']), consignes: [desactive ? null : r.Remarques] });
}
for (const r of lireCsv('Angles match.csv')) {
  if (!r.Entreprise) continue;
  const d = secondes(r['Durée vidéo']), t = secondes(r['Durée totale playlist']);
  ajouter({ sponsor: sponsor(r.Entreprise), produit: 'Angles match', duree: d, occ: d && t ? Math.max(1, Math.round(t / d)) : 1,
            visuels: [r.Visuels], valide: valide(r['Validation saison 26/27']), consignes: [r.Remarques, r['Saison/Match']] });
}
for (const r of lireCsv('Pub après Warmup.csv')) {
  if (!r.Entreprise) continue;
  ajouter({ sponsor: sponsor(r.Entreprise), produit: 'Pub après warm-up', son: oui(r.Son), visuels: [r.Visuel],
            valide: valide(r['Validation saison 26/27']), consignes: [r.Remarque] });
}
for (const r of lireCsv('LED Sportcafé.csv')) {
  if (!r.Entreprise) continue;
  ajouter({ sponsor: sponsor(r.Entreprise), produit: 'LED Sportcafé (9M)', visuels: [r.Visuels],
            valide: valide(r['Validation saison 26/27']), consignes: [r['Field 2']] });
}
// Top Ring / Bottom Ring : une feuille chacun (l'entreprise est parfois dans « Field 3 »)
for (const [fichier, produit] of [['Top Ring.csv', 'Top Ring'], ['Bottom Ring.csv', 'Bottom Ring']]) {
  for (const r of lireCsv(fichier)) {
    const e = r.Entreprise || r['Field 3'];
    if (e) ajouter({ sponsor: sponsor(e), produit, consignes: [r.Remarques || r.Remarque] });
  }
}

// ---------------------------------------------------------------------
// Action scenes : une scène = un produit
// ---------------------------------------------------------------------
for (const r of lireCsv('Action scene.csv')) {
  if (!r.Entreprise) continue;
  // pièces jointes Airtable : « nom.mp4 (https://…) » -> on garde le nom (les liens expirent)
  const visuels = (r['Vidéos'] || '').replace(/\s*\(https?:\/\/[^)]*\)/g, '').split(',').map(v => v.trim()).filter(Boolean);
  for (const e of r.Entreprise.split(',')) {
    ajouter({ sponsor: sponsor(e), produit: `Action scene – ${r.Produits}`, visuels,
              valide: valide(r['Validation saison 26/27']), consignes: [r.Remarque] });
  }
}

// ---------------------------------------------------------------------
// Slides Ladies / Young Dragons (un sponsor par produit)
// ---------------------------------------------------------------------
function slides(fichier, colProduit, table) {
  const vus = new Set();
  for (const r of lireCsv(fichier)) {
    if (!r.Entreprise || estBanner(r.Entreprise)) continue;
    const type = `${r[colProduit]} ${r.Type}`;
    const produit = Object.entries(table).find(([motif]) => new RegExp(motif, 'i').test(type))?.[1];
    if (!produit) { ignores.push(`${fichier} : type inconnu « ${type} »`); continue; }
    const nom = sponsor(r.Entreprise);
    if (vus.has(`${nom}|${produit}`)) { ignores.push(`${fichier} : ${nom} en double sur ${produit} (importé une fois)`); continue; }
    vus.add(`${nom}|${produit}`);
    ajouter({ sponsor: nom, produit, valide: valide(r['Validation saison 26/27']), consignes: [r.Remarques] });
  }
}
slides('Slide Ladies.csv', 'Slide Ladies', { legend: 'Ladies Legend Members', ailes: 'Ladies Ailes du Dragon', founder: 'Ladies Founder Members' });
slides('Slide Young Dragons.csv', 'Slides Young Dragons', { golden: 'Young Dragons Golden', active: 'Young Dragons Active',
  honorary: 'Young Dragons Honorary', soutien: 'Young Dragons Club de soutien' });

// ---------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------
const q = (v) => v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const tableau = (a, type) => a.length ? `array[${a.map(q).join(', ')}]::${type}[]` : `'{}'::${type}[]`;

// Ordre de diffusion dans chaque produit = ordre des lignes dans les feuilles Airtable (« ordre »).
// L'anneau LED d'une Pub pause tiers a sa propre ligne (produit technique) : rangé dans l'ordre des Pub pause tiers.
const parProduitOrdre = new Map();
for (const l of [...lignes].sort((a, b) => a.ordre - b.ordre)) {
  const n = (parProduitOrdre.get(l.produit) || 0) + 1;
  parProduitOrdre.set(l.produit, n);
  l.priorite = n;
}
let rangAnneau = 0;
for (const l of [...lignes].filter(l => l.anneau && l.produit === 'Pub pause tiers').sort((a, b) => a.ordre - b.ordre)) {
  l.prioriteAnneau = ++rangAnneau;
}
for (const l of lignes) l.attendu = attendu(l.consignes);

const sql = [];
// Le SQL Editor de Supabase exécute les instructions une par une : tout le travail est donc fait
// dans UN bloc « do $$ … $$ » (atomique : s'il échoue, rien n'est enregistré), sans table temporaire.
sql.push(`-- =====================================================================
-- Import des données Airtable (saison 2026-27) — généré par outils/import-airtable.mjs
-- À exécuter UNE fois dans Supabase > SQL Editor, sur une base vidée (23_remise_a_zero.sql),
-- après les migrations 01 → 26. Pour tout retirer : supabase/import_airtable_annuler.sql
-- ${sponsors.size} sponsors, ${lignes.length} diffusions.
-- Intègre directement : ordre de diffusion = ordre des feuilles, « À l'écran » (LED toutes à l'écran
-- sauf club), anneau de la Pub pause tiers compris dans la pub, « ⏳ visuel attendu », historique
-- des matchs passés (pour la comparaison de Match du jour).
-- =====================================================================

create table if not exists imports_donnees (nom text primary key, le timestamptz not null default now());
alter table imports_donnees enable row level security;
create table if not exists import_remarques (message text);
alter table import_remarques enable row level security;

-- Une diffusion
create or replace function import_airtable_ligne(p_sponsor text, p_produit text, p_type type_vente, p_duree int, p_son boolean,
                                 p_occ int, p_consignes text, p_suspendue boolean, p_motif text, p_dates date[],
                                 p_empl text[], p_visuels text[], p_anneau boolean,
                                 p_validee boolean, p_attendu boolean, p_priorite int, p_priorite_anneau int)
returns void language plpgsql as $$
declare
  v_sponsor uuid; v_produit produits; v_contrat uuid; v_ligne uuid; v_anneau uuid; v_saison uuid;
  v_nb int; e text; i int := 0;
begin
  select id into v_sponsor from sponsors where lower(nom) = lower(p_sponsor);
  select * into v_produit from produits where nom = p_produit;
  if v_produit.id is null then
    insert into import_remarques values ('Produit inconnu : ' || p_produit || ' (' || p_sponsor || ')'); return;
  end if;
  select id into v_saison from saisons where active limit 1;
  v_contrat := contrat_pour(v_sponsor, v_saison);

  insert into lignes_vendues (contrat_id, produit_id, type_vente, duree_s, avec_son, occurrences, consignes,
                              suspendue, motif_suspension, statut, validee, visuel_attendu, priorite)
  values (v_contrat, v_produit.id, p_type, p_duree, p_son, p_occ, p_consignes, p_suspendue, p_motif, 'vendu',
          p_validee, p_attendu, p_priorite)
  returning id into v_ligne;

  if p_type = 'match' then
    insert into lignes_matchs (ligne_id, match_id)
    select v_ligne, m.id from matchs m where (m.date_heure at time zone 'Europe/Zurich')::date = any (p_dates);
    get diagnostics v_nb = row_count;
    if v_nb < cardinality(p_dates) then
      insert into import_remarques values (p_sponsor || ' / ' || p_produit || ' : ' || (cardinality(p_dates) - v_nb)
        || ' date(s) sans match au calendrier : ' || array_to_string(array(
          select d::text from unnest(p_dates) d where not exists (
            select 1 from matchs m where (m.date_heure at time zone 'Europe/Zurich')::date = d)), ', '));
    end if;
  end if;

  foreach e in array p_empl loop
    insert into lignes_emplacements (ligne_id, emplacement_id)
    select v_ligne, id from emplacements where anneau = split_part(e, ':', 1) and position = split_part(e, ':', 2)::int;
  end loop;

  -- anneau LED de la Pub pause tiers : compris dans la pub (ligne couplée sur le produit technique, migration 17)
  if p_anneau and v_produit.lie_a_produit_id is not null then
    insert into lignes_vendues (contrat_id, produit_id, type_vente, duree_s, avec_son, consignes, suspendue,
                                motif_suspension, statut, ligne_couplee_id, validee, priorite)
    values (v_contrat, v_produit.lie_a_produit_id, p_type, p_duree, false, null,
            p_suspendue, p_motif, 'vendu', v_ligne, p_validee, p_priorite_anneau)
    returning id into v_anneau;
    insert into lignes_matchs (ligne_id, match_id) select v_anneau, match_id from lignes_matchs where ligne_id = v_ligne;
    update lignes_vendues set ligne_couplee_id = v_anneau where id = v_ligne;
  end if;

  foreach e in array p_visuels loop
    i := i + 1;
    insert into assets (ligne_id, nom_visuel, statut, avec_son, variante)
    values (v_ligne, e, 'valide', p_son, case when cardinality(p_visuels) > 1 then 'V' || i end);
  end loop;
end $$;

-- Tout l'import, d'un seul bloc
do $import$
begin
  if exists (select 1 from imports_donnees where nom = ${q(MARQUE)}) then
    raise exception 'Import déjà fait. Pour recommencer, exécutez d''abord supabase/23_remise_a_zero.sql';
  end if;
  if exists (select 1 from lignes_vendues) then
    raise exception 'La base contient déjà des diffusions : exécutez d''abord supabase/23_remise_a_zero.sql';
  end if;
  if (select lie_a_produit_id from produits where nom = 'Pub pause tiers')
     is distinct from (select id from produits where nom = 'Anneau LED pause tiers') then
    raise exception 'Migration 17 manquante : l''anneau de la Pub pause tiers n''est pas configuré';
  end if;
  insert into imports_donnees (nom) values (${q(MARQUE)});
  delete from import_remarques;

  -- les noms de visuels d'Airtable sont déjà validés : on les crée « validés » directement
  alter table assets disable trigger assets_avant;

  -- Sponsors (les existants, même nom, sont gardés)
  insert into sponsors (nom, alias, notes) values
${[...sponsors.values()].map(s => `    (${q(s.nom)}, ${tableau([...s.variantes], 'text')}, ${q(MARQUE)})`).join(',\n')}
  on conflict do nothing;

  -- Diffusions
${lignes.map(l => `  perform import_airtable_ligne(${q(l.sponsor)}, ${q(l.produit)}, '${l.type}', ${l.duree ?? 'null'}, ${l.son}, ${l.occ}, `
    + `${q(l.consignes.join('\n'))}, ${!!l.suspendue}, ${q(l.motif)}, ${tableau(l.dates, 'date')}, `
    + `${tableau(l.empl, 'text')}, ${tableau(l.visuels.filter(Boolean), 'text')}, ${l.anneau}, `
    + `${l.valide}, ${l.attendu}, ${l.priorite}, ${l.prioriteAnneau ?? 'null'});`).join('\n')}

  alter table assets enable trigger assets_avant;

  -- Matchs déjà joués : ils retiennent aussi leur visuel (point de départ de la comparaison de Match du jour)
  update passages set asset_id = choisir_asset(ligne_id, match_id) where asset_id is null;
end $import$;

drop function import_airtable_ligne(text, text, type_vente, int, boolean, int, text, boolean, text, date[], text[], text[], boolean,
                                    boolean, boolean, int, int);

-- Résumé : s'il y a des lignes « à vérifier », ce sont des points à regarder
select message as "Résultat" from import_remarques
union all select 'Import terminé : ' || (select count(*) from lignes_vendues where created_by is null and demande_id is null)
                 || ' diffusions (' || (select count(*) from lignes_vendues where validee and not suspendue)
                 || ' à l''écran), ' || (select count(*) from sponsors where notes = ${q(MARQUE)}) || ' sponsors importés.';
`);

fs.writeFileSync(path.join(RACINE, 'supabase', 'import_airtable_2026-27.sql'), sql.join('\n'), 'utf8');

fs.writeFileSync(path.join(RACINE, 'supabase', 'import_airtable_annuler.sql'), `-- =====================================================================
-- Annule l'import Airtable (supprime les diffusions et sponsors importés)
-- Les diffusions créées dans l'outil (depuis une demande) ne sont PAS touchées.
-- Remet aussi en état après un import interrompu. Peut être exécuté plusieurs fois.
-- =====================================================================
do $annuler$
begin
  -- la protection des visuels est toujours réactivée
  alter table assets enable trigger assets_avant;

  -- diffusions importées = créées dans le SQL Editor (sans auteur) et sans demande
  delete from lignes_vendues where created_by is null and demande_id is null;
  delete from contrats c where c.created_by is null and not exists (select 1 from lignes_vendues l where l.contrat_id = c.id);
  delete from sponsors s where s.notes = ${q(MARQUE)}
    and not exists (select 1 from contrats c where c.sponsor_id = s.id)
    and not exists (select 1 from demandes d where d.sponsor_id = s.id);

  if to_regclass('public.imports_donnees') is not null then
    delete from imports_donnees where nom = ${q(MARQUE)};
  end if;
  if to_regclass('public.import_remarques') is not null then
    delete from import_remarques;
  end if;
end $annuler$;

drop function if exists import_airtable_ligne(text, text, type_vente, int, boolean, int, text, boolean, text, date[], text[], text[], boolean);
drop function if exists import_airtable_ligne(text, text, type_vente, int, boolean, int, text, boolean, text, date[], text[], text[], boolean,
                                              boolean, boolean, int, int);

select 'Annulation terminée : ' || (select count(*) from lignes_vendues where created_by is null and demande_id is null)
       || ' diffusion importée restante, ' || (select count(*) from sponsors where notes = ${q(MARQUE)})
       || ' sponsor importé restant (ceux liés à une demande sont gardés).' as "Résultat";
`, 'utf8');

// ---------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------
const parProduit = {};
for (const l of lignes) parProduit[l.produit.startsWith('Action scene') ? 'Action scenes' : l.produit] = (parProduit[l.produit.startsWith('Action scene') ? 'Action scenes' : l.produit] || 0) + 1;
console.log(`${sponsors.size} sponsors, ${lignes.length} diffusions`);
console.log(Object.entries(parProduit).map(([p, n]) => `  ${p} : ${n}`).join('\n'));
console.log(`\nSponsors regroupés (variantes) :`);
for (const s of sponsors.values()) if (s.variantes.size) console.log(`  ${s.nom}  <=  ${[...s.variantes].join(' | ')}`);
console.log(`\nPas importé / à vérifier :\n  ${ignores.join('\n  ')}`);
