
from fastapi import APIRouter, HTTPException, Query
from backend.services.file_store import file_store

router = APIRouter()

def _is_valid_line_metadata(raw: list) -> bool:
    """Check if line metadata has valid dimensions."""
    if not raw or not isinstance(raw, list) or len(raw) < 4:
        return False
    page_height = raw[3]
    height = raw[2]
    # Valid if both height and page_height are greater than 0
    return page_height > 0 and height > 0

def _get_line_coordinates(raw: list, target_width: int, target_height: int) -> dict:
    """Extract and compute coordinates from line metadata."""
    page = raw[0]
    base_y = raw[1]
    height = raw[2]
    page_height = raw[3]
    
    # Compute coordinates
    # base_y represents the baseline of the text line in many outputs.
    # Shift the box upward by its height so the rectangle aligns to the top of the text line.
    x1 = 0
    x2 = target_width
    top_y = max(0, base_y - height)
    y1 = int((top_y / page_height) * target_height)
    y2 = int(((top_y + height) / page_height) * target_height)
    
    return {
        "page": page,
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2
    }

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
        
    # 3. Get the target line
    line_item = line_metadata[line]
    
    # Validation: Check format
    if not line_item or not isinstance(line_item, list) or len(line_item) < 4:
        raise HTTPException(status_code=400, detail={"error": "Invalid line metadata format"})

    # 4. Check if target line has valid dimensions
    if _is_valid_line_metadata(line_item):
        # Valid line - return immediately
        return _get_line_coordinates(line_item, target_width, target_height)
    
    # 5. Self-Healing: Check neighbors if target line is invalid
    target_page = line_item[0] if len(line_item) > 0 else None
    
    # Check previous line (line - 1)
    if line > 0:
        prev_item = line_metadata[line - 1]
        if (isinstance(prev_item, list) and len(prev_item) >= 4 and 
            _is_valid_line_metadata(prev_item) and 
            prev_item[0] == target_page):
            # Neighbor is valid and on same page - return neighbor's coordinates
            return _get_line_coordinates(prev_item, target_width, target_height)
    
    # Check next line (line + 1)
    if line + 1 < len(line_metadata):
        next_item = line_metadata[line + 1]
        if (isinstance(next_item, list) and len(next_item) >= 4 and 
            _is_valid_line_metadata(next_item) and 
            next_item[0] == target_page):
            # Neighbor is valid and on same page - return neighbor's coordinates
            return _get_line_coordinates(next_item, target_width, target_height)
    
    # 6. Fallback: Return dummy/empty highlight (zeros) if neighbors are also invalid
    return {
        "page": target_page if target_page is not None else 0,
        "x1": 0,
        "y1": 0,
        "x2": 0,
        "y2": 0
    }
