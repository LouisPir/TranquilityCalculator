from typing import List, Optional
from pydantic import BaseModel, Field


class CritereEvalue(BaseModel):
    id_critere: str = Field(..., description="Exact criterion ID from the CSV (e.g. '1,1', '4,3')")
    note: Optional[int] = Field(
        None,
        ge=0,
        le=5,
        description="Maturity score from 0 to 5. MUST be null if no evidence is found in text or plans.",
    )
    type_preuve: Optional[str] = Field(
        None,
        description="One of: 'PV / mesure', 'Visible sur plan', 'Notice / CCTP', 'Declaratif', or null if absent.",
    )
    preuve_extrait: Optional[str] = Field(
        None,
        description="Exact short quote from text or visual observation from plan. MUST be null if absent.",
    )
    quick_win: Optional[str] = Field(
        None,
        description="Actionable recommendation to reach level 3+ if note is 0, 1, or 2. Null otherwise.",
    )


class BatchAuditResponse(BaseModel):
    evaluations: List[CritereEvalue]