# Quiétude : front de l'audit de tranquillité (v2)

Front React 18 + Vite + TypeScript, branché sur le backend FastAPI (`backend/`) et sur le référentiel de **242 critères / 14 vecteurs** (classeur « Audit Tranquillité Nexity »).

## Lancer

```bash
npm install
cp .env.example .env     # VITE_API_URL vide = proxy Vite vers http://localhost:8000
npm run dev              # http://localhost:5173
npm run build            # production, dossier dist/
```

Backend (dans l'autre terminal) : `uvicorn backend.api:app --reload --port 8000`.

Sans backend joignable, le front passe en **mode démo** (réponses simulées, bandeau orange) tant que `VITE_ALLOW_MOCK` n'est pas `false`. Seules les pannes réseau déclenchent le mode démo : une erreur 500 du backend est affichée, jamais masquée.

## Parcours

1. **Dossier** : identité de l'opération (la surface fixe le coefficient de coût), 9 questions de contexte Oui/Non (elles écartent les critères sans objet), texte, PDF, jusqu'à 5 plans, choix des vecteurs, lancement. L'audit tourne **un appel par vecteur**, avec barre de progression, une relance automatique en cas d'échec, et un bouton pour relancer seulement les vecteurs en échec.
2. **Audit** : les 14 vecteurs en navigation, chaque critère avec sa note, le type de preuve et l'extrait cité. On peut corriger une note (case « – » = aucune information), changer le type de preuve (il plafonne la note), ou écarter un critère avec un **motif obligatoire**. Le score se recalcule sur place, sans rappeler le modèle.
3. **Score** : note sur 100 et sur 4, niveau (Inexistant, Initié, Structuré, Consolidé, Exemplaire), couverture, badge **provisoire / final**, scores par vecteur groupés par axe, points forts et vigilances déduits.
4. **Plan d'action** : quick wins classés par priorité, classe de coût et fourchette en k€ ajustée à la parcelle, score projeté, export PDF (impression) et JSON.

Le score global est la **moyenne des scores des vecteurs notés** (poids de vecteur = 1, comme `calculer` du backend). Une note n'est retenue que si elle a un **type de preuve** et un **extrait** (sauf type « Aucune ») ; elle est plafonnée par le type (PV / mesure 4, Visible sur plan 3, Notice / CCTP 3, Déclaratif 1, Aucune 0). Le score est « final » seulement si la couverture est de 100 %, les 9 questions de contexte sont répondues et les 14 vecteurs sont dans le périmètre.

## Mode démonstration (pour présenter)

Le bouton **« Charger la démonstration »** en haut de l'étape 1 charge le dossier fictif « Les Jardins de la Gare » et 40 résultats d'audit préenregistrés (score affiché : 54 / 100, niveau 2 « Structuré », 14 actions chiffrées, 71 à 405 k€ HT) (`src/data/demo.ts`) : pas de backend, pas de clé API, pas d'appel payant. Les notes restent modifiables, donc le recalcul du score se montre en direct. Le score reste volontairement provisoire (17 % de couverture, 40 critères retenus sur 241) : le dossier fictif ne dit rien de l'entretien, du signalement ni du logement, ce qui illustre le rôle de la couverture. Pour changer le scénario, modifier `DEMO_TEXTE` et `DEMO_EVALUATIONS`.

## Contrat d'API

`backend/api.py` (fichier **ajouté** ; `main.py` et `run_full_audit` ne sont pas touchés) expose les routes ci-dessous. Les formats sont ceux de `schemas.py`.

### `GET /api/health`
`{"ok": true, "criteres": 242, "vecteurs": 14, "cle_ollama": true, "modele": "gemma4"}` ; en 500 avec un message si `data/referentiel_242.xlsx` est absent ou mal formé.

### `POST /api/extraction` (multipart)
Champs : `pdf` (optionnel), `plans` (0 à 5 images PNG/JPEG). Réponse :
```json
{ "texte": "…texte nettoyé du PDF…", "plans_b64": ["…image base64…"] }
```
Le front n'appelle cette route que si un PDF ou des plans sont joints ; sinon il envoie directement le texte collé.

### `POST /api/audit/vecteur` (JSON)
```json
{ "vecteur": "V03", "texte": "…", "plans_b64": ["…"],
  "reponses": { "ESP": true, "VOI": true, "EXT": null, "PRK": true, "LOG": true, "RDC": true, "EQP": null, "TC": null, "REH": false } }
```
`reponses` = les 9 questions de contexte (`null` = sans réponse, les critères restent actifs), directement passées à `filter_applicable_criteria`. Réponse :
```json
{ "vecteur": "V03", "evaluations": [
  { "id_critere": "T06.01", "note": 2, "type_preuve": "Visible sur plan",
    "preuve_extrait": "…", "quick_win_ia": "…" } ] }
```
La route filtre les critères du vecteur, appelle `evaluer_propal_vision(..., vecteurs_cibles=[vecteur])` (lots de 20 critères) et ignore tout `id_critere` hors vecteur. Les erreurs du modèle sortent en 500 **avec** un message. Le front dédoublonne (la première évaluation d'un id gagne, comme `drop_duplicates`).

Le calcul du score (`compute_audit_242`) n'est **pas** appelé par le front : il est porté dans `src/lib/calcul.ts` pour recalculer instantanément quand l'utilisateur corrige une note.

## Brancher le vrai backend

Arborescence attendue :
```
TranquilityCalculator/
  .env                         OLLAMA_API_KEY=...   (ne jamais le committer)
  backend/                     calculator.py, llm_engine.py, parser.py, schemas.py, main.py, api.py, __init__.py
  data/referentiel_242.xlsx    classeur avec les feuilles « Vecteurs » et « Grille »
  frontend/
```
```bash
pip install -r requirements.txt
uvicorn backend.api:app --reload --port 8000      # depuis TranquilityCalculator/, pas depuis backend/
```
Vérifier : http://localhost:8000/api/health doit répondre `{"ok":true,"criteres":242,"vecteurs":14,…}`. Puis `npm run dev` dans `frontend/`.
Le front traite 502/503/504 et un 500 sans corps comme « backend éteint » (mode démo). Les erreurs du modèle sont renvoyées en 500 **avec** un message, pour être affichées.

## Vérification du calcul

`src/lib/calcul.ts` a été comparé à `calculator.compute_audit_242` sur 10 jeux aléatoires (242 critères, notes vides, doublons d'évaluations, types de preuve inconnus ou avec espaces, extraits vides, 9 réponses de contexte tirées au hasard, surfaces de 800 à 90 000 m²) : score global, note sur 4, niveau, scores par axe et par vecteur, points forts / marges, liste des quick wins (priorité, coût, ordre), budget et recommandations du modèle sont **identiques**. L'arrondi reproduit celui de Python (31,25 → 31,2).

⚠️ Cette égalité suppose le correctif suivant dans `calculator.py` : après `pd.merge(..., how="left")`, une valeur absente est un `NaN` (un `float`), qui est « vrai » en Python, donc `str(row.get("type_preuve") or "")` donne `"nan"`. Sans correctif, une note sans type de preuve est retenue comme 0, et un type valide sans extrait est retenu : la règle « preuve manquante = note non retenue » ne s'applique pas. Correctif (déjà appliqué dans `backend/calculator.py` livré) : une petite fonction `_txt(v)` qui renvoie `""` pour `None` / `NaN`, utilisée pour `type_preuve`, `preuve_extrait`, `quick_win_referentiel`, `classe_cout`, `facilite` et `quick_win_ia`.

## Points à surveiller dans le classeur

| Sujet | Détail |
|---|---|
| Classe de coût « 0 » | `COST_CLASSES_KEUR` a des clés **texte** (`"0"`, `"€"`…). Si l'export Excel transforme la cellule en nombre 0, la classe est ignorée sans erreur : garder la colonne « Coût » au format texte. |
| Critères chiffrables | Seuls 52 critères sur 242 ont une classe de coût **et** une facilité : les autres, sous la cible, ne donnent qu'une suggestion du modèle (tableau « non chiffrées » du plan d'action). |
| Cible et poids | Cible fixée à 3 et poids à 1 pour tous les critères (`parser.py`) ; vecteurs à poids 1. |

Les constantes concernées sont dans `src/config.ts` : si `calculator.py` change, y aligner les valeurs.

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
