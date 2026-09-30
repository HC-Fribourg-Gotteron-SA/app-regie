// Import en masse des fichiers reçus des sponsors : un dossier choisi sur l'ordinateur,
// un sous-dossier par sponsor. Chaque fichier va dans le dossier du sponsor (documents_sponsors)
// et, si son nom correspond à un visuel importé d'Airtable, il est relié à la diffusion (Télécharger).
import { sb, exigerConnexion, echapper, notifier, taille, nomFichierSur, toutesLesLignes } from './app.js';
import { cle, cleVisuel, trouverSponsor, fichierSysteme } from './rapprochement.js';

await exigerConnexion({ roles: ['regie', 'admin'] });

const $ = (id) => document.getElementById(id);
const LIMITE = 50 * 1024 * 1024;          // 50 Mo par fichier (limite de Supabase, plan gratuit)
const NOTE = 'Import des dossiers de la saison 26-27';

const etat = {
  sponsors: [],        // { id, nom, alias }
  parNom: new Map(),   // nom exact -> sponsor (pour la case « Sponsor »)
  visuels: [],         // visuels sans fichier : { id, cle, sponsor_id, produit_id }
  deja: new Set(),     // `${sponsor_id}|${nom}|${taille}` déjà dans un dossier
  groupes: [],         // { dossier, fichiers: File[], sponsor }
};

// ---------------------------------------------------------------------
// Chargement : sponsors, visuels sans fichier, documents déjà présents
// ---------------------------------------------------------------------
try {
  const [sponsors, visuels, documents] = await Promise.all([
    toutesLesLignes((de, a) => sb.from('sponsors').select('id, nom, alias').order('nom').range(de, a)),
    toutesLesLignes((de, a) => sb.from('assets')
      .select('id, nom_visuel, ligne:lignes_vendues(produit_id, contrat:contrats(sponsor_id))')
      .is('storage_path', null).neq('statut', 'archive').range(de, a)),
    toutesLesLignes((de, a) => sb.from('documents_sponsors').select('sponsor_id, nom, taille_octets').range(de, a)),
  ]);
  etat.sponsors = sponsors;
  etat.parNom = new Map(sponsors.map(s => [s.nom, s]));
  etat.visuels = visuels.map(v => ({ id: v.id, cle: cleVisuel(v.nom_visuel), sponsor_id: v.ligne?.contrat?.sponsor_id,
                                      produit_id: v.ligne?.produit_id }));
  etat.deja = new Set(documents.map(d => `${d.sponsor_id}|${d.nom}|${d.taille_octets}`));
  $('liste-sponsors').innerHTML = sponsors.map(s => `<option value="${echapper(s.nom)}"></option>`).join('');
} catch (err) {
  notifier(`Chargement impossible : ${err.message}`, 'erreur');
}

// ---------------------------------------------------------------------
// 1. Dossier choisi : regroupement par sous-dossier (= sponsor)
// ---------------------------------------------------------------------
$('dossier').addEventListener('change', (e) => {
  const fichiers = [...e.target.files].filter(f => !fichierSysteme(f.name));
  const groupes = new Map();
  for (const f of fichiers) {
    const parties = (f.webkitRelativePath || f.name).split('/');
    // parties[0] = dossier choisi ; parties[1] = sous-dossier du sponsor (s'il y en a un)
    const dossier = parties.length > 2 ? parties[1] : '(fichiers sans sous-dossier)';
    if (!groupes.has(dossier)) groupes.set(dossier, []);
    groupes.get(dossier).push(f);
  }
  etat.groupes = [...groupes].sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([dossier, liste]) => {
    const r = parties0(dossier) ? null : trouverSponsor(dossier, etat.sponsors);
    return { dossier, fichiers: liste, sponsor: r?.sponsor || null, sur: !!r?.sur };
  });
  afficherApercu();
});
const parties0 = (dossier) => dossier.startsWith('(');

// Visuel importé qui porte le même nom que le fichier (d'abord chez ce sponsor)
function visuelDe(fichier, sponsorId) {
  const k = cleVisuel(fichier.name);
  if (!k) return null;
  const memes = etat.visuels.filter(v => v.cle === k);
  return memes.find(v => v.sponsor_id === sponsorId) || (memes.length === 1 ? memes[0] : null);
}

function afficherApercu() {
  $('bloc-apercu').hidden = $('bloc-import').hidden = !etat.groupes.length;
  let nb = 0, poids = 0, tropGros = 0, relies = 0, dejaLa = 0, sansSponsor = 0;
  $('apercu').innerHTML = etat.groupes.map((g, i) => {
    const valides = g.fichiers.filter(f => f.size <= LIMITE);
    const gros = g.fichiers.length - valides.length;
    const deja = g.sponsor ? valides.filter(f => etat.deja.has(`${g.sponsor.id}|${f.name}|${f.size}`)).length : 0;
    const lies = g.sponsor ? valides.filter(f => visuelDe(f, g.sponsor.id)).length : 0;
    const octets = valides.reduce((t, f) => t + f.size, 0);
    if (g.sponsor) { nb += valides.length - deja; poids += octets; relies += lies; dejaLa += deja; } else sansSponsor++;
    tropGros += gros;
    return `<tr class="${g.sponsor ? '' : 'ligne-question'}">
      <td><strong>${echapper(g.dossier)}</strong></td>
      <td><input type="text" list="liste-sponsors" data-groupe="${i}" value="${echapper(g.sponsor?.nom || '')}"
            placeholder="— ne pas importer —" style="min-width:200px">
        ${g.sponsor && !g.sur ? '<div class="petit etat etat-attente" style="margin-top:.2rem">à vérifier</div>' : ''}</td>
      <td>${valides.length} <span class="doux petit">· ${taille(octets)}</span>
        ${deja ? `<div class="doux petit">${deja} déjà dans le dossier</div>` : ''}
        ${gros ? `<div class="petit" style="color:var(--erreur)">${gros} de plus de 50 Mo (pas envoyé${gros > 1 ? 's' : ''})</div>` : ''}</td>
      <td class="col-optionnelle">${lies ? `${lies} fichier${lies > 1 ? 's' : ''}` : '<span class="doux">—</span>'}</td>
    </tr>`;
  }).join('');

  $('resume-apercu').textContent = `· ${etat.groupes.length} dossier${etat.groupes.length > 1 ? 's' : ''}`;
  $('avertissements').innerHTML = [
    sansSponsor ? `<p class="message message-erreur petit">${sansSponsor} dossier${sansSponsor > 1 ? 's' : ''} sans sponsor (en rouge) : choisis le sponsor ou laisse vide pour ne pas l'importer.</p>` : '',
    tropGros ? `<p class="message message-erreur petit">${tropGros} fichier${tropGros > 1 ? 's' : ''} de plus de 50 Mo ne pourront pas être envoyés (limite de Supabase).</p>` : '',
    poids > 900 * 1024 * 1024 ? `<p class="message message-erreur petit">⚠ ${taille(poids)} au total : le stockage gratuit de Supabase est limité à 1 Go.</p>` : '',
  ].join('');
  $('resume-import').innerHTML = nb
    ? `<strong>${nb} fichier${nb > 1 ? 's' : ''}</strong> à envoyer (${taille(poids)}), dont <strong>${relies}</strong> relié${relies > 1 ? 's' : ''} à un visuel de diffusion.`
      + (dejaLa ? ` <span class="doux">${dejaLa} déjà présent${dejaLa > 1 ? 's' : ''}, ignoré${dejaLa > 1 ? 's' : ''}.</span>` : '')
    : 'Rien à envoyer.';
  $('btn-importer').disabled = !nb;
}

// Sponsor corrigé à la main
$('apercu').addEventListener('change', (e) => {
  const c = e.target.closest('[data-groupe]');
  if (!c) return;
  const g = etat.groupes[Number(c.dataset.groupe)];
  const nom = c.value.trim();
  g.sponsor = nom ? (etat.parNom.get(nom) || trouverSponsor(nom, etat.sponsors)?.sponsor || null) : null;
  g.sur = !!g.sponsor;
  if (nom && !g.sponsor) notifier(`Sponsor « ${nom} » introuvable : choisis-le dans la liste.`, 'erreur');
  afficherApercu();
});

// ---------------------------------------------------------------------
// 3. Import : envoi des fichiers (3 à la fois), dossier du sponsor, lien au visuel
// ---------------------------------------------------------------------
$('btn-importer').addEventListener('click', async () => {
  const taches = [];
  for (const g of etat.groupes) {
    if (!g.sponsor) continue;
    for (const f of g.fichiers) {
      if (f.size > LIMITE || etat.deja.has(`${g.sponsor.id}|${f.name}|${f.size}`)) continue;
      taches.push({ f, sponsor: g.sponsor, visuel: visuelDe(f, g.sponsor.id) });
    }
  }
  if (!taches.length) return;
  if (!confirm(`Envoyer ${taches.length} fichier${taches.length > 1 ? 's' : ''} dans les dossiers sponsors ?`)) return;

  $('btn-importer').disabled = true;
  $('dossier').disabled = true;
  $('progression').hidden = $('progression-texte').hidden = false;
  let faits = 0, lies = 0;
  const echecs = [];
  const avancer = () => {
    $('progression-barre').style.width = `${Math.round((faits + echecs.length) / taches.length * 100)}%`;
    $('progression-texte').textContent = `${faits + echecs.length} / ${taches.length} — ne ferme pas la page pendant l'envoi.`;
  };
  avancer();

  const envoyer = async ({ f, sponsor, visuel }) => {
    const chemin = `sponsors/${sponsor.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}__${nomFichierSur(f.name)}`;
    const { error } = await sb.storage.from('assets').upload(chemin, f, { upsert: false, contentType: f.type || undefined });
    if (error) throw new Error(error.message);
    const { error: e2 } = await sb.from('documents_sponsors').insert({
      sponsor_id: sponsor.id, role: visuel ? 'visuel' : 'autre', produit_id: visuel?.produit_id || null,
      nom: f.name, storage_path: chemin, mime: f.type || null, taille_octets: f.size, notes: NOTE });
    if (e2) throw new Error(e2.message);
    etat.deja.add(`${sponsor.id}|${f.name}|${f.size}`);
    // visuel importé d'Airtable (nom seul) : il a maintenant son fichier -> Télécharger dans l'outil
    if (visuel) {
      const { error: e3 } = await sb.from('assets')
        .update({ storage_path: chemin, mime: f.type || null, taille_octets: f.size }).eq('id', visuel.id);
      if (!e3) { lies++; etat.visuels = etat.visuels.filter(v => v.id !== visuel.id); }
    }
  };

  const file = [...taches];
  await Promise.all([1, 2, 3].map(async () => {
    while (file.length) {
      const t = file.shift();
      try { await envoyer(t); faits++; } catch (err) { echecs.push(`${t.sponsor.nom} / ${t.f.name} : ${err.message}`); }
      avancer();
    }
  }));

  $('resultat').innerHTML = `
    <p class="message ${echecs.length ? 'message-erreur' : 'message-ok'}">
      ${faits} fichier${faits > 1 ? 's' : ''} rangé${faits > 1 ? 's' : ''} dans les dossiers sponsors,
      dont ${lies} relié${lies > 1 ? 's' : ''} à un visuel de diffusion.
      ${echecs.length ? `<br>${echecs.length} échec${echecs.length > 1 ? 's' : ''} :` : ''}</p>
    ${echecs.length ? `<ul class="petit">${echecs.map(x => `<li>${echapper(x)}</li>`).join('')}</ul>
      <p class="aide">Tu peux relancer l'import avec le même dossier : ce qui est déjà envoyé est ignoré.</p>` : ''}
    <p><a href="sponsors.html">→ Voir les dossiers sponsors</a></p>`;
  $('dossier').disabled = false;
  afficherApercu();
});
