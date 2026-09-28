import { sb, exigerConnexion, echapper, notifier, descriptionProduit, CATEGORIES_UNE_PAGE, lienCategorie } from './app.js';

await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });

const $ = (id) => document.getElementById(id);
const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nomCourt = (nom) => nom.replace(/^Action scene – /, '');
const etat = { produits: [], sponsors: new Map(), aAjouter: new Map(), recherche: '' };

async function charger() {
  const [{ data: produits, error }, { data: lignes }, { data: attente }] = await Promise.all([
    sb.from('produits').select('id, nom, categorie, famille, support, moment_defaut, mode_vente, emplacements_requis')
      .eq('actif', true).order('ordre').order('categorie').order('nom'),
    sb.from('lignes_vendues').select('produit_id, contrat:contrats(sponsor_id)').not('statut', 'in', '(annule,termine)'),
    sb.from('demandes_produits').select('produit_id, demande:demandes!inner(statut)')
      .is('traite_le', null).neq('demande.statut', 'traitee'),
  ]);
  if (error) { notifier(`Chargement impossible : ${error.message}`, 'erreur'); return; }
  etat.produits = produits;

  // nombre de sponsors différents par produit
  const parProduit = new Map();
  for (const l of lignes || []) {
    if (!parProduit.has(l.produit_id)) parProduit.set(l.produit_id, new Set());
    parProduit.get(l.produit_id).add(l.contrat?.sponsor_id);
  }
  etat.sponsors = new Map([...parProduit].map(([id, s]) => [id, s.size]));
  etat.aAjouter = new Map();
  for (const a of attente || []) etat.aAjouter.set(a.produit_id, (etat.aAjouter.get(a.produit_id) || 0) + 1);
  afficher();
}

function afficher() {
  // raccourcis vers les produits qui attendent des ajouts
  const enAttente = etat.produits.filter(p => etat.aAjouter.get(p.id));
  $('bloc-a-ajouter').hidden = !enAttente.length;
  $('a-ajouter').innerHTML = enAttente.map(p => `
    <a class="puce-lien" href="produit.html?id=${p.id}">${echapper(nomCourt(p.nom))}
      <span class="menu-compteur">${etat.aAjouter.get(p.id)}</span></a>`).join('');

  const q = normaliser(etat.recherche);
  const groupes = new Map();
  for (const p of etat.produits) {
    if (q && !normaliser(`${p.nom} ${p.categorie}`).includes(q)) continue;
    const cat = p.categorie || 'Autres';
    if (!groupes.has(cat)) groupes.set(cat, []);
    groupes.get(cat).push(p);
  }
  $('categories').innerHTML = groupes.size ? [...groupes].map(([cat, liste]) => CATEGORIES_UNE_PAGE.has(cat) ? carteCategorie(cat, liste) : `
    <section class="categorie-produits">
      <h3>${echapper(cat)} <span class="doux">· ${liste.length}</span></h3>
      <div class="grille-produits">
        ${liste.map(p => {
          const n = etat.sponsors.get(p.id) || 0, a = etat.aAjouter.get(p.id) || 0;
          return `
            <a class="carte-produit${a ? ' a-traiter' : ''}" href="produit.html?id=${p.id}">
              <strong>${echapper(nomCourt(p.nom))}</strong>
              ${p.famille !== 'exclusif' || p.categorie !== 'Action scenes'
                ? `<span class="doux petit">${echapper(descriptionProduit(p))}</span>` : ''}
              <span class="pied-carte">
                <span class="petit">${n ? `${n} sponsor${n > 1 ? 's' : ''}` : '<span class="doux">aucun sponsor</span>'}</span>
                ${a ? `<span class="badge statut-nouvelle">${a} à ajouter</span>` : ''}
              </span>
            </a>`;
        }).join('')}
      </div>
    </section>`).join('') : '<p class="vide">Aucun produit ne correspond.</p>';
}

// Catégorie regroupée sur une seule page (ex. Action scenes) : une seule carte
function carteCategorie(cat, liste) {
  const vendus = liste.filter(p => etat.sponsors.get(p.id)).length;
  const a = liste.reduce((t, p) => t + (etat.aAjouter.get(p.id) || 0), 0);
  return `
    <section class="categorie-produits">
      <h3>${echapper(cat)} <span class="doux">· ${liste.length}</span></h3>
      <div class="grille-produits">
        <a class="carte-produit${a ? ' a-traiter' : ''}" href="${lienCategorie(cat)}">
          <strong>Toutes les ${echapper(cat.toLowerCase())}</strong>
          <span class="doux petit">Une seule page avec toutes les scènes et leur sponsor</span>
          <span class="pied-carte">
            <span class="petit">${vendus} / ${liste.length} avec un sponsor</span>
            ${a ? `<span class="badge statut-nouvelle">${a} à ajouter</span>` : ''}
          </span>
        </a>
      </div>
    </section>`;
}

$('recherche').addEventListener('input', (e) => { etat.recherche = e.target.value.trim(); afficher(); });

await charger();
