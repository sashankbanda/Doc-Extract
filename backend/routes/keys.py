from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.key_manager import key_manager
from typing import Dict, List, Optional

router = APIRouter()

class SetKeyRequest(BaseModel):
    provider: str
    key: str

@router.get("/keys")
async def get_keys_status():
    """Return status of keys (configured or not), suppressing actual secret values."""
    all_keys = key_manager.get_all_keys()
    # Return dict of provider -> bool
    return {k: bool(v) for k, v in all_keys.items() if v}

@router.post("/keys")
async def set_key(request: SetKeyRequest):
    """Save an API key."""
    if not request.provider or not request.key:
        raise HTTPException(status_code=400, detail="Provider and key are required")
    key_manager.set_key(request.provider, request.key)
    return {"status": "success", "provider": request.provider}

@router.delete("/keys/{provider}")
async def delete_key(provider: str):
    """Delete an API key."""
    key_manager.delete_key(provider)
    return {"status": "success", "provider": provider}
