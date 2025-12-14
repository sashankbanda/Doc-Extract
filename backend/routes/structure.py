from fastapi import APIRouter, HTTPException

from backend.services.file_store import file_store
from backend.services.llm_service import llm_service

router = APIRouter()


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

    # Flat structure: items[] array with key, value, line_numbers
    output_payload = {
        "whisper_hash": whisper_hash,
        "items": structured.get("items", []),  # Flat array of extracted items
        "metadata": stored.get("metadata"),
    }

    file_store.save_json_output(whisper_hash, output_payload, suffix="_structured")
    return output_payload

