# Quiétude : front de l'audit de tranquillité (v2)

Front React 18 + Vite + TypeScript, branché sur le backend FastAPI (`backend/`) et sur le référentiel de **242 critères / 14 vecteurs** (classeur « Audit Tranquillité Nexity »).

## Lancer

```bash
npm install
cp .env.example .env     # VITE_API_URL vide = proxy Vite vers http://localhost:8000
npm run dev              # http://localhost:5173
npm run build            # production, dossier dist/
```

Backend (dans l'autre terminal) : `uvicorn backend.main:app --reload --port 8000`.

Sans backend joignable, le front passe en **mode démo** (réponses simulées, bandeau orange) tant que `VITE_ALLOW_MOCK` n'est pas `false`. Seules les pannes réseau déclenchent le mode démo : une erreur 500 du backend est affichée, jamais masquée.

## Parcours

1. **Dossier** : identité de l'opération (la surface fixe le coefficient de coût), 9 questions de contexte Oui/Non (elles écartent les critères sans objet), texte, PDF, jusqu'à 5 plans, choix des vecteurs, lancement. L'audit tourne **un appel par vecteur**, avec barre de progression, une relance automatique en cas d'échec, et un bouton pour relancer seulement les vecteurs en échec.
2. **Audit** : les 14 vecteurs en navigation, chaque critère avec sa note, le type de preuve et l'extrait cité. On peut corriger une note (case « – » = aucune information), changer le type de preuve (il plafonne la note), ou écarter un critère avec un **motif obligatoire**. Le score se recalcule sur place, sans rappeler le modèle.
3. **Score** : note sur 100 et sur 4, niveau (Inexistant, Initié, Structuré, Consolidé, Exemplaire), couverture, badge **provisoire / final**, scores par vecteur groupés par axe, points forts et vigilances déduits.
4. **Plan d'action** : quick wins classés par priorité, classe de coût et fourchette en k€ ajustée à la parcelle, score projeté, export PDF (impression) et JSON.

Le score est « final » seulement si la couverture est de 100 %, les 9 questions de contexte sont répondues et les 14 vecteurs sont dans le périmètre.

## Contrat d'API attendu

`backend/main.py` étant vide, voici ce que le front appelle. Les formats sont ceux de `schemas.py`.

### `POST /api/extraction` (multipart)
Champs : `pdf` (optionnel), `plans` (0 à 5 fichiers). Réponse :
```json
{ "texte": "…texte nettoyé du PDF…", "plans_b64": ["…image base64…"] }
```
Le front n'appelle cette route que si un PDF ou des plans sont joints ; sinon il envoie directement le texte collé.

### `POST /api/audit/vecteur` (JSON)
```json
{ "vecteur": "V03", "texte": "…", "plans_b64": ["…"], "tags": ["ESP", "VOI", "LOG"] }
```
`tags` = tags de contexte **actifs** (réponse différente de « Non »). Réponse :
```json
{ "vecteur": "V03", "evaluations": [
  { "id_critere": "T06.01", "note": 2, "type_preuve": "Visible sur plan",
    "preuve_extrait": "…", "quick_win": "…" } ] }
```
Le backend filtre les critères du vecteur avec `filter_applicable_criteria(df, set(tags))`, appelle le LLM une fois et renvoie la liste. Le front ignore tout `id_critere` inconnu ou hors vecteur et dédoublonne (le dernier gagne).

Squelette possible de `main.py` :
```python
@app.post("/api/audit/vecteur")
def audit_vecteur(req: VecteurRequest):
    df = parser.filter_applicable_criteria(CRITERES, set(req.tags))
    df = df[df["vecteur"].str.startswith(req.vecteur)]
    evals = llm_engine.evaluer_vecteur(df, req.texte, req.plans_b64)   # nom indicatif
    return {"vecteur": req.vecteur, "evaluations": [e.model_dump() for e in evals]}
```
Le calcul du score (`compute_audit_242`) n'est **pas** appelé par le front : il est porté dans `src/lib/calcul.ts` pour recalculer instantanément quand l'utilisateur corrige une note.

## Vérification du calcul

`src/lib/calcul.ts` a été comparé à `calculator.compute_audit_242` sur 6 jeux aléatoires (242 critères, notes vides, tous les types de preuve, surfaces de 800 à 60 000 m²) : score global, note sur 4, couverture, 14 scores par vecteur, liste des quick wins et fourchettes de coût sont **identiques**. L'arrondi reproduit celui de Python (31,25 → 31,2).

## Écarts à trancher avec le backend / le classeur

| Sujet | Backend (`calculator.py`) | Classeur | Ce que fait le front |
|---|---|---|---|
| Classes de coût (k€, parcelle < 5 000 m²) | € 5–20, €€ 20–80, €€€ 80–250 | € 1–10, €€ 10–50, €€€ 50–200 | valeurs du backend (`config.ts`) |
| Coefficient de parcelle | 3 tranches : 1 / 1,8 / 3 (5 000 et 20 000 m²) | 4 tranches : 1 / 1,5 / 2,5 / 4 | valeurs du backend |
| Preuve absente | plafond 4 | « sans preuve, pas de note retenue » | comportement du backend ; `EXIGER_PREUVE_POUR_NOTER = true` dans `config.ts` applique la règle du classeur |
| Classe de coût / facilité vides | « € » par défaut pour le coût, **NaN** pour la facilité | — | 190 critères sur 242 n'en ont pas : défauts « € » et « Moyenne », signalés « Coût par défaut » |
| `quick_win` nul | `row.get("quick_win") or …` : un NaN est « vrai », l'action devient NaN | — | le front retombe sur l'action du référentiel |
| `details` | `df.to_dict()` contient des NaN, JSON invalide | — | non utilisé par le front |
| Doublons d'évaluations | le merge pandas duplique les lignes | — | le front dédoublonne (un id = une évaluation) |

Les constantes concernées sont dans `src/config.ts` : si le backend change, y aligner les valeurs.

## Structure

```
src/
  config.ts           réglages métier (plafonds, coûts, coefficient, défauts)
  types.ts            types, dont CritereEvalue (miroir de schemas.py)
  data/               criteres.json (242), vecteurs.json (14), projet.json (tags, pièces, maturité)
  lib/referentiel.ts  accès au référentiel, applicabilité par tags
  lib/calcul.ts       port de compute_audit_242 + priorité des quick wins
  lib/api.ts          appels backend, validation des réponses, timeout, repli démo
  lib/mock.ts         évaluations simulées (mode démo)
  state/AuditContext  état global, boucle d'audit par vecteur, persistance locale
  pages/              StepDossier, StepAudit, StepScore, StepPlan
```
L'état est conservé dans le navigateur (`localStorage`) ; le PDF et les plans ne le sont pas : après un rechargement, il faut les rejoindre pour relancer.
