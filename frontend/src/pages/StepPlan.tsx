import Radar from '../components/Radar';
import { Chip } from '../components/ui';
import { LIBELLE_CLASSE_COUT, MAX_QUICK_WINS } from '../config';
import { projection } from '../lib/calcul';
import { fr, telecharger } from '../lib/format';
import { getVecteur } from '../lib/referentiel';
import { useAudit } from '../state/AuditContext';

const coupe = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n)}…` : t);

export default function StepPlan() {
  const { state, dispatch, resultat: r, scoreFinal } = useAudit();
  const retenue = (id: string): boolean => !state.retirees[id];
  const qwChoisis = r.quickWins.filter((q) => retenue(q.id));
  const recosChoisies = r.recosIA.filter((q) => retenue(q.id));
  const ids = new Set([...qwChoisis.map((q) => q.id), ...recosChoisies.map((q) => q.id)]);
  const proj = projection(r, ids);
  const projete = proj.global100;
  const gain = projete - r.scoreGlobal100;
  const coutMin = qwChoisis.reduce((s, q) => s + q.coutMinKeur, 0);
  const coutMax = qwChoisis.reduce((s, q) => s + q.coutMaxKeur, 0);

  const exporterJson = () =>
    telecharger(
      'audit-tranquillite.json',
      JSON.stringify(
        {
          projet: state.projet,
          score: { global100: r.scoreGlobal100, noteSur4: r.noteSur4, niveau: r.niveau, couverturePct: r.couverturePct, indicatif: r.scoreIndicatif },
          parAxe: r.parAxe,
          parVecteur: r.parVecteur.map(({ brut4: _b, ...v }) => v),
          evaluations: r.lignes.map((l) => ({
            id_critere: l.critere.id,
            note: l.note,
            type_preuve: l.typePreuve,
            note_retenue: l.noteRetenue,
            preuve_extrait: l.preuve,
            corrigee: l.corrigee
          })),
          ecartes: state.ecartes,
          quick_wins_referentiel_retenus: qwChoisis.map((q) => ({
            id_critere: q.id,
            action: q.action,
            priorite: q.priorite,
            cout_keur: [q.coutMinKeur, q.coutMaxKeur]
          })),
          recommandations_ia_retenues: recosChoisies.map((q) => ({ id_critere: q.id, action_ia: q.action })),
          score_projete: projete
        },
        null,
        2
      )
    );

  return (
    <div>
      <h1>Que faire pour progresser</h1>
      <p className="lead">
        Les actions du référentiel, classées par priorité et chiffrées, puis les suggestions du modèle pour les critères que le référentiel ne chiffre pas.
        Décochez ce que vous ne retenez pas.
      </p>

      <div className="stats no-print">
        <div className="stat">
          <span>Score actuel {scoreFinal ? '' : '(provisoire)'}</span>
          <b>
            {Math.round(r.scoreGlobal100)}
            <small> / 100</small>
          </b>
        </div>
        <div className="stat stat--accent">
          <span>Score projeté</span>
          <b>
            {Math.round(projete)}
            <small> / 100 (+{fr(gain, 1)})</small>
          </b>
        </div>
        <div className="stat">
          <span>Coût estimé ({qwChoisis.length} actions chiffrées)</span>
          <b>
            {fr(coutMin, 0)} à {fr(coutMax, 0)}
            <small> k€ HT</small>
          </b>
        </div>
        <div className="stat">
          <span>Coefficient de parcelle</span>
          <b>×{fr(r.coeffParcelle, 1)}</b>
          {!state.projet.surfaceM2 && <small> surface non renseignée</small>}
        </div>
      </div>

      <section className="card no-print" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Effet des actions retenues, vecteur par vecteur</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Le tracé en tirets montre le score si les actions cochées amènent chaque critère concerné à sa cible. Il bouge quand vous cochez ou décochez.
        </p>
        <Radar
          series={[
            { nom: 'Score actuel', valeurs: Object.fromEntries(r.parVecteur.map((v) => [v.vecteur, v.score100])), couleur: '#1b6a73', remplir: true },
            { nom: 'Score projeté', valeurs: proj.parVecteur, couleur: '#c2620a', tirets: true }
          ]}
        />
      </section>

      <div className="cols">
        <div className="col col--main">
          <h2 style={{ margin: 0 }}>Quick wins du référentiel (chiffrés)</h2>
          <div className="table card">
            <div className="table__head">
              <span>Retenir</span>
              <span>Action (critère lié)</span>
              <span>Note</span>
              <span>Priorité</span>
              <span>Coût</span>
            </div>
            {r.quickWins.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>
                Aucun quick win chiffré : seuls les critères notés sous leur cible et dotés d'une action, d'une classe de coût et d'une facilité dans le référentiel
                en génèrent. Notez d'abord davantage de critères.
              </p>
            )}
            {r.quickWins.map((q, i) => (
              <div className="table__row" key={q.id}>
                <input type="checkbox" checked={retenue(q.id)} onChange={() => dispatch({ type: 'retiree', id: q.id })} aria-label={`Retenir l'action ${i + 1}`} />
                <div>
                  <div>
                    <strong>
                      {i + 1}. {q.action}
                    </strong>
                  </div>
                  {q.actionIA && <div className="small muted">Suggestion du modèle : {q.actionIA}</div>}
                  <div className="chips">
                    <Chip>
                      {q.id} {coupe(q.libelle, 70)}
                    </Chip>
                    <Chip>{getVecteur(q.vecteur)?.nom ?? q.vecteur}</Chip>
                    <Chip>{q.facilite}</Chip>
                    {q.phase && <Chip>{q.phase}</Chip>}
                    <Chip ton={q.classeCout === '0' ? 'ok' : 'neutral'}>
                      {q.classeCout === '0' ? '0 €' : q.classeCout} · {LIBELLE_CLASSE_COUT[q.classeCout]}
                    </Chip>
                  </div>
                </div>
                <div>
                  {q.noteRetenue} → {q.cible}
                </div>
                <div className="strong-teal">{fr(q.priorite, 1)}</div>
                <div>{q.coutMaxKeur === 0 ? 'Sans surcoût' : `${fr(q.coutMinKeur, 0)} à ${fr(q.coutMaxKeur, 0)} k€`}</div>
              </div>
            ))}
          </div>
          {r.nbQuickWinsHorsTop > 0 && (
            <p className="muted small">
              Seules les {MAX_QUICK_WINS} actions les plus prioritaires sont affichées ; {r.nbQuickWinsHorsTop} autre{r.nbQuickWinsHorsTop > 1 ? 's' : ''} du référentiel
              {r.nbQuickWinsHorsTop > 1 ? 'restent' : 'reste'} en attente.
            </p>
          )}

          <h2 style={{ margin: '12px 0 0' }}>Suggestions du modèle (non chiffrées)</h2>
          <div className="table card">
            <div className="table__head">
              <span>Retenir</span>
              <span>Suggestion (critère lié)</span>
              <span>Note</span>
              <span />
              <span />
            </div>
            {r.recosIA.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>
                Aucune suggestion : le modèle n'en formule que pour les critères notés 2 ou moins qui n'ont pas de quick win chiffré dans le référentiel.
              </p>
            )}
            {r.recosIA.map((q, i) => (
              <div className="table__row" key={q.id}>
                <input type="checkbox" checked={retenue(q.id)} onChange={() => dispatch({ type: 'retiree', id: q.id })} aria-label={`Retenir la suggestion ${i + 1}`} />
                <div>
                  <div>
                    <strong>
                      {i + 1}. {q.action}
                    </strong>
                  </div>
                  <div className="chips">
                    <Chip>
                      {q.id} {coupe(q.libelle, 70)}
                    </Chip>
                    <Chip>{getVecteur(q.vecteur)?.nom ?? q.vecteur}</Chip>
                    {q.phase && <Chip>{q.phase}</Chip>}
                  </div>
                </div>
                <div>
                  {q.noteRetenue} → {q.cible}
                </div>
                <span />
                <span />
              </div>
            ))}
          </div>
        </div>

        <aside className="col col--side no-print">
          <section className="card">
            <h2>Hypothèses explicites</h2>
            <ul className="bullets small">
              <li>Priorité = écart à la cible × poids × bonus de facilité (facile 3, moyenne 2, complexe 1) ÷ pénalité de coût (0 : 1, € : 1,5, €€ : 2,5, €€€ : 4).</li>
              <li>Coût = fourchette de la classe (€ : 1 à 10 k€, €€ : 10 à 50, €€€ : 50 à 200) × coefficient de parcelle (×1, ×1,5, ×2,5, ×4 à 5 000, 20 000 et 50 000 m²).</li>
              <li>Le score projeté suppose que chaque action retenue amène son critère à la cible, sans effet croisé.</li>
              <li>Les suggestions du modèle ne sont pas chiffrées : seul le référentiel porte une classe de coût.</li>
            </ul>
          </section>
          <div className="toolbar">
            <button type="button" className="btn btn--primary grow" onClick={() => window.print()}>
              Exporter le rapport (PDF)
            </button>
            <button type="button" className="btn grow" onClick={exporterJson}>
              Télécharger l'audit (JSON)
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
