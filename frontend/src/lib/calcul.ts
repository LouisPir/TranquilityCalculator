import { BONUS_FACILITE, CLASSES_COUT, MAX_NOTE, MAX_QUICK_WINS, PLAFOND_PAR_PREUVE, coeffParcelle } from '../config';
import type {
  Critere,
  CritereEvalue,
  LigneAudit,
  Niveau,
  QuickWin,
  RecoIA,
  ResultatAudit,
  ScoreAxe,
  ScoreVecteur
} from '../types';
import { AXES, MATURITE, VECTEURS, libelleCritere } from './referentiel';

// Port TypeScript de backend/calculator.compute_audit_242 (version alignée sur le classeur), pour recalculer
// instantanément le score quand l'utilisateur corrige une note, sans rappeler le modèle ni le serveur.
// Parité vérifiée contre le Python : voir README.

export interface EntreeCalcul {
  applicables: Critere[];
  evaluations: Map<string, CritereEvalue>; // LLM + corrections manuelles, par id de critère
  corrigees: Set<string>;
  surfaceM2: number;
}

// Arrondi identique à Python round() : en cas d'égalité exacte (ex. 31,25), on garde le chiffre pair (31,2),
// alors que Math.round donnerait 31,3.
const arrondi = (x: number, d: number): number => {
  const k = 10 ** d;
  const v = x * k;
  const bas = Math.floor(v);
  const r = v - bas === 0.5 ? (bas % 2 === 0 ? bas : bas + 1) : Math.round(v);
  return r / k;
};

// calculator.get_maturity_label : partie entière de la note /4, plafonnée à 4.
export function niveauDe(note4: number): Niveau {
  const index = Math.min(Math.trunc(note4 + 0.0001), MAX_NOTE);
  return { index, nom: MATURITE[index]?.niveau ?? '' };
}

// Formule de la grille (Grille!R7) : il faut un type de preuve, et un extrait de preuve sauf si le type est « Aucune » ;
// la note est ensuite plafonnée selon le type (type inconnu : 0).
export function noteRetenue(note: number | null, typePreuve: string | null, extrait: string | null): number | null {
  if (note === null || note === undefined) return null;
  const tp = (typePreuve ?? '').trim();
  const ref = (extrait ?? '').trim();
  if (!tp || (tp !== 'Aucune' && ref.length === 0)) return null;
  return Math.min(note, PLAFOND_PAR_PREUVE[tp] ?? 0);
}

interface Entree {
  vecteur: string;
  poids: number;
  nr: number | null;
}

// Scores par vecteur, par axe et global : le global est la moyenne des notes /4 des vecteurs notés (poids de vecteur = 1).
function agreger(entrees: Entree[]) {
  const parVecteur: ScoreVecteur[] = VECTEURS.map((v) => {
    const toutes = entrees.filter((x) => x.vecteur === v.code);
    const ev = toutes.filter((x) => x.nr !== null);
    const w = ev.reduce((s, x) => s + x.poids, 0);
    const brut4 = ev.length ? ev.reduce((s, x) => s + (x.nr as number) * x.poids, 0) / w : null;
    return {
      vecteur: v.code,
      axe: v.axe,
      score100: brut4 === null ? null : arrondi((brut4 / 4) * 100, 1),
      noteSur4: brut4 === null ? null : arrondi(brut4, 2),
      brut4,
      evalues: ev.length,
      applicables: toutes.length
    };
  });
  const moyenne = (vs: ScoreVecteur[]): number | null => (vs.length ? vs.reduce((s, v) => s + (v.brut4 as number), 0) / vs.length : null);
  const notes = parVecteur.filter((v) => v.brut4 !== null);
  const global4 = moyenne(notes);
  const parAxe: ScoreAxe[] = AXES.map((a) => {
    const n4 = moyenne(notes.filter((v) => v.axe === a.code));
    return { axe: a.code, score100: n4 === null ? null : arrondi((n4 / 4) * 100, 1), noteSur4: n4 === null ? null : arrondi(n4, 2) };
  });
  return {
    parVecteur,
    parAxe,
    global4,
    scoreGlobal100: global4 === null ? 0 : arrondi((global4 / 4) * 100, 1),
    noteSur4: global4 === null ? 0 : arrondi(global4, 2)
  };
}

export function calculer(e: EntreeCalcul): ResultatAudit {
  const lignes: LigneAudit[] = e.applicables.map((c) => {
    const ev = e.evaluations.get(c.id);
    const note = ev?.note ?? null;
    const retenue = noteRetenue(note, ev?.type_preuve ?? null, ev?.preuve_extrait ?? null);
    const tp = (ev?.type_preuve ?? '').trim();
    return {
      critere: c,
      note,
      typePreuve: ev?.type_preuve ?? null,
      preuve: ev?.preuve_extrait ?? null,
      quickWinIA: ev?.quick_win_ia ?? null,
      noteRetenue: retenue,
      plafonnee: retenue !== null && note !== null && retenue < note,
      motifNonRetenue: note !== null && retenue === null ? (tp ? 'extrait de preuve manquant' : 'type de preuve manquant') : null,
      corrigee: e.corrigees.has(c.id)
    };
  });

  const retenues = lignes.filter((l) => l.noteRetenue !== null);
  const total = lignes.length;
  const agr = agreger(lignes.map((l) => ({ vecteur: l.critere.vecteur, poids: l.critere.poids, nr: l.noteRetenue })));

  const coeff = coeffParcelle(e.surfaceM2);
  const quickWins: QuickWin[] = [];
  const recosIA: RecoIA[] = [];
  for (const l of retenues) {
    const nr = l.noteRetenue as number;
    const c = l.critere;
    const ecart = Math.max(0, c.cible - nr);
    if (ecart <= 0) continue;
    const classe = c.classeCout;
    const classeConnue = classe in CLASSES_COUT;
    const bonus = BONUS_FACILITE[c.facilite];
    if (c.quickWinAssocie && classeConnue && bonus !== undefined) {
      const [cMin, cMax, penalite] = CLASSES_COUT[classe];
      quickWins.push({
        id: c.id,
        vecteur: c.vecteur,
        libelle: libelleCritere(c),
        noteRetenue: nr,
        cible: c.cible,
        ecart,
        action: c.quickWinAssocie,
        actionIA: l.quickWinIA?.trim() || null,
        phase: c.phase,
        facilite: c.facilite,
        classeCout: classe,
        coutMinKeur: arrondi(cMin * coeff, 1),
        coutMaxKeur: arrondi(cMax * coeff, 1),
        priorite: arrondi((ecart * c.poids * bonus) / penalite, 2)
      });
    } else if (l.quickWinIA?.trim()) {
      recosIA.push({ id: c.id, vecteur: c.vecteur, libelle: libelleCritere(c), noteRetenue: nr, cible: c.cible, action: l.quickWinIA, phase: c.phase });
    }
  }
  quickWins.sort((a, b) => b.priorite - a.priorite); // tri stable, comme Python

  const classes = agr.parVecteur.filter((v) => v.noteSur4 !== null).sort((a, b) => (b.noteSur4 as number) - (a.noteSur4 as number));
  return {
    scoreGlobal100: agr.scoreGlobal100,
    noteSur4: agr.noteSur4,
    niveau: niveauDe(agr.global4 ?? 0),
    scoreIndicatif: total === 0 ? true : (retenues.length / total) * 100 < 100,
    couverturePct: total ? arrondi((retenues.length / total) * 100, 1) : 0,
    nbApplicables: total,
    nbEvalues: retenues.length,
    nbVides: total - retenues.length,
    nbPlafonnees: lignes.filter((l) => l.plafonnee).length,
    nbSansPreuve: lignes.filter((l) => l.motifNonRetenue !== null).length,
    coeffParcelle: coeff,
    parAxe: agr.parAxe,
    parVecteur: agr.parVecteur,
    pointsForts: classes.slice(0, 3),
    margesProgression: [...classes.slice(-3)].reverse(),
    quickWins: quickWins.slice(0, MAX_QUICK_WINS),
    nbQuickWinsHorsTop: Math.max(0, quickWins.length - MAX_QUICK_WINS),
    recosIA,
    lignes
  };
}

// Projection : chaque critère visé par une action retenue est amené à sa cible. Renvoie le global et les scores /100 par vecteur.
export function projection(r: ResultatAudit, retenus: Set<string>): { global100: number; parVecteur: Record<string, number | null> } {
  const agr = agreger(
    r.lignes.map((l) => ({
      vecteur: l.critere.vecteur,
      poids: l.critere.poids,
      nr: l.noteRetenue !== null && retenus.has(l.critere.id) ? Math.max(l.noteRetenue, l.critere.cible) : l.noteRetenue
    }))
  );
  return { global100: agr.scoreGlobal100, parVecteur: Object.fromEntries(agr.parVecteur.map((v) => [v.vecteur, v.score100])) };
}

// Score obtenu si les actions retenues amènent chaque critère concerné à sa cible.
export function scoreProjete(r: ResultatAudit, retenus: Set<string>): number {
  return projection(r, retenus).global100;
}
