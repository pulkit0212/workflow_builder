"""
FastAPI entrypoint (RFC: Deepgram / Whisper batch, future Kafka consumers).
Legacy bot lives in ./legacy-bot (Node) until migrated here.
"""
from fastapi import FastAPI

app = FastAPI(title="Artivaa AI Processing", version="0.0.1")


@app.get("/health/live")
def health_live():
    return {"status": "ok", "service": "ai-processing-service"}
