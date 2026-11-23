import { MAX_NOTE } from '../config';
import { maturite, scoreProjete } from '../lib/calcul';
import { fr } from '../lib/format';
import { getVecteur } from '../lib/referentiel';
import { useAudit } from '../state/AuditContext';

// Version « papier » du rapport : invisible à l'écran, seule chose imprimée par window.print().
export default function ReportPrint() {
  const { state, resultat: r, scoreFinal, horsPerimetre } = useAudit();
  if (!state.auditLance) return null;
  const retenus = new Set(r.quickWins.filter((q) => !state.retirees[q.id]).map((q) => q.id));
  const choisis = r.quickWins.filter((q) => retenus.has(q.id));
  const niveau = maturite(r.noteSur4);
  const ecartes = Object.entries(state.ecartes);

  return (
    <section className="print-only report">
      <h1>Rapport d'audit de tranquillité{state.projet.nom ? ` : ${state.projet.nom}` : ''}</h1>
      <p>
        {[state.projet.commune, state.projet.typeOperation, state.projet.phase, state.projet.surfaceM2 ? `${state.projet.surfaceM2} m²` : '']
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p>
        Score de maturité {scoreFinal ? 'final' : 'provisoire'} : <strong>{Math.round(r.scoreGlobal100)} / 100</strong> (note {fr(r.noteSur4, 2)} sur {MAX_NOTE}, niveau{' '}
        {niveau.niveau}). {r.nbEvalues} critères notés sur {r.nbApplicables} applicables (couverture {fr(r.couverturePct)} %) ; {horsPerimetre} critères écartés par le contexte.
      </p>

      <h2>Score par vecteur</h2>
      <table>
        <thead>
          <tr>
            <th>Vecteur</th>
            <th>Critères notés</th>
            <th>Score /100</th>
          </tr>
        </thead>
        <tbody>
          {r.parVecteur.map((v) => (
            <tr key={v.vecteur}>
              <td>
                {v.vecteur} {getVecteur(v.vecteur)?.nom}
              </td>
              <td>
                {v.evalues} / {v.applicables}
              </td>
              <td>{v.score100 === null ? '–' : fr(v.score100)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Plan d'action retenu</h2>
      <p>
        {choisis.length} actions ; score projeté {Math.round(scoreProjete(r, retenus))} / 100 ; coût estimé {fr(choisis.reduce((s, q) => s + q.coutMinKeur, 0), 0)} à{' '}
        {fr(choisis.reduce((s, q) => s + q.coutMaxKeur, 0), 0)} k€ HT (coefficient de parcelle ×{fr(r.coeffParcelle, 1)}).
      </p>
      <ol>
        {choisis.map((q) => (
          <li key={q.id}>
            {q.action} <em>({q.id}, note {q.noteRetenue} → {q.cible}, {q.coutMaxKeur === 0 ? 'sans surcoût' : `${fr(q.coutMinKeur, 0)} à ${fr(q.coutMaxKeur, 0)} k€`})</em>
          </li>
        ))}
      </ol>

      {ecartes.length > 0 && (
        <>
          <h2>Critères écartés</h2>
          <ul>
            {ecartes.map(([id, motif]) => (
              <li key={id}>
                {id} : {motif}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
