from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from backend.services.file_store import file_store
from backend.services.llm_service import llm_service

router = APIRouter()


class StructuredItemUpdate(BaseModel):
    source_key: str
    canonical_name: Optional[str] = None
    value: str
    line_numbers: List[int]
    semantic_type: str


class StructuredDataUpdate(BaseModel):
    items: List[StructuredItemUpdate]


@router.get("/structure/{whisper_hash}")
async def get_structured_document(whisper_hash: str):
    """Retrieve existing structured data without re-running extraction."""
    structured_data = file_store.get_json_output(whisper_hash, suffix="_structured")
    if structured_data:
        return structured_data
    raise HTTPException(status_code=404, detail="Structured data not found")


@router.post("/structure/{whisper_hash}")
async def structure_document(whisper_hash: str):
    stored = file_store.get_json_output(whisper_hash, suffix="")
    if not stored:
        raise HTTPException(status_code=404, detail="Whisper result not found")

    raw_text = stored.get("result_text")
    line_metadata = stored.get("line_metadata")
    if raw_text is None or line_metadata is None:
        raise HTTPException(
            status_code=400, detail="Missing result_text or line_metadata for this hash"
        )

    try:
        structured = await llm_service.structure_document(raw_text, line_metadata)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to structure document: {exc}"
        ) from exc

    # Flat, lossless structure: all items with semantic_type tags
    # No grouping, no claims, no sections, no skipped_items - everything is preserved
    output_payload = {
        "whisper_hash": whisper_hash,
        "items": structured.get("items", []),  # Flat array of all extracted items
        "metadata": stored.get("metadata"),
    }

    file_store.save_json_output(whisper_hash, output_payload, suffix="_structured")
    return output_payload


@router.put("/structure/{whisper_hash}")
async def update_structured_document(whisper_hash: str, data: StructuredDataUpdate):
    """Update existing structured data with edited values."""
    # Get existing structured data to preserve metadata
    existing_data = file_store.get_json_output(whisper_hash, suffix="_structured")
    if not existing_data:
        raise HTTPException(status_code=404, detail="Structured data not found")
    
    # Convert Pydantic models to dicts
    items_dict = [item.dict() for item in data.items]
    
    # Update payload with edited items
    output_payload = {
        "whisper_hash": whisper_hash,
        "items": items_dict,
        "metadata": existing_data.get("metadata"),
    }
    
    # Save updated structured data
    file_store.save_json_output(whisper_hash, output_payload, suffix="_structured")
    return output_payload

