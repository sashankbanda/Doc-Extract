
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from backend.services.file_store import file_store
from backend.services.whisper_client import whisper_client
from backend.services.mode_selector import select_mode
import os

router = APIRouter()

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    mode: str = Query(None, description="Processing mode: native_text, high_quality, table, form")
):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
        
    try:
        # 1. Save locally with UUID
        file_path = await file_store.save_input_file(file.filename, await file.read())
        
        # Determine mode using helper
        mode = select_mode(file_path, user_override=mode)
        
        # 2. Call LLMWhisperer API
        response = await whisper_client.upload_file(file_path, mode=mode)
        
        whisper_hash = response.get("whisper_hash")
        if not whisper_hash:
             whisper_hash = response.get("id")
             
        if not whisper_hash:
            raise HTTPException(status_code=500, detail="Failed to get whisper_hash from API")
            
        # 3. Create Status Object
        status_data = {
            "file_path": file_path,
            "whisper_hash": whisper_hash,
            "status": "processing",
            "mode": mode,
            "original_filename": file.filename,
            "local_file_path": file_path # Explicitly save path for retrieval
        }
        
        # 4. Persist initial status
        file_store.save_json_output(whisper_hash, status_data, suffix="_initial")
        # Also save as _status for compatibility with retrieve endpoints?
        # User requested _initial.json specifically.
        # But retrieval logic looks for _status. Let's save both or update retrieve logic.
        # The user req says: "Save a JSON metadata file in: ./output_files/<whisper_hash>_initial.json"
        # But previous retrieve logic looked for _status. 
        # I should output _initial.json AS REQUESTED, but I should probably also save it as _status 
        # so my Retrieve endpoint works without modification, OR update retrieve logic.
        # To be safe and compliant with "Do NOT store anything in DB", file is DB.
        # Let's save as _status as well to keep the system working cohesively.
        file_store.save_json_output(whisper_hash, status_data, suffix="_status")
        
        return {
            "whisper_hash": whisper_hash,
            "file_name": file.filename,
            "mode_used": mode
        }
    except Exception as e:
        # Log error in real app
        raise HTTPException(status_code=500, detail=str(e))
