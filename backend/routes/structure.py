from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from backend.services.file_store import file_store
from backend.services.llm_service import llm_service
from backend.services.st_table_builder import build_st_rows

router = APIRouter()


class StructuredItemUpdate(BaseModel):
    source_key: str
    canonical_name: Optional[str] = None
    value: str
    line_numbers: List[int]
    semantic_type: str
    confidence: Optional[int] = None


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
async def structure_document(whisper_hash: str, model_id: Optional[str] = None, save: bool = True):
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
        structured = await llm_service.structure_document(raw_text, line_metadata, model_id=model_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to structure document: {exc}"
        ) from exc

    # Flat, lossless structure: all items with semantic_type tags
    # No grouping, no claims, no sections, no skipped_items - everything is preserved
    items = structured.get("items", [])

    output_payload = {
        "whisper_hash": whisper_hash,
        "items": items,  # Flat array of all extracted items
        "metadata": stored.get("metadata"),
    }

    if save:
        # Determine suffix based on model_id to avoid overwriting main file during comparisons
        suffix_base = "_structured"
        st_suffix_base = "_st"
        debug_suffix_base = "_st_debug"
        
        if model_id:
            # Sanitize model_id for filename (e.g. "groq/llama-3" -> "groq_llama-3")
            safe_model_id = model_id.replace("/", "_").replace(":", "").replace(" ", "_")
            suffix_base = f"_structured_{safe_model_id}"
            st_suffix_base = f"_st_{safe_model_id}"
            debug_suffix_base = f"_st_debug_{safe_model_id}"

        # Save flat structured data
        file_store.save_json_output(whisper_hash, output_payload, suffix=suffix_base)

        # Build and save ST-style rows for downstream table construction
        try:
            st_rows, debug_info = build_st_rows(items, debug=True)
            st_payload = {
                "whisper_hash": whisper_hash,
                "rows": st_rows,
            }
            file_store.save_json_output(whisper_hash, st_payload, suffix=st_suffix_base)
            
            # Save debug info for troubleshooting
            debug_payload = {
                "whisper_hash": whisper_hash,
                "debug_info": debug_info,
            }
            file_store.save_json_output(whisper_hash, debug_payload, suffix=debug_suffix_base)
        except Exception as exc:
            # Do not fail the main structuring endpoint if ST building has issues
            import logging
            logging.getLogger(__name__).warning(
                "Failed to build ST rows for %s: %s", whisper_hash, exc
            )

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
    
    # Rebuild ST rows with updated items
    try:
        st_rows, debug_info = build_st_rows(items_dict, debug=True)
        st_payload = {
            "whisper_hash": whisper_hash,
            "rows": st_rows,
        }
        file_store.save_json_output(whisper_hash, st_payload, suffix="_st")
        
        debug_payload = {
            "whisper_hash": whisper_hash,
            "debug_info": debug_info,
        }
        file_store.save_json_output(whisper_hash, debug_payload, suffix="_st_debug")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to rebuild ST rows after update for %s: %s", whisper_hash, exc
        )
    
    return output_payload


@router.get("/structure/{whisper_hash}/st")
async def get_st_rows(whisper_hash: str):
    """Retrieve ST rows (table data)."""
    st_data = file_store.get_json_output(whisper_hash, suffix="_st")
    if st_data:
        return st_data
    raise HTTPException(status_code=404, detail="ST data not found")


@router.get("/structure/{whisper_hash}/debug")
async def get_st_debug_info(whisper_hash: str):
    """
    Retrieve ST table debug information for troubleshooting.
    
    Returns detailed information about:
    - How many items were assigned vs unassigned
    - Which items couldn't be mapped to ST fields
    - Validation issues found
    - Per-row assignment details
    """
    debug_data = file_store.get_json_output(whisper_hash, suffix="_st_debug")
    if debug_data:
        return debug_data
    
    # If no debug file exists, try to generate it from structured data
    structured_data = file_store.get_json_output(whisper_hash, suffix="_structured")
    if not structured_data:
        raise HTTPException(status_code=404, detail="Structured data not found")
    
    items = structured_data.get("items", [])
    if not items:
        raise HTTPException(status_code=404, detail="No items found in structured data")
    
    try:
        st_rows, debug_info = build_st_rows(items, debug=True)
        debug_payload = {
            "whisper_hash": whisper_hash,
            "debug_info": debug_info,
        }
        file_store.save_json_output(whisper_hash, debug_payload, suffix="_st_debug")
        return debug_payload
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate debug info: {exc}"
        ) from exc

