import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { STORAGE_KEY } from '../config';
import { evaluerVecteur, extraire } from '../lib/api';
import { calculer } from '../lib/calcul';
import { DEMO_EVALUATIONS, DEMO_PIECES, DEMO_PROJET, DEMO_REPONSES, DEMO_TEXTE } from '../data/demo';
import { CRITERES, TAGS, VECTEURS, estApplicable, getCritere, tagsActifs } from '../lib/referentiel';
import type { Critere, CritereEvalue, Projet, Reponse, ResultatAudit, Source, StatutRun, Step } from '../types';

interface Correction {
  note: number | null;
  type_preuve: string | null;
  preuve_extrait: string | null; // référence de la preuve (obligatoire sauf type « Aucune »)
}

interface State {
  step: Step;
  projet: Projet;
  reponses: Record<string, Reponse>; // 9 questions de contexte (ESP, VOI…)
  pieces: Record<string, boolean>; // pièces fournies (information, pas de calcul)
  texte: string; // texte collé par l'utilisateur
  texteAudit: string; // texte réellement envoyé au LLM (collé + extrait du PDF)
  pdf: File | null; // non persisté
  plans: File[]; // non persistés
  vecteursChoisis: string[];
  runs: Record<string, StatutRun>;
  erreurs: Record<string, string>;
  enCours: boolean;
  erreurGlobale: string | null;
  source: Source | null;
  evalBrutes: Record<string, CritereEvalue>; // réponse du LLM, par id de critère
  corrections: Record<string, Correction>; // notes modifiées à la main
  ecartes: Record<string, string>; // id → motif (obligatoire)
  retirees: Record<string, boolean>; // quick wins décochés (tous cochés par défaut)
  selVecteur: string;
  selCritere: string | null;
  auditLance: boolean;
  demo: boolean; // résultats préenregistrés (dossier de démonstration)
}

type Action =
  | { type: 'step'; step: Step }
  | { type: 'projet'; champ: Partial<Projet> }
  | { type: 'tag'; code: string; reponse: Reponse }
  | { type: 'piece'; nom: string }
  | { type: 'texte'; texte: string }
  | { type: 'pdf'; pdf: File | null }
  | { type: 'plans'; plans: File[] }
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

function charger(): State {
  try {
    const brut = localStorage.getItem(STORAGE_KEY);
    if (!brut) return initial;
    const s = JSON.parse(brut) as Partial<State>;
    const runs = Object.fromEntries(Object.entries(s.runs ?? {}).map(([k, v]) => [k, v === 'en_cours' ? 'attente' : v])) as Record<string, StatutRun>;
    return { ...initial, ...s, runs, pdf: null, plans: [], enCours: false, erreurGlobale: null };
  } catch {
    return initial;
  }
}

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
      return { ...s, pdf: a.pdf };
    case 'plans':
      return { ...s, plans: a.plans };
    case 'vecteur':
      return {
        ...s,
        vecteursChoisis: s.vecteursChoisis.includes(a.code) ? s.vecteursChoisis.filter((c) => c !== a.code) : [...s.vecteursChoisis, a.code]
      };
    case 'vecteursTous':
      return { ...s, vecteursChoisis: a.actifs ? VECTEURS.map((v) => v.code) : [] };
    case 'debut': {
      // On repart de zéro pour les vecteurs relancés ; les autres gardent leurs résultats.
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
        if (!c || c.vecteur !== a.vecteur || vus.has(e.id_critere)) continue; // doublon : la première évaluation gagne, comme drop_duplicates
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
  lancer: (vecteurs?: string[]) => Promise<void>;
  applicables: Critere[]; // critères du périmètre (tags + vecteurs choisis, hors écartés)
  horsPerimetre: number; // critères exclus par les réponses de contexte
  resultat: ResultatAudit;
  evaluations: Map<string, CritereEvalue>; // LLM + corrections
  nbQuestionsRepondues: number;
  scoreFinal: boolean; // couverture 100 %, 9 questions répondues, 14 vecteurs
  nbRelances: number; // vecteurs en erreur
}

const AuditCtx = createContext<Valeur | null>(null);

const PAUSE_RETRY_MS = 1200;
const NB_ESSAIS = 2;

export function AuditProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, charger);
  const ref = useRef(state);
  ref.current = state;
  const plansB64 = useRef<string[]>([]);

  useEffect(() => {
    const { pdf: _p, plans: _pl, enCours: _e, erreurGlobale: _g, ...persist } = state;
    void _p;
    void _pl;
    void _e;
    void _g;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
    } catch {
      /* stockage plein ou indisponible : on ignore */
    }
  }, [state]);

  const lancer = useCallback(async (vecteurs?: string[]) => {
    const s0 = ref.current;
    const cibles = (vecteurs ?? s0.vecteursChoisis).filter((v) => VECTEURS.some((x) => x.code === v));
    if (cibles.length === 0) return;
    dispatch({ type: 'debut', vecteurs: cibles });
    try {
      // 1) Extraction du texte et des plans (une seule fois si on ne relance que des vecteurs en erreur).
      let texte = s0.texteAudit;
      let source: Source = s0.source ?? 'api';
      if (!vecteurs || !texte || (s0.pdf || s0.plans.length > 0)) {
        const { extraction, source: src } = await extraire(s0.pdf, s0.plans, s0.texte);
        texte = extraction.texte;
        plansB64.current = extraction.plans_b64;
        source = src;
        dispatch({ type: 'texteAudit', texte, source });
      }
      if (!texte.trim() && plansB64.current.length === 0) {
        throw new Error('Aucun contenu à analyser : collez le texte du dossier ou déposez un PDF ou des plans.');
      }

      // 2) Un appel par vecteur, l'un après l'autre (budget et limites de débit côté backend).
      const reponses = Object.fromEntries(TAGS.map((t) => [t.code, s0.reponses[t.code] === 'oui' ? true : s0.reponses[t.code] === 'non' ? false : null]));
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
    () => ({ state, dispatch, lancer, applicables, horsPerimetre, resultat, evaluations, nbQuestionsRepondues, scoreFinal, nbRelances }),
    [state, lancer, applicables, horsPerimetre, resultat, evaluations, nbQuestionsRepondues, scoreFinal, nbRelances]
  );
  return <AuditCtx.Provider value={valeur}>{children}</AuditCtx.Provider>;
}

export function useAudit(): Valeur {
  const v = useContext(AuditCtx);
  if (!v) throw new Error('useAudit doit être utilisé dans <AuditProvider>');
  return v;
}
