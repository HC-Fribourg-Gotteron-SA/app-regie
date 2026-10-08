// Fichiers de travail de la Régie (PSD des LED, Canva des slides) : calcul pur, testable dans Node.
// Ce qui a changé sur un produit depuis la dernière mise à jour du fichier de travail (date « depuis ») :
//   ajout   = passe maintenant, n'existait pas (ou n'était pas à l'écran) à la dernière mise à jour
//   retrait = existait avant, ne passe plus (retiré, terminé, plus à l'écran)
//   logo    = passait déjà, nouveau logo validé depuis
// lignes = diffusions avec : statut, date_fin, validee, validee_le, suspendue, created_at, updated_at, assets[]

export function passeMaintenant(l, aujourdhui) {
  return !['annule', 'termine', 'brouillon'].includes(l.statut) && !(l.date_fin && l.date_fin < aujourdhui)
    && l.validee !== false && !l.suspendue;
}

export function changementsDepuis(lignes, depuis, aujourdhui) {
  const d = new Date(depuis).getTime();
  const apres = (x) => !!x && new Date(x).getTime() > d;
  const res = [];
  for (const l of lignes) {
    const avant = new Date(l.created_at).getTime() <= d;
    const passe = passeMaintenant(l, aujourdhui);
    if (passe && (!avant || apres(l.validee_le))) res.push({ type: 'ajout', l });
    else if (!passe && avant && apres(l.updated_at)) res.push({ type: 'retrait', l });
    else if (passe && (l.assets || []).some(a => a.statut === 'valide' && apres(a.valide_le))) res.push({ type: 'logo', l });
  }
  return res;
}

// Dernier logo / visuel validé d'une diffusion (pour le télécharger)
export function dernierVisuel(l) {
  return (l.assets || []).filter(a => a.statut === 'valide' || a.statut === 'archive')
    .sort((a, b) => (a.statut === 'valide' ? 0 : 1) - (b.statut === 'valide' ? 0 : 1)
      || new Date(b.valide_le || 0) - new Date(a.valide_le || 0))[0] || null;
}
