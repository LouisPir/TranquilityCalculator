from typing import Any, Dict, List
import pandas as pd
from backend.schemas import CritereEvalue

# Proof ceiling rules from the workbook
PROOF_MAX_NOTE = {
    "PV / mesure": 4,
    "Visible sur plan": 3,
    "Notice / CCTP": 3,
    "Declaratif": 1,
    "Aucune": 0,
}

# Base cost classes in k€ HT (for parcel < 5,000 m²)
COST_CLASSES_KEUR = {
    "0": (0.0, 0.0),
    "€": (5.0, 20.0),
    "€€": (20.0, 80.0),
    "€€€": (80.0, 250.0),
}


def get_parcel_coeff(surface_m2: float) -> float:
    if surface_m2 < 5000:
        return 1.0
    elif surface_m2 < 20000:
        return 1.8
    return 3.0


def compute_audit_242(
    df_applicable: pd.DataFrame,
    evaluations: List[CritereEvalue],
    surface_m2: float,
) -> Dict[str, Any]:
    eval_df = pd.DataFrame([e.model_dump() for e in evaluations])
    df = pd.merge(df_applicable, eval_df, on="id_critere", how="left")

    # Apply proof ceiling only on evaluated (non-null) rows
    def cap_note(row):
        if pd.isna(row["note"]):
            return None
        max_allowed = PROOF_MAX_NOTE.get(str(row.get("type_preuve", "")), 4)
        return min(int(row["note"]), max_allowed)

    df["note_retenue"] = df.apply(cap_note, axis=1)

    total_applicable = len(df)
    df_scored = df[df["note_retenue"].notna()].copy()
    couverture_pct = round((len(df_scored) / total_applicable) * 100, 1) if total_applicable > 0 else 0.0

    # Global score on evaluated criteria only (0-100 and /4)
    if not df_scored.empty:
        df_scored["pts"] = df_scored["note_retenue"] * df_scored["poids"]
        df_scored["pts_max"] = 4.0 * df_scored["poids"]
        score_global_100 = round((df_scored["pts"].sum() / df_scored["pts_max"].sum()) * 100, 1)
        note_sur_4 = round((df_scored["pts"].sum() / df_scored["poids"].sum()), 2)
    else:
        score_global_100, note_sur_4 = 0.0, 0.0

    # Scores per vector (V01..V14)
    vec_scores = []
    for vec, grp in df_scored.groupby("vecteur"):
        s_vec = round((grp["pts"].sum() / grp["pts_max"].sum()) * 100, 1)
        vec_scores.append({"vecteur": vec, "score_100": s_vec, "criteres_evalues": len(grp)})

    # Quick wins (only for evaluated criteria where note_retenue < cible)
    coeff = get_parcel_coeff(surface_m2)
    quick_wins = []
    for _, row in df_scored.iterrows():
        if row["note_retenue"] < row["cible"]:
            c_class = str(row.get("classe_cout", "€")).strip()
            c_min_k, c_max_k = COST_CLASSES_KEUR.get(c_class, (5.0, 20.0))
            quick_wins.append(
                {
                    "id_critere": row["id_critere"],
                    "vecteur": row["vecteur"],
                    "critere": row["critere"],
                    "note_retenue": int(row["note_retenue"]),
                    "cible": int(row["cible"]),
                    "action": row.get("quick_win") or row.get("quick_win_associe") or "Compléter la conception.",
                    "facilite": row.get("facilite", "Moyenne"),
                    "cout_min_keur": round(c_min_k * coeff, 1),
                    "cout_max_keur": round(c_max_k * coeff, 1),
                }
            )

    return {
        "score_global_100": score_global_100,
        "note_sur_4": note_sur_4,
        "couverture_pct": couverture_pct,
        "criteres_applicables": total_applicable,
        "criteres_evalues": len(df_scored),
        "criteres_vides": total_applicable - len(df_scored),
        "coeff_parcelle": coeff,
        "scores_par_vecteur": vec_scores,
        "quick_wins": quick_wins,
        "details": df.to_dict(orient="records"),
    }