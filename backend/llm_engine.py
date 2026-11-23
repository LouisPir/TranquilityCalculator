import json
import os
import re
from typing import List, Optional
import pandas as pd
from dotenv import load_dotenv
from ollama import Client
from backend.schemas import BatchAuditResponse, CritereEvalue

load_dotenv()

# Hard budget & stability guardrails for Ollama Cloud
MAX_CRITERIA_PER_CALL = 20
MAX_TOTAL_CALLS = 15
MAX_OUTPUT_TOKENS_PER_CALL = 3000


def get_ollama_client() -> Client:
    api_key = os.getenv("OLLAMA_API_KEY")
    if not api_key:
        raise ValueError("OLLAMA_API_KEY is missing in .env")
    return Client(
        host="https://ollama.com",
        headers={"Authorization": f"Bearer {api_key}"},
    )


def _extract_and_validate_batch(raw_content: str) -> BatchAuditResponse:
    """Strips markdown fences and normalizes list vs dict JSON outputs before Pydantic validation."""
    cleaned = raw_content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    start_obj = cleaned.find("{")
    start_arr = cleaned.find("[")
    starts = [i for i in (start_obj, start_arr) if i != -1]
    if starts:
        start = min(starts)
        end = max(cleaned.rfind("}"), cleaned.rfind("]"))
        if end > start:
            cleaned = cleaned[start : end + 1]

    parsed = json.loads(cleaned)
    if isinstance(parsed, list):
        parsed = {"evaluations": parsed}

    return BatchAuditResponse.model_validate(parsed)


def format_batch_for_prompt(df_batch: pd.DataFrame) -> str:
    """Builds a compact Markdown table without repeating the constant 0-4 rubric."""
    cols = ["id_critere", "vecteur", "critere", "question_audit", "ou_regarder_plans", "preuves_attendues"]
    return df_batch[cols].to_markdown(index=False)


def evaluer_propal_vision(
    df_applicable: pd.DataFrame,
    texte_propal: str,
    plan_images_b64: Optional[List[str]] = None,
    model: str = "gemma4",
    vecteurs_cibles: Optional[List[str]] = None,
) -> List[CritereEvalue]:
    """
    Audits PROPAL text and plan images against the 242-criteria workbook (0-4 scale).
    Chunks by criterion count (<= 20/call) and uses sparse JSON output to save tokens.
    """
    client = get_ollama_client()
    all_evaluations: List[CritereEvalue] = []

    df_target = (
        df_applicable[df_applicable["vecteur"].isin(vecteurs_cibles)].copy()
        if vecteurs_cibles
        else df_applicable.copy()
    )
    if df_target.empty:
        return []

    # Split into fixed-size chunks so large vectors (e.g. V14 with 64 criteria) never truncate
    batches = [
        df_target.iloc[i : i + MAX_CRITERIA_PER_CALL]
        for i in range(0, len(df_target), MAX_CRITERIA_PER_CALL)
    ][:MAX_TOTAL_CALLS]

    for df_batch in batches:
        referentiel_md = format_batch_for_prompt(df_batch)

        system_prompt = f"""Tu es un auditeur expert en aménagement urbain et tranquillité publique (référentiel Nexity / Engagement & Territoires).
Analyse le texte de la PROPAL et les images de plans fournies UNIQUEMENT sur les critères ci-dessous.

ÉCHELLE DE MATURITÉ (0 à 4) :
- 0 (Inexistant) : Le sujet est explicitement absent ou non traité alors qu'il devrait l'être dans la pièce fournie.
- 1 (Initié) : Intention évoquée, traitement ponctuel, non dimensionné ou non localisé.
- 2 (Structuré) : Traité et localisé sur les plans ou documents, mais de façon partielle.
- 3 (Consolidé) : Traité de façon complète et cohérente sur tout le périmètre ; pièces et responsabilités prévues.
- 4 (Exemplaire) : Solution vérifiée par essai, mesure ou retour d'usage ; suivi et corrections prévus.

DOCTRINE DE LA PREUVE (`type_preuve`) :
Choisis strictement parmi : 'PV / mesure', 'Visible sur plan', 'Notice / CCTP', 'Declaratif', 'Aucune'.

RÈGLES STRICTES D'ÉCONOMIE ET DE RIGUEUR :
1. NE RENVOIE QUE les critères pour lesquels tu vois réellement une information (positive ou négative) dans le texte OU sur les plans.
2. Si un critère n'est PAS mentionné et n'est PAS visible sur les plans, OMETS-LE totalement de la liste JSON (il restera vide). N'invente JAMAIS rien.
3. Si aucun critère du lot n'est présent dans le dossier, renvoie {{"evaluations": []}}.
4. Cite une preuve courte (1 phrase max) dans `preuve_extrait`. Remplis `quick_win_ia` uniquement si `note` <= 2.
5. Réponds UNIQUEMENT en JSON brut valide au format :
{{"evaluations": [{{"id_critere": "T06.01", "note": 3, "type_preuve": "Visible sur plan", "preuve_extrait": "...", "quick_win_ia": null}}]}}

CRITÈRES DU LOT :
{referentiel_md}
"""

        user_msg = {
            "role": "user",
            "content": f"Voici le texte de la PROPAL à auditer :\n\n{texte_propal}",
        }
        if plan_images_b64:
            user_msg["images"] = plan_images_b64

        response = client.chat(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                user_msg,
            ],
            format=BatchAuditResponse.model_json_schema(),
            options={
                "temperature": 0.1,
                "num_predict": MAX_OUTPUT_TOKENS_PER_CALL,
            },
        )

        batch_res = _extract_and_validate_batch(response.message.content)
        all_evaluations.extend(batch_res.evaluations)

    return all_evaluations