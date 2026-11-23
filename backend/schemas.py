from pydantic import BaseModel, Field
from typing import List, Optional


class CritereEvalue(BaseModel):
    id_critere: str = Field(..., description="Exact criterion ID from the CSV (e.g. T06.01)")
    note: Optional[int] = Field(
        None,
        ge=0,
        le=4,
        description="Maturity score 0-4. MUST be null if no information is found in text or plans.",
    )
    type_preuve: Optional[str] = Field(
        None,
        description="One of: 'PV / mesure', 'Visible sur plan', 'Notice / CCTP', 'Declaratif', or null if absent.",
    )
    preuve_extrait: Optional[str] = Field(
        None,
        description="Exact quote from text or visual observation from plan. MUST be null if not found.",
    )
    quick_win: Optional[str] = Field(
        None,
        description="Concrete recommendation if note is 0, 1, or 2. Null otherwise.",
    )


class BatchAuditResponse(BaseModel):
    evaluations: List[CritereEvalue]