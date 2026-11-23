import type { Step } from '../types';
import { useAudit } from '../state/AuditContext';

const ETAPES: { n: Step; label: string; sub: string }[] = [
  { n: 1, label: 'Dossier', sub: 'Proposition et contexte' },
  { n: 2, label: 'Audit', sub: '14 vecteurs, notes, preuves' },
  { n: 3, label: 'Score', sub: 'Maturité et couverture' },
  { n: 4, label: 'Plan d\'action', sub: 'Quick wins, coûts, rapport' }
];

export default function Stepper() {
  const { state, dispatch } = useAudit();
  return (
    <nav className="stepper no-print" aria-label="Étapes de l'audit">
      {ETAPES.map((e) => {
        const actif = state.step === e.n;
        const bloque = e.n > 1 && !state.auditLance;
        return (
          <button
            key={e.n}
            type="button"
            className={`step${actif ? ' step--on' : ''}`}
            aria-current={actif ? 'step' : undefined}
            disabled={bloque}
            onClick={() => dispatch({ type: 'step', step: e.n })}
          >
            <span className="step__n">{e.n}</span>
            <span className="step__txt">
              <strong>{e.label}</strong>
              <small>{e.sub}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
