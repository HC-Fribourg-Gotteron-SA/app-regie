// Traiter UN produit d'une demande : Ajouter ✓ / Mettre le nouveau visuel / Retirer / Ignorer.
// La même carte partout (décidé par Léa le 01.10.2026) : fiche produit (« À ajouter »), détail d'une demande
// (et donc depuis Match du jour, qui ouvre la demande). Fichiers, contrôle des dimensions, plan LED, remarques.
import { sb, LIBELLES, echapper, dateCourte, notifier, taille, libelleFichier, depuis, dimensionsAttendues,
         nomFichierSur, alertesFichier, specsProduit } from './app.js';
import { analyserSon, LIBELLE_SON } from './son-video.js';

// Colonnes d'un produit de demande à traiter (demandes_produits + sa demande)
export const CHAMPS_A_TRAITER = `demande_id, produit_id, type_vente, dates_matchs, duree_s, avec_son, avec_anneau,
  remarque_sponsoring, remarque_regie, suite, ligne_id,
  demande:demandes!inner(id, type, statut, created_at, sponsor_id, sponsor_nom_saisi, remarque_sponsoring,
                         sponsor:sponsors(id, nom))`;

const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const normaliser = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nomSponsor = (d) => d.sponsor?.nom || d.sponsor_nom_saisi || '—';
const STATUT_LIGNE = { fichiers_attendus: 'fichier attendu', a_valider: 'visuel à valider', valide: 'validé', programme: 'à l’écran', vendu: 'vendu' };

// ---------------------------------------------------------------------
// Données d'un produit (chargées une fois par page) : produit, anneau couplé, diffusions en cours, plan LED
// ---------------------------------------------------------------------
const contextes = new Map();
let adversaires = null;

function contexte(produitId) {
  if (!contextes.has(produitId)) contextes.set(produitId, (async () => {
    const [{ data: p }, { data: lignes }] = await Promise.all([
      sb.from('produits').select('*').eq('id', produitId).maybeSingle(),
      sb.from('lignes_vendues')
        .select('id, type_vente, statut, created_at, ligne_couplee_id, contrat:contrats(sponsor:sponsors(id, nom))')
        .eq('produit_id', produitId).not('statut', 'in', '(annule,termine)'),
    ]);
    let anneau = null, emplacements = [];
    if (p?.lie_a_produit_id) {
      ({ data: anneau } = await sb.from('produits').select('*').eq('id', p.lie_a_produit_id).maybeSingle());
    }
    if (p?.famille === 'emplacement') {
      const { data } = await sb.from('v_plan_emplacements').select('*').order('anneau').order('position');
      const parEmpl = new Map();
      for (const e of data || []) if (!parEmpl.get(e.emplacement_id)?.ligne_id) parEmpl.set(e.emplacement_id, e);
      emplacements = [...parEmpl.values()];
    }
    if (!adversaires) {
      const { data: matchs } = await sb.from('matchs').select('date_heure, adversaire');
      adversaires = new Map((matchs || []).map(m => [jourLocal(m.date_heure), m.adversaire]));
    }
    return { p, anneau, lignes: lignes || [], emplacements };
  })());
  return contextes.get(produitId);
}

// À appeler après un traitement (les diffusions et les emplacements ont changé)
export function oublierContextes() { contextes.clear(); }

// ---------------------------------------------------------------------
// Cartes affichées sur la page
// ---------------------------------------------------------------------
const cartes = new Map();     // `${demande}|${produit}` -> { a, el, options, ctx, choix }
const cle = (a) => `${a.demande_id}|${a.produit_id}`;

/**
 * Affiche la carte de traitement d'un produit de demande dans `el`.
 * options : { estRegie, mode: 'produit' | 'demande', apres(resultat) }
 *   mode 'produit' : titre = sponsor (on est sur la fiche) ; mode 'demande' : titre = produit (on est dans la demande)
 */
export async function carteTraitement(el, a, options) {
  const k = cle(a);
  const ctx = await contexte(a.produit_id);
  const ancienne = cartes.get(k);
  const lignesSponsor = ctx.lignes.filter(l => a.demande.sponsor_id && l.contrat?.sponsor?.id === a.demande.sponsor_id);
  const choix = ancienne?.choix || {
    emplacements: new Set(),
    // fichier ajouté après coup : le nouveau visuel va sur la diffusion déjà créée par la demande
    ligne_id: a.ligne_id || lignesSponsor[0]?.id || '',
    date_fin: jourLocal(new Date()), fichiers: [], semblables: [], dejaMis: new Set(),
  };
  cartes.set(k, { a, el, options, ctx, choix });
  el.classList.add('detail-produit', 'carte-attente');
  el.dataset.traitement = k;
  brancher(el);
  dessiner(k);
  await Promise.all([chargerFichiers(k), chercherSemblables(k)]);
}

function dessiner(k) {
  const c = cartes.get(k);
  if (!c) return;
  const { a, el, options, ctx, choix } = c;
  const d = a.demande, p = ctx.p;
  if (!p) { el.innerHTML = '<p class="doux">Produit introuvable.</p>'; return; }
  const existantes = ctx.lignes.filter(l => d.sponsor_id && l.contrat?.sponsor?.id === d.sponsor_id);
  const identique = choix.semblables.find(s => normaliser(s.nom) === normaliser(d.sponsor_nom_saisi));
  const proches = choix.semblables.filter(s => s !== identique);
  const titre = options.mode === 'demande'
    ? `<strong>${echapper(p.nom)}</strong>`
    : `<strong>${echapper(nomSponsor(d))}</strong>${d.sponsor ? '' : ' <span class="badge badge-a-venir">nouveau sponsor</span>'}
       <span class="badge${d.type === 'suppression' ? ' badge-suppression' : ''}">${LIBELLES.type_demande[d.type]}</span>`;
  const remarqueSpo = [a.remarque_sponsoring, options.mode === 'produit' ? d.remarque_sponsoring : null].filter(Boolean).join('\n');

  el.innerHTML = `
    <div class="suivi-produit">
      ${a.ligne_id ? '📎 Nouveau fichier ajouté après coup : à mettre sur la diffusion' : d.type === 'suppression' ? 'Retrait à faire' : 'À ajouter'}
      ${options.mode === 'demande' ? `<a href="produit.html?id=${p.id}">Ouvrir la fiche →</a>`
                                   : `<a href="demandes.html?id=${d.id}">Voir la demande →</a>`}
    </div>
    <div class="detail-entete">
      ${titre}
      ${a.type_vente === 'match' ? '<span class="badge badge-match">Seulement certains matchs</span>' : '<span class="badge">Toute la saison</span>'}
      ${a.avec_son === true ? '<span class="badge badge-son">Avec son</span>' : a.avec_son === false ? '<span class="badge">Sans son</span>' : ''}
      ${a.avec_anneau === true ? '<span class="badge badge-son">+ Anneau LED</span>' : a.avec_anneau === false ? '<span class="badge">Sans anneau LED</span>' : ''}
      ${a.duree_s ? `<span class="badge">${a.duree_s} s</span>` : ''}
      ${options.mode === 'produit' ? `<span class="doux petit description">Reçue ${depuis(d.created_at)}${d.statut === 'question' ? ' · <strong>question en cours au Sponsoring</strong>' : ''}</span>` : ''}
    </div>
    ${!d.sponsor && identique ? `<p class="message message-info petit">« ${echapper(identique.nom)} » existe déjà dans l'outil : il sera repris.</p>` : ''}
    ${!d.sponsor && !identique && proches.length ? `<p class="message message-info petit">Sera créé comme nouveau sponsor. Noms proches déjà dans l'outil :
      ${proches.map(s => `<strong>${echapper(s.nom)}</strong>`).join(', ')}. Si c'est le même, corrigez la demande avant d'ajouter.</p>` : ''}
    ${a.type_vente === 'match' ? `<div class="petit" style="margin-bottom:.7rem"><span class="titre-bloc">Matchs</span><br>${(a.dates_matchs || []).map(j =>
      `${dateCourte(j + 'T12:00')}${adversaires?.has(j) ? ` · ${echapper(adversaires.get(j))}` : ''}`).join('<br>')}</div>` : ''}
    ${d.type === 'suppression' ? '' : `
      <div class="titre-bloc">Fichiers</div>
      <div style="margin-bottom:.7rem">${blocFichiers(c)}</div>`}
    <div class="grille-remarques" style="margin-bottom:.7rem">
      <div>
        <div class="titre-bloc">Remarque Sponsoring</div>
        <div class="bloc-texte petit">${echapper(remarqueSpo || '—')}</div>
      </div>
      <div>
        <div class="titre-bloc">Remarque Régie</div>
        ${options.estRegie
          ? `<textarea class="petit" data-remarque-regie rows="2" style="min-height:0"
               placeholder="Ex. : logo reçu, à retravailler…">${echapper(a.remarque_regie || '')}</textarea>`
          : `<div class="bloc-texte petit">${echapper(a.remarque_regie || '—')}</div>`}
      </div>
    </div>
    ${options.estRegie && p.famille === 'emplacement' && !a.ligne_id && !['suppression', 'changement_visuel'].includes(d.type)
      ? grilleEmplacements(k) : ''}
    ${options.estRegie ? actions(c, existantes) : ''}`;
}

function actions(c, existantes) {
  const { a, choix } = c, d = a.demande;
  const choixLigne = existantes.length > 1 && !a.ligne_id ? `
    <select data-ligne style="width:auto">${existantes.map(l => `<option value="${l.id}" ${choix.ligne_id === l.id ? 'selected' : ''}>
      ${l.type_vente === 'saison' ? 'Saison' : 'Au match'} · ${STATUT_LIGNE[l.statut] || l.statut} · depuis le ${dateCourte(l.created_at)}</option>`).join('')}
    </select>` : '';
  let principal;
  if (a.ligne_id) {
    principal = `<button type="button" class="btn btn-principal" data-suite="visuel">Mettre le nouveau visuel</button>`;
  } else if (d.type === 'suppression') {
    principal = existantes.length
      ? `${choixLigne}<label class="petit" style="margin:0">Dernier jour <input type="date" data-fin value="${choix.date_fin}" style="width:auto"></label>
         <button type="button" class="btn btn-principal" data-suite="retire">Retirer</button>`
      : `<span class="petit doux">Ce sponsor n'a pas ce produit dans l'outil.</span>
         <button type="button" class="btn btn-principal" data-suite="ignore">Marquer comme fait</button>`;
  } else if (d.type === 'changement_visuel' && existantes.length) {
    principal = `${choixLigne}
      <button type="button" class="btn btn-principal" data-suite="visuel">Mettre le nouveau visuel</button>`;
  } else {
    principal = `<button type="button" class="btn btn-principal" data-suite="ajoute">Ajouter ✓</button>`;
  }
  return `
    <div class="actions-attente">
      <button type="button" class="btn btn-discret btn-danger" data-supprimer-produit
              title="Erreur ou demande qui ne se fera pas : la supprimer">Supprimer</button>
      <span class="espace"></span>
      ${principal}
    </div>`;
}

// ---------------------------------------------------------------------
// Fichiers joints au produit dans la demande : demandes/<demande>/<produit>/<role>__<nom>
// ---------------------------------------------------------------------
async function chargerFichiers(k) {
  const c = cartes.get(k);
  const { a, choix } = c;
  const dossier = `demandes/${a.demande_id}/${a.produit_id}`;
  const [{ data }, { data: deja }] = await Promise.all([
    sb.storage.from('assets').list(dossier, { sortBy: { column: 'name', order: 'asc' } }),
    // fichier ajouté après coup : ceux déjà mis sur la diffusion ne sont pas renvoyés
    a.ligne_id ? sb.from('assets').select('storage_path').eq('ligne_id', a.ligne_id) : Promise.resolve({ data: [] }),
  ]);
  choix.dejaMis = new Set((deja || []).map(x => x.storage_path).filter(Boolean));
  if (a.ligne_id) {
    const { data: couplee } = await sb.from('lignes_vendues').select('ligne_couplee_id').eq('id', a.ligne_id).maybeSingle();
    if (couplee?.ligne_couplee_id) {
      const { data: x } = await sb.from('assets').select('storage_path').eq('ligne_id', couplee.ligne_couplee_id);
      (x || []).forEach(f => f.storage_path && choix.dejaMis.add(f.storage_path));
    }
  }
  choix.fichiers = (data || []).filter(f => f.id).map(f => {
    const i = f.name.indexOf('__');
    const role = i > 0 ? f.name.slice(0, i) : 'visuel';
    const nomCourt = i > 0 ? f.name.slice(i + 2) : f.name;
    return { role, nomCourt, storage_path: `${dossier}/${f.name}`, nom_visuel: nomCourt.replace(/\.[^.]+$/, ''),
             mime: f.metadata?.mimetype || null, taille_octets: f.metadata?.size || null,
             largeur_px: null, hauteur_px: null, duree_s: null, sonde: 'analyse…' };
  });
  dessiner(k);
  await Promise.all(choix.fichiers.map(sonder));
  dessiner(k);
}

function blocFichiers(c) {
  const { a, ctx, choix, options } = c;
  const roles = ['visuel', ...(a.avec_anneau && ctx.p.lie_a_produit_id ? ['anneau'] : [])];
  return roles.map(role => {
    const liste = choix.fichiers.filter(f => f.role === role);
    const cible = role === 'anneau' ? ctx.anneau : ctx.p;
    return `
      <div class="fichier-attendu">
        <div class="petit"><strong>${libelleFichier(ctx.p, role)}</strong>
          ${liste.length ? '' : ' <span class="badge badge-a-venir">à venir</span>'}
          ${specsProduit(cible) ? `<span class="doux"> · attendu ${echapper(specsProduit(cible))}</span>` : ''}
          ${cible?.remarque_format ? `<span class="doux"> · ${echapper(cible.remarque_format)}</span>` : ''}</div>
        ${liste.map(f => `
          <div class="visuel-infos">
            <span class="petit">${echapper(f.nomCourt)}</span>
            <span class="doux petit">${taille(f.taille_octets || 0)} · ${echapper(f.sonde)}</span>
            ${choix.dejaMis.has(f.storage_path) ? '<span class="badge">déjà mis</span>' : controle(f, cible)}
            <button type="button" class="btn btn-discret petit" data-fichier="${echapper(f.storage_path)}">Télécharger</button>
            ${options.estRegie ? boutonSupprimerFichier(f.storage_path) : ''}
          </div>`).join('')}
        ${options.estRegie ? boutonAjoutFichier(role) : ''}
      </div>`;
  }).join('');
}

// « Ajouter un fichier » (fichier reçu plus tard) : même bouton dans la demande et sur la fiche
export const boutonAjoutFichier = (role) => `
  <label class="btn btn-discret petit bouton-fichier">+ Ajouter un fichier
    <input type="file" hidden data-ajout-fichier="${role}"></label>`;

/**
 * Ajoute un fichier arrivé plus tard au produit d'une demande (Sponsoring ou Régie).
 * Le produit revient « à traiter » s'il était déjà ajouté (migration 28).
 */
export async function ajouterFichierDemande({ demandeId, produitId, sponsorId, role, fichier }) {
  const chemin = `demandes/${demandeId}/${produitId}/${role}__${Date.now().toString(36)}-${nomFichierSur(fichier.name)}`;
  const { error } = await sb.storage.from('assets').upload(chemin, fichier, { upsert: false });
  if (error) throw new Error(`Envoi impossible : ${error.message}`);
  // dossier du sponsor (trace des documents reçus)
  await sb.from('documents_sponsors').insert({ sponsor_id: sponsorId || null, demande_id: demandeId, produit_id: produitId,
    role, nom: fichier.name, storage_path: chemin, mime: fichier.type || null, taille_octets: fichier.size });
  const { error: e2 } = await sb.rpc('fichier_ajoute_demande', { p_demande: demandeId, p_produit: produitId, p_fichier: fichier.name });
  if (e2) throw new Error(/fichier_ajoute_demande/.test(e2.message)
    ? 'Fichier envoyé, mais la migration 28 n’est pas encore exécutée : prévenez la Régie.'
    : `Fichier envoyé, mais la demande n’a pas été mise à jour : ${e2.message}`);
  return chemin;
}

// ---------------------------------------------------------------------
// Supprimer une demande faite par erreur (demandé par Léa le 02.10.2026 : « ça joue pas, on le fera pas » ≠ « fait »).
// Régie / admin (droit de suppression). Les fichiers de la demande et leurs lignes du dossier sponsor partent aussi.
// Une demande déjà ajoutée à un produit (diffusion créée) ne se supprime pas : on retire le sponsor sur la fiche.
// ---------------------------------------------------------------------
async function fichiersDe(dossier) {
  const { data } = await sb.storage.from('assets').list(dossier, { limit: 1000 });
  const chemins = [];
  for (const f of data || []) {
    if (f.id) chemins.push(`${dossier}/${f.name}`);
    else chemins.push(...await fichiersDe(`${dossier}/${f.name}`));     // sous-dossier d'un produit
  }
  return chemins;
}

async function effacerFichiers(chemins) {
  if (!chemins.length) return;
  const { error } = await sb.from('documents_sponsors').delete().in('storage_path', chemins);
  if (error) console.warn('Dossier sponsor non nettoyé :', error.message);
  const { error: e2 } = await sb.storage.from('assets').remove(chemins);
  if (e2) console.warn('Fichiers non supprimés :', e2.message);
}

export async function supprimerDemande(demandeId) {
  const { count } = await sb.from('lignes_vendues').select('id', { count: 'exact', head: true }).eq('demande_id', demandeId);
  if (count) throw new Error('Cette demande a déjà été ajoutée à un produit : retirez plutôt le sponsor sur la fiche produit.');
  await effacerFichiers(await fichiersDe(`demandes/${demandeId}`));
  const { error } = await sb.from('demandes').delete().eq('id', demandeId);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
  return { demandeSupprimee: true };
}

// Un seul produit d'une demande ; si c'était le dernier, toute la demande part
export async function supprimerProduitDemande(demandeId, produitId) {
  const { data: produits } = await sb.from('demandes_produits').select('produit_id, traite_le').eq('demande_id', demandeId);
  if ((produits || []).length <= 1) return supprimerDemande(demandeId);
  await effacerFichiers(await fichiersDe(`demandes/${demandeId}/${produitId}`));
  const { error } = await sb.from('demandes_produits').delete().eq('demande_id', demandeId).eq('produit_id', produitId);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
  // les autres produits sont tous traités : la demande est traitée
  if (produits.filter(p => p.produit_id !== produitId).every(p => p.traite_le)) {
    await sb.from('demandes').update({ statut: 'traitee' }).eq('id', demandeId);
  }
  return { demandeSupprimee: false };
}

// Confirmation commune (texte clair) puis suppression ; renvoie true si c'est fait
export async function confirmerSuppressionProduit({ demandeId, produitId, produitNom, sponsorNom }) {
  const { count } = await sb.from('demandes_produits').select('produit_id', { count: 'exact', head: true }).eq('demande_id', demandeId);
  const seul = (count ?? 1) <= 1;
  if (!confirm(`Supprimer ${seul ? 'la demande' : `« ${produitNom} » de la demande`} de ${sponsorNom} ?\n\n`
    + 'À utiliser pour une erreur ou une demande qui ne se fera pas : '
    + (seul ? 'la demande et ses fichiers disparaissent de l’outil.' : 'ce produit et ses fichiers disparaissent de la demande.'))) return false;
  try {
    const r = await supprimerProduitDemande(demandeId, produitId);
    notifier(r.demandeSupprimee ? 'Demande supprimée' : `${produitNom} supprimé de la demande`);
    return true;
  } catch (err) { notifier(err.message, 'erreur'); return false; }
}

// ---------------------------------------------------------------------
// Supprimer UN fichier qui n'est pas le bon (demandé par Léa le 02.10.2026) — pas la demande.
// Régie / admin. Migration 33 : visuel déjà mis sur une diffusion = refusé, l'ancien revient,
// « ⏳ visuel attendu » ; ligne du dossier sponsor supprimée. Puis le fichier quitte le stockage.
// ---------------------------------------------------------------------
export const boutonSupprimerFichier = (chemin) => `
  <button type="button" class="btn btn-discret btn-danger petit" data-supprimer-fichier="${echapper(chemin)}"
          title="Ce n’est pas le bon fichier : le supprimer">Supprimer</button>`;

export async function confirmerSuppressionFichier(chemin) {
  const nom = chemin.split('/').pop().replace(/^[a-z]+__/, '');
  if (!confirm(`Supprimer le fichier « ${nom} » ?\n\n`
    + 'À utiliser quand ce n’est pas le bon fichier. Le bon s’ajoute ensuite avec « + Ajouter un fichier ».\n'
    + 'S’il était déjà mis sur une diffusion, elle passe en « ⏳ visuel attendu » (l’ancien visuel revient s’il y en avait un).')) return false;
  const { data: lignes, error } = await sb.rpc('supprimer_fichier', { p_chemin: chemin });
  if (error) {
    notifier(/supprimer_fichier/.test(error.message) ? 'Exécutez d’abord la migration 33 dans Supabase.' : `Suppression impossible : ${error.message}`, 'erreur');
    return false;
  }
  const { error: e2 } = await sb.storage.from('assets').remove([chemin]);
  if (e2) { notifier(`Fichier retiré de l’outil, mais pas du stockage : ${e2.message}`, 'erreur'); return true; }
  notifier(lignes ? 'Fichier supprimé · diffusion en « visuel attendu »' : 'Fichier supprimé');
  return true;
}

// Contrôle du fichier par rapport au format du produit : alerte orange, jamais bloquant
function controle(f, cible) {
  const alertes = alertesFichier(cible, { nom: f.nomCourt, largeur: f.largeur_px, hauteur: f.hauteur_px, duree: f.duree_s });
  if (alertes.length) return alertes.map(a => `<span class="badge badge-a-venir">⚠ ${echapper(a)}</span>`).join(' ');
  return f.largeur_px && dimensionsAttendues(cible) ? '<span class="badge statut-traitee">format OK</span>' : '';
}

// Lit les dimensions / la durée du fichier dans le navigateur
async function sonder(f) {
  const { data } = await sb.storage.from('assets').createSignedUrl(f.storage_path, 600);
  const url = data?.signedUrl;
  const video = /^video\//.test(f.mime || '') || /\.(mp4|mov|m4v|webm)$/i.test(f.storage_path);
  const image = /^image\//.test(f.mime || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.storage_path);
  const r = await new Promise((ok) => {
    if (!url || (!video && !image)) return ok(null);
    const delai = setTimeout(() => ok(null), 12000);
    const fini = (v) => { clearTimeout(delai); ok(v); };
    if (image) {
      const img = new Image();
      img.onload = () => fini({ l: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => fini(null);
      img.src = url;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => fini({ l: v.videoWidth, h: v.videoHeight, duree: v.duration });
      v.onerror = () => fini(null);
      v.src = url;
    }
  });
  if (r?.l) {
    f.largeur_px = r.l; f.hauteur_px = r.h;
    if (r.duree && isFinite(r.duree)) f.duree_s = Math.round(r.duree * 100) / 100;
    f.sonde = `${r.l} × ${r.h} px${f.duree_s ? ` · ${f.duree_s.toFixed(1)} s` : ''}`;
    if (video && f.role === 'visuel') {
      f.son = await analyserSon({ url, taille: f.taille_octets, nom: f.storage_path, mime: f.mime });
      if (f.son) f.sonde += ` · ${LIBELLE_SON[f.son]}`;
    }
  } else {
    f.sonde = video || image ? 'dimensions non lues' : 'format non lu';
  }
}

// Nouveau sponsor : même nom déjà dans l'outil (repris) ou noms qui ressemblent (avertissement)
async function chercherSemblables(k) {
  const c = cartes.get(k);
  const d = c.a.demande;
  if (d.sponsor_id || !d.sponsor_nom_saisi) return;
  const { data } = await sb.rpc('rechercher_sponsors', { q: d.sponsor_nom_saisi, nb: 4 });
  c.choix.semblables = data || [];
  dessiner(k);
}

// ---------------------------------------------------------------------
// LED 3M / 6M : on place le logo là où il y a un Banner HCFG (emplacement libre)
// ---------------------------------------------------------------------
function grilleEmplacements(k) {
  const { ctx, choix, a } = cartes.get(k);
  const requis = ctx.p.emplacements_requis || 1;
  // emplacements choisis par une autre carte de la page (même produit)
  const prisAilleurs = new Set([...cartes.entries()]
    .filter(([x, autre]) => x !== k && autre.a.produit_id === a.produit_id).flatMap(([, autre]) => [...autre.choix.emplacements]));
  const bande = (e) => e.bande || (['A', 'B'].includes(e.anneau) ? '3M' : '6M');
  const libre = (e) => !e.reserve_club && !e.ligne_id && !prisAilleurs.has(e.emplacement_id);
  const est6M = /6M/.test(ctx.p.nom);
  const plein3M = !ctx.emplacements.some(e => bande(e) === '3M' && libre(e));
  const dejaSur6M = ctx.emplacements.some(e => bande(e) === '6M' && choix.emplacements.has(e.emplacement_id));
  // LED 6M : bande 6M seulement. LED 3M : bande 3M ; la bande 6M n'est proposée que s'il n'y a plus de place en 3M.
  const bandes = est6M ? ['6M'] : plein3M || dejaSur6M ? ['3M', '6M'] : ['3M'];
  const anneaux = ['A', 'B', 'C', 'D']
    .map(x => [x, ctx.emplacements.filter(e => e.anneau === x && bandes.includes(bande(e)))])
    .filter(([, l]) => l.length);
  return `
    ${!est6M && plein3M ? `<p class="message message-info petit">Plus de place sur la bande 3M : le logo peut aller sur la bande 6M.</p>` : ''}
    <div class="titre-bloc">Emplacement
      <span class="compte-empl ${choix.emplacements.size === requis ? 'ok' : ''}">${choix.emplacements.size} / ${requis}</span></div>
    <p class="aide" style="margin-top:0">Cliquez sur ${requis > 1 ? `${requis} cases « Banner HCFG »` : 'une case « Banner HCFG »'} pour y mettre le logo
      (facultatif : on peut placer plus tard).</p>
    <div class="legende-empl"><span class="case-empl libre"></span> Banner HCFG (libre) <span class="case-empl choisi"></span> choisi
      <span class="case-empl occupe"></span> sponsor <span class="case-empl reserve"></span> réservé club</div>
    <div class="plan-empl">${anneaux.map(([x, cases]) => `
      <div class="anneau">
        <div class="anneau-titre">Anneau ${x} <span class="doux">· bande ${cases[0].bande}</span></div>
        <div class="anneau-zones">${[...new Set(cases.map(e => e.zone))].map(z => `
          <div class="zone-empl"><div class="zone-nom">${echapper(z)}</div><div class="cases">
            ${cases.filter(e => e.zone === z).map(e => {
              const choisi = choix.emplacements.has(e.emplacement_id);
              const occupe = !!e.ligne_id || prisAilleurs.has(e.emplacement_id);
              const cl = choisi ? 'choisi' : e.reserve_club ? 'reserve' : occupe ? 'occupe' : 'libre';
              const titre = `${x}-${z}-${e.position} · ${e.reserve_club ? 'réservé club' : e.sponsor ? e.sponsor : prisAilleurs.has(e.emplacement_id) ? 'choisi pour une autre demande' : 'Banner HCFG (libre)'}`;
              return `<button type="button" class="case-empl ${cl}" data-empl="${e.emplacement_id}" title="${echapper(titre)}"
                        ${cl === 'reserve' || cl === 'occupe' ? 'disabled' : ''}>${e.position}</button>`;
            }).join('')}</div></div>`).join('')}
        </div>
      </div>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------------
// Interactions (un écouteur par carte)
// ---------------------------------------------------------------------
function brancher(el) {
  if (el.dataset.branche) return;
  el.dataset.branche = '1';

  el.addEventListener('change', async (e) => {
    const c = cartes.get(el.dataset.traitement);
    if (!c) return;
    const t = e.target;
    if (t.dataset.ligne !== undefined) c.choix.ligne_id = t.value;
    if (t.dataset.fin !== undefined) c.choix.date_fin = t.value;
    if (t.dataset.remarqueRegie !== undefined) {
      const texte = t.value.trim() || null;
      const { error } = await sb.from('demandes_produits').update({ remarque_regie: texte })
        .eq('demande_id', c.a.demande_id).eq('produit_id', c.a.produit_id);
      if (error) return notifier(`Remarque non enregistrée : ${error.message}`, 'erreur');
      c.a.remarque_regie = texte;
      notifier('Remarque Régie enregistrée');
    }
    if (t.dataset.ajoutFichier && t.files?.length) {
      const fichier = t.files[0];
      notifier(`Envoi de ${fichier.name}…`);
      try {
        await ajouterFichierDemande({ demandeId: c.a.demande_id, produitId: c.a.produit_id,
          sponsorId: c.a.demande.sponsor_id, role: t.dataset.ajoutFichier, fichier });
        notifier('Fichier ajouté');
      } catch (err) { notifier(err.message, 'erreur'); }
      await chargerFichiers(el.dataset.traitement);
    }
  });

  el.addEventListener('click', async (e) => {
    const k = el.dataset.traitement, c = cartes.get(k);
    if (!c) return;
    const telecharger = e.target.closest('[data-fichier]');
    if (telecharger) {
      const { data, error } = await sb.storage.from('assets').createSignedUrl(telecharger.dataset.fichier, 600, { download: true });
      if (error) return notifier(error.message, 'erreur');
      location.href = data.signedUrl;
      return;
    }
    const suppr = e.target.closest('[data-supprimer-fichier]');
    if (suppr) {
      suppr.disabled = true;
      if (await confirmerSuppressionFichier(suppr.dataset.supprimerFichier)) await chargerFichiers(k);
      suppr.disabled = false;
      return;
    }
    const empl = e.target.closest('[data-empl]');
    if (empl && !empl.disabled) {
      const requis = c.ctx.p.emplacements_requis || 1, id = empl.dataset.empl;
      if (c.choix.emplacements.has(id)) c.choix.emplacements.delete(id);
      else {
        if (c.choix.emplacements.size >= requis) c.choix.emplacements.delete([...c.choix.emplacements][0]);
        c.choix.emplacements.add(id);
      }
      // un emplacement choisi ici n'est plus libre sur les autres cartes du même produit
      for (const [x, autre] of cartes) if (autre.a.produit_id === c.a.produit_id) dessiner(x);
      return;
    }
    if (e.target.closest('[data-supprimer-produit]')) {
      const fait = await confirmerSuppressionProduit({ demandeId: c.a.demande_id, produitId: c.a.produit_id,
        produitNom: c.ctx.p?.nom || 'ce produit', sponsorNom: nomSponsor(c.a.demande) });
      if (fait) { cartes.delete(k); oublierContextes(); await c.options.apres?.({ supprime: true }); }
      return;
    }
    const bouton = e.target.closest('[data-suite]');
    if (bouton) await traiter(k, bouton.dataset.suite, bouton);
  });
}

async function traiter(k, suite, bouton) {
  const { a, ctx, choix, options } = cartes.get(k);
  const p = ctx.p, requis = p.emplacements_requis || 1;
  const nouveaux = choix.fichiers.filter(f => !choix.dejaMis.has(f.storage_path) && (f.role !== 'anneau' || a.avec_anneau));
  if (suite === 'ignore' && bouton.hasAttribute('data-confirmer')
      && !confirm(`Ignorer la demande de ${nomSponsor(a.demande)} pour ${p.nom} ?\nRien ne sera programmé pour ce produit.`)) return;
  if (suite === 'ajoute' && p.famille === 'emplacement' && choix.emplacements.size < requis
      && !confirm('Aucun emplacement choisi (ou pas assez) : le logo sera « à placer ».\nAjouter quand même ?')) return;
  if (suite === 'visuel' && !nouveaux.length
      && !confirm('Aucun nouveau fichier pour ce produit. Continuer quand même ?')) return;

  bouton.disabled = true;
  // durée du spot et son lus dans la vidéo (plus de saisie à la main) : repris par la diffusion
  const videos = ['ajoute', 'visuel'].includes(suite) ? nouveaux.filter(f => f.role === 'visuel') : [];
  const durees = videos.map(f => f.duree_s).filter(Boolean);
  const duree = durees.length ? Math.max(1, Math.round(Math.max(...durees))) : null;
  const sons = p.famille === 'temps' && p.support === 'Vidéotron' ? videos.map(f => f.son).filter(Boolean) : [];
  const avecSon = sons.length ? sons.includes('oui') : null;
  const lu = {
    ...(duree && duree !== a.duree_s ? { duree_s: duree } : {}),
    ...(avecSon !== null && avecSon !== a.avec_son ? { avec_son: avecSon } : {}),
  };
  if (Object.keys(lu).length) {
    await sb.from('demandes_produits').update(lu).eq('demande_id', a.demande_id).eq('produit_id', a.produit_id);
  }
  const { data, error } = await sb.rpc('traiter_produit', {
    p_demande: a.demande_id,
    p_produit: a.produit_id,
    p_suite: suite,
    p_options: {
      ligne_id: choix.ligne_id || null,
      date_fin: choix.date_fin || null,
      emplacements: suite === 'ajoute' ? [...choix.emplacements] : [],
      fichiers: ['ajoute', 'visuel'].includes(suite)
        ? nouveaux.map(({ role, storage_path, nom_visuel, mime, taille_octets, largeur_px, hauteur_px, duree_s }) =>
            ({ role, storage_path, nom_visuel, mime, taille_octets, largeur_px, hauteur_px, duree_s }))
        : [],
    },
  });
  bouton.disabled = false;
  if (error) return notifier(`Impossible (rien n'a été modifié) : ${error.message}`, 'erreur');
  // nouveau visuel sur une diffusion existante : durée et son suivent la nouvelle vidéo
  const suit = { ...(duree ? { duree_s: duree } : {}), ...(avecSon !== null ? { avec_son: avecSon } : {}) };
  if (suite === 'visuel' && data?.ligne_id && Object.keys(suit).length) {
    await sb.from('lignes_vendues').update(suit).eq('id', data.ligne_id);
  }

  notifier(`${{ ajoute: 'Ajouté au produit', visuel: 'Nouveau visuel mis', retire: 'Diffusion arrêtée', ignore: 'Demande ignorée pour ce produit' }[suite]} · ${p.nom}`
    + (data?.demande_traitee ? ' · la demande est complète : marquée « Traitée »' : ''));
  cartes.delete(k);
  oublierContextes();
  await options.apres?.(data);
}
