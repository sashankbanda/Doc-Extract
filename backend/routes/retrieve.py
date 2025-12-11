
from fastapi import APIRouter, HTTPException, Query
from backend.services.file_store import file_store
from backend.services.whisper_client import whisper_client

router = APIRouter()

@router.get("/retrieve")
async def retrieve_result(whisper_hash: str = Query(..., description="The unique hash of the processed file")):
    # 1. Check if result already exists locally (Cache Hit)
    data = file_store.get_json_output(whisper_hash, suffix="")
    
    if not data:
        # 2. If not found, Call LLMWhisperer API (V2 Retrieve)
        try:
           data = await whisper_client.get_result(whisper_hash)
           
           # 3. Save result locally (Cache Fill)
           # The user rule: "Extraction can only be retrieved ONCE."
           # Saving it ensures we don't call API again.
           file_store.save_json_output(whisper_hash, data, suffix="")
           
           # 4. Update initial status to 'retrieved' or 'processed'
           # We update the status file to reflect we have the result.
           # Try updating _status.json first as it's the active one
           status_data = file_store.get_json_output(whisper_hash, suffix="_status")
           if status_data:
               status_data["status"] = "retrieved"
               file_store.save_json_output(whisper_hash, status_data, suffix="_status")
               
        except Exception as e:
            # If API fails or 404, propagate error
            raise HTTPException(status_code=404, detail=f"Result not found or API error: {str(e)}")

    # 5. Return filtered response
    # Ensure specific fields are returned as requested
    filtered_response = {
        "result_text": data.get("result_text"),
        "line_metadata": data.get("line_metadata"),
        "confidence_metadata": data.get("confidence_metadata"),
        "metadata": data.get("metadata"),
        "whisper_hash": whisper_hash # good practice to include
    }
    
    return filtered_response
