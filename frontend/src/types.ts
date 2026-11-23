// ---- Référentiel (issu du classeur « 242 critères mutualisés », voir src/data/) ----
export interface Critere {
  id: string; // ex. "T06.01" — identique à id_critere côté backend
  vecteur: string; // "V01" à "V14"
  axe: string; // A | B | C
  famille: string;
  titre: string; // souvent tronqué dans la grille : voir libelleCritere()
  exigence: string;
  question: string;
  ouRegarder: string;
  preuves: string;
  applicabilite: string; // "Toujours" ou un code (ESP, LOG/RDC, PRK…)
  poids: number;
  cible: number;
  quickWinAssocie: string;
  phase: string;
  classeCout: string; // "", "0", "€", "€€", "€€€"
  facilite: string; // "", Facile, Moyenne, Complexe
  pourquoi: string;
  anciens: string;
}

export interface Vecteur {
  code: string;
  axe: string;
  nom: string;
  objectif: string;
  enjeux: string;
  menaces: string;
  liens: string;
  statut: string; // Socle (obligatoire) | Conditionnel
}

export type CodeTag = 'ESP' | 'VOI' | 'EXT' | 'PRK' | 'LOG' | 'RDC' | 'EQP' | 'TC' | 'REH';
export type Reponse = 'oui' | 'non' | null;

// ---- Contrat avec le backend : miroir de backend/schemas.py ----
export interface CritereEvalue {
  id_critere: string;
  note: number | null; // 0 à 4, null = aucune information trouvée
  type_preuve: string | null; // 'PV / mesure' | 'Visible sur plan' | 'Notice / CCTP' | 'Declaratif' | null
  preuve_extrait: string | null;
  quick_win_ia: string | null; // recommandation du modèle (note ≤ 2 uniquement)
}

export type TypePreuve = 'PV / mesure' | 'Visible sur plan' | 'Notice / CCTP' | 'Declaratif' | 'Aucune';

// ---- Résultat du calcul (miroir de calculator.compute_audit_242) ----
export interface LigneAudit {
  critere: Critere;
  note: number | null;
  typePreuve: string | null;
  preuve: string | null;
  quickWinIA: string | null;
  noteRetenue: number | null;
  plafonnee: boolean; // la preuve a fait baisser la note
  motifNonRetenue: string | null; // note saisie mais non retenue : preuve ou type de preuve manquant
  corrigee: boolean; // modifiée à la main
}

export interface Niveau {
  index: number; // 0 à 4
  nom: string; // Inexistant, Initié, Structuré, Consolidé, Exemplaire
}

export interface ScoreVecteur {
  vecteur: string;
  axe: string;
  score100: number | null; // null tant qu'aucun critère n'est retenu
  noteSur4: number | null;
  brut4: number | null; // note /4 non arrondie, pour les moyennes
  evalues: number;
  applicables: number;
}

export interface ScoreAxe {
  axe: string;
  score100: number | null;
  noteSur4: number | null;
}

export interface QuickWin {
  id: string;
  vecteur: string;
  libelle: string;
  noteRetenue: number;
  cible: number;
  ecart: number;
  action: string; // action du référentiel
  actionIA: string | null; // suggestion du modèle, si elle existe
  phase: string;
  facilite: string;
  classeCout: string;
  coutMinKeur: number;
  coutMaxKeur: number;
  priorite: number;
}

// Critère sous la cible, sans classe de coût ni facilité dans le référentiel : seule la suggestion du modèle existe.
export interface RecoIA {
  id: string;
  vecteur: string;
  libelle: string;
  noteRetenue: number;
  cible: number;
  action: string;
  phase: string;
}

export interface ResultatAudit {
  scoreGlobal100: number;
  noteSur4: number;
  niveau: Niveau;
  scoreIndicatif: boolean; // couverture < 100 %
  couverturePct: number;
  nbApplicables: number;
  nbEvalues: number;
  nbVides: number;
  nbPlafonnees: number;
  nbSansPreuve: number; // notes saisies mais non retenues faute de preuve
  coeffParcelle: number;
  parAxe: ScoreAxe[];
  parVecteur: ScoreVecteur[];
  pointsForts: ScoreVecteur[]; // 3 meilleurs vecteurs
  margesProgression: ScoreVecteur[]; // 3 plus faibles, le plus faible d'abord
  quickWins: QuickWin[]; // top 20 par priorité (comme backend : max_quick_wins)
  nbQuickWinsHorsTop: number;
  recosIA: RecoIA[];
  lignes: LigneAudit[];
}

export interface Projet {
  nom: string;
  commune: string;
  typeOperation: string;
  phase: string;
  surfaceM2: number | null;
  logements: number | null;
}

export type Step = 1 | 2 | 3 | 4;
export type Source = 'api' | 'mock';
export type StatutRun = 'attente' | 'en_cours' | 'ok' | 'erreur';
