# DocExtract: Document Extraction Application

DocExtract is a document processing application that extracts text and layout information from PDFs and images. It features a **FastAPI backend** that integrates with **LLMWhisperer V2** and a **React frontend** for visualizing results with precise highlight overlays.

The system is designed for simplicity, using local file storage instead of a database and a robust polling workflow for asynchronous processing.

## Architecture Summary

The application follows a decoupled client-server architecture:

1.  **Frontend (React)**: Handles file uploads, renders PDFs using `pdf.js`, and overlays extraction results.
2.  **Backend (FastAPI)**: Managing file I/O and communication with the LLMWhisperer API.
3.  **Storage (Local Disk)**: Files are stored locally in `backend/input_files/` (uploads) and `backend/output_files/` (results).

### key Workflow
1.  **Upload**: Client sends file → Backend saves locally → Backend submits to LLMWhisperer V2.
2.  **Poll Status**: Client polls `/status` endpoint → Backend checks API status.
3.  **Retrieve**: Once "processed", client requests `/retrieve` → Backend fetches full JSON result, saves to disk, and returns data.
4.  **Highlight**: Client clicks a text line → Backend calculates coordinates based on page dimensions → Client renders overlay.

---

## Backend Setup

### Prerequisites
-   Python 3.10+
-   `pip`

### 1. Installation
Navigate to the root directory and install dependencies:
```bash
pip install -r requirements.txt
```
*(Ensure `fastapi`, `uvicorn`, `python-dotenv`, `httpx`, `aiofiles` are in requirements)*

### 2. Environment Variables
Create a `.env` file in `backend/` (or root, config loads from backend dir):

```env
# Required for extraction
LLMWHISPERER_API_KEY=your_api_key_here

# Backend Config
BACKEND_BASE_URL=http://localhost:8005
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### 3. Start Server
Run the FastAPI server on port 8005:
```bash
uvicorn backend.main:app --reload --port 8005
```

### 4. Folder Structure
The backend automatically manages these directories:
```
backend/
├── main.py              # App entry point, CORS, Routes
├── config.py            # Environment configuration
├── routes/              # API Endpoints
│   ├── upload.py        # POST /upload
│   ├── status.py        # GET /status
│   ├── retrieve.py      # GET /retrieve
│   ├── highlight.py     # GET /highlight
│   └── document.py      # GET /document (Raw file serving)
├── services/
│   ├── whisper_client.py # LLMWhisperer API wrapper
│   ├── file_store.py     # Local file I/O and sanitization
│   └── mode_selector.py  # Auto-mode detection logic
├── input_files/          # Raw user uploads (auto-created)
└── output_files/         # Extracted JSON results (auto-created)
```

---

## Extraction Workflow (Step-by-Step)

### 1. Upload (`POST /upload`)
-   Saves file to `input_files/<uuid>_<filename>`.
-   Auto-detects processing mode (e.g., `native_text` for PDFs, `high_quality` for images).
-   Submits to LLMWhisperer V2 API.
-   Returns `whisper_hash` immediately.

### 2. Poll Status (`GET /status`)
-   Checks `whisper-status` endpoint.
-   Returns `status: "processing" | "processed" | "error"`.

### 3. Retrieve Results (`GET /retrieve`)
-   **One-time fetch**: Checks local cache first. If missing, requests `whisper-retrieve` from API.
-   Saves full result to `output_files/<hash>.json`.
-   Returns simplified response (Text + Line Metadata).

### 4. Highlight (`GET /highlight`)
-   Accepts `line_index` and `target_width/height` of the client's viewport.
-   Reads cached JSON.
-   Maps normalized PDF coordinates to the target image dimensions.
-   Returns `{ page, x1, y1, x2, y2 }`.

---

## Example API Calls

**1. Upload a File**
```bash
curl -F "file=@/path/to/invoice.pdf" http://localhost:8005/upload
# Response: {"whisper_hash": "abc-123", "mode_used": "native_text", ...}
```

**2. Check Status**
```bash
curl "http://localhost:8005/status?whisper_hash=abc-123"
# Response: {"status": "processed", "whisper_hash": "abc-123"}
```

**3. Retrieve Data**
```bash
curl "http://localhost:8005/retrieve?whisper_hash=abc-123"
```

**4. Get Highlights for Line 0**
```bash
# Validates bounding box and returns scaled coordinates
curl "http://localhost:8005/highlight?whisper_hash=abc-123&line=0&target_width=1000&target_height=1400"
```

---

## Frontend Setup

The frontend is a React application using Vite.

### Prerequisites
-   Node.js 18+
-   `npm` or `yarn`

### 1. Installation
Navigate to the frontend directory (if separate) or root:
```bash
npm install
npm install pdfjs-dist
```

### 2. Configuration
Ensure the API URL matches your backend.
In `src/components/UploadAndProcess.tsx` (or `.env`):
```typescript
const API_BASE = "http://localhost:8005";
```

### 3. Start Development Server
```bash
npm run dev
# Running at http://localhost:5173
```

---

## Frontend Workflow

1.  **Dashboard**: User sees previous jobs (stored in `localStorage`) or can upload a new file.
2.  **Processing**: Upon upload, a spinner appears while the app polls `/status`.
3.  **Workspace**: When "processed", user is redirected to the `DocumentWorkspace`.
    -   **Text Panel (Left)**: Scrollable detected text.
    -   **PDF Viewer (Right)**: Renders PDF using `pdf.js` with a transparent `<canvas>` overlay.
4.  **Interaction**:
    -   Clicking a line in the text panel triggers `/highlight`.
    -   The viewer auto-scrolls to the correct page.
    -   A red bounding box is drawn on the overlay layer.

---

## Troubleshooting

### CORS Errors
**Symptom**: Frontend blocked from calling Backend.
**Fix**: Update `CORS_ORIGINS` in `backend/.env` to include your frontend URL (e.g., `http://localhost:5173`).

### 400 Bad Request on Highlight
**Symptom**: Clicking some lines does not show a highlight.
**Cause**: Some extracted lines (e.g., empty space or headers) may have zero height/width from the OCR engine.
**Fix**: The backend validates metadata. If invalid, it returns `400` which the frontend catches and gracefully ignores (logs a warning).

### Retrieve Working Only Once
**Symptom**: API calls to LLMWhisperer are minimized.
**Behavior**: This is intentional. The backend caches the JSON result to disk on the first call. Subsequent calls read from disk to save bandwidth and API credits.

---

## Future Improvements

-   [ ] **Batch Highlighting**: Fetch all highlights at once instead of per-click.
-   [ ] **Database**: Persist job status and metadata in SQLite/Postgres for multi-user support.
-   [ ] **Webhooks**: Re-enable webhook mode for push-based notifications (instead of polling).
-   [ ] **Multi-file Workspace**: UI to manage and search across multiple documents.
