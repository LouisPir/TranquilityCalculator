from pydantic import BaseModel, Field
from typing import List, Optional

class CritereEvalue(BaseModel):
    id_critere: str = Field(..., description="Identifiant exact issu du référentiel")
    note: int = Field(..., ge=0, le=4, description="0=Inexistant, 1=Intention vague, 2=Prévu, 3=Conçu/Chiffré, 4=Exemplaire")
    preuve_extrait: str = Field(..., description="Citation exacte de la PROPAL justifiant la note, ou 'Aucune mention'")
    analyse_rapide: str = Field(..., description="Explication courte de l'écart par rapport à l'attendu")
    quick_win: Optional[str] = Field(None, description="Action concrète recommandée si note <= 2")

class AuditLLMResponse(BaseModel):
    evaluations: List[CritereEvalue]
    synthese_executive: str
    points_forts: List[str]
    vigilances_majeures: List[str]