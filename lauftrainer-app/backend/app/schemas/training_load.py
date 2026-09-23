from datetime import date

from pydantic import BaseModel


class PmcPointOut(BaseModel):
    day: date
    load: float
    ctl: float
    atl: float
    tsb: float
