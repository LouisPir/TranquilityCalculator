import base64
import io
import re
import unicodedata
from pathlib import Path
from typing import List, Optional, Set
import pandas as pd
from PIL import Image
from pypdf import PdfReader


def _normalize_col(col: str) -> str:
    """Lowercases and strips accents/symbols for resilient column matching."""
    s = unicodedata.normalize("NFKD", str(col)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


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


def load_criteria(csv_path: str | Path) -> pd.DataFrame:
    """Loads the 0-5 criteria CSV (semicolon or comma delimited, UTF-8 or Windows-1252)."""
    try:
        df = pd.read_csv(csv_path, encoding="utf-8-sig", sep=None, engine="python", dtype=str)
    except UnicodeDecodeError:
        df = pd.read_csv(csv_path, encoding="cp1252", sep=None, engine="python", dtype=str)

    df.columns = [_normalize_col(c) for c in df.columns]

    rename_map = {
        "id": "id_critere",
        "0_non_traite": "niveau_0",
        "1_tres_insuffisant": "niveau_1",
        "2_minimum_courant": "niveau_2",
        "3_bonne_pratique": "niveau_3",
        "4_renforce": "niveau_4",
        "5_exemplaire": "niveau_5",
        "nature_du_seuil": "nature_seuil",
        "poids_1_3": "poids",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    # Drop empty rows and enforce clean types
    df = df[df["id_critere"].notna() & (df["id_critere"].str.strip() != "")].copy()
    df["id_critere"] = df["id_critere"].str.strip()
    df["theme"] = df["theme"].fillna("Autre").str.strip()
    df["echelle"] = df["echelle"].fillna("Ville").str.strip()
    df["nature_seuil"] = df["nature_seuil"].fillna("Recommandation").str.strip()
    df["poids"] = pd.to_numeric(df["poids"].str.replace(",", "."), errors="coerce").fillna(1.0)

    return df


def filter_criteria_by_scale(
    df: pd.DataFrame, active_scales: Optional[Set[str]] = None
) -> pd.DataFrame:
    """Filters criteria by spatial scale ('Ville', 'Interface', 'Bâtiment')."""
    if not active_scales:
        return df.copy()
    normalized_scales = {s.strip().lower() for s in active_scales}
    return df[df["echelle"].str.lower().isin(normalized_scales)].copy()