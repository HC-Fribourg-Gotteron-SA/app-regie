// Liste des sponsors : ce que chaque entreprise a, et combien de documents on a reçus pour elle
import { sb, exigerConnexion, echapper, dateCourte, notifier, toutesLesLignes } from './app.js';

await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });

const $ = (id) => document.getElementById(id);
const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const court = (nom) => nom.replace(/^Action scene – /, '');

const etat = { sponsors: [], vue: 'produits', recherche: '' };
try { etat.vue = localStorage.getItem('sponsors-vue') || 'produits'; } catch { /* stockage indisponible */ }

async function charger() {
  try {
    const [sponsors, lignes, documents] = await Promise.all([
      toutesLesLignes((de, a) => sb.from('sponsors').select('id, nom, alias, origine').order('nom').range(de, a)),
      toutesLesLignes((de, a) => sb.from('lignes_vendues')
        .select('produit:produits(nom, ordre, actif), contrat:contrats(sponsor_id)')
        .not('statut', 'in', '(annule,termine)').range(de, a)),
      toutesLesLignes((de, a) => sb.from('documents_sponsors').select('sponsor_id, depose_le').range(de, a)),
    ]);

    const produits = new Map(), docs = new Map();
    for (const l of lignes) {
      const id = l.contrat?.sponsor_id;
      if (!id || !l.produit?.actif) continue;       // l'anneau de la pause tiers est compris dans la Pub pause tiers
      if (!produits.has(id)) produits.set(id, new Map());
      const m = produits.get(id);
      m.set(l.produit.nom, { nom: l.produit.nom, ordre: l.produit.ordre ?? 100, n: (m.get(l.produit.nom)?.n || 0) + 1 });
    }
    for (const d of documents) {
      if (!d.sponsor_id) continue;
      const x = docs.get(d.sponsor_id) || { n: 0, dernier: null };
      x.n++;
      if (!x.dernier || d.depose_le > x.dernier) x.dernier = d.depose_le;
      docs.set(d.sponsor_id, x);
    }
    etat.sponsors = sponsors.map(s => ({
      ...s,
      produits: [...(produits.get(s.id)?.values() || [])].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom)),
      docs: docs.get(s.id) || { n: 0, dernier: null },
    }));
  } catch (err) {
    notifier(`Chargement impossible : ${err.message}`, 'erreur');
    $('resume').textContent = '';
    return;
  }
  const avec = etat.sponsors.filter(s => s.produits.length).length;
  $('resume').textContent = `${etat.sponsors.length} sponsors · ${avec} avec des produits en cours. `
    + 'Cliquez sur un sponsor pour ouvrir son dossier.';
  afficher();
}

function afficher() {
  document.querySelectorAll('#onglets button').forEach(b => b.classList.toggle('actif', b.dataset.vue === etat.vue));
  const q = normaliser(etat.recherche);
  const liste = etat.sponsors.filter(s =>
    (q ? normaliser([s.nom, ...(s.alias || [])].join(' ')).includes(q)            // la recherche porte sur tous
       : etat.vue === 'tous' || (etat.vue === 'produits' ? s.produits.length : s.docs.n)));

  $('lignes').innerHTML = liste.map(s => {
    const noms = s.produits.map(p => echapper(court(p.nom)) + (p.n > 1 ? ` <span class="doux">×${p.n}</span>` : ''));
    return `<tr data-id="${s.id}">
      <td><strong>${echapper(s.nom)}</strong>
        ${s.origine && s.origine !== 'sponsor' ? ` <span class="badge">${echapper(s.origine)}</span>` : ''}
        <div class="doux petit">${s.produits.length ? `${s.produits.length} produit${s.produits.length > 1 ? 's' : ''}` : 'aucun produit en cours'}</div></td>
      <td class="col-optionnelle petit">${noms.slice(0, 4).join(', ')}${noms.length > 4 ? ` <span class="doux">+ ${noms.length - 4} autres</span>` : ''}</td>
      <td>${s.docs.n ? `📁 ${s.docs.n}<div class="doux petit">dernier le ${dateCourte(s.docs.dernier)}</div>` : '<span class="doux">—</span>'}</td>
    </tr>`;
  }).join('');
  $('vide').hidden = liste.length > 0;
}

$('lignes').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = `sponsor.html?id=${tr.dataset.id}`;
});
$('onglets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vue]');
  if (!b) return;
  etat.vue = b.dataset.vue;
  try { localStorage.setItem('sponsors-vue', etat.vue); } catch { /* stockage indisponible */ }
  afficher();
});
$('recherche').addEventListener('input', (e) => { etat.recherche = e.target.value.trim(); afficher(); });

await charger();
