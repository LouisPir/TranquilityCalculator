import { ALLOW_MOCK, API_TIMEOUT_MS, API_URL, MAX_NOTE } from '../config';
import type { ContexteAutoRempli, CritereEvalue, Source } from '../types';
import { contexteSimule, evaluationsSimulees } from './mock';
import { codeVecteur } from './referentiel';

// Expected backend contract:
//   POST /api/extraction      multipart : pdf?, plans[]?                 -> { texte, plans_b64 }
//   POST /api/contexte        JSON { texte, plans_b64, nom_fichier? }    -> ContexteAutoRempli
//   POST /api/audit/vecteur   JSON { vecteur, texte, plans_b64, reponses } -> { vecteur, evaluations: CritereEvalue[] }

export interface Extraction {
  texte: string;
  plans_b64: string[];
}

class BackendInjoignable extends Error {}

async function appeler<T>(chemin: string, init: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${chemin}`, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if ([502, 503, 504].includes(res.status) || (res.status === 500 && detail.trim() === '')) {
        throw new BackendInjoignable("Backend injoignable : vérifiez qu'il est lancé (uvicorn, port 8000).");
      }
      throw new Error(`Le backend a répondu ${res.status}${detail ? ` : ${detail.slice(0, 200)}` : ''}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const estPanneReseau = (e: unknown): boolean =>
  e instanceof BackendInjoignable || e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError');

function evaluationValide(x: unknown): x is CritereEvalue {
  if (!x || typeof x !== 'object') return false;
  const e = x as Partial<CritereEvalue>;
  return (
    typeof e.id_critere === 'string' &&
    (e.note === null || e.note === undefined || (Number.isInteger(e.note) && e.note >= 0 && e.note <= MAX_NOTE))
  );
}

export async function extraire(pdf: File | null, plans: File[], textePrecolle: string): Promise<{ extraction: Extraction; source: Source }> {
  if (!pdf && plans.length === 0) return { extraction: { texte: textePrecolle, plans_b64: [] }, source: 'api' };
  try {
    const fd = new FormData();
    if (pdf) fd.append('pdf', pdf);
    plans.forEach((p) => fd.append('plans', p));
    const r = await appeler<Extraction>('/api/extraction', { method: 'POST', body: fd });
    if (typeof r.texte !== 'string' || !Array.isArray(r.plans_b64)) {
      throw new Error('Réponse /api/extraction inattendue (attendu : texte, plans_b64).');
    }
    return { extraction: { texte: [textePrecolle, r.texte].filter(Boolean).join('\n\n'), plans_b64: r.plans_b64 }, source: 'api' };
  } catch (e) {
    if (ALLOW_MOCK && estPanneReseau(e)) return { extraction: { texte: textePrecolle, plans_b64: [] }, source: 'mock' };
    throw e instanceof Error ? e : new Error('Erreur inconnue');
  }
}

// Auto-fills Step 1 fields (operation metadata, 9 applicability answers, detected documents) from extracted content.
export async function analyserContexte(args: {
  texte: string;
  plansB64: string[];
  nomFichier?: string;
}): Promise<{ contexte: ContexteAutoRempli; source: Source }> {
  try {
    const r = await appeler<ContexteAutoRempli>('/api/contexte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texte: args.texte, plans_b64: args.plansB64, nom_fichier: args.nomFichier ?? null })
    });
    return {
      contexte: {
        projet: r.projet ?? {},
        reponses: r.reponses ?? {},
        pieces: Array.isArray(r.pieces) ? r.pieces : []
      },
      source: 'api'
    };
  } catch (e) {
    // Fall back to local heuristic extraction if /api/contexte is not deployed yet (404) or in offline mock mode.
    const is404 = e instanceof Error && e.message.includes('404');
    if (is404 || (ALLOW_MOCK && estPanneReseau(e))) {
      return { contexte: contexteSimule(args.texte, args.nomFichier), source: 'mock' };
    }
    throw e instanceof Error ? e : new Error('Erreur inconnue lors du pré-remplissage');
  }
}

export async function evaluerVecteur(args: {
  vecteur: string;
  texte: string;
  plansB64: string[];
  reponses: Record<string, boolean | null>;
  applicables: string[];
}): Promise<{ evaluations: CritereEvalue[]; source: Source }> {
  try {
    const r = await appeler<{ vecteur: string; evaluations: unknown }>('/api/audit/vecteur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vecteur: args.vecteur, texte: args.texte, plans_b64: args.plansB64, reponses: args.reponses })
    });
    if (!Array.isArray(r.evaluations) || !r.evaluations.every(evaluationValide)) {
      throw new Error('Réponse /api/audit/vecteur inattendue : elle ne correspond pas à BatchAuditResponse (schemas.py).');
    }
    const evaluations = (r.evaluations as CritereEvalue[]).map((e) => ({
      id_critere: e.id_critere,
      note: e.note ?? null,
      type_preuve: e.type_preuve ?? null,
      preuve_extrait: e.preuve_extrait ?? null,
      quick_win_ia: e.quick_win_ia ?? null
    }));
    return { evaluations, source: 'api' };
  } catch (e) {
    if (ALLOW_MOCK && estPanneReseau(e)) {
      await new Promise((ok) => setTimeout(ok, 350));
      return { evaluations: evaluationsSimulees(codeVecteur(args.vecteur), args.applicables, args.texte), source: 'mock' };
    }
    throw e instanceof Error ? e : new Error('Erreur inconnue');
  }
}