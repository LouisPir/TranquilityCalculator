from typing import Any, Dict, List
import pandas as pd
from backend.schemas import CritereEvalue

# Proof ceiling rules adapted to the 0-5 scale
PROOF_MAX_NOTE_5 = {
    "PV / mesure": 5,
    "Visible sur plan": 4,
    "Notice / CCTP": 4,
    "Declaratif": 1,
    "Aucune": 0,
}

# Indicative base cost ranges (k€ HT for parcel < 5,000 m²) by theme keywords
DEFAULT_THEME_COST_KEUR = {
    "Éclairage": (15.0, 50.0),
    "Cheminements": (10.0, 40.0),
    "Vitesse": (10.0, 35.0),
    "Traversées": (15.0, 45.0),
    "Vélos": (10.0, 30.0),
    "Stationnement": (15.0, 60.0),
    "Lisibilité": (2.0, 10.0),
    "Rez-de-chaussée": (5.0, 25.0),
    "Interfaces": (10.0, 40.0),
    "Abords": (20.0, 80.0),
    "Propreté": (5.0, 20.0),
    "Nature": (25.0, 90.0),
    "Bruit": (15.0, 50.0),
    "Espaces conviviaux": (10.0, 35.0),
    "Sûreté": (15.0, 45.0),
    "Ambiances": (10.0, 40.0),
    "Chantier": (5.0, 20.0),
    "Gouvernance": (2.0, 12.0),
}


def get_parcel_coeff(surface_m2: float) -> float:
    if surface_m2 < 5000:
        return 1.0
    elif surface_m2 < 20000:
        return 1.8
    return 3.0


def get_maturity_level_5(score_100: float) -> str:
    if score_100 < 20:
        return "Niveau 0 — Non traité"
    elif score_100 < 40:
        return "Niveau 1 — Très insuffisant"
    elif score_100 < 60:
        return "Niveau 2 — Minimum / courant"
    elif score_100 < 75:
        return "Niveau 3 — Bonne pratique"
    elif score_100 < 90:
        return "Niveau 4 — Renforcé"
    return "Niveau 5 — Exemplaire"


def _estimate_cost_keur(theme: str, coeff: float) -> tuple[float, float]:
    for prefix, (c_min, c_max) in DEFAULT_THEME_COST_KEUR.items():
        if theme.startswith(prefix):
            return round(c_min * coeff, 1), round(c_max * coeff, 1)
    return round(10.0 * coeff, 1), round(30.0 * coeff, 1)


def compute_audit_results(
    df_criteria: pd.DataFrame,
    evaluations: List[CritereEvalue],
    surface_m2: float,
) -> Dict[str, Any]:
    """Computes 0-100 and /5 scores, coverage %, theme/scale breakdowns, and prioritized Quick Wins."""
    if evaluations:
        eval_df = pd.DataFrame([e.model_dump() for e in evaluations]).drop_duplicates(subset=["id_critere"])
        df = pd.merge(df_criteria, eval_df, on="id_critere", how="left")
    else:
        df = df_criteria.copy()
        for col in ["note", "type_preuve", "preuve_extrait", "quick_win"]:
            df[col] = None

    def cap_note(row):
        if pd.isna(row["note"]):
            return None
        max_allowed = PROOF_MAX_NOTE_5.get(str(row.get("type_preuve", "")), 5)
        return min(int(row["note"]), max_allowed)

    df["note_retenue"] = df.apply(cap_note, axis=1)

    total_applicable = len(df)
    df_scored = df[df["note_retenue"].notna()].copy()
    couverture_pct = round((len(df_scored) / total_applicable) * 100, 1) if total_applicable > 0 else 0.0

    # Global score on evaluated criteria only (max note = 5.0)
    if not df_scored.empty:
        df_scored["pts"] = df_scored["note_retenue"] * df_scored["poids"]
        df_scored["pts_max"] = 5.0 * df_scored["poids"]
        total_pts_max = df_scored["pts_max"].sum()
        score_global_100 = round((df_scored["pts"].sum() / total_pts_max) * 100, 1)
        note_sur_5 = round((df_scored["pts"].sum() / df_scored["poids"].sum()), 2)
    else:
        total_pts_max = 0.0
        score_global_100, note_sur_5 = 0.0, 0.0

    # Breakdown by Thème
    theme_scores = []
    for theme, grp in df_scored.groupby("theme", sort=False):
        s_100 = round((grp["pts"].sum() / grp["pts_max"].sum()) * 100, 1)
        n_5 = round(grp["pts"].sum() / grp["poids"].sum(), 2)
        theme_scores.append(
            {
                "theme": theme,
                "score_100": s_100,
                "note_sur_5": n_5,
                "criteres_evalues": len(grp),
            }
        )

    # Breakdown by Échelle (Ville / Interface / Bâtiment)
    scale_scores = []
    for scale, grp in df_scored.groupby("echelle", sort=False):
        s_100 = round((grp["pts"].sum() / grp["pts_max"].sum()) * 100, 1)
        scale_scores.append({"echelle": scale, "score_100": s_100, "criteres_evalues": len(grp)})

    # Prioritized Quick Wins (triggered when note_retenue < 3, target = 3 'Bonne pratique')
    coeff = get_parcel_coeff(surface_m2)
    quick_wins = []
    for _, row in df_scored.iterrows():
        note_val = int(row["note_retenue"])
        if note_val < 3:
            c_min_k, c_max_k = _estimate_cost_keur(row["theme"], coeff)
            gain_pts = (3 - note_val) * row["poids"]
            gain_score_100 = round((gain_pts / total_pts_max) * 100, 1) if total_pts_max > 0 else 0.0
            is_reglementaire = "réglementaire" in str(row.get("nature_seuil", "")).lower()

            quick_wins.append(
                {
                    "id_critere": row["id_critere"],
                    "theme": row["theme"],
                    "echelle": row["echelle"],
                    "critere": row["critere"],
                    "nature_seuil": row["nature_seuil"],
                    "est_reglementaire": is_reglementaire,
                    "note_retenue": note_val,
                    "cible": 3,
                    "action": row.get("quick_win") or f"Atteindre le niveau 3 : {row.get('niveau_3', '')}",
                    "gain_score_100": gain_score_100,
                    "cout_min_keur": c_min_k,
                    "cout_max_keur": c_max_k,
                }
            )

    # Sort: Regulatory gaps first, then highest score gain
    quick_wins_sorted = sorted(
        quick_wins,
        key=lambda x: (x["est_reglementaire"], x["gain_score_100"]),
        reverse=True,
    )

    return {
        "score_global_100": score_global_100,
        "note_sur_5": note_sur_5,
        "niveau_maturite": get_maturity_level_5(score_global_100),
        "couverture_pct": couverture_pct,
        "criteres_applicables": total_applicable,
        "criteres_evalues": len(df_scored),
        "criteres_vides": total_applicable - len(df_scored),
        "coeff_parcelle": coeff,
        "scores_par_theme": theme_scores,
        "scores_par_echelle": scale_scores,
        "quick_wins": quick_wins_sorted,
        "details": df.where(pd.notna(df), None).to_dict(orient="records"),
    }