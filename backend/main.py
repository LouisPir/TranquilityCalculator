import json
from pathlib import Path
from typing import List, Optional, Set
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

from backend.parser import (
    load_criteria_242,
    filter_applicable_criteria,
    extract_and_clean_pdf,
    prepare_plan_images,
)
from backend.llm_engine import evaluer_propal_vision
from backend.calculator import compute_audit_242

# Explicit path to the 242-criteria CSV file
CRITERIA_CSV_PATH = ROOT_DIR / "data" / "criteres.csv"


def run_full_audit(
    surface_m2: float,
    active_tags: Set[str],
    pdf_path_or_buffer=None,
    raw_text: str = "",
    plan_image_buffers: Optional[List] = None,
    model: str = "gemma4",
    vecteurs_cibles: Optional[List[str]] = None,
) -> dict:
    """Orchestrates CSV loading, applicability filtering, Ollama Vision audit, and deterministic scoring."""
    # 1. Load the 242 criteria from CSV
    df_all = load_criteria_242(CRITERIA_CSV_PATH)

    # 2. Filter criteria applicable to this project scope
    df_applicable = filter_applicable_criteria(df_all, active_tags)

    # 3. Extract PROPAL text and compress plan images (if provided)
    texte_propal = (
        extract_and_clean_pdf(pdf_path_or_buffer)
        if pdf_path_or_buffer is not None
        else raw_text
    )
    images_b64 = (
        prepare_plan_images(plan_image_buffers)
        if plan_image_buffers
        else None
    )

    # 4. Run Ollama Vision evaluation (one API call per vector)
    evaluations = evaluer_propal_vision(
        df_applicable=df_applicable,
        texte_propal=texte_propal,
        plan_images_b64=images_b64,
        model=model,
        vecteurs_cibles=vecteurs_cibles,
    )

    # 5. Compute deterministic scores, proof caps, and cost estimates
    return compute_audit_242(
        df_applicable=df_applicable,
        evaluations=evaluations,
        surface_m2=surface_m2,
    )


if __name__ == "__main__":
    # Quick smoke test on a single vector (V01) to verify CSV + Ollama Vision (~$0.003)
    sample_propal = (
        "L'opération prévoit des entrées résidentielles directement adressées sur la rue "
        "avec numérotation rétroéclairée visible de nuit, ainsi que des haies basses de 80 cm "
        "le long des cheminements piétons pour préserver les lignes de vue."
    )

    result = run_full_audit(
        surface_m2=6500,
        active_tags={"ESP", "EXT", "LOG", "RDC"},
        raw_text=sample_propal,
        model="gemma4",
        vecteurs_cibles=["V01"],  # Remove this line when running all 14 vectors
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))