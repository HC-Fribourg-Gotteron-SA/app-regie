// Changements Colosseo entre le match précédent et ce match (calcul pur, testable dans Node).
// Un passage = une diffusion x un match ; il « passe » quand son statut est prévu (ou diffusé).
// Les playlists restent d'un match à l'autre : la Régie n'a à faire que ces différences.

export const PASSE = new Set(['prevu', 'diffuse']);

// passagesAvant / passagesCe : [{ ligne_id, statut, asset_id }] ; lignes : Map(id -> diffusion)
export function calculerChangements({ passagesAvant, passagesCe, lignes }) {
  const avant = new Map(passagesAvant.map(p => [p.ligne_id, p]));
  const ce = new Map(passagesCe.map(p => [p.ligne_id, p]));
  const changements = [];

  for (const [id, p] of ce) {
    if (!PASSE.has(p.statut)) continue;
    const a = avant.get(id);
    if (!a || !PASSE.has(a.statut)) {
      changements.push({ action: 'ajouter', ligne_id: id, asset_id: p.asset_id, raison: raisonAjout(lignes.get(id), a) });
    } else if (p.asset_id && a.asset_id && a.asset_id !== p.asset_id) {
      // ancien visuel inconnu (ex. diffusions importées : pas de visuel sur les matchs passés) = pas un changement
      changements.push({ action: 'visuel', ligne_id: id, asset_id: p.asset_id, ancien_asset_id: a.asset_id, raison: 'nouveau visuel' });
    }
  }
  for (const [id, a] of avant) {
    if (!PASSE.has(a.statut)) continue;
    const p = ce.get(id);
    if (!p || !PASSE.has(p.statut)) {
      changements.push({ action: 'enlever', ligne_id: id, asset_id: a.asset_id, raison: raisonRetrait(lignes.get(id)) });
    }
  }
  return changements;
}

function raisonAjout(l, avant) {
  if (avant) return 'de nouveau à l’écran';
  if (l?.type_vente === 'match') return 'vendu pour ce match : il entre dans la playlist ce jour-là';
  return 'nouveau';
}

function raisonRetrait(l) {
  if (!l) return 'retiré';
  if (['termine', 'annule'].includes(l.statut) || l.date_fin) return 'retiré';
  // une seule notion « à l'écran » (l'ancien « désactivé » compte comme « plus à l'écran »)
  if (!l.validee || l.suspendue) return `plus à l’écran${l.motif_suspension ? ` : ${l.motif_suspension}` : ''}`;
  if (l.type_vente === 'match') return 'son match est passé';
  return 'ne passe plus';
}

// Ce que la Régie fait concrètement, selon le type de produit (le produit est en titre du groupe)
// « Ajouter à <produit> » / « Enlever de <produit> » (demandé par Léa le 01.10.2026 : ex. « Ajouter à Sponsor du match ») ;
// LED 3M / 6M : on parle du logo et du Banner HCFG
export function consigne(action, famille, categorie = '', produit = '') {
  if (action === 'visuel') return 'Remplacer le visuel';
  if (famille === 'emplacement') return action === 'ajouter' ? 'Mettre le logo' : 'Enlever le logo · remettre Banner HCFG';
  const nom = produit || (categorie === 'Action scenes' ? 'l’action scene' : 'la playlist');
  return action === 'ajouter' ? `Ajouter à ${nom}` : `Enlever de ${nom}`;
}
