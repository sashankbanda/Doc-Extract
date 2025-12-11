# DocExtract Backend

A FastAPI backend for extracting data from documents using **LLMWhisperer V2**.

## Workflow (Pure Polling)

This backend strictly uses a polling mechanism. No webhooks are involved.

1.  **POST /upload**:
    - Accepts `file` (multipart/form-data).
    - Returns `whisper_hash`.
    - Backend submits job to LLMWhisperer V2 (async).
2.  **GET /status?whisper_hash=<hash>**:
    - Frontend polls this endpoint.
    - Backend checks upstream status and caches the result locally.
    - Returns `{ "status": "processing" | "processed" | "error" }`.
3.  **GET /retrieve?whisper_hash=<hash>**:
    - Called **ONCE** after status is "processed".
    - Backend fetches result from LLMWhisperer and saves to disk.
    - Future calls read from disk.
4.  **GET /highlight?whisper_hash=<hash>&line=<n>...**:
    - Returns highlight coordinates for specific lines using cached data.
    - **Note**: Some lines may return `400 Bad Request` if they lack valid bounding box data (e.g. `height=0`). Frontend should handle this gracefully (skip highlighting).

## Setup

1.  Set environment variables in `.env`:
    ```
    LLMWHISPERER_API_KEY=...
    LLMWHISPERER_BASE_URL_V2=...
    CORS_ORIGINS=http://localhost:3000
    ```
2.  Run server (from the root directory `DocExtract/`):
    ```bash
    # Ensure you are in D:\projects_all_time\02 DocExtract\00 code\DocExtract
    uvicorn backend.main:app --reload --port 8005
    ```
