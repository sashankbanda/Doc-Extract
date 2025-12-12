
from fastapi import APIRouter, HTTPException, Query
from backend.services.file_store import file_store

router = APIRouter()

@router.get("/highlight")
async def get_highlight(
    whisper_hash: str = Query(..., description="The unique hash of the processed file"),
    line: int = Query(..., description="The line index to highlight (0-based)"),
    target_width: int = Query(..., description="Width of the target image/viewport"),
    target_height: int = Query(..., description="Height of the target image/viewport")
):
    # 1. Load extraction JSON
    data = file_store.get_json_output(whisper_hash, suffix="")
    if not data:
        raise HTTPException(status_code=404, detail="Result not found")
        
    # 2. Get line metadata
    # The structure of line_metadata is a list of objects.
    line_metadata = data.get("line_metadata")
    if not line_metadata or line >= len(line_metadata):
        raise HTTPException(status_code=400, detail="Invalid line index")
        
    line_item = line_metadata[line]
    
    # 3. Extract raw coordinates
    # Actual structure in JSON is a list: [page, base_y, height, page_height]
    raw = line_item

    # Validation: Check format
    if not raw or not isinstance(raw, list) or len(raw) < 4:
         raise HTTPException(status_code=400, detail={"error": "Invalid line metadata format"})

    page = raw[0]
    base_y = raw[1]
    height = raw[2]
    page_height = raw[3]
    
    # Validation: Check for zero dimensions
    if page_height == 0 or height == 0:
        raise HTTPException(
            status_code=400, 
            detail={
                "error": "Line has no valid bounding box",
                "line": line
            }
        )

    # 4. Compute coordinates
    # base_y might represent the baseline or top of the line
    # Adjust slightly to ensure highlight aligns with text
    # Using the height to calculate the top position more accurately
    x1 = 0
    x2 = target_width
    # Calculate Y position - base_y is the top of the line bounding box
    y1 = int((base_y / page_height) * target_height)
    y2 = int(((base_y + height) / page_height) * target_height)
    
    return {
        "page": page,
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2
    }
