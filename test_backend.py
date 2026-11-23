import json
from pathlib import Path
from backend.main import run_full_audit

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"

sample_pdf = DATA_DIR / "sample_propal.pdf"
sample_plan = DATA_DIR / "sample_plan.png"

fallback_text = """
PROJET D'AMÉNAGEMENT — ÎLOT DES TILLEULS (6 500 m², 85 logements)
1. Lisibilité (Plan masse & RDC) : Toutes les entrées résidentielles sont orientées sur l'espace public
avec numérotation rétroéclairée visible de nuit. En revanche, certaines haies le long des venelles
atteignent 1,60 m et créent des masques visuels près des accès secondaires.
2. Éclairage & nuit (Notice éclairagiste) : Scène lumineuse LED 2700K uniforme (Uo = 0,42), sans trou noir
sur les cheminements principaux et détection de présence sur les cheminements secondaires.
"""

# 9 applicability answers from 'Projet' sheet (True=Oui, False=Non, None=Unanswered/Active)
project_answers = {
    "ESP": True,
    "VOI": True,
    "EXT": True,
    "PRK": True,
    "LOG": True,
    "RDC": True,
    "EQP": False,
    "TC": True,
    "REH": False,
}

if __name__ == "__main__":
    print("Running budget-safe 242-criteria Excel test (V01 + V02 = 1 API call)...")

    pdf_input = sample_pdf if sample_pdf.exists() else None
    text_input = "" if pdf_input else fallback_text
    images_input = [sample_plan] if sample_plan.exists() else None

    result = run_full_audit(
        surface_m2=6500,
        project_answers=project_answers,
        pdf_path_or_buffer=pdf_input,
        raw_text=text_input,
        plan_image_buffers=images_input,
        model="gemma4",
        vecteurs_cibles=["V01", "V02"],  # Remove this line to run all 14 vectors
    )

    output_file = DATA_DIR / "sample_audit_242_output.json"
    output_file.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== AUDIT SUMMARY (242 CRITERIA — 0-4 SCALE) ===")
    print(f"Global Score   : {result['score_global_100']} / 100 ({result['note_globale_sur_4']} / 4) — {result['niveau_maturite']}")
    print(f"Coverage       : {result['couverture_pct']}% ({result['criteres_evalues']} evaluated, {result['criteres_vides']} left blank / {result['criteres_applicables']} applicable)")
    print(f"Parcel Coeff   : x{result['coeff_parcelle']}")
    print(f"Ref Quick Wins : {len(result['quick_wins_referentiel'])} ({result['budget_qw_min_keur']}–{result['budget_qw_max_keur']} k€ HT)")
    print(f"AI Recos       : {len(result['recommandations_ia'])}")

    print("\n=== EVALUATED CRITERIA ===")
    for item in result["details"]:
        if item["note_retenue"] is not None:
            print(f"[{item['id_critere']}] {item['critere']} -> {item['note_retenue']}/4 ({item['type_preuve']}) | {item['preuve_extrait']}")

    print(f"\nClean JSON saved to: {output_file}")