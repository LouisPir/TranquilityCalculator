from pathlib import Path
from typing import List, Optional, Set
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

from backend.parser import (
    load_criteria,
    filter_criteria_by_scale,
    extract_and_clean_pdf,
    prepare_plan_images,
)
from backend.llm_engine import evaluer_propal_vision
from backend.calculator import compute_audit_results

CRITERIA_CSV_PATH = ROOT_DIR / "data" / "criteres.csv"


def run_full_audit(
    surface_m2: float,
    active_scales: Optional[Set[str]] = None,
    pdf_path_or_buffer=None,
    raw_text: str = "",
    plan_image_buffers: Optional[List] = None,
    model: str = "gemma4",
    themes_cibles: Optional[List[str]] = None,
) -> dict:
    """Orchestrates CSV loading, scale filtering, Ollama Vision audit, and 0-5 deterministic scoring."""
    df_all = load_criteria(CRITERIA_CSV_PATH)
    df_filtered = filter_criteria_by_scale(df_all, active_scales)

    texte_propal = (
        extract_and_clean_pdf(pdf_path_or_buffer)
        if pdf_path_or_buffer is not None
        else raw_text
    )
    images_b64 = prepare_plan_images(plan_image_buffers) if plan_image_buffers else None

    evaluations = evaluer_propal_vision(
        df_criteria=df_filtered,
        texte_propal=texte_propal,
        plan_images_b64=images_b64,
        model=model,
        themes_cibles=themes_cibles,
    )

    return compute_audit_results(
        df_criteria=df_filtered,
        evaluations=evaluations,
        surface_m2=surface_m2,
    )