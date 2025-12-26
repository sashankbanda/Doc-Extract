
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.dashboard_service import dashboard_service

router = APIRouter()

class StatusUpdate(BaseModel):
    whisper_hash: str
    status: str

@router.get("/files")
async def get_dashboard_files():
    """Get all files and stats for the dashboard."""
    try:
        data = dashboard_service.get_dashboard_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/status")
async def update_file_status(update: StatusUpdate):
    """Update the status of a file."""
    try:
        dashboard_service.update_status(update.whisper_hash, update.status)
        return {"message": "Status updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/files/{whisper_hash}")
async def delete_dashboard_file(whisper_hash: str):
    """Delete a file from the dashboard."""
    try:
        success = dashboard_service.delete_file(whisper_hash)
        if not success:
            raise HTTPException(status_code=404, detail="File not found")
        return {"message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
