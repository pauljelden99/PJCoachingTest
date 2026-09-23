from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api import (
    activities,
    analytics,
    auth,
    calendar_notes,
    trainer,
    training_load,
    training_plans,
    training_zones,
    wellness,
)
from app.core.config import settings

app = FastAPI(title="Lauftrainer API")

# Die Listen-/Zeitreihen-Endpunkte liefern stark repetitives JSON (eine
# Zeile je Tag ueber die gesamte Trainingshistorie, siehe
# api/training_load.py und api/analytics.py) - das komprimiert um ein
# Vielfaches. minimum_size haelt kleine Antworten (Health-Check, einzelne
# Objekte) unkomprimiert, bei denen sich der Aufwand nicht lohnt.
# Vor CORSMiddleware hinzugefuegt und damit NACH ihr ausgefuehrt (Starlette
# arbeitet die Middleware-Kette in umgekehrter Reihenfolge ab), damit die
# CORS-Header auch auf komprimierten Antworten gesetzt sind.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(activities.router)
app.include_router(training_load.router)
app.include_router(training_plans.router)
app.include_router(trainer.router)
app.include_router(analytics.router)
app.include_router(training_zones.router)
app.include_router(calendar_notes.router)
app.include_router(wellness.router)


@app.get("/health")
def health():
    return {"status": "ok"}
