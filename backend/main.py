from pathlib import Path
from typing import Dict, List, Optional
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

from backend.parser import (
    load_workbook_referentiel,
    filter_applicable_criteria,
    extract_and_clean_pdf,
    prepare_plan_images,
)
from backend.llm_engine import evaluer_propal_vision
from backend.calculator import compute_audit_242

# Place the .xlsx file in data/referentiel_242.xlsx
WORKBOOK_PATH = ROOT_DIR / "data" / "referentiel_242.xlsx"


def run_full_audit(
    surface_m2: float,
    project_answers: Optional[Dict[str, Optional[bool]]] = None,
    pdf_path_or_buffer=None,
    raw_text: str = "",
    plan_image_buffers: Optional[List] = None,
    model: str = "gemma4",
    vecteurs_cibles: Optional[List[str]] = None,
) -> dict:
    """Orchestrates Excel loading, 9-question filtering, Ollama Vision audit, and exact workbook scoring."""
    df_all, df_vecteurs = load_workbook_referentiel(WORKBOOK_PATH)
    df_applicable = filter_applicable_criteria(df_all, project_answers)

    texte_propal = (
        extract_and_clean_pdf(pdf_path_or_buffer)
        if pdf_path_or_buffer is not None
        else raw_text
    )
    images_b64 = prepare_plan_images(plan_image_buffers) if plan_image_buffers else None

    evaluations = evaluer_propal_vision(
        df_applicable=df_applicable,
        texte_propal=texte_propal,
        plan_images_b64=images_b64,
        model=model,
        vecteurs_cibles=vecteurs_cibles,
    )

    return compute_audit_242(
        df_applicable=df_applicable,
        df_vecteurs=df_vecteurs,
        evaluations=evaluations,
        surface_m2=surface_m2,
    )