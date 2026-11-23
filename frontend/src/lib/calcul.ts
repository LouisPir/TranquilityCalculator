import {
  BONUS_FACILITE,
  CLASSES_COUT,
  CLASSE_COUT_PAR_DEFAUT,
  EXIGER_PREUVE_POUR_NOTER,
  FACILITE_PAR_DEFAUT,
  MAX_NOTE,
  PENALITE_COUT,
  PLAFOND_PAR_PREUVE,
  coeffParcelle
} from '../config';
import type { Critere, CritereEvalue, LigneAudit, QuickWin, ResultatAudit, ScoreVecteur } from '../types';
import { MATURITE, VECTEURS, libelleCritere } from './referentiel';

// Port TypeScript de backend/calculator.compute_audit_242, pour recalculer instantanément le score
// quand l'utilisateur corrige une note, sans rappeler le LLM ni le serveur.

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

export function noteRetenue(note: number | null, typePreuve: string | null): number | null {
  if (note === null || note === undefined) return null;
  if (!typePreuve) return EXIGER_PREUVE_POUR_NOTER ? null : note;
  return Math.min(note, PLAFOND_PAR_PREUVE[typePreuve] ?? MAX_NOTE);
}

export function calculer(e: EntreeCalcul): ResultatAudit {
  const lignes: LigneAudit[] = e.applicables.map((c) => {
    const ev = e.evaluations.get(c.id);
    const note = ev?.note ?? null;
    const typePreuve = ev?.type_preuve ?? null;
    const retenue = noteRetenue(note, typePreuve);
    return {
      critere: c,
      note,
      typePreuve,
      preuve: ev?.preuve_extrait ?? null,
      quickWin: ev?.quick_win ?? null,
      noteRetenue: retenue,
      plafonnee: retenue !== null && note !== null && retenue < note,
      corrigee: e.corrigees.has(c.id)
    };
  });

  const evaluees = lignes.filter((l) => l.noteRetenue !== null);
  const total = lignes.length;
  const pts = evaluees.reduce((s, l) => s + (l.noteRetenue as number) * l.critere.poids, 0);
  const ptsMax = evaluees.reduce((s, l) => s + MAX_NOTE * l.critere.poids, 0);
  const poids = evaluees.reduce((s, l) => s + l.critere.poids, 0);

  const parVecteur: ScoreVecteur[] = VECTEURS.map((v) => {
    const toutes = lignes.filter((l) => l.critere.vecteur === v.code);
    const ev = toutes.filter((l) => l.noteRetenue !== null);
    const p = ev.reduce((s, l) => s + (l.noteRetenue as number) * l.critere.poids, 0);
    const pm = ev.reduce((s, l) => s + MAX_NOTE * l.critere.poids, 0);
    const w = ev.reduce((s, l) => s + l.critere.poids, 0);
    return {
      vecteur: v.code,
      score100: pm ? arrondi((p / pm) * 100, 1) : null,
      noteSur4: w ? arrondi(p / w, 2) : null,
      evalues: ev.length,
      applicables: toutes.length
    };
  });

  const coeff = coeffParcelle(e.surfaceM2);
  const quickWins: QuickWin[] = [];
  for (const l of evaluees) {
    const nr = l.noteRetenue as number;
    if (nr >= l.critere.cible) continue;
    const classe = (l.critere.classeCout || '').trim();
    const classeUtilisee = classe in CLASSES_COUT ? classe : CLASSE_COUT_PAR_DEFAUT;
    const [cMin, cMax] = CLASSES_COUT[classeUtilisee];
    const facilite = l.critere.facilite || FACILITE_PAR_DEFAUT;
    const ecart = l.critere.cible - nr;
    quickWins.push({
      id: l.critere.id,
      vecteur: l.critere.vecteur,
      libelle: libelleCritere(l.critere),
      noteRetenue: nr,
      cible: l.critere.cible,
      ecart,
      action: l.quickWin?.trim() || l.critere.quickWinAssocie || 'Compléter la conception.',
      facilite,
      classeCout: classeUtilisee,
      coutParDefaut: !(classe in CLASSES_COUT),
      coutMinKeur: arrondi(cMin * coeff, 1),
      coutMaxKeur: arrondi(cMax * coeff, 1),
      priorite: (ecart * l.critere.poids * (BONUS_FACILITE[facilite] ?? 2)) / (PENALITE_COUT[classeUtilisee] ?? 1)
    });
  }
  quickWins.sort((a, b) => b.priorite - a.priorite || a.id.localeCompare(b.id));

  return {
    scoreGlobal100: ptsMax ? arrondi((pts / ptsMax) * 100, 1) : 0,
    noteSur4: poids ? arrondi(pts / poids, 2) : 0,
    couverturePct: total ? arrondi((evaluees.length / total) * 100, 1) : 0,
    nbApplicables: total,
    nbEvalues: evaluees.length,
    nbVides: total - evaluees.length,
    nbPlafonnees: lignes.filter((l) => l.plafonnee).length,
    coeffParcelle: coeff,
    parVecteur,
    quickWins,
    lignes
  };
}

// Score obtenu si les quick wins cochés amènent chaque critère à sa cible.
export function scoreProjete(r: ResultatAudit, retenus: Set<string>): number {
  const evaluees = r.lignes.filter((l) => l.noteRetenue !== null);
  const ptsMax = evaluees.reduce((s, l) => s + MAX_NOTE * l.critere.poids, 0);
  if (!ptsMax) return 0;
  let pts = evaluees.reduce((s, l) => s + (l.noteRetenue as number) * l.critere.poids, 0);
  for (const q of r.quickWins) {
    if (!retenus.has(q.id)) continue;
    const l = evaluees.find((x) => x.critere.id === q.id);
    if (l) pts += q.ecart * l.critere.poids;
  }
  return Math.min(100, arrondi((pts / ptsMax) * 100, 1));
}

// Niveau de maturité du classeur (Inexistant, Initié, Structuré, Consolidé, Exemplaire), par partie entière de la note /4.
export function maturite(noteSur4: number): { note: number; niveau: string; definition: string } {
  const i = Math.max(0, Math.min(MATURITE.length - 1, Math.floor(noteSur4 + 0.0001)));
  return MATURITE[i];
}
