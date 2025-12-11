
from fastapi import APIRouter, HTTPException, Query
from backend.services.file_store import file_store
from backend.services.whisper_client import whisper_client

router = APIRouter()

@router.get("/status")
async def get_status(whisper_hash: str = Query(..., description="The unique hash to check status for")):
    # 1. Load initial status file
    initial_status = file_store.get_json_output(whisper_hash, suffix="_initial")
    
    if not initial_status:
        raise HTTPException(status_code=404, detail="Job not found (initial status missing)")
    
    try:
        # 2. Call LLMWhisperer Status API active polling
        api_status = await whisper_client.get_status(whisper_hash)
        
        # 3. Save updated status locally
        file_store.save_json_output(whisper_hash, api_status, suffix="_status")
        
        # 4. Return to frontend
        return {
            "status": api_status.get("status"),
            "detail": api_status.get("message"), # 'message' often contains detail like 'Whisper Job Processing'
            "whisper_hash": whisper_hash
        }
    except Exception as e:
        # In case of API error, return the last known status or error
        # We might want to read the local _status file if it exists as fallback
        existing_status = file_store.get_json_output(whisper_hash, suffix="_status")
        if existing_status:
             return {
                 "status": existing_status.get("status"),
                 "detail": "Using cached status due to API error",
                 "whisper_hash": whisper_hash
             }
        
        # If active polling fails and no cache, return error
        raise HTTPException(status_code=502, detail=f"Failed to fetch status from upstream: {str(e)}")
