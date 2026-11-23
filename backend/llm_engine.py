import os
from ollama import Client
from backend.schemas import AuditLLMResponse

client = Client(
    host="https://ollama.com",
    headers={"Authorization": f"Bearer {os.environ['OLLAMA_API_KEY']}"}
)

def evaluer_propal_llm(referentiel_str: str, texte_propal: str, model: str = "gpt-oss:120b") -> AuditLLMResponse:
    system_prompt = f"""Tu es un auditeur expert en aménagement urbain et tranquillité publique.
Évalue la proposition d'aménagement (PROPAL) fournie par l'utilisateur STRICTEMENT selon la grille de critères ci-dessous.

RÈGLES DE NOTATION :
- 0 : Non traité / absent du dossier.
- 1 : Intention vague ou vœu pieux sans détail technique ni localisation.
- 2 : Prévu au programme mais non dimensionné.
- 3 : Conçu, localisé et techniquement détaillé.
- 4 : Exemplaire, intègre les interfaces public-privé et la gestion/maintenance future.
- Cite systématiquement un extrait réel de la PROPAL comme preuve. Ne déduis rien qui n'est pas écrit.

RÉFÉRENTIEL D'ÉVALUATION :
{referentiel_str}
"""

    response = client.chat(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Voici le texte de la PROPAL à auditer :\n\n{texte_propal}"}
        ],
        format=AuditLLMResponse.model_json_schema(),
        options={"temperature": 0.1}
    )

    return AuditLLMResponse.model_validate_json(response.message.content)