
import os
import shutil
from fastapi import APIRouter, HTTPException
from backend.config import config

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/reset")
async def reset_session():
    """
    Resets the session by deleting all files in input_files and output_files.
    """
    try:
        # Clear output_files
        if os.path.exists(config.OUTPUT_DIR):
            for filename in os.listdir(config.OUTPUT_DIR):
                file_path = os.path.join(config.OUTPUT_DIR, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f"[Admin] Failed to delete {file_path}. Reason: {e}")

        # Clear input_files
        if os.path.exists(config.INPUT_DIR):
            for filename in os.listdir(config.INPUT_DIR):
                file_path = os.path.join(config.INPUT_DIR, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f"[Admin] Failed to delete {file_path}. Reason: {e}")
                    
        return {"status": "success", "message": "Session reset successfully"}
        
    except Exception as e:
        print(f"[Admin] Error resetting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
