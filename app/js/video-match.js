// Vidéo différente à chaque match, déposée le jour même (21.10.2026, Léa : « Spot chef » de Leguriviera, transmis
// par le Sponsoring). Diffusions en `regle_rotation = 'par_match'` (migration 64) : une vidéo par match (assets.match_id).
// Utilisé par la page Demandes (Sponsoring : prochain match) et par Match du jour (Régie : le match affiché).
import { sb, echapper, dateCourte, notifier, nomFichierSur, lireDimensions, boutonVoir } from './app.js';
import { analyserSon } from './son-video.js';

const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const heure = (d) => new Date(d).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

// Diffusions « une vidéo par match » encore actives, avec leurs matchs et leurs vidéos déjà déposées
export async function chargerVideosMatch() {
  const { data, error } = await sb.from('lignes_vendues')
    .select('id, consignes, produit:produits(nom), contrat:contrats(sponsor:sponsors(nom)), matchs:lignes_matchs(match:matchs(id, date_heure, adversaire))')
    .eq('regle_rotation', 'par_match').not('statut', 'in', '(annule,termine)');
  if (error || !data?.length) return [];
  const [{ data: videos }, { data: personnes }] = await Promise.all([
    sb.from('assets').select('id, ligne_id, match_id, nom_visuel, storage_path, depose_par, depose_le')
      .in('ligne_id', data.map(l => l.id)).eq('statut', 'valide').not('match_id', 'is', null),
    sb.from('profiles').select('id, nom, email'),
  ]);
  const nomDe = new Map((personnes || []).map(p => [p.id, p.nom || (p.email || '').split('@')[0]]));
  return data.map(l => ({
    ...l,
    titre: /spot chef/i.test(l.consignes || '') ? 'Spot chef' : 'Vidéo du match',
    matchs: (l.matchs || []).map(x => x.match).filter(Boolean).sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure)),
    videos: (videos || []).map(v => ({ ...v, par: nomDe.get(v.depose_par) || '' })).filter(v => v.ligne_id === l.id),
  }));
}

// Le match concerné pour une diffusion : celui demandé (Match du jour) ou le prochain (aujourd'hui compris)
export function matchConcerne(l, matchId = null) {
  if (matchId) return l.matchs.find(m => m.id === matchId) || null;
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  return l.matchs.find(m => new Date(m.date_heure) >= debut) || null;
}

// Une carte par diffusion concernée ; vide si rien
export function cartesVideos(lignes, { matchId = null, peutDeposer = true } = {}) {
  return lignes.map(l => {
    const m = matchConcerne(l, matchId);
    if (!m) return '';
    const v = l.videos.find(x => x.match_id === m.id);
    const ceSoir = jourLocal(m.date_heure) === jourLocal(new Date());
    return `
      <div class="carte video-match${v ? ' recue' : ''}" data-ligne="${l.id}" data-match="${m.id}" data-date="${jourLocal(m.date_heure)}">
        <div class="video-match-entete">
          <span>🎬 <strong>${echapper(l.titre)} · ${echapper(l.contrat?.sponsor?.nom || '')}</strong>
            <span class="doux petit">· ${echapper(l.produit?.nom || '')} · ${ceSoir ? 'ce soir' : `match du ${dateCourte(m.date_heure)}`} contre ${echapper(m.adversaire)}</span></span>
          ${v ? `<span class="etat etat-ecran">✓ vidéo reçue</span>` : '<span class="etat etat-attente">⏳ vidéo pas encore reçue</span>'}
        </div>
        ${v ? `<div class="petit" style="margin-top:.35rem">${echapper(v.nom_visuel)}
            <span class="doux">· déposée${v.par ? ` par ${echapper(v.par)}` : ''} le ${dateCourte(v.depose_le)} à ${heure(v.depose_le)}</span>
            ${boutonVoir(v.storage_path)}
            <button type="button" class="btn btn-discret" data-telecharger-video="${echapper(v.storage_path)}">Télécharger</button></div>` : ''}
        ${peutDeposer ? `<div class="zone-depot zone-compacte" data-depot-video style="margin-top:.5rem">
            ${v ? 'Mauvaise vidéo ? Glissez la bonne ici' : 'Glissez la vidéo de ce match ici'} ou <u>cliquez pour choisir</u>
            <input type="file" accept="video/*" hidden data-fichier-video></div>` : ''}
      </div>`;
  }).join('');
}

// Branche le dépôt / téléchargement sur une zone ; apres() = recharger
export function brancherVideos(zone, apres) {
  if (zone.dataset.videosBranche) return;
  zone.dataset.videosBranche = '1';
  const deposer = async (carte, fichier) => {
    if (!fichier) return;
    const depot = carte.querySelector('[data-depot-video]');
    if (depot) depot.textContent = `Envoi de ${fichier.name}…`;
    try {
      const chemin = `diffusions/${carte.dataset.ligne}/match-${carte.dataset.date}__${Date.now().toString(36)}-${nomFichierSur(fichier.name)}`;
      const [dims, son] = await Promise.all([lireDimensions(fichier), analyserSon(fichier).catch(() => null)]);
      const { error: e1 } = await sb.storage.from('assets').upload(chemin, fichier, { upsert: false, contentType: fichier.type || undefined });
      if (e1) throw new Error(`Envoi impossible : ${e1.message}`);
      const { error: e2 } = await sb.rpc('deposer_video_match', {
        p_ligne: carte.dataset.ligne, p_match: carte.dataset.match, p_chemin: chemin, p_nom: fichier.name,
        p_mime: fichier.type || null, p_taille: fichier.size, p_duree: dims?.duree || null,
        p_son: son === 'oui' ? true : son ? false : null,
      });
      if (e2) {
        await sb.storage.from('assets').remove([chemin]);
        throw new Error(/deposer_video_match/.test(e2.message) ? 'Exécutez d’abord la migration 64 dans Supabase.' : e2.message);
      }
      notifier('Vidéo déposée : la Régie la voit dans Match du jour.');
      await apres?.();
    } catch (err) {
      notifier(err.message, 'erreur');
      await apres?.();
    }
  };
  zone.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-telecharger-video]');
    if (t) {
      const { data, error } = await sb.storage.from('assets').createSignedUrl(t.dataset.telechargerVideo, 600, { download: true });
      if (error) return notifier(error.message, 'erreur');
      location.href = data.signedUrl;
      return;
    }
    const d = e.target.closest('[data-depot-video]');
    if (d && e.target.tagName !== 'INPUT') d.querySelector('input[type=file]').click();
  });
  zone.addEventListener('change', (e) => {
    if (e.target.dataset.fichierVideo !== undefined) deposer(e.target.closest('.video-match'), e.target.files[0]);
  });
  zone.addEventListener('dragover', (e) => { const d = e.target.closest('[data-depot-video]'); if (d) { e.preventDefault(); d.classList.add('survol'); } });
  zone.addEventListener('dragleave', (e) => e.target.closest('[data-depot-video]')?.classList.remove('survol'));
  zone.addEventListener('drop', (e) => {
    const d = e.target.closest('[data-depot-video]');
    if (!d) return;
    e.preventDefault();
    deposer(d.closest('.video-match'), e.dataTransfer.files[0]);
  });
}
