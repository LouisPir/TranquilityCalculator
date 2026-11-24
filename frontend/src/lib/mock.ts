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
    if (t < 35) return { id_critere: c.id, note: null, type_preuve: null, preuve_extrait: null, quick_win_ia: null };
    const note = t < 45 ? 0 : t < 65 ? 1 : t < 85 ? 2 : t < 96 ? 3 : 4;
    const types = ['Declaratif', 'Notice / CCTP', 'Visible sur plan', 'Visible sur plan', 'PV / mesure'];
    return {
      id_critere: c.id,
      note,
      type_preuve: note === 0 ? 'Aucune' : types[h % types.length],
      preuve_extrait: note === 0 ? 'Aucune mention (simulé)' : extraits.length ? extraits[h % extraits.length] : 'Observation sur plan (simulée)',
      quick_win_ia: note <= 2 ? c.quickWinAssocie || 'Compléter la conception de ce critère (simulé).' : null
    };
  });
}

import { OPTIONS_PHASE, OPTIONS_TYPE_OPERATION } from '../config';
import { PIECES } from './referentiel';
import type { CodeTag, ContexteAutoRempli, Reponse } from '../types';

// Local regex/keyword fallback used if /api/contexte is unreachable or not implemented yet.
export function contexteSimule(texte: string, nomFichier?: string): ContexteAutoRempli {
  const t = texte.toLowerCase();

  const surfaceMatch = texte.match(/(\d[\d\s\u00a0.,]{1,10})\s*(m²|m2|ha|hectares?)/i);
  let surfaceM2: number | null = null;
  if (surfaceMatch) {
    const raw = Number(surfaceMatch[1].replace(/[\s\u00a0]/g, '').replace(',', '.'));
    if (!Number.isNaN(raw)) {
      surfaceM2 = surfaceMatch[2].toLowerCase().startsWith('ha') ? Math.round(raw * 10000) : Math.round(raw);
    }
  }

  const logMatch = texte.match(/(\d[\d\s\u00a0]{0,5})\s*logements?/i);
  const logements = logMatch ? Number(logMatch[1].replace(/[\s\u00a0]/g, '')) || null : null;

  const phase =
    OPTIONS_PHASE.find((p) => t.includes(p.toLowerCase().split(' / ')[0])) ??
    (t.includes('permis de construire') ? 'Permis de construire' : '');

  const typeOperation =
    (t.includes('zac') && 'Aménagement / ZAC') ||
    (t.includes('réhabilit') && 'Réhabilitation / renouvellement urbain') ||
    (t.includes('commer') && t.includes('logement') && 'Mixte logements + commerces') ||
    (t.includes('logement') && 'Résidentiel neuf') ||
    OPTIONS_TYPE_OPERATION.find((o) => t.includes(o.toLowerCase())) ||
    '';

  const nom = nomFichier ? nomFichier.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() : '';

  const detect = (re: RegExp): Reponse => (re.test(t) ? 'oui' : null);
  const reponses: Partial<Record<CodeTag, Reponse>> = {
    ESP: detect(/espace[s]?\s+public|parvis|square|mail\s+pi[ée]ton|place\s+publique/),
    VOI: detect(/voirie|carrefour|intersection|chauss[ée]e|rue\s+cr[ée][ée]/),
    EXT: detect(/c[œo]ur\s+d['’][îi]lot|jardin|venelle|espace[s]?\s+ext[ée]rieur/),
    PRK: detect(/parking|stationnement\s+(souterrain|silo|a[ée]rien)/),
    LOG: logements !== null || /logement|r[ée]sidentiel|appartement/.test(t) ? 'oui' : null,
    RDC: detect(/rdc\s+actif|rez-de-chauss[ée]e.*(commerc|activit|service)|commerce/),
    EQP: detect(/[ée]cole|groupe\s+scolaire|cr[èe]che|[ée]quipement\s+public|gymnase/),
    TC: detect(/arr[êe]t\s+de\s+(bus|tram)|gare|m[ée]tro|transport[s]?\s+en\s+commun/),
    REH: detect(/r[ée]habilit|renouvellement\s+urbain|site\s+occup[ée]/)
  };

  const pieces = PIECES.filter((p) => {
    const mots = p.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((m) => m.length > 4);
    return mots.some((m) => t.includes(m));
  });

  return {
    projet: {
      ...(nom ? { nom } : {}),
      ...(typeOperation ? { typeOperation } : {}),
      ...(phase ? { phase } : {}),
      ...(surfaceM2 !== null ? { surfaceM2 } : {}),
      ...(logements !== null ? { logements } : {})
    },
    reponses,
    pieces
  };
}