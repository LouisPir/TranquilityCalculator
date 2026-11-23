import { MAX_NOTE } from '../config';
import { fr } from '../lib/format';
import { AXES, VECTEURS } from '../lib/referentiel';

// Radar des 14 vecteurs en SVG pur (aucune dépendance). Valeurs sur 100 ; null = vecteur non noté.
export interface SerieRadar {
  nom: string;
  valeurs: Record<string, number | null>; // clé = code vecteur (V01…)
  couleur: string;
  tirets?: boolean;
  remplir?: boolean;
  marqueurs?: boolean;
}

// Cible = niveau 3 (cible par défaut des critères) ramené sur 100.
export const CIBLE_100 = (3 / MAX_NOTE) * 100;

const COURT: Record<string, string> = {
  V01: 'Lisibilité & visibilité',
  V02: 'Éclairage nocturne',
  V03: 'Parcours & mobilités',
  V04: 'Espaces publics',
  V05: 'Stationnement',
  V06: 'Interfaces & RDC',
  V07: 'Accès & communs',
  V08: 'Logements',
  V09: 'Présence & mixité',
  V10: 'Confort & nature',
  V11: 'Gestion & entretien',
  V12: 'Dispositifs collectivité',
  V13: 'Chantier',
  V14: 'Co-construction'
};

const COULEUR_AXE: Record<string, string> = { A: '#1b6a73', B: '#a15c00', C: '#6b4c9a' };

const W = 860;
const H = 480;
const CX = W / 2;
const CY = 238;
const R = 175;
const NIVEAUX = [25, 50, 75, 100];

const point = (i: number, valeur: number, n: number): [number, number] => {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  const r = (R * Math.max(0, Math.min(100, valeur))) / 100;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};

export default function Radar({ series, cible = true }: { series: SerieRadar[]; cible?: boolean }) {
  const n = VECTEURS.length;
  const resume = series
    .map((s) => `${s.nom} : ${VECTEURS.map((v) => `${v.code} ${s.valeurs[v.code] === null || s.valeurs[v.code] === undefined ? 'non noté' : Math.round(s.valeurs[v.code] as number)}`).join(', ')}`)
    .join(' ; ');

  return (
    <figure className="radar">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Radar des 14 vecteurs sur 100. ${resume}`} style={{ width: '100%', maxWidth: 720, height: 'auto' }}>
        {/* anneaux */}
        {NIVEAUX.map((niv) => (
          <polygon
            key={niv}
            points={VECTEURS.map((_, i) => point(i, niv, n).join(',')).join(' ')}
            fill="none"
            stroke={cible && niv === CIBLE_100 ? '#1b6a73' : '#dedbd0'}
            strokeWidth={cible && niv === CIBLE_100 ? 1.4 : 1}
            strokeDasharray={cible && niv === CIBLE_100 ? '5 4' : undefined}
          />
        ))}
        {/* rayons et graduation */}
        {VECTEURS.map((v, i) => {
          const [x, y] = point(i, 100, n);
          return <line key={v.code} x1={CX} y1={CY} x2={x} y2={y} stroke="#dedbd0" strokeWidth="1" />;
        })}
        {NIVEAUX.map((niv) => (
          <text key={niv} x={CX + 4} y={CY - (R * niv) / 100 + 11} fontSize="12" fill="#55656b" fontFamily="Inter, sans-serif">
            {niv}
          </text>
        ))}

        {/* séries : la dernière est dessinée en dessous pour que l'actuel reste lisible */}
        {[...series].reverse().map((s) => {
          const pts = VECTEURS.map((v, i) => point(i, s.valeurs[v.code] ?? 0, n));
          return (
            <g key={s.nom}>
              <polygon
                points={pts.map((p) => p.join(',')).join(' ')}
                fill={s.remplir ? s.couleur : 'none'}
                fillOpacity={s.remplir ? 0.18 : 0}
                stroke={s.couleur}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeDasharray={s.tirets ? '6 4' : undefined}
              />
              {s.marqueurs !== false &&
                VECTEURS.map((v, i) => {
                  const val = s.valeurs[v.code];
                  if (val === null || val === undefined) return null;
                  const [x, y] = pts[i];
                  return (
                    <circle key={v.code} cx={x} cy={y} r="4" fill={s.couleur} stroke="#fff" strokeWidth="1.2">
                      <title>{`${v.code} ${v.nom} — ${s.nom.toLowerCase()} : ${fr(val)} / 100`}</title>
                    </circle>
                  );
                })}
            </g>
          );
        })}

        {/* étiquettes */}
        {VECTEURS.map((v, i) => {
          const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const lx = CX + (R + 20) * Math.cos(a);
          const ly = CY + (R + 20) * Math.sin(a);
          const ancre = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
          const dy = Math.sin(a) > 0.5 ? 10 : Math.sin(a) < -0.5 ? -4 : 3;
          const nonNote = series[0] && (series[0].valeurs[v.code] === null || series[0].valeurs[v.code] === undefined);
          return (
            <text key={v.code} x={lx} y={ly + dy} textAnchor={ancre} fontSize="14.5" fontFamily="Inter, sans-serif" fill={nonNote ? '#8a979c' : '#17262b'}>
              <tspan fontWeight="700" fill={COULEUR_AXE[v.axe]}>
                {v.code}
              </tspan>
              <tspan dx="5">{COURT[v.code] ?? v.nom}</tspan>
            </text>
          );
        })}
      </svg>

      <figcaption className="radar__legend">
        {series.map((s) => (
          <span key={s.nom} className="radar__key">
            <svg width="26" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="25" y2="5" stroke={s.couleur} strokeWidth="2.4" strokeDasharray={s.tirets ? '5 3' : undefined} />
              <circle cx="13" cy="5" r="3.2" fill={s.couleur} />
            </svg>
            {s.nom}
          </span>
        ))}
        {cible && (
          <span className="radar__key">
            <svg width="26" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="25" y2="5" stroke="#1b6a73" strokeWidth="1.4" strokeDasharray="5 4" />
            </svg>
            Cible (niveau 3 = {CIBLE_100})
          </span>
        )}
        {series[0] && VECTEURS.some((v) => series[0].valeurs[v.code] === null || series[0].valeurs[v.code] === undefined) && (
          <span className="radar__key">Libellé grisé : vecteur non noté (placé au centre)</span>
        )}
        <span className="radar__axes">
          {AXES.map((a) => (
            <span key={a.code} className="radar__key">
              <b style={{ color: COULEUR_AXE[a.code] }}>{a.code}</b> {a.nom}
            </span>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
