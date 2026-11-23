import { Chip } from '../components/ui';
import { LIBELLE_CLASSE_COUT } from '../config';
import { scoreProjete } from '../lib/calcul';
import { fr, telecharger } from '../lib/format';
import { getVecteur } from '../lib/referentiel';
import { useAudit } from '../state/AuditContext';

export default function StepPlan() {
  const { state, dispatch, resultat: r, scoreFinal } = useAudit();
  const retenus = new Set(r.quickWins.filter((q) => !state.retirees[q.id]).map((q) => q.id));
  const choisis = r.quickWins.filter((q) => retenus.has(q.id));
  const projete = scoreProjete(r, retenus);
  const gain = projete - r.scoreGlobal100;
  const coutMin = choisis.reduce((s, q) => s + q.coutMinKeur, 0);
  const coutMax = choisis.reduce((s, q) => s + q.coutMaxKeur, 0);
  const nbCoutDefaut = choisis.filter((q) => q.coutParDefaut).length;

  const exporterJson = () =>
    telecharger(
      'audit-tranquillite.json',
      JSON.stringify(
        {
          projet: state.projet,
          score: { global100: r.scoreGlobal100, noteSur4: r.noteSur4, couverturePct: r.couverturePct, final: scoreFinal },
          parVecteur: r.parVecteur,
          evaluations: r.lignes.map((l) => ({
            id_critere: l.critere.id,
            note: l.note,
            type_preuve: l.typePreuve,
            note_retenue: l.noteRetenue,
            preuve_extrait: l.preuve,
            corrigee: l.corrigee
          })),
          ecartes: state.ecartes,
          quick_wins_retenus: choisis.map((q) => ({
            id_critere: q.id,
            action: q.action,
            priorite: Number(q.priorite.toFixed(2)),
            cout_keur: [q.coutMinKeur, q.coutMaxKeur]
          })),
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
        Un quick win par critère encore sous sa cible, classé par priorité : plus l'écart est grand et l'action facile et peu chère, plus elle remonte. Décochez ceux
        que vous ne retenez pas.
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
          <span>Coût estimé ({choisis.length} actions)</span>
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

      <div className="cols">
        <div className="col col--main">
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
                Aucune action : tous les critères notés sont à leur cible. Les critères sans note ne génèrent pas d'action tant qu'ils ne sont pas évalués.
              </p>
            )}
            {r.quickWins.map((q, i) => (
              <div className="table__row" key={q.id}>
                <input type="checkbox" checked={retenus.has(q.id)} onChange={() => dispatch({ type: 'retiree', id: q.id })} aria-label={`Retenir l'action ${i + 1}`} />
                <div>
                  <div>
                    <strong>
                      {i + 1}. {q.action}
                    </strong>
                  </div>
                  <div className="chips">
                    <Chip>
                      {q.id} {q.libelle.length > 70 ? `${q.libelle.slice(0, 70)}…` : q.libelle}
                    </Chip>
                    <Chip>{getVecteur(q.vecteur)?.nom ?? q.vecteur}</Chip>
                    <Chip>{q.facilite}</Chip>
                    <Chip ton={q.classeCout === '0' ? 'ok' : 'neutral'}>
                      {q.classeCout === '0' ? '0 €' : q.classeCout} · {LIBELLE_CLASSE_COUT[q.classeCout]}
                    </Chip>
                    {q.coutParDefaut && <Chip ton="warn">Coût par défaut</Chip>}
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
        </div>

        <aside className="col col--side no-print">
          <section className="card">
            <h2>Hypothèses explicites</h2>
            <ul className="bullets small">
              <li>Priorité = écart à la cible × poids × bonus de facilité (facile 3, moyenne 2, complexe 1) ÷ pénalité de coût (0 : 1, € : 1,5, €€ : 2,5, €€€ : 4).</li>
              <li>Le score projeté suppose que chaque action retenue amène son critère à la cible, sans effet croisé.</li>
              <li>Le coût est la fourchette de sa classe (€, €€, €€€) multipliée par le coefficient de parcelle.</li>
              {nbCoutDefaut > 0 && (
                <li>
                  {nbCoutDefaut} action{nbCoutDefaut > 1 ? 's' : ''} sans classe de coût dans le référentiel : classe « € » et facilité « moyenne » appliquées par défaut.
                </li>
              )}
              <li>Les critères sans note ne génèrent pas d'action : notez-les d'abord pour compléter le plan.</li>
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
