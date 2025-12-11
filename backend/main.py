
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import config

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure input/output directories exist on startup
    os.makedirs(config.INPUT_DIR, exist_ok=True)
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    yield

app = FastAPI(lifespan=lifespan)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "unstract-key"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

from backend.routes import upload, retrieve, highlight, status

app.include_router(upload.router)
app.include_router(retrieve.router)
app.include_router(highlight.router)
app.include_router(status.router)
