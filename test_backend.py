import json
from pathlib import Path
from backend.main import run_full_audit

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"

sample_pdf = DATA_DIR / "sample_propal.pdf"
sample_plan = DATA_DIR / "sample_plan.png"

fallback_text = """
PROJET D'AMÉNAGEMENT — ÎLOT DES TILLEULS (6 500 m², 85 logements)
1. Éclairage public & nuit : L'étude photométrique prévoit une classe P3 (7,5 lx) sur les cheminements piétons
avec une uniformité Uo = 0,42 et une température de couleur de 2700 K (ULR < 1 %, optiques anti-éblouissement).
Les halls résidentiels sont vitrés et éclairés dans la même teinte que l'espace public, pilotés par horloge
avec abaissement aux heures creuses et détection de présence sur les venelles secondaires.
2. Cheminements piétons : Les trottoirs présentent une largeur utile libre de 2,20 m sans obstacle,
une pente maximale de 3,5 % et des abaissés conformes avec bandes d'éveil de vigilance (BEV).
"""

if __name__ == "__main__":
    print("Running budget-safe backend test (2 themes only)...")

    pdf_input = sample_pdf if sample_pdf.exists() else None
    text_input = "" if pdf_input else fallback_text
    images_input = [sample_plan] if sample_plan.exists() else None

    result = run_full_audit(
        surface_m2=6500,
        active_scales={"Ville", "Interface", "Bâtiment"},
        pdf_path_or_buffer=pdf_input,
        raw_text=text_input,
        plan_image_buffers=images_input,
        model="gemma4",
        themes_cibles=[
            "Éclairage public & nuit",
            "Cheminements piétons & trottoirs",
        ],
    )

    output_file = DATA_DIR / "sample_audit_output.json"
    output_file.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== AUDIT SUMMARY (0-5 SCALE) ===")
    print(f"Global Score   : {result['score_global_100']} / 100 ({result['note_sur_5']} / 5) — {result['niveau_maturite']}")
    print(f"Coverage       : {result['couverture_pct']}% ({result['criteres_evalues']} evaluated, {result['criteres_vides']} left blank)")
    print(f"Quick Wins     : {len(result['quick_wins'])} generated")

    print("\n=== EVALUATED CRITERIA ===")
    for item in result["details"]:
        if item.get("note_retenue") is not None:
            print(f"[{item['id_critere']}] {item['critere']} -> {item['note_retenue']}/5 ({item.get('type_preuve')}) | {item.get('preuve_extrait')}")

    print(f"\nFull JSON saved to: {output_file}")