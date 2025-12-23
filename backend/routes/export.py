from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os

from backend.services.file_store import file_store
from backend.config import config

router = APIRouter()

class ExportItem(BaseModel):
    key: str
    value: str
    source_key: str
    line_numbers: List[int]
    is_approved: bool
    is_match: bool

class ExportRequest(BaseModel):
    whisper_hash: str
    items: List[ExportItem]

@router.post("/export/save_result")
async def save_export_result(request: ExportRequest):
    """
    Save the final comparison result (with approvals) to a JSON file in the output directory.
    """
    try:
        # Get original filename from hash storage if possible, or just use hash
        # We don't have a direct reverse lookup here easily without loading metadata, 
        # but we can try to find an existing file to get the filename logic or just use the hash.
        
        # Try to find existing structured data to get better context? 
        # Actually, let's just use the hash and a suffix, consistent with other files.
        # But user asked for "output_files" folder, which file_store uses.
        
        # We will save as {whisper_hash}_final_result.json
        
        # Construct payload
        payload = {
            "whisper_hash": request.whisper_hash,
            "total_items": len(request.items),
            "items": [item.dict() for item in request.items]
        }
        
        # Save using file_store
        saved_path = file_store.save_json_output(request.whisper_hash, payload, suffix="_final_result")
        
        return {"status": "success", "path": saved_path, "message": "Export saved successfully"}
        
    except Exception as e:
        print(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
