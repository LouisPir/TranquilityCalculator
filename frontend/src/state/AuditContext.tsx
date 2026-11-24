import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { STORAGE_KEY } from '../config';
import { analyserContexte, evaluerVecteur, extraire } from '../lib/api';
import { calculer } from '../lib/calcul';
import { DEMO_EVALUATIONS, DEMO_PIECES, DEMO_PROJET, DEMO_REPONSES, DEMO_TEXTE } from '../data/demo';
import { CRITERES, TAGS, VECTEURS, estApplicable, getCritere, tagsActifs } from '../lib/referentiel';
import type { ContexteAutoRempli, Critere, CritereEvalue, Projet, Reponse, ResultatAudit, Source, StatutRun, Step } from '../types';

interface Correction {
  note: number | null;
  type_preuve: string | null;
  preuve_extrait: string | null;
}

interface State {
  step: Step;
  projet: Projet;
  reponses: Record<string, Reponse>;
  pieces: Record<string, boolean>;
  texte: string;
  texteAudit: string;
  pdf: File | null;
  plans: File[];
  vecteursChoisis: string[];
  runs: Record<string, StatutRun>;
  erreurs: Record<string, string>;
  enCours: boolean;
  erreurGlobale: string | null;
  preRemplissageEnCours: boolean;
  preRempli: boolean;
  erreurPreRemplissage: string | null;
  source: Source | null;
  evalBrutes: Record<string, CritereEvalue>;
  corrections: Record<string, Correction>;
  ecartes: Record<string, string>;
  retirees: Record<string, boolean>;
  selVecteur: string;
  selCritere: string | null;
  auditLance: boolean;
  demo: boolean;
}

type Action =
  | { type: 'step'; step: Step }
  | { type: 'projet'; champ: Partial<Projet> }
  | { type: 'tag'; code: string; reponse: Reponse }
  | { type: 'piece'; nom: string }
  | { type: 'texte'; texte: string }
  | { type: 'pdf'; pdf: File | null }
  | { type: 'plans'; plans: File[] }
  | { type: 'preRemplirDebut' }
  | { type: 'preRemplirOk'; contexte: ContexteAutoRempli; texteAudit: string; source: Source }
  | { type: 'preRemplirErreur'; erreur: string }
  | { type: 'vecteur'; code: string }
  | { type: 'vecteursTous'; actifs: boolean }
  | { type: 'debut'; vecteurs: string[] }
  | { type: 'texteAudit'; texte: string; source: Source }
  | { type: 'runStatut'; vecteur: string; statut: StatutRun; erreur?: string }
  | { type: 'runOk'; vecteur: string; evaluations: CritereEvalue[]; source: Source }
  | { type: 'fin'; erreur: string | null }
  | { type: 'note'; id: string; note: number | null; typePreuve: string | null; preuve: string | null }
  | { type: 'noteReset'; id: string }
  | { type: 'ecarte'; id: string; motif: string | null }
  | { type: 'retiree'; id: string }
  | { type: 'selVecteur'; code: string; premier: string | null }
  | { type: 'selCritere'; id: string }
  | { type: 'demo' }
  | { type: 'reset' };

const initial: State = {
  step: 1,
  projet: { nom: '', commune: '', typeOperation: '', phase: '', surfaceM2: null, logements: null },
  reponses: {},
  pieces: {},
  texte: '',
  texteAudit: '',
  pdf: null,
  plans: [],
  vecteursChoisis: VECTEURS.map((v) => v.code),
  runs: {},
  erreurs: {},
  enCours: false,
  erreurGlobale: null,
  preRemplissageEnCours: false,
  preRempli: false,
  erreurPreRemplissage: null,
  source: null,
  evalBrutes: {},
  corrections: {},
  ecartes: {},
  retirees: {},
  selVecteur: VECTEURS[0].code,
  selCritere: null,
  auditLance: false,
  demo: false
};

const sans = <T,>(o: Record<string, T>, cle: string): Record<string, T> => {
  const copie = { ...o };
  delete copie[cle];
  return copie;
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'step':
      return { ...s, step: a.step };
    case 'projet':
      return { ...s, projet: { ...s.projet, ...a.champ } };
    case 'tag':
      return { ...s, reponses: { ...s.reponses, [a.code]: a.reponse } };
    case 'piece':
      return { ...s, pieces: { ...s.pieces, [a.nom]: !s.pieces[a.nom] } };
    case 'texte':
      return { ...s, texte: a.texte };
    case 'pdf':
      return { ...s, pdf: a.pdf, ...(a.pdf === null ? { preRempli: false, erreurPreRemplissage: null } : {}) };
    case 'plans':
      return { ...s, plans: a.plans };
    case 'preRemplirDebut':
      return { ...s, preRemplissageEnCours: true, erreurPreRemplissage: null };
    case 'preRemplirOk': {
      // Apply extracted project metadata, 9 Yes/No tags, and detected documents while preserving manual defaults if null/empty.
      const p = a.contexte.projet;
      const nextProjet: Projet = {
        nom: p.nom ?? s.projet.nom,
        commune: p.commune ?? s.projet.commune,
        typeOperation: p.typeOperation ?? s.projet.typeOperation,
        phase: p.phase ?? s.projet.phase,
        surfaceM2: p.surfaceM2 !== undefined ? p.surfaceM2 : s.projet.surfaceM2,
        logements: p.logements !== undefined ? p.logements : s.projet.logements
      };
      const nextReponses: Record<string, Reponse> = { ...s.reponses };
      for (const t of TAGS) {
        const val = a.contexte.reponses[t.code];
        if (val === 'oui' || val === 'non' || val === null) {
          nextReponses[t.code] = val;
        }
      }
      const nextPieces: Record<string, boolean> = { ...s.pieces };
      for (const nomPiece of a.contexte.pieces) {
        nextPieces[nomPiece] = true;
      }
      return {
        ...s,
        projet: nextProjet,
        reponses: nextReponses,
        pieces: nextPieces,
        texteAudit: a.texteAudit,
        source: a.source,
        preRemplissageEnCours: false,
        preRempli: true,
        erreurPreRemplissage: null,
        demo: false
      };
    }
    case 'preRemplirErreur':
      return { ...s, preRemplissageEnCours: false, erreurPreRemplissage: a.erreur };
    case 'vecteur':
      return {
        ...s,
        vecteursChoisis: s.vecteursChoisis.includes(a.code) ? s.vecteursChoisis.filter((c) => c !== a.code) : [...s.vecteursChoisis, a.code]
      };
    case 'vecteursTous':
      return { ...s, vecteursChoisis: a.actifs ? VECTEURS.map((v) => v.code) : [] };
    case 'debut': {
      const evalBrutes = { ...s.evalBrutes };
      for (const id of Object.keys(evalBrutes)) {
        const c = getCritere(id);
        if (c && a.vecteurs.includes(c.vecteur)) delete evalBrutes[id];
      }
      const runs = { ...s.runs };
      const erreurs = { ...s.erreurs };
      for (const v of a.vecteurs) {
        runs[v] = 'attente';
        delete erreurs[v];
      }
      return { ...s, enCours: true, erreurGlobale: null, evalBrutes, runs, erreurs, demo: false };
    }
    case 'texteAudit':
      return { ...s, texteAudit: a.texte, source: a.source };
    case 'runStatut': {
      const erreurs = a.erreur ? { ...s.erreurs, [a.vecteur]: a.erreur } : sans(s.erreurs, a.vecteur);
      return { ...s, runs: { ...s.runs, [a.vecteur]: a.statut }, erreurs };
    }
    case 'runOk': {
      const evalBrutes = { ...s.evalBrutes };
      const vus = new Set<string>();
      for (const e of a.evaluations) {
        const c = getCritere(e.id_critere);
        if (!c || c.vecteur !== a.vecteur || vus.has(e.id_critere)) continue;
        vus.add(e.id_critere);
        evalBrutes[e.id_critere] = e;
      }
      return { ...s, evalBrutes, runs: { ...s.runs, [a.vecteur]: 'ok' }, erreurs: sans(s.erreurs, a.vecteur), source: a.source };
    }
    case 'fin': {
      const unOk = Object.values(s.runs).some((r) => r === 'ok');
      return { ...s, enCours: false, erreurGlobale: a.erreur, auditLance: s.auditLance || unOk, step: unOk ? 2 : s.step };
    }
    case 'note':
      return { ...s, corrections: { ...s.corrections, [a.id]: { note: a.note, type_preuve: a.typePreuve, preuve_extrait: a.preuve } } };
    case 'noteReset':
      return { ...s, corrections: sans(s.corrections, a.id) };
    case 'ecarte':
      return { ...s, ecartes: a.motif ? { ...s.ecartes, [a.id]: a.motif } : sans(s.ecartes, a.id) };
    case 'retiree':
      return { ...s, retirees: { ...s.retirees, [a.id]: !s.retirees[a.id] } };
    case 'selVecteur':
      return { ...s, selVecteur: a.code, selCritere: a.premier };
    case 'selCritere':
      return { ...s, selCritere: a.id };
    case 'demo':
      return {
        ...initial,
        step: 2,
        projet: DEMO_PROJET,
        reponses: DEMO_REPONSES,
        pieces: Object.fromEntries(DEMO_PIECES.map((p) => [p, true])),
        texte: DEMO_TEXTE,
        texteAudit: DEMO_TEXTE,
        runs: Object.fromEntries(VECTEURS.map((v) => [v.code, 'ok' as StatutRun])),
        evalBrutes: Object.fromEntries(DEMO_EVALUATIONS.map((x) => [x.id_critere, x])),
        auditLance: true,
        demo: true
      };
    case 'reset':
      return { ...initial };
  }
}

interface Valeur {
  state: State;
  dispatch: Dispatch<Action>;
  deposerPdf: (pdf: File | null) => Promise<void>;
  preRemplirDepuisDossier: () => Promise<void>;
  lancer: (vecteurs?: string[]) => Promise<void>;
  applicables: Critere[];
  horsPerimetre: number;
  resultat: ResultatAudit;
  evaluations: Map<string, CritereEvalue>;
  nbQuestionsRepondues: number;
  scoreFinal: boolean;
  nbRelances: number;
}

const AuditCtx = createContext<Valeur | null>(null);

const PAUSE_RETRY_MS = 1200;
const NB_ESSAIS = 2;

const signatureFichiers = (pdf: File | null, plans: File[]): string =>
  [pdf ? `${pdf.name}:${pdf.size}:${pdf.lastModified}` : 'nopdf', ...plans.map((p) => `${p.name}:${p.size}:${p.lastModified}`)].join('|');

export function AuditProvider({ children }: { children: ReactNode }) {
  // Always start with a clean form on page reload
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state);
  ref.current = state;

  // Cache extracted PDF text and base64 plans so clicking "Lancer l'audit" does not re-extract unchanged files.
  const plansB64 = useRef<string[]>([]);
  const extractedPdfText = useRef<string>('');
  const lastExtractionSig = useRef<string>('');

  // Clear any previously saved state/errors from localStorage on mount
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Storage unavailable: ignore */
    }
  }, []);
  const executerPreRemplissage = useCallback(async (pdf: File | null, plans: File[], texteColle: string) => {
    if (!pdf && plans.length === 0 && !texteColle.trim()) return;
    dispatch({ type: 'preRemplirDebut' });
    try {
      // Extract PDF text + plans once and cache them for the upcoming audit run.
      const { extraction, source: srcExt } = await extraire(pdf, plans, '');
      extractedPdfText.current = extraction.texte;
      plansB64.current = extraction.plans_b64;
      lastExtractionSig.current = signatureFichiers(pdf, plans);

      const texteComplet = [texteColle, extraction.texte].filter(Boolean).join('\n\n');
      const { contexte, source: srcCtx } = await analyserContexte({
        texte: texteComplet,
        plansB64: extraction.plans_b64,
        nomFichier: pdf?.name
      });

      dispatch({
        type: 'preRemplirOk',
        contexte,
        texteAudit: texteComplet,
        source: srcCtx === 'api' && srcExt === 'api' ? 'api' : 'mock'
      });
    } catch (e) {
      dispatch({
        type: 'preRemplirErreur',
        erreur: e instanceof Error ? e.message : 'Impossible de pré-remplir automatiquement le dossier.'
      });
    }
  }, []);

  // Uploading a PDF immediately extracts and auto-fills Step 1 fields for review.
  const deposerPdf = useCallback(
    async (pdf: File | null) => {
      dispatch({ type: 'pdf', pdf });
      if (!pdf) {
        extractedPdfText.current = '';
        lastExtractionSig.current = '';
        return;
      }
      const s0 = ref.current;
      await executerPreRemplissage(pdf, s0.plans, s0.texte);
    },
    [executerPreRemplissage]
  );

  // Manual trigger if the user pasted text or added plan images instead of uploading a PDF.
  const preRemplirDepuisDossier = useCallback(async () => {
    const s0 = ref.current;
    await executerPreRemplissage(s0.pdf, s0.plans, s0.texte);
  }, [executerPreRemplissage]);

  const lancer = useCallback(async (vecteurs?: string[]) => {
    const s0 = ref.current;
    const cibles = (vecteurs ?? s0.vecteursChoisis).filter((v) => VECTEURS.some((x) => x.code === v));
    if (cibles.length === 0) return;
    dispatch({ type: 'debut', vecteurs: cibles });
    try {
      // 1) Reuse cached PDF/plan extraction if files haven't changed since Step 1 auto-fill.
      const sigCourante = signatureFichiers(s0.pdf, s0.plans);
      let texte = s0.texteAudit;
      let source: Source = s0.source ?? 'api';

      if (sigCourante === lastExtractionSig.current && (extractedPdfText.current || plansB64.current.length > 0)) {
        texte = [s0.texte, extractedPdfText.current].filter(Boolean).join('\n\n');
        dispatch({ type: 'texteAudit', texte, source });
      } else if (!vecteurs || !texte || s0.pdf || s0.plans.length > 0) {
        const { extraction, source: src } = await extraire(s0.pdf, s0.plans, s0.texte);
        texte = extraction.texte;
        plansB64.current = extraction.plans_b64;
        lastExtractionSig.current = sigCourante;
        source = src;
        dispatch({ type: 'texteAudit', texte, source });
      }

      if (!texte.trim() && plansB64.current.length === 0) {
        throw new Error('Aucun contenu à analyser : collez le texte du dossier ou déposez un PDF ou des plans.');
      }

      // 2) Sequential vector-by-vector audit calls.
      const reponses = Object.fromEntries(
        TAGS.map((t) => [t.code, s0.reponses[t.code] === 'oui' ? true : s0.reponses[t.code] === 'non' ? false : null])
      );
      const actifs = tagsActifs(s0.reponses);
      const applicablesIds = CRITERES.filter((c) => estApplicable(c, actifs)).map((c) => c.id);

      for (const v of cibles) {
        dispatch({ type: 'runStatut', vecteur: v, statut: 'en_cours' });
        let derniereErreur = '';
        let ok = false;
        for (let essai = 1; essai <= NB_ESSAIS && !ok; essai++) {
          try {
            const r = await evaluerVecteur({
              vecteur: v,
              texte,
              plansB64: plansB64.current,
              reponses,
              applicables: applicablesIds
            });
            dispatch({ type: 'runOk', vecteur: v, evaluations: r.evaluations, source: r.source });
            ok = true;
          } catch (e) {
            derniereErreur = e instanceof Error ? e.message : 'Erreur inconnue';
            if (essai < NB_ESSAIS) await new Promise((res) => setTimeout(res, PAUSE_RETRY_MS));
          }
        }
        if (!ok) dispatch({ type: 'runStatut', vecteur: v, statut: 'erreur', erreur: derniereErreur });
      }
      dispatch({ type: 'fin', erreur: null });
    } catch (e) {
      for (const v of cibles) dispatch({ type: 'runStatut', vecteur: v, statut: 'attente' });
      dispatch({ type: 'fin', erreur: e instanceof Error ? e.message : 'Erreur inconnue' });
    }
  }, []);

  const actifs = useMemo(() => tagsActifs(state.reponses), [state.reponses]);

  const { applicables, horsPerimetre } = useMemo(() => {
    const apresTags = CRITERES.filter((c) => estApplicable(c, actifs));
    const enScope = apresTags.filter((c) => state.vecteursChoisis.includes(c.vecteur) && !state.ecartes[c.id]);
    return { applicables: enScope, horsPerimetre: CRITERES.length - apresTags.length };
  }, [actifs, state.vecteursChoisis, state.ecartes]);

  const { evaluations, resultat } = useMemo(() => {
    const ev = new Map<string, CritereEvalue>();
    const corrigees = new Set<string>();
    for (const c of applicables) {
      const brute = state.evalBrutes[c.id];
      const corr = state.corrections[c.id];
      if (corr) {
        corrigees.add(c.id);
        ev.set(c.id, {
          id_critere: c.id,
          note: corr.note,
          type_preuve: corr.type_preuve,
          preuve_extrait: corr.preuve_extrait,
          quick_win_ia: brute?.quick_win_ia ?? null
        });
      } else if (brute) {
        ev.set(c.id, brute);
      }
    }
    return {
      evaluations: ev,
      resultat: calculer({ applicables, evaluations: ev, corrigees, surfaceM2: state.projet.surfaceM2 ?? 0 })
    };
  }, [applicables, state.evalBrutes, state.corrections, state.projet.surfaceM2]);

  const nbQuestionsRepondues = Object.values(state.reponses).filter((r) => r === 'oui' || r === 'non').length;
  const scoreFinal = resultat.nbApplicables > 0 && !resultat.scoreIndicatif && nbQuestionsRepondues >= 9 && state.vecteursChoisis.length === VECTEURS.length;
  const nbRelances = Object.values(state.runs).filter((r) => r === 'erreur').length;

  const valeur = useMemo<Valeur>(
    () => ({
      state,
      dispatch,
      deposerPdf,
      preRemplirDepuisDossier,
      lancer,
      applicables,
      horsPerimetre,
      resultat,
      evaluations,
      nbQuestionsRepondues,
      scoreFinal,
      nbRelances
    }),
    [state, deposerPdf, preRemplirDepuisDossier, lancer, applicables, horsPerimetre, resultat, evaluations, nbQuestionsRepondues, scoreFinal, nbRelances]
  );
  return <AuditCtx.Provider value={valeur}>{children}</AuditCtx.Provider>;
}

export function useAudit(): Valeur {
  const v = useContext(AuditCtx);
  if (!v) throw new Error('useAudit doit être utilisé dans <AuditProvider>');
  return v;
}