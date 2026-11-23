import base64
import io
import re
from pathlib import Path
from typing import List, Set
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


def load_criteria_242(csv_path: str | Path) -> pd.DataFrame:
    """Loads the 242-criteria CSV exported from the Numbers workbook."""
    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    df["poids"] = pd.to_numeric(df["poids"], errors="coerce").fillna(1.0)
    df["cible"] = pd.to_numeric(df["cible"], errors="coerce").fillna(3.0)
    df["applicabilite"] = df["applicabilite"].fillna("Toujours").astype(str).str.strip()
    return df


def filter_applicable_criteria(df: pd.DataFrame, active_tags: Set[str]) -> pd.DataFrame:
    """Filters criteria before LLM call based on project scope tags (e.g. {'ESP', 'LOG', 'PRK'})."""
    def is_applicable(cond: str) -> bool:
        if cond == "Toujours":
            return True
        # Handle combined conditions like 'ESP/EXT' or 'LOG/RDC'
        parts = [p.strip() for p in cond.split("/")]
        return any(p in active_tags for p in parts)

    return df[df["applicabilite"].apply(is_applicable)].copy()