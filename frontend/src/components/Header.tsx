import { useAudit } from '../state/AuditContext';
import { Chip } from './ui';

export default function Header() {
  const { state, dispatch } = useAudit();
  return (
    <header className="header no-print">
      <div className="brand">
        <div className="brand__logo" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10" cy="10" r="7" />
            <path d="M6.5 10.5c1.2 1.6 5.8 1.6 7 0" />
          </svg>
        </div>
        <div>
          <div className="brand__name">Quiétude</div>
          <div className="muted small">Score de maturité de la tranquillité d'une opération d'aménagement</div>
        </div>
      </div>
      <div className="header__right">
        {state.source === 'mock' && <Chip ton="warn">Mode démo : réponses simulées</Chip>}
        {state.source === 'api' && state.auditLance && <Chip ton="teal">Audit réalisé par le backend</Chip>}
        {(state.auditLance || state.projet.nom || state.texte) && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              if (window.confirm("Effacer l'audit en cours et recommencer ?")) dispatch({ type: 'reset' });
            }}
          >
            Nouvel audit
          </button>
        )}
      </div>
    </header>
  );
}
