import io
import json
import re
import traceback
from pathlib import Path
from typing import Dict, List, Literal, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

from backend.parser import (
    extract_and_clean_pdf,
    filter_applicable_criteria,
    load_workbook_referentiel,
    prepare_plan_images,
)
from backend.llm_engine import evaluer_propal_vision, get_ollama_client

WORKBOOK_PATH = ROOT_DIR / "data" / "referentiel_242.xlsx"

app = FastAPI(title="Tranquillite Urbaine API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the 242-criteria workbook once at startup
DF_ALL, _ = load_workbook_referentiel(WORKBOOK_PATH)

VALID_TYPES_OPERATION = [
    "Aménagement / ZAC",
    "Résidentiel neuf",
    "Mixte logements + commerces",
    "Tertiaire / activités",
    "Résidence gérée (étudiants, seniors)",
    "Réhabilitation / renouvellement urbain",
    "Équipement public",
]

VALID_PHASES = [
    "Esquisse / concours",
    "APS",
    "APD",
    "Permis de construire",
    "PRO / DCE",
    "Chantier",
    "Livré",
]

VALID_PIECES = [
    "Plan masse",
    "Plans de RDC",
    "Plans d'étages et de logements",
    "Coupes et façades",
    "Plans de parking",
    "Plan VRD / réseaux",
    "Plan d'éclairage et notice éclairagiste",
    "Plan paysager et palette végétale",
    "Plan de domanialité",
    "Notice architecturale / de programmation",
    "CCTP (lots VRD, menuiseries, contrôle d'accès)",
    "Plan d'installation de chantier et phasage",
    "Bilan de concertation",
]

TAG_CODES = ("ESP", "VOI", "EXT", "PRK", "LOG", "RDC", "EQP", "TC", "REH")


def _normalize_reponse(val) -> Optional[Literal["oui", "non"]]:
    """Normalizes booleans or French strings into 'oui' | 'non' | None."""
    if val is True:
        return "oui"
    if val is False:
        return "non"
    if isinstance(val, str):
        s = val.strip().lower()
        if s in ("oui", "yes", "true", "1"):
            return "oui"
        if s in ("non", "no", "false", "0"):
            return "non"
    return None


def _to_optional_int(val) -> Optional[int]:
    """Safely extracts a non-negative integer from numbers or strings like '6 500 m²'."""
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return max(0, int(round(val)))
    if isinstance(val, str):
        m = re.search(r"\d[\d\s\u00a0.,]*", val)
        if m:
            num = m.group(0).replace(" ", "").replace("\u00a0", "").replace(",", ".")
            try:
                return max(0, int(round(float(num))))
            except ValueError:
                return None
    return None


def _match_allowed(val, allowed: List[str]) -> Optional[str]:
    """Matches an LLM string against the exact frontend <select> options."""
    if not isinstance(val, str) or not val.strip():
        return None
    low = val.strip().lower()
    for opt in allowed:
        if opt.lower() == low or opt.lower() in low or low in opt.lower():
            return opt
    return None


def _first_present(source: dict, keys: List[str]):
    """Returns the first non-empty value found among candidate alias keys."""
    for k in keys:
        if k in source and source[k] not in (None, ""):
            return source[k]
    return None


def _parse_json_object(raw_content: str) -> dict:
    """Strips markdown fences and extracts the outermost JSON object."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_content.strip(), flags=re.IGNORECASE)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        cleaned = cleaned[start : end + 1]
    parsed = json.loads(cleaned)
    return parsed if isinstance(parsed, dict) else {}


@app.get("/api/health")
def api_health():
    """Health check confirming loaded criteria count."""
    return {"status": "ok", "criteres": len(DF_ALL)}


@app.post("/api/extraction")
async def api_extraction(
    pdf: Optional[UploadFile] = File(default=None),
    plans: List[UploadFile] = File(default=[]),
):
    """Extracts text from uploaded PDF and compresses architectural plan images."""
    try:
        texte = ""
        if pdf is not None:
            pdf_bytes = await pdf.read()
            texte = extract_and_clean_pdf(io.BytesIO(pdf_bytes))

        plans_b64: List[str] = []
        if plans:
            buffers = [io.BytesIO(await p.read()) for p in plans]
            plans_b64 = prepare_plan_images(buffers)

        return {"texte": texte, "plans_b64": plans_b64}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


class ContexteRequest(BaseModel):
    texte: str
    plans_b64: List[str] = []
    nom_fichier: Optional[str] = None


class ProjetExtrait(BaseModel):
    nom: Optional[str] = None
    commune: Optional[str] = None
    typeOperation: Optional[str] = None
    phase: Optional[str] = None
    surfaceM2: Optional[int] = None
    logements: Optional[int] = None


class ContexteResponse(BaseModel):
    projet: ProjetExtrait
    reponses: Dict[str, Optional[Literal["oui", "non"]]]
    pieces: List[str] = []


@app.post("/api/contexte", response_model=ContexteResponse)
def api_contexte(req: ContexteRequest):
    """Auto-fills Step 1 operation metadata, 9 applicability answers, and detected documents."""
    try:
        client = get_ollama_client()
        pieces_bullet = "\n".join(f"- {p}" for p in VALID_PIECES)

        system_prompt = f"""Extrais les informations du projet depuis le dossier fourni.
RÈGLES STRICTES :
- N'invente RIEN. Laisse null si absent ou incertain.
- `typeOperation` doit être EXACTEMENT parmi : {VALID_TYPES_OPERATION} (ou null).
- `phase` doit être EXACTEMENT parmi : {VALID_PHASES} (ou null).
- `reponses` : objet avec les 9 clés ('ESP', 'VOI', 'EXT', 'PRK', 'LOG', 'RDC', 'EQP', 'TC', 'REH') et valeurs STRICTEMENT 'oui', 'non' ou null.
- `pieces` : sous-liste contenant UNIQUEMENT les intitulés EXACTS ci-dessous qui sont présents ou mentionnés dans le dossier :
{pieces_bullet}

Réponds UNIQUEMENT en JSON brut valide avec exactement cette structure racine :
{{
  "projet": {{"nom": null, "commune": null, "typeOperation": null, "phase": null, "surfaceM2": null, "logements": null}},
  "reponses": {{"ESP": null, "VOI": null, "EXT": null, "PRK": null, "LOG": null, "RDC": null, "EQP": null, "TC": null, "REH": null}},
  "pieces": []
}}"""

        user_msg = {
            "role": "user",
            "content": f"Nom du fichier : {req.nom_fichier or 'inconnu'}\n\nTexte :\n{req.texte[:15000]}",
        }
        if req.plans_b64:
            user_msg["images"] = req.plans_b64[:2]

        res = client.chat(
            model="gemma4",
            messages=[{"role": "system", "content": system_prompt}, user_msg],
            format=ContexteResponse.model_json_schema(),
            options={"temperature": 0.0, "num_predict": 1500},
        )

        raw = _parse_json_object(res.message.content)
        p_src = raw.get("projet") if isinstance(raw.get("projet"), dict) else raw
        r_src = raw.get("reponses") if isinstance(raw.get("reponses"), dict) else raw
        pieces_raw = raw.get("pieces") if isinstance(raw.get("pieces"), list) else []

        nom_val = _first_present(p_src, ["nom", "nomProjet", "nom_projet", "project_name"])
        commune_val = _first_present(p_src, ["commune", "ville", "city"])
        type_val = _first_present(p_src, ["typeOperation", "type_operation", "type"])
        phase_val = _first_present(p_src, ["phase", "phaseDossier", "phase_dossier"])
        surface_val = _first_present(p_src, ["surfaceM2", "surface_m2", "surface", "surfaceParcelle"])
        logements_val = _first_present(p_src, ["logements", "nbLogements", "nb_logements", "nombreLogements"])

        clean_projet = ProjetExtrait(
            nom=str(nom_val).strip() if nom_val else None,
            commune=str(commune_val).strip() if commune_val else None,
            typeOperation=_match_allowed(type_val, VALID_TYPES_OPERATION),
            phase=_match_allowed(phase_val, VALID_PHASES),
            surfaceM2=_to_optional_int(surface_val),
            logements=_to_optional_int(logements_val),
        )

        clean_reponses = {code: _normalize_reponse(r_src.get(code)) for code in TAG_CODES}

        clean_pieces = []
        for item in pieces_raw:
            matched = _match_allowed(item, VALID_PIECES)
            if matched and matched not in clean_pieces:
                clean_pieces.append(matched)

        return ContexteResponse(
            projet=clean_projet,
            reponses=clean_reponses,
            pieces=clean_pieces,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


class AuditVecteurRequest(BaseModel):
    vecteur: str
    texte: str
    plans_b64: List[str] = []
    reponses: Dict[str, Optional[bool]] = {}


@app.post("/api/audit/vecteur")
def api_audit_vecteur(req: AuditVecteurRequest):
    """Audits a single vector (V01..V14) against its applicable criteria."""
    try:
        # Normalize vector code in case a full label like 'V01 - Lisibilité' is sent
        m = re.match(r"^(V\d{2})", req.vecteur.strip())
        vec_code = m.group(1) if m else req.vecteur.strip()

        df_app = filter_applicable_criteria(DF_ALL, req.reponses)
        evals = evaluer_propal_vision(
            df_applicable=df_app,
            texte_propal=req.texte,
            plan_images_b64=req.plans_b64 or None,
            model="gemma4",
            vecteurs_cibles=[vec_code],
        )
        return {"vecteur": vec_code, "evaluations": [e.model_dump() for e in evals]}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")