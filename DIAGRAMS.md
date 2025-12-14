# Application Diagrams

This document contains comprehensive diagrams explaining the DocExtract application architecture, data flows, component relationships, and code organization.

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Frontend Component Hierarchy](#2-frontend-component-hierarchy)
3. [Backend Service Architecture](#3-backend-service-architecture)
4. [Complete Document Processing Flow](#4-complete-document-processing-flow)
5. [Highlighting Flow](#5-highlighting-flow)
6. [API Endpoints Map](#6-api-endpoints-map)
7. [State Management Flow](#7-state-management-flow)
8. [Search Functionality Flow](#8-search-functionality-flow)
9. [File Organization Structure](#9-file-organization-structure)
10. [Component Dependency Graph](#10-component-dependency-graph)

---

## 1. System Architecture Overview

High-level view of the entire application stack.

```mermaid
graph TB
    subgraph "Frontend (React + TypeScript)"
        UI[User Interface]
        Pages[Pages: Home, Upload, Workspace]
        Components[Components: PDF Viewer, Data Panels]
        Context[Document Context]
        API[API Client Layer]
    end
    
    subgraph "Backend (FastAPI)"
        Routes[API Routes]
        Services[Services Layer]
        FileStore[File Store]
    end
    
    subgraph "External Services"
        OCR[LLMWhisperer OCR]
        LLM[Groq LLM via LiteLLM]
    end
    
    subgraph "Storage"
        InputFiles[Input Files Directory]
        OutputFiles[Output Files Directory]
    end
    
    UI --> Pages
    Pages --> Components
    Components --> Context
    Context --> API
    API -->|HTTP Requests| Routes
    Routes --> Services
    Services --> FileStore
    Services -->|OCR Processing| OCR
    Services -->|AI Extraction| LLM
    FileStore --> InputFiles
    FileStore --> OutputFiles
```

**Key Files:**
- Frontend Entry: `src/main.tsx` → `src/App.tsx`
- Backend Entry: `backend/main.py`
- API Client: `src/lib/api.ts`
- Context: `src/context/DocumentContext.tsx`

---

## 2. Frontend Component Hierarchy

Component tree showing how UI components are organized and nested.

```mermaid
graph TD
    App[App.tsx] --> Router[BrowserRouter]
    Router --> Header[AppHeader]
    Router --> Routes[Routes]
    
    Routes --> Home[Home Page]
    Routes --> Upload[Upload Page]
    Routes --> Workspace[Workspace Page]
    Routes --> NotFound[NotFound Page]
    
    Upload --> FileDropzone[FileDropzone]
    Upload --> FileListItem[FileListItem]
    Upload --> ProgressBar[ProgressBar]
    Upload --> DocumentContext[DocumentContext]
    
    Workspace --> TwoPaneLayout[TwoPaneLayout]
    TwoPaneLayout --> LeftPane[Left Pane: PDF Viewer]
    TwoPaneLayout --> RightPane[Right Pane: Data Panel]
    
    LeftPane --> PDFViewerWrapper[PDFViewerWrapper]
    PDFViewerWrapper --> HighlightOverlay[HighlightOverlay]
    
    RightPane --> FileSelector[FileSelectorDropdown]
    RightPane --> Tabs[Tabs: Raw Text / Structured Data]
    RightPane --> ExtractedTextPanel[ExtractedTextPanel]
    RightPane --> StructuredDataViewer[StructuredDataViewer]
    
    StructuredDataViewer --> Accordions[Accordions: Claims, Policy Info, etc.]
    
    App --> DocumentProvider[DocumentProvider]
    DocumentProvider --> DocumentContext
```

**Key Files:**
- Root: `src/App.tsx`
- Pages: `src/pages/Home.tsx`, `src/pages/Upload.tsx`, `src/pages/Workspace.tsx`
- Components: `src/components/workspace/*.tsx`
- Context: `src/context/DocumentContext.tsx`

---

## 3. Backend Service Architecture

Backend services and their relationships.

```mermaid
graph LR
    subgraph "API Routes"
        UploadRoute[upload.py]
        RetrieveRoute[retrieve.py]
        StatusRoute[status.py]
        HighlightRoute[highlight.py]
        DocumentRoute[document.py]
        StructureRoute[structure.py]
    end
    
    subgraph "Services"
        FileStore[file_store.py<br/>File I/O Operations]
        WhisperClient[whisper_client.py<br/>LLMWhisperer API Client]
        LLMService[llm_service.py<br/>Groq LLM Integration]
        SemanticTagger[semantic_tagger.py<br/>Semantic Type Tagging]
        ModeSelector[mode_selector.py<br/>OCR Mode Selection]
    end
    
    subgraph "Storage"
        InputDir[input_files/]
        OutputDir[output_files/]
    end
    
    UploadRoute --> FileStore
    UploadRoute --> WhisperClient
    UploadRoute --> ModeSelector
    
    RetrieveRoute --> FileStore
    RetrieveRoute --> WhisperClient
    
    StatusRoute --> FileStore
    StatusRoute --> WhisperClient
    
    HighlightRoute --> FileStore
    
    DocumentRoute --> FileStore
    
    StructureRoute --> FileStore
    StructureRoute --> LLMService
    LLMService --> SemanticTagger
    
    FileStore --> InputDir
    FileStore --> OutputDir
    
    WhisperClient -->|External API| OCR[LLMWhisperer]
    LLMService -->|External API| LLM[Groq LLM]
```

**Key Files:**
- Routes: `backend/routes/*.py`
- Services: `backend/services/*.py`
- Config: `backend/config.py`

---

## 4. Complete Document Processing Flow

End-to-end flow from file upload to structured data display.

```mermaid
sequenceDiagram
    participant User
    participant UploadPage
    participant DocumentContext
    participant Backend
    participant LLMWhisperer
    participant FileStore
    participant LLMService
    participant WorkspacePage
    participant FrontendOrg

    User->>UploadPage: Upload PDF File
    UploadPage->>DocumentContext: Add Document (status: uploading)
    UploadPage->>Backend: POST /upload
    Backend->>FileStore: Save file to input_files/
    Backend->>LLMWhisperer: Upload file for OCR
    LLMWhisperer-->>Backend: Return whisper_hash
    Backend->>FileStore: Save status (_initial.json, _status.json)
    Backend-->>UploadPage: Return whisper_hash
    
    UploadPage->>DocumentContext: Update status (processing)
    
    loop Polling
        UploadPage->>Backend: GET /status?whisper_hash=hash
        Backend->>FileStore: Load status
        Backend->>LLMWhisperer: Check processing status
        LLMWhisperer-->>Backend: Status: processing/processed
        Backend-->>UploadPage: Return status
    end
    
    Note over Backend,FileStore: When processed, save OCR results
    Backend->>FileStore: Save OCR results (_raw_text.txt, .json)
    
    User->>WorkspacePage: Navigate to /workspace?whisper_hash=hash
    WorkspacePage->>Backend: GET /retrieve?whisper_hash=hash
    Backend->>FileStore: Load OCR results
    Backend-->>WorkspacePage: Return result_text + line_metadata
    WorkspacePage->>DocumentContext: Cache data
    
    User->>WorkspacePage: Click "Analyze with AI"
    WorkspacePage->>Backend: POST /structure/whisper_hash
    Backend->>FileStore: Load raw text + line_metadata
    Backend->>LLMService: Extract structured data
    LLMService->>LLMService: Call Groq LLM
    LLMService-->>Backend: Return flat items with line_numbers
    Backend->>FileStore: Save structured data (_structured.json)
    Backend-->>WorkspacePage: Return structured items
    
    WorkspacePage->>FrontendOrg: organizeStructuredData()
    FrontendOrg->>FrontendOrg: Group by semantic_type
    FrontendOrg->>FrontendOrg: Organize into sections
    FrontendOrg-->>WorkspacePage: Return organized data
    WorkspacePage->>DocumentContext: Cache structured data
    WorkspacePage->>StructuredDataViewer: Display organized data
```

**Key Files:**
- Upload Flow: `src/pages/Upload.tsx`, `backend/routes/upload.py`
- Processing: `backend/services/whisper_client.py`
- Extraction: `backend/services/llm_service.py`
- Organization: `src/lib/organizeStructuredData.ts`

---

## 5. Highlighting Flow

How clicking a value highlights the corresponding location in the PDF.

```mermaid
sequenceDiagram
    participant User
    participant StructuredDataViewer
    participant WorkspacePage
    participant Backend
    participant FileStore
    participant PDFViewerWrapper
    participant HighlightOverlay

    User->>StructuredDataViewer: Click extracted value
    Note over StructuredDataViewer: Value has line_numbers: [17, 18]
    
    StructuredDataViewer->>WorkspacePage: onHighlight([17, 18])
    WorkspacePage->>WorkspacePage: handleStructuredHighlight()
    
    loop For each line_number
        WorkspacePage->>Backend: GET /highlight?line=17&target_width=w&target_height=h
        Backend->>FileStore: Load line_metadata[17]
        Note over Backend: Extract: page, base_y, height, page_height
        Backend->>Backend: Calculate coordinates
        Note over Backend: Convert to viewport coordinates
        Backend-->>WorkspacePage: Return page, x1, y1, x2, y2
    end
    
    WorkspacePage->>WorkspacePage: setActiveBoundingBox(first)
    WorkspacePage->>WorkspacePage: setSecondaryHighlights(rest)
    
    WorkspacePage->>PDFViewerWrapper: Pass highlights prop
    PDFViewerWrapper->>HighlightOverlay: Render overlay for page
    HighlightOverlay->>HighlightOverlay: Draw highlight rectangles
    
    WorkspacePage->>PDFViewerWrapper: Scroll to page
    PDFViewerWrapper->>PDFViewerWrapper: scrollToPage(page)
```

**Key Files:**
- Highlight Handler: `src/pages/Workspace.tsx` (handleStructuredHighlight)
- API: `backend/routes/highlight.py`
- Viewer: `src/components/workspace/PDFViewerWrapper.tsx`
- Overlay: `src/components/workspace/HighlightOverlay.tsx`

---

## 6. API Endpoints Map

All API endpoints and their relationships.

```mermaid
graph TB
    subgraph "Frontend API Client"
        APIClient[src/lib/api.ts]
    end
    
    subgraph "Backend Routes"
        Upload[POST /upload<br/>upload.py]
        Status[GET /status<br/>status.py]
        Retrieve[GET /retrieve<br/>retrieve.py]
        Document[GET /document/hash<br/>document.py]
        StructureGet[GET /structure/hash<br/>structure.py]
        StructurePost[POST /structure/hash<br/>structure.py]
        Highlight[GET /highlight<br/>highlight.py]
        Health[GET /health<br/>main.py]
    end
    
    subgraph "Used By"
        UploadPage[Upload Page]
        WorkspacePage[Workspace Page]
        PDFViewer[PDF Viewer]
    end
    
    APIClient --> Upload
    APIClient --> Status
    APIClient --> Retrieve
    APIClient --> Document
    APIClient --> StructureGet
    APIClient --> StructurePost
    APIClient --> Highlight
    
    UploadPage -->|apiUpload| Upload
    UploadPage -->|apiStatus| Status
    WorkspacePage -->|apiRetrieve| Retrieve
    WorkspacePage -->|structureDocument| StructurePost
    WorkspacePage -->|getStructuredDocument| StructureGet
    WorkspacePage -->|apiHighlight| Highlight
    PDFViewer -->|PDF URL| Document
```

**Key Files:**
- API Client: `src/lib/api.ts`
- Routes: `backend/routes/*.py`
- Usage: `src/pages/Upload.tsx`, `src/pages/Workspace.tsx`

---

## 7. State Management Flow

How state flows through the application using React Context.

```mermaid
graph TD
    subgraph "DocumentContext"
        Documents[documents: Document Array]
        ActiveDoc[activeDocumentId]
        DataCache[dataCache: Record]
        AddDoc[addDocument]
        UpdateStatus[updateDocumentStatus]
        CacheData[cacheData]
    end
    
    subgraph "Upload Page"
        UploadState[Local State: file, loading]
        UploadEffect[useEffect: Poll status]
    end
    
    subgraph "Workspace Page"
        WorkspaceState[Local State: resultText, structuredData, highlights]
        WorkspaceEffect[useEffect: Fetch data]
    end
    
    subgraph "Storage"
        LocalStorage[localStorage: doc_extract_files]
        MemoryCache[In-memory cache]
    end
    
    UploadPage -->|addDocument| DocumentContext
    UploadPage -->|updateDocumentStatus| DocumentContext
    UploadPage -->|Poll status| Backend
    
    WorkspacePage -->|Get activeDocument| DocumentContext
    WorkspacePage -->|Check cache| DocumentContext
    WorkspacePage -->|Fetch if missing| Backend
    WorkspacePage -->|cacheData| DocumentContext
    
    DocumentContext -->|Persist| LocalStorage
    DocumentContext -->|Cache| MemoryCache
    
    DocumentContext -->|Provide state| UploadPage
    DocumentContext -->|Provide state| WorkspacePage
```

**Key Files:**
- Context: `src/context/DocumentContext.tsx`
- Usage: `src/pages/Upload.tsx`, `src/pages/Workspace.tsx`

---

## 8. Search Functionality Flow

How global search works across raw text and structured data.

```mermaid
flowchart TD
    User[User Types Search Query] --> SearchInput[Search Input Component]
    SearchInput --> BuildIndex[Build Search Index]
    
    BuildIndex --> IndexText[Index Raw Text Items<br/>with line_numbers]
    BuildIndex --> IndexStructured[Index Structured Data<br/>with line_numbers + path]
    
    IndexText --> SearchResults[Filter by Query<br/>Case-insensitive substring]
    IndexStructured --> SearchResults
    
    SearchResults --> CheckResults{Results Found?}
    
    CheckResults -->|Yes| DetermineType{Has Structured?}
    CheckResults -->|No| ShowNoResults[Show 'No results']
    
    DetermineType -->|Yes| SwitchToStructured[Switch to Structured Data Tab]
    DetermineType -->|No| SwitchToText[Switch to Raw Text Tab]
    
    SwitchToStructured --> ExpandAccordions[Expand Required Accordions]
    ExpandAccordions --> ScrollToMatch[Scroll to First Match]
    ScrollToMatch --> HighlightPDF[Highlight in PDF using line_numbers]
    
    SwitchToText --> ScrollToLine[Scroll to Matching Line]
    ScrollToLine --> HighlightPDF
    
    HighlightPDF --> DisplayResults[Display Highlighted Results]
```

**Key Files:**
- Search Logic: `src/pages/Workspace.tsx` (searchIndex, searchResults)
- Text Highlighting: `src/components/workspace/ExtractedTextPanel.tsx`
- Structured Highlighting: `src/components/StructuredDataViewer.tsx`

---

## 9. File Organization Structure

Directory structure and what each major directory/file contains.

```mermaid
graph TD
    Root[DocExtract/] --> Frontend[src/]
    Root --> Backend[backend/]
    Root --> Config[Config Files]
    
    Frontend --> Pages[pages/<br/>Home, Upload, Workspace, NotFound]
    Frontend --> Components[components/<br/>UI Components]
    Frontend --> Context[context/<br/>DocumentContext]
    Frontend --> Lib[lib/<br/>api.ts, organizeStructuredData.ts]
    Frontend --> Types[types/<br/>document.ts]
    Frontend --> Hooks[hooks/<br/>use-mobile.tsx, use-toast.ts]
    Frontend --> Utils[utils/<br/>api.ts - UNUSED]
    
    Components --> Workspace[workspace/<br/>PDFViewerWrapper, ExtractedTextPanel, etc.]
    Components --> Upload[upload/<br/>FileDropzone, FileListItem, ProgressBar]
    Components --> UI[ui/<br/>shadcn/ui components]
    
    Backend --> Routes[routes/<br/>upload, retrieve, status, highlight, document, structure]
    Backend --> Services[services/<br/>file_store, whisper_client, llm_service, etc.]
    Backend --> ConfigFile[config.py]
    Backend --> Main[main.py]
    
    Root --> InputFiles[input_files/<br/>Uploaded PDFs]
    Root --> OutputFiles[output_files/<br/>OCR results, structured data]
```

**Key Directories:**
- `src/pages/` - Main page components
- `src/components/workspace/` - Workspace-specific components
- `backend/routes/` - API endpoints
- `backend/services/` - Business logic

---

## 10. Component Dependency Graph

Detailed view of which components import and use which other components.

```mermaid
graph LR
    subgraph "Entry Points"
        Main[main.tsx]
        App[App.tsx]
    end
    
    subgraph "Pages"
        Home[Home.tsx]
        Upload[Upload.tsx]
        Workspace[Workspace.tsx]
        NotFound[NotFound.tsx]
    end
    
    subgraph "Workspace Components"
        TwoPane[TwoPaneLayout.tsx]
        PDFWrapper[PDFViewerWrapper.tsx]
        HighlightOverlay[HighlightOverlay.tsx]
        ExtractedText[ExtractedTextPanel.tsx]
        StructuredViewer[StructuredDataViewer.tsx]
        FileSelector[FileSelectorDropdown.tsx]
    end
    
    subgraph "Upload Components"
        FileDropzone[FileDropzone.tsx]
        FileListItem[FileListItem.tsx]
        ProgressBar[ProgressBar.tsx]
    end
    
    subgraph "Shared"
        DocumentViewer[DocumentViewer.tsx]
        PdfViewer[PdfViewer.tsx]
        AppHeader[AppHeader.tsx]
        DocumentContext[DocumentContext.tsx]
    end
    
    subgraph "Libraries"
        API[lib/api.ts]
        Organize[lib/organizeStructuredData.ts]
        Utils[lib/utils.ts]
    end
    
    Main --> App
    App --> Home
    App --> Upload
    App --> Workspace
    App --> NotFound
    App --> AppHeader
    App --> DocumentContext
    
    Upload --> FileDropzone
    Upload --> FileListItem
    FileListItem --> ProgressBar
    Upload --> DocumentContext
    Upload --> API
    
    Workspace --> TwoPane
    Workspace --> FileSelector
    Workspace --> ExtractedText
    Workspace --> StructuredViewer
    Workspace --> PDFWrapper
    Workspace --> DocumentViewer
    Workspace --> DocumentContext
    Workspace --> API
    Workspace --> Organize
    
    TwoPane --> PDFWrapper
    TwoPane --> ExtractedText
    TwoPane --> StructuredViewer
    
    PDFWrapper --> HighlightOverlay
    PDFWrapper --> PdfViewer
    
    DocumentViewer --> PdfViewer
    
    StructuredViewer --> Utils
    ExtractedText --> Utils
    FileSelector --> Utils
    TwoPane --> Utils
```

**Key Dependencies:**
- All components use: `@/lib/utils` (cn helper)
- API calls: `@/lib/api`
- State: `@/context/DocumentContext`
- Types: `@/types/document`

---

## 11. Data Flow: Upload to Display

Complete data transformation pipeline.

```mermaid
flowchart LR
    PDF[PDF File] --> Upload[Upload Endpoint]
    Upload --> SaveFile[Save to input_files/]
    Upload --> OCR[LLMWhisperer OCR]
    
    OCR --> RawText[Raw Text<br/>result_text]
    OCR --> LineMeta[Line Metadata<br/>line_metadata array]
    
    RawText --> Store1[Store in output_files/<br/>_raw_text.txt]
    LineMeta --> Store2[Store in output_files/<br/>hash.json]
    
    Store1 --> Retrieve[Retrieve Endpoint]
    Store2 --> Retrieve
    
    Retrieve --> Frontend1[Frontend: resultText]
    Retrieve --> Frontend2[Frontend: lineMetadata]
    
    Frontend1 --> DisplayText[Display in ExtractedTextPanel]
    Frontend2 --> HighlightCalc[Used for Highlight Calculations]
    
    Frontend1 --> LLMExtract[LLM Extraction]
    Frontend2 --> LLMExtract
    
    LLMExtract --> FlatItems[Flat Items Array<br/>key, value, line_numbers, semantic_type]
    
    FlatItems --> Store3[Store in output_files/<br/>hash_structured.json]
    Store3 --> Frontend3[Frontend: organizeStructuredData]
    
    Frontend3 --> Organized[Organized Sections<br/>Claims, Policy Info, Summary, Other]
    
    Organized --> DisplayStructured[Display in StructuredDataViewer]
    
    DisplayText --> UserClick1[User Clicks Text Line]
    DisplayStructured --> UserClick2[User Clicks Value]
    
    UserClick1 --> HighlightAPI[Highlight API]
    UserClick2 --> HighlightAPI
    
    HighlightAPI --> LineMeta
    LineMeta --> Coordinates[Calculate Coordinates]
    Coordinates --> PDFHighlight[Highlight in PDF Viewer]
```

**Key Transformations:**
- PDF → Raw Text + Line Metadata (OCR)
- Raw Text → Structured Items (LLM)
- Structured Items → Organized Sections (Frontend)
- Line Numbers → PDF Coordinates (Highlight API)

---

## 12. Code File Usage Map

Which code files are used for what purpose.

```mermaid
mindmap
  root((DocExtract))
    Frontend
      Entry Point
        main.tsx
        App.tsx
      Pages
        Home.tsx: Landing page
        Upload.tsx: File upload + polling
        Workspace.tsx: Main workspace with PDF + data
        NotFound.tsx: 404 page
      Components
        PDFViewerWrapper.tsx: PDF rendering + toolbar
        HighlightOverlay.tsx: Highlight rectangles
        ExtractedTextPanel.tsx: Raw text display
        StructuredDataViewer.tsx: Organized data display
        FileSelectorDropdown.tsx: Document switcher
        TwoPaneLayout.tsx: Resizable split view
      Context
        DocumentContext.tsx: Global document state
      Libraries
        api.ts: API client functions
        organizeStructuredData.ts: Frontend data organization
    Backend
      Entry
        main.py: FastAPI app setup
      Routes
        upload.py: File upload endpoint
        retrieve.py: Get OCR results
        status.py: Check processing status
        highlight.py: Calculate highlight coordinates
        document.py: Serve PDF files
        structure.py: LLM extraction endpoint
      Services
        file_store.py: File I/O operations
        whisper_client.py: LLMWhisperer API client
        llm_service.py: Groq LLM integration
        semantic_tagger.py: Semantic type tagging
        mode_selector.py: OCR mode selection
      Config
        config.py: Environment configuration
```

---

## Diagram Legend

### Component Types
- **Pages**: Top-level route components
- **Components**: Reusable UI components
- **Services**: Backend business logic
- **Routes**: API endpoints
- **Context**: React state management
- **Libraries**: Utility functions and helpers

### Flow Directions
- **→**: Data flow or function call
- **↔**: Bidirectional communication
- **⟳**: Loop or iteration
- **?**: Conditional logic

### Color Coding (in rendered diagrams)
- Blue: Frontend components
- Green: Backend services
- Orange: External services
- Purple: Storage/Data
- Yellow: User interactions

---

## How to Use These Diagrams

1. **For New Developers**: Start with "System Architecture Overview" and "Frontend Component Hierarchy"
2. **For Understanding Data Flow**: See "Complete Document Processing Flow" and "Data Flow: Upload to Display"
3. **For Debugging**: Use "Highlighting Flow" and "State Management Flow"
4. **For API Integration**: Refer to "API Endpoints Map"
5. **For Code Organization**: Check "File Organization Structure" and "Component Dependency Graph"

These diagrams are rendered using Mermaid and will display correctly on GitHub, GitLab, and most Markdown viewers that support Mermaid syntax.

