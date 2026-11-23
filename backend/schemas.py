from typing import List, Optional
from pydantic import BaseModel, Field


class CritereEvalue(BaseModel):
    id_critere: str = Field(..., description="Exact criterion ID from the Excel sheet (e.g. 'T06.01')")
    note: Optional[int] = Field(
        None,
        ge=0,
        le=4,
        description="Maturity score from 0 to 4. MUST be null if no information is found.",
    )
    type_preuve: Optional[str] = Field(
        None,
        description="Exactly one of: 'PV / mesure', 'Visible sur plan', 'Notice / CCTP', 'Declaratif', 'Aucune', or null.",
    )
    preuve_extrait: Optional[str] = Field(
        None,
        description="Short exact quote from text or visual observation from plan. Null if absent.",
    )
    quick_win_ia: Optional[str] = Field(
        None,
        description="Short actionable recommendation ONLY if note <= 2. Null otherwise.",
    )


class BatchAuditResponse(BaseModel):
    evaluations: List[CritereEvalue]