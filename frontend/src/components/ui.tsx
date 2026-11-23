import type { ReactNode } from 'react';
import { MAX_NOTE, PREUVES } from '../config';
import { MATURITE } from '../lib/referentiel';

type Ton = 'neutral' | 'teal' | 'ok' | 'warn' | 'bad';

export function Chip({ children, ton = 'neutral' }: { children: ReactNode; ton?: Ton }) {
  return <span className={`chip chip--${ton}`}>{children}</span>;
}

export const libelleNote = (n: number | null): string => (n === null ? 'Sans information' : (MATURITE[n]?.niveau ?? ''));

// Note 0 à 4, plus une case « – » pour « aucune information » (note vide côté backend).
export function NoteSelector({ critereId, value, onChange }: { critereId: string; value: number | null; onChange: (n: number | null) => void }) {
  const options: (number | null)[] = [null, ...Array.from({ length: MAX_NOTE + 1 }, (_, n) => n)];
  return (
    <div className="notes" role="group" aria-label={`Note du critère ${critereId}`}>
      {options.map((n) => (
        <button
          key={n === null ? 'vide' : n}
          type="button"
          className={`note-btn${n === value ? ' note-btn--on' : ''}`}
          aria-pressed={n === value}
          aria-label={n === null ? 'Aucune information' : `Note ${n} : ${libelleNote(n)}`}
          title={n === null ? 'Aucune information trouvée' : `${n} · ${libelleNote(n)}`}
          onClick={() => onChange(n)}
        >
          {n === null ? '–' : n}
        </button>
      ))}
    </div>
  );
}

export function PreuveSelect({ critereId, value, onChange }: { critereId: string; value: string | null; onChange: (t: string | null) => void }) {
  return (
    <select
      className="select"
      aria-label={`Type de preuve du critère ${critereId}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Preuve non précisée</option>
      {PREUVES.map((p) => (
        <option key={p.type} value={p.type}>
          {p.type} (note max {p.plafond})
        </option>
      ))}
    </select>
  );
}

const CIRC = 2 * Math.PI * 54;

export function ScoreRing({ score }: { score: number }) {
  const arrondi = Math.round(score);
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Score global ${arrondi} sur 100`}>
      <circle cx="66" cy="66" r="54" fill="none" stroke="#ECEAE0" strokeWidth="12" />
      <circle
        cx="66"
        cy="66"
        r="54"
        fill="none"
        stroke="#1B6A73"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(CIRC * Math.max(0, Math.min(100, score))) / 100} ${CIRC}`}
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="68" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontSize="34" fontWeight="700" fill="#17262B">
        {arrondi}
      </text>
      <text x="66" y="90" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" fill="#55656B">
        sur 100
      </text>
    </svg>
  );
}
