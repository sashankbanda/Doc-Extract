
from fastapi import APIRouter, HTTPException

router = APIRouter()

@router.post("/webhook/llmwhisperer")
async def webhook_llmwhisperer():
    # Deprecated for pure polling workflow
    raise HTTPException(status_code=410, detail="Webhook is deprecated. Use polling workflow.")
