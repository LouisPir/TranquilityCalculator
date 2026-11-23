// Réglages « métier » du front. Les règles de calcul reprennent backend/calculator.py à l'identique
// (vérifié par comparaison avec compute_audit_242). Si le backend change, changer ces constantes aussi.

export const MAX_NOTE = 4;

// Plafond de la note selon le type de preuve (calculator.PROOF_MAX_NOTE). Un type inconnu plafonne à 0, comme côté backend.
export const PREUVES: { type: string; plafond: number; aide: string }[] = [
  { type: 'PV / mesure', plafond: 4, aide: 'Vérification datée, essai ou mesure documentée' },
  { type: 'Visible sur plan', plafond: 3, aide: 'Projet localisé sur un plan daté' },
  { type: 'Notice / CCTP', plafond: 3, aide: 'Engagement contractuel ou document technique daté' },
  { type: 'Declaratif', plafond: 1, aide: 'Intention sans preuve suffisante' },
  { type: 'Aucune', plafond: 0, aide: 'Aucune preuve exploitable' }
];
export const PLAFOND_PAR_PREUVE: Record<string, number> = Object.fromEntries(PREUVES.map((p) => [p.type, p.plafond]));

// Classes de coût des quick wins : (min k€ HT, max k€ HT) pour une parcelle < 5 000 m², et pénalité de priorité.
// Valeurs de la feuille « Paramètres » du classeur, reprises par backend/calculator.py (COST_CLASSES_KEUR).
export const CLASSES_COUT: Record<string, [number, number, number]> = {
  '0': [0, 0, 1.0],
  '€': [1, 10, 1.5],
  '€€': [10, 50, 2.5],
  '€€€': [50, 200, 4.0]
};
export const LIBELLE_CLASSE_COUT: Record<string, string> = {
  '0': 'Sans surcoût',
  '€': 'Faible',
  '€€': 'Modéré',
  '€€€': 'Élevé'
};

// Coefficient de coût selon la surface (calculator.get_parcel_coeff, feuille Paramètres).
export function coeffParcelle(surfaceM2: number): number {
  if (surfaceM2 < 5000) return 1.0;
  if (surfaceM2 < 20000) return 1.5;
  if (surfaceM2 < 50000) return 2.5;
  return 4.0;
}

// Bonus de facilité d'un quick win (calculator.FACILITY_BONUS) : priorité = écart × poids × bonus ÷ pénalité de coût.
export const BONUS_FACILITE: Record<string, number> = { Facile: 3, Moyenne: 2, Complexe: 1 };
export const MAX_QUICK_WINS = 20; // calculator.compute_audit_242(max_quick_wins=20)

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
export const API_TIMEOUT_MS = 420_000; // une requête = un vecteur (jusqu'à 4 appels de 20 critères pour V14), le modèle vision peut être lent

export const STORAGE_KEY = 'quietude-audit-v3';
