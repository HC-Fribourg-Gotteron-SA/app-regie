// Bloc « Fichier de travail » de la fiche produit (Régie / admin, demandé par Léa le 08.10.2026, migration 44) :
//   LED 3M / 6M : le PSD unique de la Régie (calques) — dernière version, versions précédentes, et
//                 « À mettre dans le PSD » : logos ajoutés / enlevés / changés depuis la dernière mise à jour ;
//   Slides      : le design Canva de la série (lien) et « À mettre dans Canva », même liste.
// La liste part de la dernière mise à jour (« ✓ à jour ») : la première fois, on marque le fichier à jour.
import { sb, echapper, dateCourte, notifier, nomFichierSur, taille, toutesLesLignes } from './app.js';
import { changementsDepuis, dernierVisuel } from './travail-calcul.js';

const LIMITE = 50 * 1024 * 1024;          // Supabase gratuit : 50 Mo par fichier
const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const heure = (d) => new Date(d).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

export async function afficherFichiersTravail(zone, p) {
  if (!zone || !p || !['emplacement', 'slide'].includes(p.famille)) return;
  const led = p.famille === 'emplacement';
  const cle = led ? 'led' : p.id;
  const quoi = led ? 'le PSD' : 'Canva';

  const [{ data: versions, error }, { data: personnes }, produitsLed] = await Promise.all([
    sb.from('fichiers_travail').select('*').eq('cle', cle).order('fait_le', { ascending: false }),
    sb.from('profiles').select('id, nom, email'),
    led ? sb.from('produits').select('id, nom').eq('famille', 'emplacement') : Promise.resolve({ data: [p] }),
  ]);
  if (error) {           // migration 44 pas encore exécutée : on n'affiche rien
    zone.hidden = true;
    return;
  }
  const nomDe = (id) => { const x = (personnes || []).find(y => y.id === id); return x ? (x.nom || x.email.split('@')[0]) : '—'; };
  const derniere = versions?.[0];
  const fichier = versions?.find(v => v.storage_path || (led && v.lien));
  const lienCanva = !led ? versions?.find(v => v.lien)?.lien : null;

  // changements depuis la dernière mise à jour
  let changements = [];
  if (derniere) {
    const ids = (produitsLed.data || []).map(x => x.id);
    const lignes = await toutesLesLignes((de, a) => sb.from('lignes_vendues')
      .select(`id, statut, date_fin, validee, validee_le, suspendue, created_at, updated_at,
               produit:produits(nom), contrat:contrats(sponsor:sponsors(nom)),
               emplacements:lignes_emplacements(emplacement:emplacements(anneau, position)),
               assets(id, nom_visuel, statut, storage_path, valide_le)`)
      .in('produit_id', ids).or(`updated_at.gt."${derniere.fait_le}",created_at.gt."${derniere.fait_le}"`).range(de, a));
    changements = changementsDepuis(lignes, derniere.fait_le, jourLocal(new Date()));
    const place = (l) => (l.emplacements || []).map(e => e.emplacement).filter(Boolean)
      .sort((a, b) => a.anneau.localeCompare(b.anneau) || a.position - b.position);
    changements.forEach(c => { c.places = place(c.l); });
    changements.sort((a, b) => {
      const pa = a.places[0], pb = b.places[0];
      return (pa && pb ? pa.anneau.localeCompare(pb.anneau) || pa.position - pb.position : 0)
        || (a.l.contrat?.sponsor?.nom || '').localeCompare(b.l.contrat?.sponsor?.nom || '');
    });
  }
  const aTelecharger = changements.filter(c => c.type !== 'retrait').map(c => ({ c, v: dernierVisuel(c.l) }))
    .filter(x => x.v?.storage_path);

  const LIBELLE = { ajout: ['➕', 'Ajouter', 'changement-ajouter'], retrait: ['➖', 'Enlever', 'changement-enlever'],
                    logo: ['🔄', 'Nouveau logo', 'changement-visuel'] };
  const ligneChangement = (c) => {
    const [icone, verbe, classe] = LIBELLE[c.type];
    const v = dernierVisuel(c.l);
    const places = c.places.map(e => `${e.anneau}${e.position}`).join(' + ');
    return `<li class="travail-changement">
      <span class="${classe}"><strong class="changement-verbe">${icone} ${verbe}</strong></span>
      <span><strong>${echapper(c.l.contrat?.sponsor?.nom || '—')}</strong>
        ${places ? `<span class="badge">${echapper(places)}</span>` : ''}
        ${led ? `<span class="doux petit">${echapper(c.l.produit?.nom || '')}</span>` : ''}
        ${c.type === 'retrait' && led ? '<span class="doux petit">→ remettre Banner HCFG</span>' : ''}</span>
      ${c.type !== 'retrait' && v?.storage_path
        ? `<button type="button" class="btn btn-discret petit" data-telecharger-visuel="${echapper(v.storage_path)}">Télécharger</button>`
        : c.type !== 'retrait' ? `<span class="doux petit">${v ? `visuel « ${echapper(v.nom_visuel)} » sans fichier` : 'pas de fichier'}</span>` : ''}
    </li>`;
  };

  zone.hidden = false;
  zone.innerHTML = `
    <div class="carte bloc-travail">
      <div class="titre-section">
        <h3 style="margin:0">${led ? '📁 Fichier PSD des LED' : '🎨 Design Canva'} <span class="doux petit">· Régie</span></h3>
        <div class="travail-actions">
          ${led ? `
            <label class="btn">Déposer le PSD mis à jour<input type="file" id="travail-fichier" hidden></label>
            <button type="button" class="btn btn-discret" id="travail-lien">Lien OneDrive…</button>`
          : `${lienCanva ? `<a class="btn" href="${echapper(lienCanva)}" target="_blank" rel="noopener">Ouvrir dans Canva ↗</a>` : ''}
            <button type="button" class="btn btn-discret" id="travail-lien">${lienCanva ? 'Changer le lien…' : 'Lien du design Canva…'}</button>`}
          <button type="button" class="btn btn-principal" id="travail-a-jour">✓ ${led ? 'PSD' : 'Canva'} à jour</button>
        </div>
      </div>
      <p class="petit" style="margin:.5rem 0 0">
        ${derniere ? `Dernière mise à jour : <strong>${dateCourte(derniere.fait_le)} à ${heure(derniere.fait_le)}</strong> par ${echapper(nomDe(derniere.fait_par))}`
          : `<span class="doux">Pas encore de suivi. Quand ${quoi} est à jour, cliquez « ✓ ${led ? 'PSD' : 'Canva'} à jour » : ensuite, chaque changement s'affichera ici.</span>`}
        ${led && fichier ? ` · ${fichier.storage_path
          ? `<button type="button" class="btn-lien" data-telecharger-visuel="${echapper(fichier.storage_path)}">Télécharger ${echapper(fichier.nom || 'le PSD')}</button>${fichier.taille_octets ? ` <span class="doux">(${taille(fichier.taille_octets)})</span>` : ''}`
          : `<a href="${echapper(fichier.lien)}" target="_blank" rel="noopener">Ouvrir le PSD (OneDrive) ↗</a>`}` : ''}
      </p>
      ${derniere ? `
        <h4 style="margin:1rem 0 .4rem">À mettre dans ${quoi} <span class="menu-compteur"${changements.length ? '' : ' hidden'}>${changements.length}</span></h4>
        ${changements.length ? `
          <ul class="travail-liste">${changements.map(ligneChangement).join('')}</ul>
          ${aTelecharger.length > 1 ? `<button type="button" class="btn" id="travail-tout">Tout télécharger (${aTelecharger.length} logos, .zip)</button>` : ''}`
          : `<p class="doux petit" style="margin:0">✓ Rien de nouveau depuis la dernière mise à jour.</p>`}` : ''}
      ${led && (versions || []).filter(v => v.storage_path || v.lien).length > 1 ? `
        <details style="margin-top:.8rem"><summary class="petit">Versions précédentes</summary>
          <ul class="travail-liste">${versions.filter(v => v.storage_path || v.lien).slice(1).map(v => `
            <li><span class="petit">${dateCourte(v.fait_le)} · ${echapper(nomDe(v.fait_par))}</span>
              ${v.storage_path ? `<button type="button" class="btn btn-discret petit" data-telecharger-visuel="${echapper(v.storage_path)}">${echapper(v.nom || 'PSD')}</button>`
                : `<a class="petit" href="${echapper(v.lien)}" target="_blank" rel="noopener">lien OneDrive ↗</a>`}</li>`).join('')}</ul>
        </details>` : ''}
    </div>`;

  const recharger = () => afficherFichiersTravail(zone, p);
  const enregistrer = async (ligne, message) => {
    const { error: e } = await sb.from('fichiers_travail').insert({ cle, ...ligne });
    if (e) return notifier(`Enregistrement impossible : ${e.message}`, 'erreur');
    notifier(message);
    recharger();
  };

  zone.querySelector('#travail-a-jour').onclick = () => {
    if (changements.length && !confirm(`${quoi === 'le PSD' ? 'Le PSD est' : 'Canva est'} à jour avec les ${changements.length} changements de la liste ?\nLa liste sera vidée.`)) return;
    enregistrer({}, `${led ? 'PSD' : 'Canva'} marqué à jour`);
  };
  zone.querySelector('#travail-lien').onclick = () => {
    const lien = prompt(led ? 'Lien OneDrive du PSD (s’il est trop lourd pour l’outil) :' : 'Lien du design Canva de cette série :', led ? '' : lienCanva || '');
    if (!lien?.trim()) return;
    if (!/^https?:\/\//i.test(lien.trim())) return notifier('Le lien doit commencer par https://', 'erreur');
    enregistrer({ lien: lien.trim() }, led ? 'Lien du PSD enregistré · PSD marqué à jour' : 'Lien Canva enregistré');
  };
  zone.querySelector('#travail-fichier')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > LIMITE) {
      e.target.value = '';
      return notifier(`Fichier trop lourd pour l’outil (${taille(f.size)}, maximum 50 Mo) : mettez-le sur OneDrive et utilisez « Lien OneDrive… ».`, 'erreur');
    }
    const chemin = `travail/${cle}/${Date.now()}__${nomFichierSur(f.name)}`;
    notifier(`Envoi de ${f.name}…`);
    const { error: e1 } = await sb.storage.from('assets').upload(chemin, f, { upsert: false });
    if (e1) return notifier(`Envoi impossible : ${e1.message}`, 'erreur');
    enregistrer({ storage_path: chemin, nom: f.name, taille_octets: f.size }, 'PSD déposé · liste remise à zéro');
  });
  zone.querySelector('#travail-tout')?.addEventListener('click', async (e) => {
    const b = e.target;
    b.disabled = true;
    try {
      const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
      const zip = new JSZip();
      for (const [k, { c, v }] of aTelecharger.entries()) {
        b.textContent = `Préparation ${k + 1}/${aTelecharger.length}…`;
        const { data, error: e2 } = await sb.storage.from('assets').download(v.storage_path);
        if (e2) continue;
        const ext = v.storage_path.includes('.') ? v.storage_path.split('.').pop() : 'png';
        const places = c.places.map(x => `${x.anneau}${x.position}`).join('+');
        zip.file(nomFichierSur(`${places ? `${places} - ` : ''}${c.l.contrat?.sponsor?.nom || 'logo'}.${ext}`), data);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob),
        download: `${led ? 'LED' : nomFichierSur(p.nom)}_a_mettre_${jourLocal(new Date())}.zip` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      notifier(`Téléchargement impossible : ${err.message}`, 'erreur');
    }
    b.disabled = false;
    b.textContent = `Tout télécharger (${aTelecharger.length} logos, .zip)`;
  });
}
