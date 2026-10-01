// Vue d'ensemble d'une catégorie sur une seule page (ex. les 39 Action scenes) : categorie.html?c=Action%20scenes
import { sb, exigerConnexion, echapper, dateCourte, notifier, ongletsProduits } from './app.js';

await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });

const $ = (id) => document.getElementById(id);
const categorie = new URLSearchParams(location.search).get('c') || 'Action scenes';
ongletsProduits($('onglets-produits'), { categorie });
try { localStorage.setItem('dernier-onglet', `categorie.html?c=${encodeURIComponent(categorie)}`); } catch { /* stockage indisponible */ }
const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const court = (nom) => nom.replace(/^Action scene – /, '');

const etat = { produits: [], lignes: new Map(), attente: new Map(), vue: 'toutes', recherche: '' };

async function charger() {
  document.title = `${categorie} — Sponsoring ↔ Régie`;
  $('c-nom').textContent = categorie;
  $('col-produit').textContent = /action/i.test(categorie) ? 'Scène' : 'Produit';

  const { data: produits, error } = await sb.from('produits').select('id, nom, ordre')
    .eq('categorie', categorie).eq('actif', true).order('ordre').order('nom');
  if (error) { notifier(`Chargement impossible : ${error.message}`, 'erreur'); return; }
  etat.produits = produits || [];
  const ids = etat.produits.map(p => p.id);

  const [{ data: lignes }, { data: attente }] = await Promise.all([
    sb.from('lignes_vendues')
      .select(`id, produit_id, type_vente, statut, consignes, suspendue, motif_suspension, validee, visuel_attendu, date_fin, priorite,
               contrat:contrats(sponsor:sponsors(nom)), matchs:lignes_matchs(match_id, match:matchs(date_heure)),
               assets(nom_visuel, statut, depose_le)`)
      .in('produit_id', ids).not('statut', 'in', '(annule,termine)'),
    sb.from('demandes_produits').select('produit_id, demande:demandes!inner(statut)')
      .in('produit_id', ids).is('traite_le', null).neq('demande.statut', 'traitee'),
  ]);
  etat.lignes = new Map();
  // sponsors « au match » dont tous les matchs sont passés : plus affichés ici (historique sur la fiche de la scène)
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const passe = (l) => l.type_vente === 'match' && (l.matchs || []).length > 0
    && l.matchs.every(m => m.match?.date_heure && new Date(m.match.date_heure) < debutJour);
  for (const l of (lignes || []).filter(x => !passe(x))) {
    if (!etat.lignes.has(l.produit_id)) etat.lignes.set(l.produit_id, []);
    etat.lignes.get(l.produit_id).push(l);
  }
  etat.attente = new Map();
  for (const liste of etat.lignes.values()) liste.sort((a, b) => (a.priorite ?? 1e9) - (b.priorite ?? 1e9));
  for (const a of attente || []) etat.attente.set(a.produit_id, (etat.attente.get(a.produit_id) || 0) + 1);

  const vendues = etat.produits.filter(p => etat.lignes.get(p.id)?.length).length;
  $('c-resume').textContent = `${etat.produits.length} ${/action/i.test(categorie) ? 'scènes' : 'produits'} · `
    + `${vendues} avec un sponsor · ${etat.produits.length - vendues} libres`;
  afficher();
}

function afficher() {
  const q = normaliser(etat.recherche);
  const rangees = [];
  for (const p of etat.produits) {
    const lignes = etat.lignes.get(p.id) || [];
    const attente = etat.attente.get(p.id) || 0;
    if (etat.vue === 'vendues' && !lignes.length) continue;
    if (etat.vue === 'libres' && lignes.length) continue;
    if (q && !normaliser([p.nom, ...lignes.map(l => l.contrat?.sponsor?.nom)].join(' ')).includes(q)) continue;

    const nom = `<a class="produit-match" href="produit.html?id=${p.id}">${echapper(court(p.nom))}</a>
      ${attente ? ` <a class="badge statut-nouvelle" href="produit.html?id=${p.id}">${attente} à ajouter</a>` : ''}`;
    if (!lignes.length) {
      rangees.push(`<tr class="rangee-libre" data-lien="produit.html?id=${p.id}" title="Ouvrir la fiche"><td>${nom}</td><td><span class="doux">libre</span></td>
        <td class="col-optionnelle"></td><td class="col-optionnelle"></td><td class="col-optionnelle"></td></tr>`);
      continue;
    }
    lignes.forEach((l, i) => {
      const visuel = (l.assets || []).filter(a => a.statut !== 'archive')
        .sort((a, b) => new Date(b.depose_le) - new Date(a.depose_le))[0];
      const etatTxt = (l.validee && !l.suspendue ? '<span class="etat etat-ecran">À l’écran</span>'
        : `<span class="etat etat-non" title="${echapper(l.motif_suspension || '')}">Pas à l’écran</span>`)
        + (l.visuel_attendu ? ' <span class="etat etat-attente">⏳ visuel attendu</span>' : '');
      rangees.push(`<tr data-lien="produit.html?id=${p.id}&ligne=${l.id}" title="Ouvrir le détail">
        <td>${i === 0 ? nom : ''}</td>
        <td><strong>${echapper(l.contrat?.sponsor?.nom || '—')}</strong> ${etatTxt}
          ${lignes.length > 1 && i === 0 ? ' <span class="badge badge-a-venir" title="Un seul sponsor par scène normalement">2 sponsors</span>' : ''}</td>
        <td class="col-optionnelle">${l.type_vente === 'saison' ? 'Saison' : `${l.matchs?.length || 0} match${(l.matchs?.length || 0) > 1 ? 's' : ''}`}
          ${l.date_fin ? `<div class="doux petit">jusqu'au ${dateCourte(l.date_fin + 'T12:00')}</div>` : ''}</td>
        <td class="col-optionnelle">${visuel ? `<span class="petit">${echapper(visuel.nom_visuel)}</span>` : ''}
          ${visuel?.statut === 'a_valider' ? ' <span class="etat etat-attente">à valider</span>' : ''}</td>
        <td class="col-optionnelle"><span class="petit doux">${echapper((l.consignes || '').slice(0, 100))}${(l.consignes || '').length > 100 ? '…' : ''}</span></td>
      </tr>`);
    });
  }
  $('lignes').innerHTML = rangees.join('');
  $('vide').hidden = rangees.length > 0;
}

// clic sur une rangée : fiche de la scène (avec le détail du sponsor ouvert)
$('lignes').addEventListener('click', (e) => {
  if (e.target.closest('a, button, input, textarea')) return;
  const tr = e.target.closest('tr[data-lien]');
  if (tr) location.href = tr.dataset.lien;
});

$('onglets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vue]');
  if (!b) return;
  etat.vue = b.dataset.vue;
  document.querySelectorAll('#onglets button').forEach(x => x.classList.toggle('actif', x === b));
  afficher();
});
$('recherche').addEventListener('input', (e) => { etat.recherche = e.target.value.trim(); afficher(); });

await charger();
