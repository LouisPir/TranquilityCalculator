import criteresData from '../data/criteres.json';
import projetData from '../data/projet.json';
import vecteursData from '../data/vecteurs.json';
import type { Critere, CodeTag, Reponse, Vecteur } from '../types';

export const CRITERES = criteresData as unknown as Critere[];
export const VECTEURS = vecteursData as unknown as Vecteur[];
export const TAGS = projetData.tags as { code: CodeTag; question: string }[];
export const PIECES = projetData.pieces as string[];
export const MATURITE = projetData.maturite as { note: number; niveau: string; definition: string }[];
export const NIVEAUX_GENERIQUES = projetData.niveauxGeneriques as string[];

const parId = new Map(CRITERES.map((c) => [c.id, c]));
export const getCritere = (id: string): Critere | undefined => parId.get(id);

const parCode = new Map(VECTEURS.map((v) => [v.code, v]));
export const getVecteur = (code: string): Vecteur | undefined => parCode.get(code);

// Les vecteurs peuvent arriver du backend sous la forme « V03 » ou « V03 - Parcours & mobilités ».
export const codeVecteur = (valeur: string): string => /^V\d{2}/.exec(valeur)?.[0] ?? valeur;

export const AXES: { code: string; nom: string }[] = [
  { code: 'A', nom: 'Espaces publics & mobilités' },
  { code: 'B', nom: 'Bâtiments, interfaces & usages' },
  { code: 'C', nom: 'Gérer, anticiper, prouver' }
];

// Le titre de la grille est souvent la phrase d'exigence coupée par « ... » : on lui préfère l'exigence.
export const libelleCritere = (c: Critere): string => (c.titre && !c.titre.endsWith('...') ? c.titre : c.exigence || c.titre);

// Même règle que parser.filter_applicable_criteria, avec une précision du classeur :
// une question laissée sans réponse garde les critères actifs « par prudence ».
export function tagsActifs(reponses: Record<string, Reponse>): Set<string> {
  return new Set(TAGS.filter((t) => reponses[t.code] !== 'non').map((t) => t.code));
}

export function estApplicable(c: Critere, actifs: Set<string>): boolean {
  if (c.applicabilite === 'Toujours') return true;
  return c.applicabilite.split('/').some((p) => actifs.has(p.trim()));
}

// Pourquoi un critère est écarté (pour l'afficher à l'utilisateur).
export function motifNonApplicable(c: Critere): string {
  return `Condition « ${c.applicabilite} » = Non dans le contexte du projet`;
}

export const nbCriteresParTag = (code: string): number =>
  CRITERES.filter((c) => c.applicabilite !== 'Toujours' && c.applicabilite.split('/').some((p) => p.trim() === code)).length;
