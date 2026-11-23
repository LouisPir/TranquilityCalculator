import { MAX_NOTE } from '../config';
import { projection } from '../lib/calcul';
import Radar from './Radar';
import { fr } from '../lib/format';
import { getVecteur } from '../lib/referentiel';
import { useAudit } from '../state/AuditContext';

// Version « papier » du rapport : invisible à l'écran, seule chose imprimée par window.print().
export default function ReportPrint() {
  const { state, resultat: r, scoreFinal, horsPerimetre } = useAudit();
  if (!state.auditLance) return null;
  const choisis = r.quickWins.filter((q) => !state.retirees[q.id]);
  const recos = r.recosIA.filter((q) => !state.retirees[q.id]);
  const retenus = new Set([...choisis.map((q) => q.id), ...recos.map((q) => q.id)]);
  const niveau = r.niveau;
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
        Score de maturité {scoreFinal ? 'final' : 'provisoire'} : <strong>{Math.round(r.scoreGlobal100)} / 100</strong> (note {fr(r.noteSur4, 2)} sur {MAX_NOTE}, niveau {niveau.index}{' '}
        {niveau.nom}). {r.nbEvalues} critères notés sur {r.nbApplicables} applicables (couverture {fr(r.couverturePct)} %) ; {horsPerimetre} critères écartés par le contexte.
      </p>

      <h2>Score par axe</h2>
      <ul>
        {r.parAxe.map((a) => (
          <li key={a.axe}>
            Axe {a.axe} : {a.score100 === null ? '–' : `${fr(a.score100)} / 100`}
          </li>
        ))}
      </ul>

      <h2>Radar des 14 vecteurs</h2>
      <Radar
        series={[
          { nom: 'Score actuel', valeurs: Object.fromEntries(r.parVecteur.map((v) => [v.vecteur, v.score100])), couleur: '#1b6a73', remplir: true },
          { nom: 'Score projeté', valeurs: projection(r, retenus).parVecteur, couleur: '#c2620a', tirets: true }
        ]}
      />

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
        {choisis.length} actions chiffrées et {recos.length} suggestions ; score projeté {Math.round(projection(r, retenus).global100)} / 100 ; coût estimé {fr(choisis.reduce((s, q) => s + q.coutMinKeur, 0), 0)} à{' '}
        {fr(choisis.reduce((s, q) => s + q.coutMaxKeur, 0), 0)} k€ HT (coefficient de parcelle ×{fr(r.coeffParcelle, 1)}).
      </p>
      <ol>
        {choisis.map((q) => (
          <li key={q.id}>
            {q.action} <em>({q.id}, note {q.noteRetenue} → {q.cible}, {q.coutMaxKeur === 0 ? 'sans surcoût' : `${fr(q.coutMinKeur, 0)} à ${fr(q.coutMaxKeur, 0)} k€`})</em>
          </li>
        ))}
      </ol>

      {recos.length > 0 && (
        <>
          <h2>Suggestions du modèle (non chiffrées)</h2>
          <ul>
            {recos.map((q) => (
              <li key={q.id}>
                {q.action} <em>({q.id}, note {q.noteRetenue} → {q.cible})</em>
              </li>
            ))}
          </ul>
        </>
      )}

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
