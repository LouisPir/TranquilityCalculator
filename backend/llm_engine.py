import json
import os
import re
from typing import List, Optional
import pandas as pd
from dotenv import load_dotenv
from ollama import Client
from backend.schemas import BatchAuditResponse, CritereEvalue

load_dotenv()

# Hard guardrails to protect Ollama Cloud budget
THEMES_PER_BATCH = 2
MAX_BATCH_CALLS = 10
MAX_OUTPUT_TOKENS_PER_CALL = 3500


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

    # Remove ```json ... ``` or ``` ... ``` wrappers if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    # Fallback: slice from first '{' or '[' to last '}' or ']'
    start_obj = cleaned.find("{")
    start_arr = cleaned.find("[")
    starts = [i for i in (start_obj, start_arr) if i != -1]
    if starts:
        start = min(starts)
        end = max(cleaned.rfind("}"), cleaned.rfind("]"))
        if end > start:
            cleaned = cleaned[start : end + 1]

    parsed = json.loads(cleaned)

    # If model returned a raw list of evaluations, wrap it into the expected dict
    if isinstance(parsed, list):
        parsed = {"evaluations": parsed}

    return BatchAuditResponse.model_validate(parsed)


def format_batch_for_prompt(df_batch: pd.DataFrame) -> str:
    """Formats a compact Markdown table with the 0-5 threshold rubric for the LLM."""
    cols = [
        "id_critere",
        "theme",
        "critere",
        "indicateur_mesure",
        "niveau_0",
        "niveau_1",
        "niveau_2",
        "niveau_3",
        "niveau_4",
        "niveau_5",
        "preuve_attendue",
    ]
    available_cols = [c for c in cols if c in df_batch.columns]
    return df_batch[available_cols].to_markdown(index=False)


def evaluer_propal_vision(
    df_criteria: pd.DataFrame,
    texte_propal: str,
    plan_images_b64: Optional[List[str]] = None,
    model: str = "gemma4",
    themes_cibles: Optional[List[str]] = None,
) -> List[CritereEvalue]:
    """
    Audits PROPAL text and plan images on a 0-5 scale, batching themes to cap API calls.
    Leaves 'note' as None whenever no information is present in text or plans.
    """
    client = get_ollama_client()
    all_evaluations: List[CritereEvalue] = []

    themes = themes_cibles or df_criteria["theme"].unique().tolist()
    theme_batches = [
        themes[i : i + THEMES_PER_BATCH]
        for i in range(0, len(themes), THEMES_PER_BATCH)
    ][:MAX_BATCH_CALLS]

    for batch_themes in theme_batches:
        df_batch = df_criteria[df_criteria["theme"].isin(batch_themes)]
        if df_batch.empty:
            continue

        referentiel_md = format_batch_for_prompt(df_batch)

        system_prompt = f"""Tu es un auditeur expert en aménagement urbain et tranquillité publique.
Évalue la PROPAL (texte et/ou images de plans) UNIQUEMENT sur les critères ci-dessous selon leur grille de seuils de 0 à 5.

RÈGLES STRICTES :
1. Si aucune information n'est visible dans le texte OU les plans pour un critère, LAISSE `note` = null, `type_preuve` = null, `preuve_extrait` = null et `quick_win` = null. N'invente JAMAIS rien.
2. Si une information est présente, attribue une note entière de 0 à 5 en comparant les valeurs/dispositifs du dossier aux colonnes `niveau_0` à `niveau_5`.
3. Renseigne `type_preuve` parmi : 'PV / mesure', 'Visible sur plan', 'Notice / CCTP', 'Declaratif'.
4. Sois concis sur `preuve_extrait` (1 phrase max) et propose un `quick_win` concret uniquement si `note` <= 2.
5. Réponds UNIQUEMENT en JSON brut valide (sans balises ```json) au format exact :
{{"evaluations": [{{"id_critere": "1,1", "note": 3, "type_preuve": "Notice / CCTP", "preuve_extrait": "...", "quick_win": null}}]}}

GRILLE D'ÉVALUATION (0 à 5) :
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