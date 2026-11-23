from typing import Any, Dict, List
import pandas as pd
from backend.schemas import CritereEvalue

# Exact tables from sheet 'Paramètres'
PROOF_MAX_NOTE = {
    "PV / mesure": 4,
    "Visible sur plan": 3,
    "Notice / CCTP": 3,
    "Declaratif": 1,
    "Aucune": 0,
}

COST_CLASSES_KEUR = {
    "0": (0.0, 0.0, 1.0),       # (min_k€, max_k€, priority_penalty)
    "€": (1.0, 10.0, 1.5),
    "€€": (10.0, 50.0, 2.5),
    "€€€": (50.0, 200.0, 4.0),
}

FACILITY_BONUS = {
    "Facile": 3.0,
    "Moyenne": 2.0,
    "Complexe": 1.0,
}

AXE_LABELS = {
    "A": "Axe A — Espaces publics & mobilités",
    "B": "Axe B — Bâtiments, interfaces & usages",
    "C": "Axe C — Gérer, anticiper, prouver",
}


def _txt(value: Any) -> str:
    """Texte nettoyé ; vide si la valeur est None ou NaN.
    Après le pd.merge, un `null` renvoyé par le modèle devient NaN, et NaN est « vrai » en Python
    (`nan or ""` donne nan) : sans ce filtre, un extrait ou un type de preuve absent passait pour présent."""
    return "" if value is None or pd.isna(value) else str(value).strip()


def get_parcel_coeff(surface_m2: float) -> float:
    """Exact parcel size cost multiplier from Paramètres!R10:T13."""
    if surface_m2 < 5000:
        return 1.0
    elif surface_m2 < 20000:
        return 1.5
    elif surface_m2 < 50000:
        return 2.5
    return 4.0


def get_maturity_label(note_sur_4: float) -> str:
    """Exact tier mapping from Synthèse!I5 and Paramètres!B10:B14."""
    tiers = ["Inexistant", "Initié", "Structuré", "Consolidé", "Exemplaire"]
    idx = min(int(note_sur_4 + 0.0001), 4)
    return f"Niveau {idx} — {tiers[idx]}"


def compute_audit_242(
    df_applicable: pd.DataFrame,
    df_vecteurs: pd.DataFrame,
    evaluations: List[CritereEvalue],
    surface_m2: float,
    max_quick_wins: int = 20,
) -> Dict[str, Any]:
    """Replicates exact workbook scoring (Grille + Synthèse + Quick wins) in Python."""
    if evaluations:
        eval_df = pd.DataFrame([e.model_dump() for e in evaluations]).drop_duplicates(subset=["id_critere"])
        df = pd.merge(df_applicable, eval_df, on="id_critere", how="left")
    else:
        df = df_applicable.copy()
        for col in ["note", "type_preuve", "preuve_extrait", "quick_win_ia"]:
            df[col] = None

    # Exact formula from Grille!R7: proof ceiling + mandatory reference check
    def compute_note_retenue(row):
        if pd.isna(row["note"]):
            return None
        tp = _txt(row.get("type_preuve"))
        ref = _txt(row.get("preuve_extrait"))
        if not tp or (tp != "Aucune" and len(ref) == 0):
            return None
        max_allowed = PROOF_MAX_NOTE.get(tp, 0)
        return min(int(row["note"]), max_allowed)

    df["note_retenue"] = df.apply(compute_note_retenue, axis=1)
    df["ecart"] = df.apply(
        lambda r: max(0.0, float(r["cible"]) - float(r["note_retenue"]))
        if pd.notna(r["note_retenue"])
        else None,
        axis=1,
    )

    total_applicable = len(df)
    df_scored = df[df["note_retenue"].notna()].copy()
    couverture_pct = round((len(df_scored) / total_applicable) * 100, 1) if total_applicable > 0 else 0.0

    # 1. Per-vector scores (Synthèse!F16:G29)
    vector_scores = []
    for _, vrow in df_vecteurs.iterrows():
        vcode = vrow["Code"]
        sub_all = df[df["vecteur"] == vcode]
        sub_scored = df_scored[df_scored["vecteur"] == vcode]

        if not sub_scored.empty:
            n4 = float((sub_scored["note_retenue"] * sub_scored["poids"]).sum() / sub_scored["poids"].sum())
            s100 = round((n4 / 4.0) * 100, 1)
            n4_rounded = round(n4, 2)
            niveau = get_maturity_label(n4)
        else:
            n4, n4_rounded, s100, niveau = None, None, None, "Non évalué"

        vector_scores.append({
            "code": vcode,
            "axe": vrow["axe_code"],
            "vecteur": vrow["Vecteur"],
            "criteres_applicables": len(sub_all),
            "criteres_evalues": len(sub_scored),
            "note_sur_4": n4_rounded,
            "score_100": s100,
            "niveau": niveau,
            "poids_vecteur": float(vrow["poids_vecteur"]),
            "_raw_n4": n4,
        })

    # 2. Per-Axis & Global scores (vector-weighted average, exact Synthèse formula)
    scored_vecs = [v for v in vector_scores if v["_raw_n4"] is not None]
    if scored_vecs:
        global_n4 = sum(v["_raw_n4"] * v["poids_vecteur"] for v in scored_vecs) / sum(
            v["poids_vecteur"] for v in scored_vecs
        )
        score_global_100 = round((global_n4 / 4.0) * 100, 1)
        note_globale_4 = round(global_n4, 2)
        niveau_global = get_maturity_label(global_n4)
    else:
        score_global_100, note_globale_4, niveau_global = 0.0, 0.0, "Non évalué"

    axis_scores = []
    for axe_code, axe_name in AXE_LABELS.items():
        a_vecs = [v for v in scored_vecs if v["axe"] == axe_code]
        if a_vecs:
            a_n4 = sum(v["_raw_n4"] * v["poids_vecteur"] for v in a_vecs) / sum(v["poids_vecteur"] for v in a_vecs)
            axis_scores.append({
                "axe": axe_code,
                "label": axe_name,
                "note_sur_4": round(a_n4, 2),
                "score_100": round((a_n4 / 4.0) * 100, 1),
                "niveau": get_maturity_label(a_n4),
            })
        else:
            axis_scores.append({
                "axe": axe_code,
                "label": axe_name,
                "note_sur_4": None,
                "score_100": None,
                "niveau": "Non évalué",
            })

    # Strip internal _raw_n4 before returning
    for v in vector_scores:
        v.pop("_raw_n4", None)

    # 3. Quick Wins & Costing (exact Grille!AC7 formula)
    coeff = get_parcel_coeff(surface_m2)
    quick_wins_referentiel = []
    recommandations_ia = []

    for _, row in df_scored.iterrows():
        ecart = float(row["ecart"])
        if ecart <= 0:
            continue

        qw_ref = row.get("quick_win_referentiel")
        c_class = row.get("classe_cout")
        fac = row.get("facilite")

        if qw_ref and c_class in COST_CLASSES_KEUR and fac in FACILITY_BONUS:
            c_min_k, c_max_k, penalty = COST_CLASSES_KEUR[c_class]
            bonus = FACILITY_BONUS[fac]
            priorite = round(ecart * float(row["poids"]) * bonus / penalty, 2)
            quick_wins_referentiel.append({
                "id_critere": row["id_critere"],
                "vecteur": row["vecteur"],
                "critere": row["critere"],
                "note_retenue": int(row["note_retenue"]),
                "cible": int(row["cible"]),
                "ecart": int(ecart),
                "action": qw_ref,
                "phase": row["phase"],
                "classe_cout": c_class,
                "facilite": fac,
                "cout_min_keur": round(c_min_k * coeff, 1),
                "cout_max_keur": round(c_max_k * coeff, 1),
                "priorite": priorite,
            })
        elif _txt(row.get("quick_win_ia")):
            recommandations_ia.append({
                "id_critere": row["id_critere"],
                "vecteur": row["vecteur"],
                "critere": row["critere"],
                "note_retenue": int(row["note_retenue"]),
                "cible": int(row["cible"]),
                "action_ia": _txt(row.get("quick_win_ia")),
                "phase": row["phase"],
            })

    quick_wins_referentiel.sort(key=lambda x: x["priorite"], reverse=True)
    quick_wins_top = quick_wins_referentiel[:max_quick_wins]

    # Top strengths and improvement margins (vectors)
    ranked_vecs = sorted([v for v in vector_scores if v["note_sur_4"] is not None], key=lambda x: x["note_sur_4"], reverse=True)
    points_forts = ranked_vecs[:3]
    marges_progression = list(reversed(ranked_vecs[-3:])) if len(ranked_vecs) > 0 else []

    return {
        "score_global_100": score_global_100,
        "note_globale_sur_4": note_globale_4,
        "niveau_maturite": niveau_global,
        "score_indicatif": couverture_pct < 100.0,
        "couverture_pct": couverture_pct,
        "criteres_applicables": total_applicable,
        "criteres_evalues": len(df_scored),
        "criteres_vides": total_applicable - len(df_scored),
        "coeff_parcelle": coeff,
        "scores_par_axe": axis_scores,
        "scores_par_vecteur": vector_scores,
        "points_forts": points_forts,
        "marges_progression": marges_progression,
        "quick_wins_referentiel": quick_wins_top,
        "budget_qw_min_keur": round(sum(q["cout_min_keur"] for q in quick_wins_top), 1),
        "budget_qw_max_keur": round(sum(q["cout_max_keur"] for q in quick_wins_top), 1),
        "recommandations_ia": recommandations_ia,
        "details": df.astype(object).where(pd.notna(df), None).to_dict(orient="records"),
    }