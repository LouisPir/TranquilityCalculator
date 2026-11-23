// Réglages « métier » du front. Les règles de calcul reprennent backend/calculator.py à l'identique
// (vérifié par comparaison avec compute_audit_242). Si le backend change, changer ces constantes aussi.

export const MAX_NOTE = 4;

// Plafond de la note selon le type de preuve (calculator.PROOF_MAX_NOTE, identique au classeur).
export const PREUVES: { type: string; plafond: number; aide: string }[] = [
  { type: 'PV / mesure', plafond: 4, aide: 'Vérification datée, essai ou mesure documentée' },
  { type: 'Visible sur plan', plafond: 3, aide: 'Projet localisé sur un plan daté' },
  { type: 'Notice / CCTP', plafond: 3, aide: 'Engagement contractuel ou document technique daté' },
  { type: 'Declaratif', plafond: 1, aide: 'Intention sans preuve suffisante' },
  { type: 'Aucune', plafond: 0, aide: 'Aucune preuve exploitable' }
];
export const PLAFOND_PAR_PREUVE: Record<string, number> = Object.fromEntries(PREUVES.map((p) => [p.type, p.plafond]));

// ÉCART À SIGNALER : le classeur (feuille Paramètres) dit « sans preuve, pas de note retenue »,
// alors que calculator.py applique un plafond de 4 quand type_preuve est vide.
// false = comportement de calculator.py ; true = règle du classeur.
export const EXIGER_PREUVE_POUR_NOTER = false;

// Classes de coût des quick wins, en k€ HT pour une parcelle < 5 000 m² (calculator.COST_CLASSES_KEUR).
// ÉCART À SIGNALER : le classeur donne € = 1-10, €€ = 10-50, €€€ = 50-200.
export const CLASSES_COUT: Record<string, [number, number]> = {
  '0': [0, 0],
  '€': [5, 20],
  '€€': [20, 80],
  '€€€': [80, 250]
};
export const CLASSE_COUT_PAR_DEFAUT = '€';
export const LIBELLE_CLASSE_COUT: Record<string, string> = {
  '0': 'Sans surcoût',
  '€': 'Faible',
  '€€': 'Modéré',
  '€€€': 'Élevé'
};

// Coefficient de coût selon la surface (calculator.get_parcel_coeff).
// ÉCART À SIGNALER : le classeur a 4 tranches (1 / 1,5 / 2,5 / 4 à 5 000, 20 000, 50 000 m²).
export function coeffParcelle(surfaceM2: number): number {
  if (surfaceM2 < 5000) return 1.0;
  if (surfaceM2 < 20000) return 1.8;
  return 3.0;
}

// Priorité d'un quick win (formule du classeur, colonne « Priorité ») :
// écart × poids × bonus de facilité ÷ pénalité de coût.
export const BONUS_FACILITE: Record<string, number> = { Facile: 3, Moyenne: 2, Complexe: 1 };
export const PENALITE_COUT: Record<string, number> = { '0': 1.0, '€': 1.5, '€€': 2.5, '€€€': 4.0 };
export const FACILITE_PAR_DEFAUT = 'Moyenne';

export const OPTIONS_TYPE_OPERATION = [
  'Aménagement / ZAC',
  'Résidentiel neuf',
  'Mixte logements + commerces',
  'Tertiaire / activités',
  'Résidence gérée (étudiants, seniors)',
  'Réhabilitation / renouvellement urbain',
  'Équipement public'
];
export const OPTIONS_PHASE = ['Esquisse / concours', 'APS', 'APD', 'Permis de construire', 'PRO / DCE', 'Chantier', 'Livré'];

export const MAX_PLANS = 5; // parser.prepare_plan_images(max_images=5)

export const API_URL: string = import.meta.env.VITE_API_URL ?? '';
export const ALLOW_MOCK: boolean = import.meta.env.VITE_ALLOW_MOCK !== 'false';
export const API_TIMEOUT_MS = 240_000; // une requête = un vecteur, mais un modèle vision peut être lent

export const STORAGE_KEY = 'quietude-audit-v2';
