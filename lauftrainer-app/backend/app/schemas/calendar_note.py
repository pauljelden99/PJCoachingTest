from datetime import date, datetime

from pydantic import BaseModel


class CalendarNoteUpsert(BaseModel):
    note: str


class CalendarNoteOut(BaseModel):
    day: date
    note: str
    updated_by_name: str | None
    updated_at: datetime | None
