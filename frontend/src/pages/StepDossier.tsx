import { useRef } from 'react';
import { Chip } from '../components/ui';
import { MAX_PLANS, OPTIONS_PHASE, OPTIONS_TYPE_OPERATION, coeffParcelle } from '../config';
import { fr } from '../lib/format';
import { AXES, CRITERES, PIECES, TAGS, VECTEURS, estApplicable, nbCriteresParTag, tagsActifs } from '../lib/referentiel';
import { useAudit } from '../state/AuditContext';
import type { StatutRun } from '../types';

const LIBELLE_RUN: Record<StatutRun, string> = { attente: 'En attente', en_cours: 'Analyse en cours…', ok: 'Terminé', erreur: 'Échec' };

export default function StepDossier() {
  const { state, dispatch, lancer, nbQuestionsRepondues, nbRelances } = useAudit();
  const refPdf = useRef<HTMLInputElement>(null);
  const refPlans = useRef<HTMLInputElement>(null);
  const { projet } = state;
  const actifs = tagsActifs(state.reponses);
  const applicablesParVecteur = (code: string) => CRITERES.filter((c) => c.vecteur === code && estApplicable(c, actifs)).length;
  const nbVecteurs = state.vecteursChoisis.length;
  const aDuContenu = state.texte.trim().length > 0 || !!state.pdf || state.plans.length > 0;
  const peutLancer = aDuContenu && nbVecteurs > 0 && !state.enCours;
  const nbTermines = Object.values(state.runs).filter((r) => r === 'ok').length;
  const coeff = projet.surfaceM2 ? coeffParcelle(projet.surfaceM2) : null;

  const ajouterPlans = (fichiers: FileList | null) => {
    if (!fichiers) return;
    const tous = [...state.plans, ...Array.from(fichiers)].slice(0, MAX_PLANS);
    dispatch({ type: 'plans', plans: tous });
  };

  return (
    <div>
      <h1>Déposez la proposition de l'opération</h1>
      <p className="lead">
        Collez le texte du dossier, ou joignez le PDF et les plans. Le modèle lit le dossier vecteur par vecteur, note chaque critère applicable et cite la preuve
        trouvée. Rien n'est inventé : un critère sans information reste vide.
      </p>

      <section className="card demo-card">
        <div>
          <h2>Présenter sans rien saisir</h2>
          <p className="muted" style={{ margin: 0 }}>
            Charge le dossier fictif « Les Jardins de la Gare » avec des résultats d'audit préenregistrés : aucun backend, aucune clé API, aucun appel payant. Les
            notes restent modifiables pour montrer le recalcul du score.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={state.enCours}
          onClick={() => {
            if (!state.auditLance && !state.texte && !state.projet.nom) dispatch({ type: 'demo' });
            else if (window.confirm('Remplacer le dossier en cours par le dossier de démonstration ?')) dispatch({ type: 'demo' });
          }}
        >
          Charger la démonstration
        </button>
      </section>

      <div className="cols">
        <div className="col col--main">
          <section className="card">
            <h2>1. L'opération</h2>
            <div className="form">
              <label className="field">
                <span>Nom du projet</span>
                <input type="text" value={projet.nom} onChange={(e) => dispatch({ type: 'projet', champ: { nom: e.target.value } })} />
              </label>
              <label className="field">
                <span>Commune</span>
                <input type="text" value={projet.commune} onChange={(e) => dispatch({ type: 'projet', champ: { commune: e.target.value } })} />
              </label>
              <label className="field">
                <span>Type d'opération</span>
                <select value={projet.typeOperation} onChange={(e) => dispatch({ type: 'projet', champ: { typeOperation: e.target.value } })}>
                  <option value="">À préciser</option>
                  {OPTIONS_TYPE_OPERATION.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Phase du dossier</span>
                <select value={projet.phase} onChange={(e) => dispatch({ type: 'projet', champ: { phase: e.target.value } })}>
                  <option value="">À préciser</option>
                  {OPTIONS_PHASE.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Surface de la parcelle (m²)</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={projet.surfaceM2 ?? ''}
                  onChange={(e) => dispatch({ type: 'projet', champ: { surfaceM2: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })}
                />
              </label>
              <label className="field">
                <span>Nombre de logements</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={projet.logements ?? ''}
                  onChange={(e) => dispatch({ type: 'projet', champ: { logements: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })}
                />
              </label>
            </div>
            <p className="muted small">
              {coeff === null
                ? 'La surface sert à ajuster les coûts des quick wins (coefficient de parcelle). Sans surface, le coefficient reste à 1.'
                : `Coefficient de coût appliqué aux quick wins : ×${fr(coeff, 1)}.`}
            </p>
          </section>

          <section className="card">
            <h2>2. Contexte du projet ({nbQuestionsRepondues} / {TAGS.length} réponses)</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Une réponse « Non » écarte les critères qui n'ont pas de sens pour ce projet. Sans réponse, ils restent actifs par prudence, et le score reste provisoire.
            </p>
            <div className="tags">
              {TAGS.map((t) => {
                const rep = state.reponses[t.code] ?? null;
                return (
                  <div className="tag-row" key={t.code}>
                    <div>
                      <div>{t.question}</div>
                      <div className="muted small">
                        {t.code} · {nbCriteresParTag(t.code)} critères concernés
                      </div>
                    </div>
                    <div className="toolbar" style={{ margin: 0 }} role="group" aria-label={t.question}>
                      {(['oui', 'non'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`btn btn--sm${rep === r ? ' btn--on' : ''}`}
                          aria-pressed={rep === r}
                          onClick={() => dispatch({ type: 'tag', code: t.code, reponse: rep === r ? null : r })}
                        >
                          {r === 'oui' ? 'Oui' : 'Non'}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2>3. Le dossier</h2>
            <textarea
              rows={9}
              value={state.texte}
              disabled={state.enCours}
              placeholder="Collez ici le texte du dossier (notice, programme, descriptif…)"
              aria-label="Texte du dossier"
              onChange={(e) => dispatch({ type: 'texte', texte: e.target.value })}
            />
            <div className="toolbar">
              <input ref={refPdf} type="file" accept="application/pdf" hidden onChange={(e) => dispatch({ type: 'pdf', pdf: e.target.files?.[0] ?? null })} />
              <button type="button" className="btn" disabled={state.enCours} onClick={() => refPdf.current?.click()}>
                Joindre un PDF
              </button>
              {state.pdf && (
                <span className="file-pill">
                  {state.pdf.name}
                  <button type="button" aria-label="Retirer le PDF" onClick={() => dispatch({ type: 'pdf', pdf: null })}>
                    ×
                  </button>
                </span>
              )}
            </div>
            <div className="toolbar">
              <input
                ref={refPlans}
                type="file"
                accept="image/png,image/jpeg"
                multiple
                hidden
                onChange={(e) => {
                  ajouterPlans(e.target.files);
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn" disabled={state.enCours || state.plans.length >= MAX_PLANS} onClick={() => refPlans.current?.click()}>
                Ajouter des plans ({state.plans.length} / {MAX_PLANS})
              </button>
              {state.plans.map((p, i) => (
                <span className="file-pill" key={`${p.name}-${i}`}>
                  {p.name}
                  <button type="button" aria-label={`Retirer ${p.name}`} onClick={() => dispatch({ type: 'plans', plans: state.plans.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <p className="muted small">
              Plans en images PNG ou JPEG (pour un plan en PDF, exportez-le d'abord en image). Le modèle lit aussi les plans : un critère « visible sur plan » peut être noté jusqu'à 3. Au-delà de {MAX_PLANS} plans, seuls les {MAX_PLANS} premiers sont
              transmis.
            </p>

            <div className="label" style={{ marginTop: 16 }}>
              Pièces fournies (à titre d'information)
            </div>
            <div className="pieces">
              {PIECES.map((p) => (
                <label key={p} className="check">
                  <input type="checkbox" checked={!!state.pieces[p]} onChange={() => dispatch({ type: 'piece', nom: p })} />
                  <span>{p}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="col col--side">
          <section className="card">
            <h2>4. Périmètre de l'audit</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Un appel au modèle par vecteur : décocher un vecteur réduit le temps et le coût, mais rend le score partiel.
            </p>
            <div className="toolbar" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'vecteursTous', actifs: true })}>
                Tout cocher
              </button>
              <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'vecteursTous', actifs: false })}>
                Tout décocher
              </button>
            </div>
            {AXES.map((ax) => (
              <div key={ax.code} className="axe">
                <div className="eyebrow">
                  Axe {ax.code} · {ax.nom}
                </div>
                {VECTEURS.filter((v) => v.axe === ax.code).map((v) => {
                  const statut = state.runs[v.code];
                  return (
                    <label key={v.code} className="check check--vecteur">
                      <input type="checkbox" checked={state.vecteursChoisis.includes(v.code)} disabled={state.enCours} onChange={() => dispatch({ type: 'vecteur', code: v.code })} />
                      <span>
                        <strong>{v.code}</strong> {v.nom}
                        <span className="muted small"> · {applicablesParVecteur(v.code)} critères</span>
                        {v.statut.startsWith('Socle') && <span className="muted small"> · socle</span>}
                        {statut && (
                          <span className="run">
                            <Chip ton={statut === 'ok' ? 'ok' : statut === 'erreur' ? 'bad' : statut === 'en_cours' ? 'teal' : 'neutral'}>{LIBELLE_RUN[statut]}</Chip>
                          </span>
                        )}
                        {state.erreurs[v.code] && <span className="small err">{state.erreurs[v.code]}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </section>

          <section className="card">
            {state.enCours && (
              <div className="note note--info" role="status">
                Analyse en cours : {nbTermines} / {nbVecteurs} vecteurs terminés. Gardez cet onglet ouvert.
                <div className="bar" style={{ marginTop: 8 }}>
                  <div className="bar__fill" style={{ width: `${nbVecteurs ? Math.round((nbTermines / nbVecteurs) * 100) : 0}%` }} />
                </div>
              </div>
            )}
            {state.erreurGlobale && (
              <div className="note note--bad" role="alert">
                {state.erreurGlobale}
              </div>
            )}
            {!state.enCours && nbRelances > 0 && (
              <div className="note note--bad" role="alert">
                {nbRelances} vecteur{nbRelances > 1 ? 's' : ''} en échec. Les autres résultats sont conservés.
              </div>
            )}
            <div className="toolbar" style={{ marginTop: state.enCours || state.erreurGlobale || nbRelances ? 12 : 0 }}>
              <button type="button" className="btn btn--primary grow" disabled={!peutLancer} onClick={() => void lancer()}>
                {state.enCours ? 'Analyse en cours…' : state.auditLance ? 'Relancer tout l\'audit' : `Lancer l'audit (${nbVecteurs} vecteur${nbVecteurs > 1 ? 's' : ''})`}
              </button>
              {!state.enCours && nbRelances > 0 && (
                <button
                  type="button"
                  className="btn grow"
                  onClick={() => void lancer(VECTEURS.filter((v) => state.runs[v.code] === 'erreur').map((v) => v.code))}
                >
                  Relancer les vecteurs en échec
                </button>
              )}
            </div>
            {!aDuContenu && <p className="muted small">Collez un texte ou joignez un fichier pour lancer l'audit.</p>}
            {state.auditLance && !state.enCours && (
              <button type="button" className="btn btn--block" style={{ marginTop: 10 }} onClick={() => dispatch({ type: 'step', step: 2 })}>
                Voir les résultats
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
