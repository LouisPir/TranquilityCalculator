"""API du front Quiétude : trois routes, qui s'appuient sur ton parser.py et ton llm_engine.py.

Lancer depuis le dossier qui CONTIENT backend/ (TranquilityCalculator) :
    uvicorn backend.api:app --reload --port 8000

main.py (run_full_audit) reste intact. Le score n'est pas calculé ici : le front le recalcule lui-même
(port de calculator.py) pour réagir tout de suite quand l'utilisateur corrige une note.
"""
import io
import os
from functools import lru_cache
from typing import Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# main.py charge le .env (OLLAMA_API_KEY) et définit WORKBOOK_PATH = data/referentiel_242.xlsx
from backend.main import WORKBOOK_PATH
from backend.llm_engine import evaluer_propal_vision
from backend.parser import (
    extract_and_clean_pdf,
    filter_applicable_criteria,
    load_workbook_referentiel,
    prepare_plan_images,
)

MODELE = os.getenv("OLLAMA_MODEL", "gemma4")
MAX_CHARS_TEXTE = 35000  # même plafond que parser.extract_and_clean_pdf

app = FastAPI(title="Quiétude : audit de tranquillité")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def referentiel():
    """Lit l'Excel une seule fois (242 critères + 14 vecteurs)."""
    return load_workbook_referentiel(WORKBOOK_PATH)


class VecteurRequest(BaseModel):
    vecteur: str = Field(..., pattern=r"^V\d{2}$", description="Code du vecteur, ex. V03")
    texte: str = ""
    plans_b64: List[str] = []
    # Les 9 questions de contexte : {"ESP": true, "REH": false, "PRK": null, …} (null = sans réponse)
    reponses: Dict[str, Optional[bool]] = {}


@app.get("/api/health")
def health():
    try:
        df_all, df_vec = referentiel()
        return {
            "ok": True,
            "criteres": len(df_all),
            "vecteurs": len(df_vec),
            "cle_ollama": bool(os.getenv("OLLAMA_API_KEY")),
            "modele": MODELE,
        }
    except Exception as e:  # Excel absent ou mal formé : message lisible plutôt qu'une 500 muette
        raise HTTPException(status_code=500, detail=f"Référentiel illisible ({WORKBOOK_PATH}) : {e}")


@app.post("/api/extraction")
async def extraction(pdf: UploadFile | None = File(None), plans: List[UploadFile] = File(default=[])):
    """Extrait le texte d'un PDF et prépare les plans (PNG/JPEG) pour le modèle vision."""
    texte = ""
    if pdf is not None:
        try:
            texte = extract_and_clean_pdf(io.BytesIO(await pdf.read()))
        except Exception as e:  # PDF illisible ou protégé
            raise HTTPException(status_code=400, detail=f"PDF illisible : {e}")

    images = [io.BytesIO(await p.read()) for p in plans]
    try:
        plans_b64 = prepare_plan_images(images) if images else []
    except Exception as e:  # fichier qui n'est pas une image
        raise HTTPException(status_code=400, detail=f"Plan illisible (PNG ou JPEG attendus) : {e}")
    return {"texte": texte, "plans_b64": plans_b64}


@app.post("/api/audit/vecteur")
def audit_vecteur(req: VecteurRequest):
    """Évalue les critères applicables d'UN vecteur (evaluer_propal_vision découpe par lots de 20)."""
    try:
        df_all, _ = referentiel()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Référentiel illisible ({WORKBOOK_PATH}) : {e}")

    applicables = filter_applicable_criteria(df_all, req.reponses)
    df_vec = applicables[applicables["vecteur"] == req.vecteur]
    if df_vec.empty:
        return {"vecteur": req.vecteur, "evaluations": []}

    texte = req.texte[:MAX_CHARS_TEXTE]
    if not texte.strip() and not req.plans_b64:
        raise HTTPException(status_code=400, detail="Aucun texte ni plan à analyser.")

    try:
        evaluations = evaluer_propal_vision(
            df_applicable=df_vec,
            texte_propal=texte,
            plan_images_b64=req.plans_b64 or None,
            model=MODELE,
            vecteurs_cibles=[req.vecteur],
        )
    except Exception as e:
        # 500 AVEC un message : le front l'affiche tel quel. Ne pas renvoyer 502/503/504 ici, car le front
        # les interprète comme « backend éteint » et bascule alors en mode démo.
        raise HTTPException(status_code=500, detail=f"Erreur du modèle ({type(e).__name__}) : {e}")

    ids = set(df_vec["id_critere"])  # ignore les ids inventés par le modèle
    return {"vecteur": req.vecteur, "evaluations": [e.model_dump() for e in evaluations if e.id_critere in ids]}
