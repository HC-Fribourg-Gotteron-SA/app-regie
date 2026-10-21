// Sauvegarde de la base (21.10.2026, option B de Léa) : un bouton admin télécharge un ZIP avec
//   · un fichier CSV par table (séparateur « ; », lisible dans Excel) ;
//   · sauvegarde.json = toutes les tables telles quelles (pour tout restaurer si besoin).
// Les fichiers du stockage (vidéos, logos) ne sont PAS dedans : seulement les données.
// Rappel : la date de la dernière sauvegarde est gardée dans ce navigateur (localStorage) ; plus de 7 jours → rappel.
import { sb, notifier, toutesLesLignes } from './app.js';

const CLE = 'derniere-sauvegarde';
export const JOURS_RAPPEL = 7;

// table → colonnes de tri (pagination stable par 1000 lignes)
const TABLES = [
  ['profiles', ['id']], ['saisons', ['id']], ['matchs', ['id']], ['produits', ['id']], ['emplacements', ['id']],
  ['sponsors', ['id']], ['contrats', ['id']], ['demandes', ['id']], ['demandes_produits', ['demande_id', 'produit_id']],
  ['lignes_vendues', ['id']], ['lignes_matchs', ['ligne_id', 'match_id']], ['lignes_emplacements', ['ligne_id', 'emplacement_id']],
  ['assets', ['id']], ['passages', ['id']], ['documents_sponsors', ['id']], ['colosseo_fait', ['match_id', 'ligne_id', 'action']],
  ['notes_match', ['id']], ['ros_modeles', ['id']], ['ros_matchs', ['id']], ['ros_lignes', ['id']],
  ['fichiers_travail', ['id']], ['joueurs', ['id']], ['digital_elements', ['id']], ['journal', ['id']],
];

// Date de la dernière sauvegarde faite depuis ce navigateur (null = jamais)
export function derniereSauvegarde() {
  try { const v = localStorage.getItem(CLE); return v ? new Date(v) : null; } catch { return null; }
}
export function sauvegardeEnRetard() {
  const d = derniereSauvegarde();
  return !d || (Date.now() - d.getTime()) > JOURS_RAPPEL * 864e5;
}

const cellule = (v) => {
  if (v === null || v === undefined) return '';
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
function csv(lignes) {
  if (!lignes.length) return '';
  const colonnes = [...new Set(lignes.flatMap(l => Object.keys(l)))];
  return '﻿' + [colonnes.join(';'), ...lignes.map(l => colonnes.map(c => cellule(l[c])).join(';'))].join('\r\n');
}

// Télécharge la sauvegarde ; bouton = l'élément qui affiche l'avancement
export async function telechargerSauvegarde(bouton) {
  const texte = bouton?.innerHTML;
  if (bouton) bouton.disabled = true;
  try {
    const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    const zip = new JSZip();
    const tout = {}, absentes = [];
    for (const [i, [table, tri]] of TABLES.entries()) {
      if (bouton) bouton.textContent = `Sauvegarde ${i + 1}/${TABLES.length}…`;
      try {
        const lignes = await toutesLesLignes((de, a) => {
          let q = sb.from(table).select('*');
          for (const c of tri) q = q.order(c);
          return q.range(de, a);
        });
        tout[table] = lignes;
        zip.file(`${table}.csv`, csv(lignes));
      } catch (err) {
        absentes.push(`${table} (${err.message})`);           // table pas encore créée (migration) ou pas lisible
      }
    }
    const quand = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nom = `sauvegarde-outil-regie_${quand.getFullYear()}-${pad(quand.getMonth() + 1)}-${pad(quand.getDate())}_${pad(quand.getHours())}h${pad(quand.getMinutes())}`;
    zip.file('sauvegarde.json', JSON.stringify({ faite_le: quand.toISOString(), tables: tout }));
    zip.file('LISEZMOI.txt', [
      `Sauvegarde de l'outil Sponsoring <-> Régie du ${quand.toLocaleString('fr-CH')}.`,
      'Un fichier .csv par table (à ouvrir dans Excel), et sauvegarde.json avec tout (pour restaurer la base).',
      'Les fichiers déposés (vidéos, logos) ne sont pas dans cette sauvegarde : ils restent dans Supabase Storage.',
      ...Object.entries(tout).map(([t, l]) => `  ${t} : ${l.length} lignes`),
      ...(absentes.length ? ['Tables non sauvegardées :', ...absentes.map(t => `  ${t}`)] : []),
    ].join('\r\n'));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${nom}.zip` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    try { localStorage.setItem(CLE, quand.toISOString()); } catch { /* navigateur sans stockage : pas de rappel */ }
    const total = Object.values(tout).reduce((t, l) => t + l.length, 0);
    notifier(`Sauvegarde téléchargée : ${Object.keys(tout).length} tables, ${total} lignes. Rangez le fichier sur OneDrive.`
      + (absentes.length ? ` (${absentes.length} table(s) non lue(s), voir LISEZMOI.txt)` : ''));
    return true;
  } catch (err) {
    notifier(`Sauvegarde impossible : ${err.message}`, 'erreur');
    return false;
  } finally {
    if (bouton) { bouton.disabled = false; bouton.innerHTML = texte; }
  }
}
