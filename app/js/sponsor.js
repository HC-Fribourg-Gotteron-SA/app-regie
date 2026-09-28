// Dossier d'un sponsor (sponsor.html?id=…) : ce qu'il a, les documents reçus, ses demandes
import { sb, exigerConnexion, LIBELLES, echapper, dateCourte, notifier, taille, nomFichierSur,
         libelleFichier } from './app.js';

const { profil } = await exigerConnexion({ roles: ['sponsoring', 'regie', 'admin'] });
// Sponsoring : consultation ; les documents arrivent par les demandes. Déposer ici = Régie / admin.
const estRegie = ['regie', 'admin'].includes(profil.role);

const $ = (id) => document.getElementById(id);
const idSponsor = new URLSearchParams(location.search).get('id');
const court = (nom) => nom.replace(/^Action scene – /, '');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
let personnes = new Map();

async function charger() {
  const [{ data: s, error }, { data: lignes }, { data: documents }, { data: demandes }, { data: profils }] = await Promise.all([
    sb.from('sponsors').select('id, nom, origine, alias').eq('id', idSponsor).maybeSingle(),
    sb.from('lignes_vendues')
      .select(`id, type_vente, date_fin, validee, suspendue, motif_suspension, visuel_attendu, ligne_couplee_id,
               produit:produits(id, nom, ordre, actif), contrat:contrats!inner(sponsor_id),
               matchs:lignes_matchs(match_id)`)
      .eq('contrat.sponsor_id', idSponsor).not('statut', 'in', '(annule,termine)'),
    sb.from('documents_sponsors')
      .select('id, demande_id, role, nom, storage_path, mime, taille_octets, notes, depose_par, depose_le, produit:produits(nom, famille, support)')
      .eq('sponsor_id', idSponsor).order('depose_le', { ascending: false }),
    sb.from('demandes').select('id, type, statut, created_at, cree_par')
      .eq('sponsor_id', idSponsor).order('created_at', { ascending: false }),
    sb.from('profiles').select('id, nom, email'),
  ]);
  if (error || !s) { $('s-nom').textContent = 'Sponsor introuvable'; if (error) notifier(error.message, 'erreur'); return; }
  personnes = new Map((profils || []).map(x => [x.id, x.nom || x.email.split('@')[0]]));

  document.title = `${s.nom} — Sponsoring ↔ Régie`;
  $('s-nom').textContent = s.nom;
  const produits = (lignes || []).filter(l => l.produit?.actif)
    .sort((a, b) => (a.produit.ordre ?? 100) - (b.produit.ordre ?? 100) || a.produit.nom.localeCompare(b.produit.nom));
  $('s-resume').textContent = [s.origine && s.origine !== 'sponsor' ? `Contenu ${s.origine}` : '',
    s.alias?.length ? `aussi écrit : ${s.alias.join(', ')}` : ''].filter(Boolean).join(' · ');

  afficherProduits(produits);
  afficherDocuments(documents || []);
  afficherDemandes(demandes || []);
}

function afficherProduits(lignes) {
  $('nb-produits').textContent = lignes.length ? `(${lignes.length})` : '';
  $('produits').innerHTML = lignes.map(l => {
    const n = l.matchs?.length || 0;
    const etatTxt = l.suspendue ? `<span class="etat etat-desactive" title="${echapper(l.motif_suspension || '')}">⏸ Désactivé</span>`
      : l.validee ? '<span class="etat etat-ecran">À l’écran</span>' : '<span class="etat etat-non">Pas à l’écran</span>';
    return `<tr data-produit="${l.produit.id}">
      <td><strong>${echapper(court(l.produit.nom))}</strong>
        ${l.ligne_couplee_id ? ' <span class="doux petit">+ anneau LED</span>' : ''}</td>
      <td>${l.type_vente === 'saison' ? 'Toute la saison' : pluriel(n, 'match')}
        ${l.date_fin ? `<div class="doux petit">jusqu'au ${dateCourte(l.date_fin + 'T12:00')}</div>` : ''}</td>
      <td>${etatTxt}${l.visuel_attendu ? ' <span class="etat etat-attente">⏳ visuel attendu</span>' : ''}</td>
    </tr>`;
  }).join('');
  $('vide-produits').hidden = lignes.length > 0;
}

function typeDocument(d) {
  if (d.role === 'visuel' || d.role === 'anneau') return libelleFichier(d.produit, d.role);
  return 'Document';
}

function afficherDocuments(docs) {
  $('nb-documents').textContent = docs.length ? `(${docs.length})` : '';
  $('documents').innerHTML = docs.map(d => `
    <li>
      <span title="${echapper(d.nom)}">${echapper(d.nom)}
        <span class="doux petit"> · ${echapper(typeDocument(d))}${d.produit ? ` · ${echapper(court(d.produit.nom))}` : ''}
          · reçu le ${dateCourte(d.depose_le)}${personnes.get(d.depose_par) ? ` par ${echapper(personnes.get(d.depose_par))}` : ''}
          ${d.taille_octets ? ` · ${taille(d.taille_octets)}` : ''}</span>
        ${d.notes ? `<br><span class="petit">${echapper(d.notes)}</span>` : ''}
      </span>
      ${d.demande_id ? `<a class="btn btn-discret" href="demandes.html?id=${d.demande_id}">Demande</a>` : ''}
      <button type="button" class="btn btn-discret" data-telecharger="${echapper(d.storage_path)}">Télécharger</button>
    </li>`).join('');
  $('vide-documents').hidden = docs.length > 0;
}

function afficherDemandes(demandes) {
  $('nb-demandes').textContent = demandes.length ? `(${demandes.length})` : '';
  $('demandes').innerHTML = demandes.map(d => `
    <tr class="ligne-${d.statut}" data-demande="${d.id}">
      <td><strong>${echapper(LIBELLES.type_demande[d.type] || d.type)}</strong>
        <div class="doux petit">${dateCourte(d.created_at)}${personnes.get(d.cree_par) ? ` · ${echapper(personnes.get(d.cree_par))}` : ''}</div></td>
      <td><span class="badge statut-${d.statut}">${LIBELLES.statut_demande[d.statut] || d.statut}</span></td>
    </tr>`).join('');
  $('vide-demandes').hidden = demandes.length > 0;
}

// Clics : télécharger, ouvrir un produit, ouvrir une demande
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-telecharger]');
  if (b) {
    const { data, error } = await sb.storage.from('assets').createSignedUrl(b.dataset.telecharger, 600, { download: true });
    if (error) return notifier(`Téléchargement impossible : ${error.message}`, 'erreur');
    location.href = data.signedUrl;
    return;
  }
  const p = e.target.closest('tr[data-produit]');
  if (p) { location.href = `produit.html?id=${p.dataset.produit}`; return; }
  const d = e.target.closest('tr[data-demande]');
  if (d) location.href = `demandes.html?id=${d.dataset.demande}`;
});

// Ajouter un document reçu (e-mail, clé USB…) directement dans le dossier
async function deposer(fichiers) {
  if (!fichiers.length) return;
  const note = $('note').value.trim() || null;
  const envoi = $('envoi');
  const echecs = [];
  for (const [i, f] of [...fichiers].entries()) {
    envoi.hidden = false;
    envoi.textContent = `Envoi (${i + 1}/${fichiers.length}) : ${f.name}…`;
    const chemin = `sponsors/${idSponsor}/${Date.now()}__${nomFichierSur(f.name)}`;
    const { error } = await sb.storage.from('assets').upload(chemin, f, { upsert: false });
    const { error: e2 } = error ? { error } : await sb.from('documents_sponsors').insert({
      sponsor_id: idSponsor, role: 'autre', nom: f.name, storage_path: chemin,
      mime: f.type || null, taille_octets: f.size, notes: note });
    if (e2) echecs.push(`${f.name} (${e2.message})`);
  }
  envoi.hidden = true;
  if (echecs.length) notifier(`Non ajouté : ${echecs.join(', ')}`, 'erreur');
  else notifier(fichiers.length > 1 ? 'Documents ajoutés au dossier' : 'Document ajouté au dossier');
  $('note').value = '';
  await charger();
}
$('fichiers').addEventListener('change', async (e) => { await deposer([...e.target.files]); e.target.value = ''; });
$('zone-depot').addEventListener('click', (e) => { if (e.target.id !== 'fichiers') $('fichiers').click(); });
$('zone-depot').addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.classList.add('survol'); });
$('zone-depot').addEventListener('dragleave', (e) => e.currentTarget.classList.remove('survol'));
$('zone-depot').addEventListener('drop', (e) => {
  e.preventDefault();
  e.currentTarget.classList.remove('survol');
  deposer([...e.dataTransfer.files]);
});

if (!estRegie) {
  $('zone-depot').hidden = true;
  $('note').hidden = true;
  $('vide-documents').innerHTML = 'Aucun document pour l’instant. Les fichiers joints à vos demandes arrivent ici automatiquement.';
}

if (!idSponsor) $('s-nom').textContent = 'Sponsor introuvable';
else await charger();
