import { sb, exigerConnexion, LIBELLES, echapper, dateHeure, notifier, ongletsProduits } from './app.js';

await exigerConnexion({ roles: ['regie', 'admin'] });

const $ = (id) => document.getElementById(id);
// un onglet des fiches produit (plus d'entrée à part dans le menu)
ongletsProduits($('onglets-produits'), { page: 'matchs' });
try { localStorage.setItem('dernier-onglet', 'matchs.html'); } catch { /* stockage indisponible */ }
const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const jourSemaine = (d) => new Date(d).toLocaleDateString('fr-CH', { weekday: 'long' });

const STATUT_LIGNE = {
  fichiers_attendus: ['visuel attendu', 'badge-a-venir'], a_valider: ['visuel à valider', 'statut-en_cours'],
  valide: ['validé', 'statut-traitee'], programme: ['prêt', 'statut-traitee'],
};

const etat = {
  matchs: [],
  ventes: new Map(),     // match_id -> [ligne vendue au match]
  attente: new Map(),    // 'AAAA-MM-JJ' -> [produit de demande au match pas encore ajouté]
  vue: 'avenir',
  recherche: '',
};

async function charger() {
  const { data: saison } = await sb.from('saisons').select('id, libelle').eq('active', true).maybeSingle();
  if (saison) $('titre-saison').textContent = saison.libelle;

  const [{ data: matchs, error }, { data: ventes }, { data: attente }] = await Promise.all([
    sb.from('matchs').select('id, numero, date_heure, adversaire, type').eq('saison_id', saison?.id).order('date_heure'),
    sb.from('lignes_matchs').select(`match_id,
        ligne:lignes_vendues!inner(id, statut, avec_son, type_vente, ligne_couplee_id, priorite,
          produit:produits(id, nom, ordre, actif), contrat:contrats(sponsor:sponsors(nom)))`)
      .eq('ligne.type_vente', 'match').not('ligne.statut', 'in', '(annule,termine)'),
    sb.from('demandes_produits').select(`dates_matchs, produit:produits(id, nom, ordre),
        demande:demandes!inner(id, statut, sponsor_nom_saisi, sponsor:sponsors(nom))`)
      .eq('type_vente', 'match').is('traite_le', null).neq('demande.statut', 'traitee'),
  ]);
  if (error) { notifier(`Chargement impossible : ${error.message}`, 'erreur'); return; }

  etat.matchs = matchs || [];
  etat.ventes = new Map();
  for (const v of ventes || []) {
    if (v.ligne.produit?.actif === false) continue;   // anneau de la pause tiers : compris dans la Pub pause tiers
    if (!etat.ventes.has(v.match_id)) etat.ventes.set(v.match_id, []);
    etat.ventes.get(v.match_id).push(v.ligne);
  }
  etat.attente = new Map();
  for (const a of attente || []) {
    for (const j of a.dates_matchs || []) {
      if (!etat.attente.has(j)) etat.attente.set(j, []);
      etat.attente.get(j).push(a);
    }
  }
  afficher();
}

const parOrdre = (a, b) => (a.produit?.ordre ?? 100) - (b.produit?.ordre ?? 100)
  || (a.produit?.nom || '').localeCompare(b.produit?.nom || '', 'fr')
  || (a.priorite ?? 1e9) - (b.priorite ?? 1e9);          // puis ordre de diffusion dans le produit

function afficher() {
  const maintenant = new Date();
  const q = normaliser(etat.recherche);
  let liste = etat.matchs.filter(m => etat.vue === 'passes' ? new Date(m.date_heure) < maintenant : new Date(m.date_heure) >= maintenant);
  if (etat.vue === 'passes') liste = liste.reverse();

  const cartes = liste.map(m => {
    const ventes = (etat.ventes.get(m.id) || []).sort(parOrdre);
    const attente = (etat.attente.get(jourLocal(m.date_heure)) || []).sort(parOrdre);
    if (etat.vue === 'avec' && !ventes.length && !attente.length) return '';
    const texte = normaliser([m.adversaire, ...ventes.map(l => `${l.produit?.nom} ${l.contrat?.sponsor?.nom}`),
      ...attente.map(a => `${a.produit?.nom} ${a.demande.sponsor?.nom || a.demande.sponsor_nom_saisi}`)].join(' '));
    if (q && !texte.includes(q)) return '';

    return `
      <article class="carte carte-match${ventes.length || attente.length ? '' : ' sans-vente'}">
        <header class="entete-match">
          <div class="date-match">
            <span class="jour">${new Date(m.date_heure).getDate()}</span>
            <span class="mois">${new Date(m.date_heure).toLocaleDateString('fr-CH', { month: 'short' })}</span>
          </div>
          <div class="infos-match">
            <strong>${echapper(m.adversaire)}</strong>
            <span class="doux petit">Match ${m.numero} · ${jourSemaine(m.date_heure)} ${dateHeure(m.date_heure)}
              ${m.type !== 'saison' ? ` · <span class="badge">${LIBELLES.type_match[m.type]}</span>` : ''}</span>
          </div>
          <div class="compteurs-match">
            ${ventes.length ? `<span class="badge badge-match">${ventes.length} au match</span>` : ''}
            ${attente.length ? `<span class="badge statut-nouvelle">${attente.length} à ajouter</span>` : ''}
          </div>
        </header>
        ${ventes.length || attente.length ? `
          <ul class="lignes-match">
            ${ventes.map(l => {
              const [txt, cl] = STATUT_LIGNE[l.statut] || [l.statut, ''];
              return `
                <li>
                  <a href="produit.html?id=${l.produit?.id}" class="produit-match">${echapper((l.produit?.nom || '').replace(/^Action scene – /, 'Action scene · '))}</a>
                  <span class="sponsor-match">${echapper(l.contrat?.sponsor?.nom || '—')}</span>
                  <span class="details-match">
                    ${l.avec_son ? '<span class="badge badge-son">avec son</span>' : ''}
                    ${l.ligne_couplee_id && l.produit?.actif !== false ? '<span class="badge badge-son">+ anneau</span>' : ''}
                    <span class="badge ${cl}">${txt}</span>
                  </span>
                </li>`;
            }).join('')}
            ${attente.map(a => `
              <li class="en-attente">
                <a href="produit.html?id=${a.produit?.id}" class="produit-match">${echapper((a.produit?.nom || '').replace(/^Action scene – /, 'Action scene · '))}</a>
                <span class="sponsor-match">${echapper(a.demande.sponsor?.nom || a.demande.sponsor_nom_saisi || '—')}</span>
                <span class="details-match"><a class="badge statut-nouvelle" href="produit.html?id=${a.produit?.id}">à ajouter →</a></span>
              </li>`).join('')}
          </ul>` : '<p class="doux petit" style="margin:.6rem 0 0">Rien de spécifique à ce match : seulement ce qui passe toute la saison.</p>'}
      </article>`;
  }).filter(Boolean);

  $('liste-matchs').innerHTML = cartes.length ? cartes.join('')
    : `<p class="vide">${etat.vue === 'avec' ? 'Aucune vente au match pour l’instant.' : 'Aucun match.'}</p>`;
}

$('onglets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vue]');
  if (!b) return;
  etat.vue = b.dataset.vue;
  document.querySelectorAll('#onglets button').forEach(x => x.classList.toggle('actif', x === b));
  afficher();
});
$('recherche').addEventListener('input', (e) => { etat.recherche = e.target.value.trim(); afficher(); });

await charger();
