import { Chip, ScoreRing } from '../components/ui';
import { MAX_NOTE } from '../config';
import { maturite } from '../lib/calcul';
import { fr } from '../lib/format';
import { AXES, VECTEURS, getVecteur } from '../lib/referentiel';
import { useAudit } from '../state/AuditContext';

export default function StepScore() {
  const { state, dispatch, resultat, scoreFinal, nbQuestionsRepondues, horsPerimetre } = useAudit();
  const r = resultat;
  const niveau = maturite(r.noteSur4);
  const nbVec = state.vecteursChoisis.length;

  const raisons: string[] = [];
  if (r.couverturePct < 100) raisons.push(`${r.nbVides} critère${r.nbVides > 1 ? 's' : ''} applicable${r.nbVides > 1 ? 's' : ''} sans note (couverture ${fr(r.couverturePct)} %)`);
  if (nbQuestionsRepondues < 9) raisons.push(`${9 - nbQuestionsRepondues} question${9 - nbQuestionsRepondues > 1 ? 's' : ''} de contexte sans réponse`);
  if (nbVec < VECTEURS.length) raisons.push(`${VECTEURS.length - nbVec} vecteur${VECTEURS.length - nbVec > 1 ? 's' : ''} hors périmètre`);

  const notes = r.parVecteur.filter((v) => v.score100 !== null);
  const classes = [...notes].sort((a, b) => (a.score100 as number) - (b.score100 as number));
  const faibles = classes.slice(0, 3).map((v) => v.vecteur);
  const forts = [...classes].reverse().slice(0, 3).filter((v) => (v.score100 as number) >= 50);
  const vigilances = classes.slice(0, 3);
  const nbZero = r.lignes.filter((l) => l.noteRetenue === 0).length;

  return (
    <div>
      <h1>Score de maturité</h1>
      <p className="lead">
        Le score mesure la maturité de la tranquillité du projet à partir des critères notés. Il reste <strong>provisoire</strong> tant que tous les critères applicables ne
        sont pas notés et que le contexte n'est pas renseigné en entier.
      </p>

      <div className="cols">
        <div className="col col--side">
          <section className="card ring-card">
            <ScoreRing score={r.scoreGlobal100} />
            <div>
              <Chip ton={scoreFinal ? 'ok' : 'warn'}>{scoreFinal ? 'Score final' : 'Score provisoire'}</Chip>
              <div className="big" style={{ marginTop: 6 }}>
                Note {fr(r.noteSur4, 2)} sur {MAX_NOTE}
              </div>
              <div className="strong-teal">Niveau : {niveau.niveau}</div>
              <div className="muted small">{niveau.definition}</div>
            </div>
          </section>

          <section className="card">
            <div className="label">Couverture de l'audit</div>
            <div className="bar">
              <div className="bar__fill" style={{ width: `${r.couverturePct}%` }} />
            </div>
            <p className="muted small">
              {r.nbEvalues} critères notés sur {r.nbApplicables} applicables ({fr(r.couverturePct)} %). {horsPerimetre} critères écartés par le contexte du projet.
            </p>
            {raisons.length > 0 && (
              <>
                <div className="eyebrow">Pourquoi le score est provisoire</div>
                <ul className="bullets small">
                  {raisons.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
            {r.nbPlafonnees > 0 && (
              <p className="muted small">
                {r.nbPlafonnees} note{r.nbPlafonnees > 1 ? 's' : ''} plafonnée{r.nbPlafonnees > 1 ? 's' : ''} par le type de preuve (ex. une simple déclaration ne dépasse pas 1).
              </p>
            )}
          </section>

          <section className="card">
            <h2>Lecture rapide</h2>
            <div className="tiles">
              <div className="tile tile--ok">
                <b>{r.lignes.filter((l) => l.noteRetenue !== null && l.noteRetenue >= l.critere.cible).length}</b>
                <span>À la cible</span>
              </div>
              <div className="tile tile--warn">
                <b>{r.quickWins.length}</b>
                <span>À améliorer</span>
              </div>
              <div className="tile tile--bad">
                <b>{nbZero}</b>
                <span>Notés 0</span>
              </div>
            </div>
          </section>
        </div>

        <div className="col col--main">
          <section className="card">
            <h2>Points forts et vigilances</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Déduits des scores par vecteur : aucun texte n'est ajouté par le modèle.
            </p>
            <div className="two">
              <div>
                <div className="eyebrow">Points forts</div>
                <ul className="bullets">
                  {forts.length === 0 && <li className="muted">Aucun vecteur à 50 ou plus pour l'instant.</li>}
                  {forts.map((v) => (
                    <li key={v.vecteur}>
                      {v.vecteur} {getVecteur(v.vecteur)?.nom} : {fr(v.score100 as number)} / 100
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="eyebrow">Vigilances</div>
                <ul className="bullets">
                  {vigilances.length === 0 && <li className="muted">Aucun vecteur noté.</li>}
                  {vigilances.map((v) => (
                    <li key={v.vecteur}>
                      {v.vecteur} {getVecteur(v.vecteur)?.nom} : {fr(v.score100 as number)} / 100
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Score par vecteur</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Les trois vecteurs les plus faibles sont signalés. « n / N » = critères notés sur critères applicables.
            </p>
            {AXES.map((ax) => (
              <div key={ax.code} className="axe">
                <div className="eyebrow">
                  Axe {ax.code} · {ax.nom}
                </div>
                <div className="bars">
                  {r.parVecteur
                    .filter((v) => getVecteur(v.vecteur)?.axe === ax.code)
                    .map((v) => {
                      const bas = faibles.includes(v.vecteur) && v.score100 !== null;
                      return (
                        <div className="bars__row" key={v.vecteur}>
                          <div className="bars__label">
                            {v.vecteur} {getVecteur(v.vecteur)?.nom} <span className="muted">· {v.evalues} / {v.applicables}</span>
                          </div>
                          <div className="bars__track">
                            <div className={`bars__fill${bas ? ' bars__fill--low' : ''}`} style={{ width: `${v.score100 ?? 0}%` }} />
                          </div>
                          <div className="bars__val">{v.score100 === null ? '–' : fr(v.score100)}</div>
                          {bas ? <Chip ton="warn">À renforcer</Chip> : <span />}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </section>

          <button type="button" className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={() => dispatch({ type: 'step', step: 4 })}>
            Voir le plan d'action
          </button>
        </div>
      </div>
    </div>
  );
}
