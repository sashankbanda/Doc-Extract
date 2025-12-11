from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.services.file_store import file_store
import os

router = APIRouter()

@router.get("/document/{whisper_hash}")
async def get_document(whisper_hash: str):
    """
    Serves the raw input file associated with the whisper_hash.
    Looks up the local_file_path from the _initial.json metadata.
    """
    # Load initial metadata
    initial_data = file_store.get_json_output(whisper_hash, suffix="_initial")
    if not initial_data:
        # Fallback: check _status in case it was saved there? 
        # But we saved to both _initial and _status in upload.py.
        initial_data = file_store.get_json_output(whisper_hash, suffix="_status")
        
    if not initial_data:
        raise HTTPException(status_code=404, detail="Document metadata not found")

    file_path = initial_data.get("local_file_path")
    if not file_path:
        # Backward compatibility for old uploads?
        # Try finding file using original name if present?
        # But UUID makes it hard.
        raise HTTPException(status_code=404, detail="File path not found in metadata")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(file_path, filename=initial_data.get("original_filename", "document"))
