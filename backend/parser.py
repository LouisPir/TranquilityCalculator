import base64
import io
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import openpyxl
import pandas as pd
from PIL import Image
from pypdf import PdfReader


def extract_and_clean_pdf(file_path_or_buffer, max_chars: int = 35000) -> str:
    """Extracts and cleans text from a PDF to minimize LLM token usage."""
    reader = PdfReader(file_path_or_buffer)
    pages_text = []
    for idx, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ""
        cleaned = re.sub(r"[ \t]+", " ", raw_text)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
        if cleaned:
            pages_text.append(f"--- PAGE {idx} ---\n{cleaned}")

    full_text = "\n\n".join(pages_text)
    if len(full_text) > max_chars:
        full_text = full_text[:max_chars] + "\n\n[TRUNCATED]"
    return full_text


def prepare_plan_images(
    image_buffers: List, max_images: int = 5, max_size: int = 1024
) -> List[str]:
    """Resizes and compresses architectural plan images to base64 JPEG to cap vision token cost."""
    encoded_images = []
    for buf in image_buffers[:max_images]:
        img = Image.open(buf).convert("RGB")
        img.thumbnail((max_size, max_size))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=80, optimize=True)
        encoded_images.append(base64.b64encode(out.getvalue()).decode("utf-8"))
    return encoded_images


def load_workbook_referentiel(xlsx_path: str | Path) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Reads the 242 criteria from 'Grille' and vector metadata from 'Vecteurs'
    directly from the Excel workbook (zero encoding issues).
    """
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)

    # 1. Load 'Vecteurs' metadata (Axis mapping, labels, objectives)
    ws_vec = wb["Vecteurs"]
    vec_rows = list(ws_vec.iter_rows(min_row=4, values_only=True))
    vec_headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(vec_rows[0])]
    df_vecteurs = pd.DataFrame(vec_rows[1:], columns=vec_headers)
    df_vecteurs = df_vecteurs[
        df_vecteurs["Code"].astype(str).str.match(r"^V\d{2}$")
    ].copy()
    df_vecteurs["axe_code"] = df_vecteurs["Axe"].astype(str).str.replace("Axe ", "", regex=False).str.strip()
    df_vecteurs["poids_vecteur"] = 1.0

    # 2. Load 'Grille' (242 unique criteria)
    ws_g = wb["Grille"]
    g_rows = list(ws_g.iter_rows(min_row=4, values_only=True))
    g_headers = [str(h).replace("\n", " ").strip() if h else f"col_{i}" for i, h in enumerate(g_rows[0])]
    df_raw = pd.DataFrame(g_rows[1:], columns=g_headers)

    # Filter out family header rows; keep only the 242 criteria rows (V01..V14)
    df_crit = df_raw[df_raw["Vecteur"].astype(str).str.match(r"^V\d{2}$")].copy()

    df_clean = pd.DataFrame({
        "id_critere": df_crit["ID"].astype(str).str.strip(),
        "vecteur": df_crit["Vecteur"].astype(str).str.strip(),
        "famille": df_crit["Famille de bonnes pratiques"].fillna("").astype(str).str.strip(),
        "critere": df_crit["Critère"].fillna("").astype(str).str.strip(),
        "question_audit": df_crit["Question d'audit"].fillna("").astype(str).str.strip(),
        "ou_regarder_plans": df_crit["Où regarder dans les plans"].fillna("").astype(str).str.strip(),
        "preuves_attendues": df_crit["Preuves attendues"].fillna("").astype(str).str.strip(),
        "condition": df_crit["Condition"].fillna("Toujours").astype(str).str.strip(),
        "poids": pd.to_numeric(df_crit["Poids"], errors="coerce").fillna(1.0),
        "cible": 3.0,  # Default target from Paramètres!B4
        "quick_win_referentiel": df_crit["Quick win associé"].where(df_crit["Quick win associé"].notna(), None),
        "phase": df_crit["Phase"].fillna("").astype(str).str.strip(),
        "classe_cout": df_crit["Coût"].where(df_crit["Coût"].notna(), None),
        "facilite": df_crit["Facilité"].where(df_crit["Facilité"].notna(), None),
        "pourquoi": df_crit["Pourquoi ce critere ?"].fillna("").astype(str).str.strip(),
    })

    # Attach Axis code and Vector label for downstream aggregation
    vec_lookup = df_vecteurs.set_index("Code")[["axe_code", "Vecteur"]].to_dict(orient="index")
    df_clean["axe"] = df_clean["vecteur"].map(lambda v: vec_lookup.get(v, {}).get("axe_code", ""))
    df_clean["vecteur_nom"] = df_clean["vecteur"].map(lambda v: vec_lookup.get(v, {}).get("Vecteur", v))

    return df_clean.reset_index(drop=True), df_vecteurs.reset_index(drop=True)


def filter_applicable_criteria(
    df_criteria: pd.DataFrame, project_answers: Optional[Dict[str, Optional[bool]]] = None
) -> pd.DataFrame:
    """
    Applies the exact workbook applicability formula from Grille!Q7:
    - 'Toujours' -> always active.
    - Unanswered (None) -> stays active by precaution.
    - Combined conditions ('ESP/EXT', 'LOG/RDC') -> excluded ONLY if BOTH are explicitly False.
    - Single condition ('PRK', 'LOG', 'RDC', 'ESP', 'EQP', 'REH') -> excluded ONLY if explicitly False.
    """
    if not project_answers:
        return df_criteria.copy()

    def is_active(cond: str) -> bool:
        if cond == "Toujours":
            return True
        parts = [p.strip() for p in cond.split("/")]
        # Active unless every tag in the condition is explicitly False
        return any(project_answers.get(p, True) is not False for p in parts)

    return df_criteria[df_criteria["condition"].apply(is_active)].copy().reset_index(drop=True)