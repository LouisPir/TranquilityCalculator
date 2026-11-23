import { useMemo, useState } from 'react';
import { Chip, NoteSelector, PreuveSelect, libelleNote } from '../components/ui';
import { fr } from '../lib/format';
import { AXES, CRITERES, VECTEURS, estApplicable, getCritere, getVecteur, libelleCritere, tagsActifs } from '../lib/referentiel';
import { useAudit } from '../state/AuditContext';
import type { Critere, LigneAudit } from '../types';

type Filtre = 'tous' | 'vides' | 'plafonnees' | 'corrigees';
const FILTRES: { k: Filtre; label: string }[] = [
  { k: 'tous', label: 'Tous' },
  { k: 'vides', label: 'Sans note' },
  { k: 'plafonnees', label: 'Plafonnés par la preuve' },
  { k: 'corrigees', label: 'Corrigés' }
];

function LigneCritere({ l }: { l: LigneAudit }) {
  const { state, dispatch, evaluations } = useAudit();
  const c = l.critere;
  const selectionne = state.selCritere === c.id;
  const aUneNote = l.note !== null;
  const typePreuve = evaluations.get(c.id)?.type_preuve ?? null;

  return (
    <div className={`row${selectionne ? ' row--sel' : ''}`}>
      <div className="row__head">
        <div className="row__title">
          <button type="button" className="link-title" onClick={() => dispatch({ type: 'selCritere', id: c.id })}>
            {c.id} · {libelleCritere(c)}
          </button>
          <div className="chips">
            <Chip>{c.famille}</Chip>
            <Chip>Cible {c.cible}</Chip>
            {l.noteRetenue !== null && <Chip ton={l.noteRetenue >= c.cible ? 'ok' : 'neutral'}>Note retenue {l.noteRetenue}</Chip>}
            {l.plafonnee && <Chip ton="warn">Plafonnée par la preuve ({typePreuve})</Chip>}
            {!aUneNote && <Chip>Sans information</Chip>}
            {l.corrigee && <Chip ton="teal">Corrigée à la main</Chip>}
          </div>
        </div>
        <NoteSelector
          critereId={c.id}
          value={l.note}
          onChange={(n) => dispatch({ type: 'note', id: c.id, note: n, typePreuve: n === null ? null : typePreuve })}
        />
      </div>
      <div className="row__body">
        <div className="small">
          <strong>{libelleNote(l.note)}.</strong> {aUneNote ? '' : "Le modèle n'a pas trouvé d'information : ce critère ne compte pas dans le score tant qu'il n'est pas noté."}
        </div>
        {l.preuve && <blockquote className="quote">{l.preuve}</blockquote>}
        {aUneNote && (
          <div className="toolbar" style={{ marginTop: 8 }}>
            <PreuveSelect critereId={c.id} value={typePreuve} onChange={(t) => dispatch({ type: 'note', id: c.id, note: l.note, typePreuve: t })} />
          </div>
        )}
      </div>
    </div>
  );
}

function LigneEcartee({ c, motif }: { c: Critere; motif: string }) {
  const { dispatch } = useAudit();
  return (
    <div className="row row--off">
      <div className="row__head">
        <div className="row__title">
          <div>
            {c.id} · {libelleCritere(c)}
          </div>
          <div className="chips">
            <Chip>Écarté</Chip>
            <span className="muted small">Motif : {motif}</span>
          </div>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'ecarte', id: c.id, motif: null })}>
          Réintégrer
        </button>
      </div>
    </div>
  );
}

function Detail({ c, ligne }: { c: Critere; ligne: LigneAudit | undefined }) {
  const { state, dispatch } = useAudit();
  const [motif, setMotif] = useState('');
  const ecarte = state.ecartes[c.id];
  const corrige = !!state.corrections[c.id];

  return (
    <section className="card detail">
      <div>
        <div className="eyebrow">
          Critère {c.id} · {c.famille}
        </div>
        <h3>{libelleCritere(c)}</h3>
      </div>
      {c.question && (
        <div className="box box--teal">
          <div className="eyebrow">Question d'audit</div>
          <div>{c.question}</div>
        </div>
      )}
      {ligne?.quickWin && (
        <div className="box">
          <div className="eyebrow">Action proposée par le modèle</div>
          <div>{ligne.quickWin}</div>
        </div>
      )}
      {c.ouRegarder && (
        <div>
          <div className="eyebrow">Où regarder sur les plans</div>
          <div>{c.ouRegarder}</div>
        </div>
      )}
      {c.preuves && (
        <div>
          <div className="eyebrow">Preuves attendues</div>
          <div>{c.preuves}</div>
        </div>
      )}
      {c.pourquoi && (
        <div>
          <div className="eyebrow">Pourquoi ce critère</div>
          <div>{c.pourquoi}</div>
        </div>
      )}
      <div className="muted small">
        Applicabilité : {c.applicabilite} · poids {c.poids} · cible {c.cible} · phase {c.phase || '—'}
      </div>

      {corrige && (
        <button type="button" className="btn" onClick={() => dispatch({ type: 'noteReset', id: c.id })}>
          Revenir à la note du modèle
        </button>
      )}
      {ecarte ? (
        <button type="button" className="btn" onClick={() => dispatch({ type: 'ecarte', id: c.id, motif: null })}>
          Réintégrer ce critère
        </button>
      ) : (
        <div>
          <label className="field">
            <span>Écarter ce critère (sans objet) : motif obligatoire</span>
            <input type="text" value={motif} placeholder="Ex. pas de local vélos : opération sans logements" onChange={(e) => setMotif(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 8 }}
            disabled={motif.trim().length < 5}
            onClick={() => {
              dispatch({ type: 'ecarte', id: c.id, motif: motif.trim() });
              setMotif('');
            }}
          >
            Écarter ce critère
          </button>
        </div>
      )}
    </section>
  );
}

export default function StepAudit() {
  const { state, dispatch, resultat } = useAudit();
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const vecteur = getVecteur(state.selVecteur) ?? VECTEURS[0];
  const actifs = useMemo(() => tagsActifs(state.reponses), [state.reponses]);
  const dansVecteur = useMemo(() => CRITERES.filter((c) => c.vecteur === vecteur.code && estApplicable(c, actifs)), [vecteur.code, actifs]);
  const lignes = resultat.lignes.filter((l) => l.critere.vecteur === vecteur.code);
  const parId = new Map(lignes.map((l) => [l.critere.id, l]));
  const ecartes = dansVecteur.filter((c) => state.ecartes[c.id]);
  const horsPerimetre = !state.vecteursChoisis.includes(vecteur.code);
  const sv = resultat.parVecteur.find((x) => x.vecteur === vecteur.code);
  const run = state.runs[vecteur.code];

  const visibles = lignes.filter((l) =>
    filtre === 'tous' ? true : filtre === 'vides' ? l.note === null : filtre === 'plafonnees' ? l.plafonnee : l.corrigee
  );
  const sel = state.selCritere ? getCritere(state.selCritere) : undefined;
  const detail = sel && sel.vecteur === vecteur.code ? sel : (lignes[0]?.critere ?? dansVecteur[0]);

  return (
    <div>
      <h1>Auditez les critères</h1>
      <p className="lead">
        Les notes viennent du modèle, avec la preuve citée. Corrigez celles qui vous semblent fausses, précisez le type de preuve (il plafonne la note), ou écartez un
        critère sans objet en indiquant pourquoi : le score et le plan d'action se recalculent immédiatement.
      </p>
      <div className="cols">
        <aside className="col col--nav card">
          {AXES.map((ax) => (
            <div key={ax.code} className="axe">
              <div className="label">
                {ax.code} · {ax.nom}
              </div>
              <div className="nav">
                {VECTEURS.filter((v) => v.axe === ax.code).map((v) => {
                  const s = resultat.parVecteur.find((x) => x.vecteur === v.code);
                  const on = v.code === vecteur.code;
                  const hors = !state.vecteursChoisis.includes(v.code);
                  return (
                    <button
                      key={v.code}
                      type="button"
                      className={`nav__item${on ? ' nav__item--on' : ''}`}
                      aria-pressed={on}
                      onClick={() =>
                        dispatch({ type: 'selVecteur', code: v.code, premier: resultat.lignes.find((l) => l.critere.vecteur === v.code)?.critere.id ?? null })
                      }
                    >
                      <span className="nav__name">
                        {v.code} {v.nom}
                      </span>
                      <span className="muted small">{hors ? 'hors périmètre' : s?.score100 !== null && s?.score100 !== undefined ? fr(s.score100) : '–'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <div className="col col--main">
          <div className="between">
            <h2 style={{ margin: 0 }}>
              {vecteur.code} · {vecteur.nom}
            </h2>
            <span className="muted small">
              {sv?.score100 !== null && sv?.score100 !== undefined ? (
                <>
                  Score du vecteur : <strong>{fr(sv.score100)} / 100</strong> · {sv.evalues} / {sv.applicables} critères notés
                </>
              ) : (
                'Aucun critère noté'
              )}
            </span>
          </div>
          {vecteur.objectif && <p className="muted" style={{ margin: 0 }}>{vecteur.objectif}</p>}
          {horsPerimetre && <div className="note note--info">Ce vecteur est hors du périmètre de l'audit. Cochez-le à l'étape 1 pour l'évaluer.</div>}
          {run === 'erreur' && <div className="note note--bad">L'analyse de ce vecteur a échoué : {state.erreurs[vecteur.code]}</div>}
          {run === 'ok' && sv && sv.evalues === 0 && <div className="note note--info">Le modèle n'a trouvé aucune information pour ce vecteur. Vous pouvez noter les critères à la main.</div>}

          {!horsPerimetre && (
            <div className="toolbar" style={{ marginTop: 0 }} role="group" aria-label="Filtrer les critères">
              {FILTRES.map((f) => (
                <button key={f.k} type="button" className={`btn btn--sm${filtre === f.k ? ' btn--on' : ''}`} aria-pressed={filtre === f.k} onClick={() => setFiltre(f.k)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {visibles.map((l) => (
            <LigneCritere key={l.critere.id} l={l} />
          ))}
          {!horsPerimetre && visibles.length === 0 && <p className="muted">Aucun critère ne correspond à ce filtre.</p>}
          {ecartes.map((c) => (
            <LigneEcartee key={c.id} c={c} motif={state.ecartes[c.id]} />
          ))}
        </div>

        <aside className="col col--side">
          {detail ? <Detail c={detail} ligne={parId.get(detail.id)} /> : <section className="card muted">Aucun critère applicable dans ce vecteur.</section>}
          <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'step', step: 3 })}>
            Voir le score
          </button>
        </aside>
      </div>
    </div>
  );
}
