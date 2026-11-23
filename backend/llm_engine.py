import os
from typing import List, Optional
import pandas as pd
from dotenv import load_dotenv
from ollama import Client
from backend.schemas import BatchAuditResponse, CritereEvalue

load_dotenv()

# Hard guardrails to protect API budget ($4.81)
MAX_VECTORS_PER_RUN = 14
MAX_OUTPUT_TOKENS_PER_CALL = 2500


def get_ollama_client() -> Client:
    api_key = os.getenv("OLLAMA_API_KEY")
    if not api_key:
        raise ValueError("OLLAMA_API_KEY is missing in .env")
    return Client(
        host="https://ollama.com",
        headers={"Authorization": f"Bearer {api_key}"},
    )


def format_batch_for_prompt(df_batch: pd.DataFrame) -> str:
    """Formats a compact table of criteria for a single vector to minimize input tokens."""
    cols = ["id_critere", "critere", "question_audit", "a_regarder_plans"]
    return df_batch[cols].to_markdown(index=False)


def evaluer_propal_vision(
    df_applicable: pd.DataFrame,
    texte_propal: str,
    plan_images_b64: Optional[List[str]] = None,
    model: str = "gemma4",
    vecteurs_cibles: Optional[List[str]] = None,
) -> List[CritereEvalue]:
    """
    Audits the PROPAL text + plan images batch-by-batch (one API call per vector).
    Leaves 'note' as None whenever no evidence is visible.
    """
    client = get_ollama_client()
    all_evaluations: List[CritereEvalue] = []

    vecteurs = vecteurs_cibles or sorted(df_applicable["vecteur"].unique().tolist())
    vecteurs = vecteurs[:MAX_VECTORS_PER_RUN]

    for vec in vecteurs:
        df_vec = df_applicable[df_applicable["vecteur"] == vec]
        if df_vec.empty:
            continue

        referentiel_md = format_batch_for_prompt(df_vec)

        system_prompt = f"""Tu es un auditeur technique en aménagement urbain et tranquillité publique.
Analyse le texte de la PROPAL et les images de plans fournies pour évaluer UNIQUEMENT les critères du vecteur {vec} ci-dessous.

RÈGLES STRICTES :
1. Si aucune information n'est visible dans le texte OU les plans pour un critère, LAISSE `note` = null, `type_preuve` = null et `preuve_extrait` = null. N'invente JAMAIS rien.
2. Si une information existe, note de 0 à 4 :
   - 0 : Explicitement absent / non traité
   - 1 : Intention vague / déclaratif sans localisation
   - 2 : Prévu mais incomplet
   - 3 : Conçu, localisé sur plan ou détaillé au CCTP
   - 4 : Exemplaire avec vérification/mesure et gestion prévue
3. Sois concis sur `preuve_extrait` (1 phrase max) et `quick_win` (uniquement si note <= 2).

CRITÈRES À ÉVALUER ({vec}) :
{referentiel_md}
"""

        user_msg = {
            "role": "user",
            "content": f"Voici le texte de la PROPAL :\n\n{texte_propal}",
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

        batch_res = BatchAuditResponse.model_validate_json(response.message.content)
        all_evaluations.extend(batch_res.evaluations)

    return all_evaluations