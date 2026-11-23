import { CRITERES } from './referentiel';
import type { CritereEvalue } from '../types';

// Réponse SIMULÉE, utilisée seulement si le backend est injoignable (VITE_ALLOW_MOCK=true).
// Même format que backend/schemas.py : permet de développer le front sans appeler le LLM.

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const phrases = (texte: string): string[] =>
  texte
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 25 && p.length < 220);

export function evaluationsSimulees(vecteur: string, applicables: string[], texte: string): CritereEvalue[] {
  const extraits = phrases(texte);
  return CRITERES.filter((c) => c.vecteur === vecteur && applicables.includes(c.id)).map((c) => {
    const h = hash(c.id + texte.length);
    const t = h % 100;
    // ~35 % des critères restent « sans information », comme avec le vrai modèle.
    if (t < 35) return { id_critere: c.id, note: null, type_preuve: null, preuve_extrait: null, quick_win: null };
    const note = t < 45 ? 0 : t < 65 ? 1 : t < 85 ? 2 : t < 96 ? 3 : 4;
    const types = ['Declaratif', 'Notice / CCTP', 'Visible sur plan', 'Visible sur plan', 'PV / mesure'];
    return {
      id_critere: c.id,
      note,
      type_preuve: note === 0 ? 'Aucune' : types[h % types.length],
      preuve_extrait: note === 0 ? 'Aucune mention (simulé)' : extraits.length ? extraits[h % extraits.length] : 'Observation sur plan (simulée)',
      quick_win: note <= 2 ? c.quickWinAssocie || 'Compléter la conception de ce critère (simulé).' : null
    };
  });
}
