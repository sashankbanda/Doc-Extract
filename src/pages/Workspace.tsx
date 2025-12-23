import CanonicalNameViewer from "@/components/CanonicalNameViewer";
import DocumentViewer, { guessFileType } from "@/components/DocumentViewer";
import StructuredDataViewer from "@/components/StructuredDataViewer";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComparisonTab } from "@/components/workspace/ComparisonTab";
import { ExtractedTextPanel } from "@/components/workspace/ExtractedTextPanel";
import { FileSelectorDropdown } from "@/components/workspace/FileSelectorDropdown";
import { PDFViewerWrapper } from "@/components/workspace/PDFViewerWrapper";
import { ResultTab } from "@/components/workspace/ResultTab";
import { StructuredTablePanel } from "@/components/workspace/StructuredTablePanel";
import { TwoPaneLayout } from "@/components/workspace/TwoPaneLayout";
import { ComparisonProvider } from "@/context/ComparisonContext";
import { useDocumentContext } from "@/context/DocumentContext";
import { API_BASE, apiHighlight, apiResetSession, apiRetrieve, getStructuredDocument, OrganizedStructuredData, StructuredItem, structureDocument, updateStructuredDocument } from "@/lib/api";
import { organizeStructuredData } from "@/lib/organizeStructuredData";
import { FixedWidthTable, parseMultiHeaderLossRunTable, parseSimpleLossRunTable } from "@/lib/parseFixedWidthTables";
import { cn } from "@/lib/utils";
import { BoundingBox, ExtractedTable, LayoutText } from "@/types/document";
import { getStRows } from "@/utils/api";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Download, Edit2, FileText, GitCompare, Hash, Loader2, Maximize2, RotateCcw, Search, Sparkles, Table, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type TabType = "text" | "tables" | "cn" | "qa" | "st" | "compare";

const tabs: { id: TabType; label: string; icon: typeof FileText }[] = [
  { id: "text", label: "Raw Text", icon: FileText },
  { id: "tables", label: "Structured Data", icon: Table },
  { id: "cn", label: "CN", icon: Hash },
  { id: "qa", label: "QA", icon: Sparkles },
  { id: "st", label: "ST", icon: Table },
  { id: "compare", label: "Compare Models", icon: GitCompare },
  { id: "result", label: "Result", icon: CheckCircle2 },
];

export default function Workspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { documents, activeDocumentId, setActiveDocument, dataCache, cacheData, removeDocument, clearDocuments } = useDocumentContext();
  
  // Get whisper_hash from URL
  const urlHash = searchParams.get("whisper_hash");
  
  // Find active document by hash or by activeDocumentId
  const activeDocument = useMemo(() => {
    if (urlHash) {
      // First try to find by whisperHash
      const docByHash = documents.find((d) => d.whisperHash === urlHash);
      if (docByHash) return docByHash;
    }
    if (activeDocumentId) {
      // Then try to find by activeDocumentId
      const docById = documents.find((d) => d.id === activeDocumentId);
      if (docById) return docById;
    }
    // Fallback: get first complete document
    return documents.find((d) => d.status === "complete" && d.whisperHash) || null;
  }, [documents, urlHash, activeDocumentId]);

  const whisperHash = activeDocument?.whisperHash || urlHash;
  const fileName = activeDocument?.fileName || activeDocument?.name || searchParams.get("fileName") || "document";

  const [resultText, setResultText] = useState<string>("");
  const [lineMetadata, setLineMetadata] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("text");
  const [hoveredBoundingBox, setHoveredBoundingBox] = useState<BoundingBox | null>(null);
  const [activeBoundingBox, setActiveBoundingBox] = useState<BoundingBox | null>(null);
  const [secondaryHighlights, setSecondaryHighlights] = useState<BoundingBox[]>([]);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number, height: number }>>({});
  const [structuredData, setStructuredData] = useState<OrganizedStructuredData | null>(null);
  const [structureLoading, setStructureLoading] = useState<boolean>(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [userExpandedAccordions, setUserExpandedAccordions] = useState<string[]>([]);
  const structuredDataViewerRef = useRef<HTMLDivElement>(null);
  const extractedTextPanelRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const qaContainerRef = useRef<HTMLDivElement>(null);
  const qaRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const previousHighlightLineRef = useRef<number | null>(null);
  const qaHorizontalProgressRef = useRef<number | null>(null); // 0 (left) -> 1 (right)
  const qaLineScrollStateRef = useRef<{ line: number; baselineLeft: number } | null>(null);
  const [stSelectedIndex, setStSelectedIndex] = useState<number>(0);
  const stRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [qaSelectedIndex, setQaSelectedIndex] = useState<number>(0);
  const [qaEditingId, setQaEditingId] = useState<string | null>(null);
  const [qaDraftKey, setQaDraftKey] = useState<string>("");
  const [qaDraftValue, setQaDraftValue] = useState<string>("");
  const [qaSavingId, setQaSavingId] = useState<string | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaDeletingId, setQaDeletingId] = useState<string | null>(null);
  const [structureSavingId, setStructureSavingId] = useState<string | null>(null);
  
  // Text tab state
  const [textSelectedIndex, setTextSelectedIndex] = useState<number>(-1);
  const textItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ST tab state
  const [stRows, setStRows] = useState<ExtractedTable[] | null>(null);
  const [stLoading, setStLoading] = useState<boolean>(false);
  const [stSelectedColIndex, setStSelectedColIndex] = useState<number>(0);

  const handleFetchStRows = useCallback(async () => {
       if (!whisperHash) return;
       setStLoading(true);
       try {
           const resp = await getStRows(whisperHash);
           if (resp && resp.rows && resp.rows.length > 0) {
              const rows = resp.rows;
              // Determine columns from first row (excluding internal fields)
              // Determine columns from first row (excluding internal fields)
              const firstRow = rows[0];
              const internalFields = ["line_numbers", "semantic_type", "window", "claim_line"];
              const allColumns = Object.keys(firstRow).filter(k => !internalFields.includes(k) && typeof firstRow[k] === 'object');
              
              // Filter out columns that are completely empty
              const activeColumns = allColumns.filter(col => {
                  return rows.some(r => {
                      const val = r[col]?.value;
                      return val && val.toString().trim().length > 0;
                  });
              });

              // Also ensure we always keep 'claimNumber' if it exists, just in case
              if (allColumns.includes("claimNumber") && !activeColumns.includes("claimNumber")) {
                  activeColumns.unshift("claimNumber");
              }
              
              const extractedRows = rows.map((r) => {
                  return activeColumns.map((col) => {
                      const cellData = r[col];
                      return {
                          value: cellData?.value || "",
                          boundingBox: (cellData?.line_numbers && cellData.line_numbers.length > 0) ? {
                            // Dummy bbox to enable click
                            x: 0, y: 0, width: 0, height: 0, page: 1,
                          } : undefined,
                          lineIndices: cellData?.line_numbers || []
                      };
                  });
              });

              // Create one table
              const table: ExtractedTable = {
                  id: "st-table-1",
                  headers: activeColumns,
                  rows: extractedRows,
                  boundingBox: { x:0, y:0, width:0, height:0, page: 1 }
              };
              
              setStRows([table]);
           } else {
               setStRows([]);
           }
       } catch (e) {
           console.error("Failed to fetch ST rows", e);
       } finally {
           setStLoading(false);
       }
  }, [whisperHash]);

  const buildItemId = useCallback((item: StructuredItem) => {
    return `${item.source_key}|${item.value}|${item.line_numbers.join(",")}`;
  }, []);

  const handlePageDimensions = useCallback((pageNum: number, width: number, height: number) => {
    setPageDimensions(prev => {
      // Only update if dimensions actually changed to prevent infinite loops
      if (prev[pageNum]?.width === width && prev[pageNum]?.height === height) {
        return prev;
      }
      return {
        ...prev,
        [pageNum]: { width, height }
      };
    });
  }, []);

  // Synchronization Logic: URL <-> Context
  useEffect(() => {
    if (!whisperHash) {
      // No hash in URL or context - redirect to upload
      if (documents.length === 0) {
        console.warn("[Workspace] No documents found, redirecting to upload");
        navigate("/upload");
        return;
      }
      // If we have documents but no hash, use the first complete one
      const firstComplete = documents.find((d) => d.status === "complete" && d.whisperHash);
      if (firstComplete && firstComplete.whisperHash) {
        setActiveDocument(firstComplete.id);
        setSearchParams(
          { whisper_hash: firstComplete.whisperHash, fileName: firstComplete.fileName || firstComplete.name },
          { replace: true }
        );
        return;
      }
      navigate("/upload");
      return;
    }

    // If URL has a hash but it's not in the document context, it might be invalid/expired
    if (urlHash && !activeDocument) {
      if (documents.length === 0) {
        // No documents available - clear URL and redirect to upload
        console.warn("[Workspace] URL hash not found in context and no documents available, clearing URL and redirecting");
        setSearchParams({}, { replace: true });
        navigate("/upload");
        return;
      } else {
        // We have documents but URL hash doesn't match - use first available document
        const firstComplete = documents.find((d) => d.status === "complete" && d.whisperHash);
        if (firstComplete && firstComplete.whisperHash) {
          console.warn("[Workspace] URL hash not found in context, using first available document");
          setActiveDocument(firstComplete.id);
          setSearchParams(
            { whisper_hash: firstComplete.whisperHash, fileName: firstComplete.fileName || firstComplete.name },
            { replace: true }
          );
          return;
        }
      }
    }

    // If URL has hash but activeDocumentId doesn't match, find and set active document
    if (urlHash && activeDocument && activeDocument.id !== activeDocumentId) {
      console.log("[Workspace] Syncing context with URL hash:", urlHash);
      setActiveDocument(activeDocument.id);
    }

    // If URL has no hash but activeDocumentId is set, update URL
    if (!urlHash && activeDocument && activeDocument.whisperHash) {
      console.log("[Workspace] Syncing URL with active document:", activeDocument.whisperHash);
      setSearchParams(
        { whisper_hash: activeDocument.whisperHash, fileName: activeDocument.fileName || activeDocument.name },
        { replace: true }
      );
    }
  }, [urlHash, activeDocument, activeDocumentId, setActiveDocument, setSearchParams, navigate, documents]);

  // Read-Through Cache Pattern: Fetch data with caching
  useEffect(() => {
    if (!whisperHash) {
      setLoading(false);
      setStructuredData(null);
      return;
    }

    const fetchData = async () => {
      console.log("[Workspace] Fetching data for whisperHash:", whisperHash);
      
      // Check cache first
      const cachedData = dataCache[whisperHash];
      if (cachedData && cachedData.result_text !== undefined) {
        console.log("[Workspace] Cache hit for whisperHash:", whisperHash);
        setResultText(cachedData.result_text || "");
        setLineMetadata(cachedData.line_metadata || []);
        
        // Also load cached structured data if available
        if (cachedData.structured) {
          console.log("[Workspace] Loading cached structured data");
          setStructuredData(cachedData.structured);
        } else {
          // Cache miss for structured data - try to load from backend
          try {
            const flatData = await getStructuredDocument(whisperHash);
            if (flatData && flatData.items && flatData.items.length > 0) {
              console.log("[Workspace] Found existing structured data in backend, organizing for display");
              // Organize flat items into UI sections
              const organized = organizeStructuredData(flatData.items);
              setStructuredData(organized);
              // Update cache with organized data
              cacheData(whisperHash, {
                ...cachedData,
                structured: organized,
              });
            } else {
              setStructuredData(null);
            }
          } catch (err: any) {
            // Structured data doesn't exist yet
            console.log("[Workspace] No existing structured data found");
            setStructuredData(null);
          }
        }
        
        setLoading(false);
        return;
      }

      // Cache miss - fetch from API
      console.log("[Workspace] Cache miss, fetching from API for whisperHash:", whisperHash);
      setLoading(true);
      try {
        const data = await apiRetrieve(whisperHash);
        console.log("[Workspace] Retrieved data:", {
          resultTextLength: data.result_text?.length,
          lineMetadataLength: data.line_metadata?.length
        });
        
        // Save to cache (preserve structured data if it exists)
        cacheData(whisperHash, {
          ...cachedData, // Preserve any existing cached data (like structured)
          result_text: data.result_text || "",
          line_metadata: data.line_metadata || [],
        });
        
        setResultText(data.result_text || "");
        setLineMetadata(data.line_metadata || []);
        
        // Try to load structured data from backend if it exists (even if not in cache)
        // This ensures structured data persists across page reloads
        if (!cachedData?.structured) {
          try {
            // Check if structured data exists by trying to fetch it (GET request, doesn't re-run extraction)
            const flatData = await getStructuredDocument(whisperHash);
            if (flatData && flatData.items && flatData.items.length > 0) {
              console.log("[Workspace] Found existing structured data, organizing for display");
              // Organize flat items into UI sections
              const organized = organizeStructuredData(flatData.items);
              setStructuredData(organized);
              // Save to cache for future use
              cacheData(whisperHash, {
                ...cachedData,
                result_text: data.result_text || "",
                line_metadata: data.line_metadata || [],
                structured: organized,
              });
            } else {
              setStructuredData(null);
            }
          } catch (err: any) {
            // Structured data doesn't exist yet - this is fine, user can click "Analyze with AI"
            console.log("[Workspace] No existing structured data found (this is normal for new files)");
            setStructuredData(null);
          }
        }
      } catch (err: any) {
        console.error("[Workspace] Error fetching data:", err);
        
        // Check if this is a 400 Bad Request error (invalid/expired hash)
        const is400Error = err.message && (
          err.message.includes("400") || 
          err.message.includes("Bad Request") ||
          err.message.includes("Result not found") ||
          err.message.includes("API error") ||
          err.message.includes("Client error")
        );
        
        // If hash is not in document context and we get a 400 error, the hash is invalid/expired
        const hashNotInContext = !activeDocument || activeDocument.whisperHash !== whisperHash;
        
        if (is400Error && hashNotInContext) {
          console.warn("[Workspace] Invalid/expired whisper_hash detected, clearing URL and redirecting to upload");
          // Clear the invalid hash from URL and redirect to upload
          setSearchParams({}, { replace: true });
          navigate("/upload");
          return;
        }
        
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [whisperHash, dataCache, cacheData]);

  // Convert result_text to LayoutText[] format - preserve visual structure
  const layoutTextItems: LayoutText[] = useMemo(() => {
    if (!resultText) return [];
    const lines = resultText.split('\n');
    return lines.map((line, index) => {
      const metadata = lineMetadata[index];
      let page = 1;
      if (metadata && Array.isArray(metadata) && metadata.length > 0) {
        page = (metadata[0] || 0) + 1; // Convert 0-based to 1-based
      }
      
      // Preserve the exact text structure (including hex prefixes like "0x01:")
      // The text already contains the visual structure from the PDF
      const text = line.trim();
      
      // Determine type based on text content
      let type: 'paragraph' | 'heading' | 'list-item' = 'paragraph';
      if (text.length === 0) {
        return null; // Skip completely empty lines
      }
      
      // Check if it's a heading (starts with hex prefix and has uppercase text)
      if (text.match(/^0x[0-9A-F]+:\s+[A-Z]/)) {
        type = 'heading';
      } else if (text.match(/^0x[0-9A-F]+:\s+[•\-]/)) {
        type = 'list-item';
      } else if (text.match(/^0x[0-9A-F]+:\s*$/)) {
        // Empty line with just hex prefix
        return null;
      }

      return {
        id: `line-${index}`,
        text: text, // Keep the full text including hex prefix to preserve structure
        type,
        boundingBox: {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          page
        }
      };
    }).filter((item): item is LayoutText => item !== null);
  }, [resultText, lineMetadata]);

  // Handle item interactions
  const handleItemHover = useCallback((boundingBox: BoundingBox | null) => {
    setHoveredBoundingBox(boundingBox);
  }, []);

  const handleItemClick = useCallback(async (boundingBox: BoundingBox, item: LayoutText, index: number) => {
    // Extract line index from item.id (format: "line-{index}")
    const lineIndexMatch = item.id.match(/line-(\d+)/);
    const lineIndex = lineIndexMatch ? parseInt(lineIndexMatch[1], 10) : index;
    
    // Convert 1-based page to 0-based for API, but keep 1-based for display
    const apiPage = boundingBox.page - 1;
    const displayPage = boundingBox.page;
    
    if (whisperHash && pageDimensions[displayPage]) {
      const dims = pageDimensions[displayPage];
      const targetWidth = Math.round(dims.width);
      const targetHeight = Math.round(dims.height);
      try {
        console.log("[Workspace] Calling highlight for line:", lineIndex, "page (1-based):", displayPage);
        const rect = await apiHighlight(whisperHash, lineIndex, targetWidth, targetHeight);
        console.log("[Workspace] Got highlight rect:", rect);
        
        // API returns 0-based page, convert to 1-based for PDF.js
        const pdfPage = rect.page + 1;
        
        // The coordinates from API are in viewport space (scale 1.5)
        // Canvas is rendered at viewport.width/height but displayed at displayWidth/Height (scaled by zoom)
        // So coordinates need to be scaled by zoom/100 to match display size
        const zoomScale = 100; // We'll get actual zoom from PDFViewerWrapper if needed, but for now use base scale
        
        // Update bounding box with real coordinates (1-based page for PDF.js)
        // Coordinates are in viewport space (scale 1.5), will be scaled by HighlightOverlay
        setActiveBoundingBox({
          x: rect.x1,
          y: rect.y1,
          width: rect.x2 - rect.x1,
          height: rect.y2 - rect.y1,
          page: pdfPage
        });
        
        // Wait for highlight to render, then scroll to it
        setTimeout(() => {
          const pageElement = document.getElementById(`page_${pdfPage}`);
          if (pageElement) {
            // Find the scrollable container (PDF viewer area)
            const scrollContainer = pageElement.closest('.overflow-auto');
            
            if (scrollContainer) {
              // Get the canvas to determine zoom
              const canvas = pageElement.querySelector('canvas') as HTMLCanvasElement;
              const viewportWidth = dims.width; // Viewport width at scale 1.5
              const displayWidth = canvas ? parseFloat(canvas.style.width || '0') : viewportWidth;
              const zoom = displayWidth > 0 ? (displayWidth / viewportWidth) * 100 : 100;
              
              // Calculate the highlight position on the displayed canvas
              // rect.y1 is in viewport coordinates (scale 1.5)
              // Canvas display size = viewport.size * (zoom/100)
              // So highlight y on display = rect.y1 * (zoom/100)
              const highlightY = rect.y1 * (zoom / 100);
              
              // Get positions relative to container
              const pageRect = pageElement.getBoundingClientRect();
              const containerRect = scrollContainer.getBoundingClientRect();
              
              // Get canvas position within page element (account for padding/margins)
              const canvasRect = canvas?.getBoundingClientRect();
              const canvasOffsetY = canvasRect ? canvasRect.top - pageRect.top : 0;
              
              // Calculate scroll position to center the highlight
              // Account for page position, canvas offset, and highlight position
              const pageTop = pageRect.top - containerRect.top + scrollContainer.scrollTop;
              const targetScrollTop = pageTop + canvasOffsetY + highlightY - (containerRect.height / 2);
              
              console.log("[Workspace] Scroll calculation:", {
                pageTop,
                canvasOffsetY,
                highlightY,
                targetScrollTop,
                containerHeight: containerRect.height
              });
              
              scrollContainer.scrollTo({
                top: Math.max(0, targetScrollTop),
                left: scrollContainer.scrollLeft, // Preserve horizontal scroll
                behavior: 'smooth'
              });
            } else {
              // Fallback: just scroll page into view
              pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }, 150);
        
      } catch (e: any) {
        // Check for 400 errors (invalid line index or invalid bbox)
        if (e.message && (e.message.includes("Invalid") || e.message.includes("no valid bounding box"))) {
          console.warn("[Workspace] Line skipped by backend:", e.message);
          return;
        }
        console.error("[Workspace] Highlight error:", e);
      }
    } else {
      console.warn("[Workspace] Missing data for highlight:", { whisperHash, pageDimensions: pageDimensions[displayPage], displayPage });
    }
  }, [whisperHash, pageDimensions]);

  // Collect all highlights: hovered + secondary highlights (reduced intensity)
  const allHighlights = [
    ...(hoveredBoundingBox ? [hoveredBoundingBox] : []),
    ...secondaryHighlights
  ];

  // Convert highlights to rectangle format for non-PDF viewers
  const highlightRects = useMemo(
    () =>
      allHighlights.map((box) => ({
        page: box.page,
        x1: box.x,
        y1: box.y,
        x2: box.x + box.width,
        y2: box.y + box.height,
      })),
    [allHighlights]
  );

  // ST tab: parse fixed-width tables from raw resultText for loss-run style PDFs.
  const stTable: FixedWidthTable | null = useMemo(() => {
    if (!resultText) return null;

    const rawLines = resultText.split("\n").map((line, idx) => {
      // Strip leading 0xNN: prefix if present
      const match = line.match(/^0x[0-9A-Fa-f]+:\s?(.*)$/);
      return {
        index: idx,
        text: match ? match[1] : line,
      };
    });

    // Try simple loss-run parser first (single header style)
    const simple = parseSimpleLossRunTable(rawLines);
    if (simple && simple.rows.length > 0) return simple;

    // Fallback to multi-header style
    const multi = parseMultiHeaderLossRunTable(rawLines);
    if (multi && multi.rows.length > 0) return multi;

    return null;
  }, [resultText]);

  // QA tab: build flat list of items ordered by first line number (PDF order)
  const qaItems = useMemo(() => {
    if (!structuredData || !structuredData.items) return [];

    return structuredData.items
      .map((item, index) => ({
        item,
        index,
        itemId: buildItemId(item),
        sortKey:
          item.line_numbers && item.line_numbers.length > 0
            ? Math.min(...item.line_numbers)
            : Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [structuredData, buildItemId]);

  // Handle structure document with caching
  const handleStructureDocument = useCallback(async () => {
    if (!whisperHash) return;
    
    // Check cache first
    const cachedData = dataCache[whisperHash];
    if (cachedData && cachedData.structured) {
      console.log("[Workspace] Using cached structured data for whisperHash:", whisperHash);
      setStructuredData(cachedData.structured);
      return;
    }

    setStructureLoading(true);
    setStructureError(null);
    try {
      const flatData = await structureDocument(whisperHash);
      
      // Organize flat items into UI sections
      const organized = organizeStructuredData(flatData.items || []);
      
      // Save to cache (merge with existing cached data)
      cacheData(whisperHash, {
        ...cachedData,
        structured: organized,
      });
      
      setStructuredData(organized);
    } catch (err: any) {
      console.error("[Workspace] Structure error:", err);
      setStructureError(err.message || "Failed to structure document");
    } finally {
      setStructureLoading(false);
    }
  }, [whisperHash, dataCache, cacheData]);

  // Edit mode handlers (used by Structured Data & CN views)

  // Check if there are unsaved changes
  // Save a single structured item value inline
  const handleStructureItemSave = useCallback(
    async (itemId: string, newValue: string) => {
      if (!whisperHash || !structuredData || !structuredData.items) return;

      // Find item index
      const index = structuredData.items.findIndex((it) => buildItemId(it) === itemId);
      if (index === -1) {
          console.warn("[Workspace] Could not find item to save:", itemId);
          return;
      }

      setStructureSavingId(itemId);
      setStructureError(null);

      try {
        // Create updated items list
        const updatedItems = structuredData.items.map((item, idx) =>
          idx === index
            ? {
                ...item,
                value: newValue,
              }
            : item
        );

        console.log(`[Workspace] Saving item ${itemId}: "${newValue}"`);
        
        // Update backend
        const response = await updateStructuredDocument(whisperHash, updatedItems);
        
        // Reorganize
        const organized = organizeStructuredData(response.items || updatedItems);

        // Update state
        setStructuredData(organized);

        // Update cache
        const cachedData = dataCache[whisperHash];
        cacheData(whisperHash, {
          ...cachedData,
          structured: organized,
        });

      } catch (err: any) {
        console.error("[Workspace] Structure save error:", err);
        setStructureError(err.message || "Failed to save change");
      } finally {
        setStructureSavingId(null);
      }
    },
    [whisperHash, structuredData, buildItemId, dataCache, cacheData]
  );

  // Mock data for tables (can be enhanced later)
  const mockTables: ExtractedTable[] = [];

  // QA editing: save a single item's source key + value inline
  const handleQASave = useCallback(
    async (itemId: string, newSourceKey: string, newValue: string) => {
      if (!whisperHash || !structuredData || !structuredData.items) return;

      const index = structuredData.items.findIndex((it) => buildItemId(it) === itemId);
      if (index === -1) return;

      setQaSavingId(itemId);
      setQaError(null);

      try {
        const updatedItems = structuredData.items.map((item, idx) =>
          idx === index
            ? {
                ...item,
                source_key: newSourceKey || item.source_key,
                value: newValue,
              }
            : item
        );

        const response = await updateStructuredDocument(whisperHash, updatedItems);
        const organized = organizeStructuredData(response.items || updatedItems);

        setStructuredData(organized);

        const cachedData = dataCache[whisperHash];
        cacheData(whisperHash, {
          ...cachedData,
          structured: organized,
        });

        setQaEditingId(null);
        setQaDraftValue("");
      } catch (err: any) {
        console.error("[Workspace] QA save error:", err);
        setQaError(err.message || "Failed to save change");
      } finally {
        setQaSavingId(null);
      }
    },
    [whisperHash, structuredData, buildItemId, dataCache, cacheData]
  );

  // QA delete: remove a single row
  const handleQADelete = useCallback(
    async (itemId: string) => {
      if (!whisperHash || !structuredData || !structuredData.items) return;

      setQaDeletingId(itemId);
      setQaError(null);

      try {
        const updatedItems = structuredData.items.filter((it) => buildItemId(it) !== itemId);

        const response = await updateStructuredDocument(whisperHash, updatedItems);
        const organized = organizeStructuredData(response.items || updatedItems);

        setStructuredData(organized);

        const cachedData = dataCache[whisperHash];
        cacheData(whisperHash, {
          ...cachedData,
          structured: organized,
        });

        setQaEditingId(null);
        setQaDraftKey("");
        setQaDraftValue("");

        // Adjust selection index if needed
        if (qaSelectedIndex >= updatedItems.length) {
          setQaSelectedIndex(Math.max(0, updatedItems.length - 1));
        }
      } catch (err: any) {
        console.error("[Workspace] QA delete error:", err);
        setQaError(err.message || "Failed to delete row");
      } finally {
        setQaDeletingId(null);
      }
    },
    [whisperHash, structuredData, buildItemId, dataCache, cacheData, qaSelectedIndex]
  );

  // QA Export: Download current QA data as JSON
  const handleExportQA = useCallback(() => {
    if (!structuredData || !structuredData.items) return;

    try {
      // Create simplified array of key-value pairs
      const exportData = structuredData.items.map(item => ({
        Source_key: item.source_key || "",
        Value: item.value || ""
      }));

      // Create blob and download link
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qa_export_${whisperHash?.substring(0, 8) || "data"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Workspace] Export error:", err);
      // Optional: set some UI error state if needed
    }
  }, [structuredData, whisperHash]);

  // Highlight a specific line id (0-based) using existing highlight API
  // Returns the bounding box if successful, throws error if failed
  const highlightLineById = useCallback(
    async (lineIndex: number): Promise<BoundingBox> => {
      console.log(`[DEBUG] highlightLineById called for lineIndex: ${lineIndex}`);
      
      if (lineIndex == null || lineIndex < 0) {
        throw new Error(`Invalid line index: ${lineIndex}`);
      }
      
      const meta = lineMetadata?.[lineIndex];
      console.log(`[DEBUG] Line ${lineIndex} metadata:`, meta);
      
      if (!meta || !Array.isArray(meta) || meta.length < 4) {
        throw new Error(`No line metadata for index ${lineIndex}`);
      }
      
      const pageZeroBased = meta[0] || 0;
      const base_y = meta[1];
      const height = meta[2];
      const page_height = meta[3];
      const displayPage = pageZeroBased + 1; // viewer uses 1-based
      
      console.log(`[DEBUG] Line ${lineIndex} details:`, {
        pageZeroBased,
        displayPage,
        base_y,
        height,
        page_height,
        rawTextLine: resultText?.split('\n')[lineIndex]?.substring(0, 50) // First 50 chars
      });
      
      const dims = pageDimensions[displayPage];
      if (!dims) {
        throw new Error(`Missing page dimensions for page ${displayPage}`);
      }
      
      console.log(`[DEBUG] Calling API highlight for line ${lineIndex} with dimensions:`, dims);
      
      const rect = await apiHighlight(
        whisperHash!,
        lineIndex,
        Math.round(dims.width),
        Math.round(dims.height)
      );
      
      console.log(`[DEBUG] API returned coordinates for line ${lineIndex}:`, rect);
      
      const pdfPage = rect.page + 1;
      const boundingBox: BoundingBox = {
        x: rect.x1,
        y: rect.y1,
        width: rect.x2 - rect.x1,
        height: rect.y2 - rect.y1,
        page: pdfPage
      };
      
      console.log(`[DEBUG] Final boundingBox for line ${lineIndex}:`, boundingBox);
      
      return boundingBox;
    },
    [lineMetadata, pageDimensions, whisperHash, resultText]
  );

  const handleStructuredHighlight = useCallback(
    async (lineIds: number[], isFirstLine: boolean = true) => {
      if (!lineIds || lineIds.length === 0) return;
      
      // Filter valid line IDs
      const validIds = lineIds.filter(id => typeof id === "number" && id >= 0);
      if (validIds.length === 0) {
        console.warn("[Workspace] No valid line IDs provided for highlighting");
        return;
      }

      console.log(`[Workspace] Highlighting ${validIds.length} line(s):`, validIds);
      console.log(`[DEBUG] Source Refs for these lines:`, validIds.map(id => ({
        lineId: id,
        metadata: lineMetadata?.[id],
        rawText: resultText?.split('\n')[id]?.substring(0, 100)
      })));

      // Clear previous highlights
      setActiveBoundingBox(null);
      setSecondaryHighlights([]);

      // Process all line IDs with Promise.allSettled to handle errors gracefully
      const results = await Promise.allSettled(
        validIds.map(id => highlightLineById(id))
      );

      // Collect successful bounding boxes
      const boundingBoxes: BoundingBox[] = [];
      const failed: Array<{ id: number; reason: string }> = [];

      results.forEach((result, index) => {
        const lineId = validIds[index];
        if (result.status === "fulfilled") {
          boundingBoxes.push(result.value);
        } else {
          const reason = result.reason?.message || String(result.reason) || "Unknown error";
          failed.push({ id: lineId, reason });
          console.warn(`[Workspace] Failed to highlight line ${lineId}:`, reason);
        }
      });

      if (boundingBoxes.length === 0) {
        console.warn("[Workspace] No lines could be highlighted");
        return;
      }

      // First line: full intensity (active highlight with glow)
      const firstBoundingBox = boundingBoxes[0];
      setActiveBoundingBox(firstBoundingBox);

      // Remaining lines: reduced intensity (secondary highlights)
      if (boundingBoxes.length > 1) {
        setSecondaryHighlights(boundingBoxes.slice(1));
        console.log(`[Workspace] Highlighted ${boundingBoxes.length} line(s): first line (full intensity), ${boundingBoxes.length - 1} additional line(s) (reduced intensity)`);
      } else {
        console.log(`[Workspace] Highlighted 1 line (full intensity)`);
      }

      // Scroll to first highlight
      setTimeout(() => {
        const pageElement = document.getElementById(`page_${firstBoundingBox.page}`);
        if (pageElement) {
          const scrollContainer = pageElement.closest('.overflow-auto');
          if (scrollContainer) {
            const canvas = pageElement.querySelector('canvas') as HTMLCanvasElement;
            const pageRect = pageElement.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const canvasRect = canvas?.getBoundingClientRect();
            const canvasOffsetY = canvasRect ? canvasRect.top - pageRect.top : 0;
            const pageTop = pageRect.top - containerRect.top + scrollContainer.scrollTop;
            const targetScrollTop = pageTop + canvasOffsetY + firstBoundingBox.y - (containerRect.height / 2);

            // Determine desired horizontal scroll position
            let targetScrollLeft = scrollContainer.scrollLeft;

            // If QA navigation is active, pan horizontally based on progress (0 = left, 1 = right)
            if (qaHorizontalProgressRef.current != null && previousHighlightLineRef.current != null) {
              const currentLine = previousHighlightLineRef.current;

              // Initialize per-line baseline the first time we scroll for this line.
              // For a new line, always start from the left edge (baselineLeft = 0)
              // so horizontal position fully resets when changing lines.
              if (!qaLineScrollStateRef.current || qaLineScrollStateRef.current.line !== currentLine) {
                qaLineScrollStateRef.current = {
                  line: currentLine,
                  baselineLeft: 0,
                };
              }

              const { baselineLeft } = qaLineScrollStateRef.current;

              // Only scroll horizontally if there's meaningful horizontal overflow
              const maxScrollLeft = Math.max(
                0,
                scrollContainer.scrollWidth - scrollContainer.clientWidth
              );

              if (maxScrollLeft > 32) {
                // Move at most half a viewport width from the baseline so the highlight stays visible
                const maxDelta = scrollContainer.clientWidth * 0.5;
                const rawTarget =
                  baselineLeft + maxDelta * qaHorizontalProgressRef.current;

                // Clamp within scrollable bounds
                targetScrollLeft = Math.min(
                  Math.max(0, rawTarget),
                  maxScrollLeft
                );
              } else {
                targetScrollLeft = baselineLeft;
              }
            }

            scrollContainer.scrollTo({
              top: Math.max(0, targetScrollTop),
              left: targetScrollLeft,
              behavior: 'smooth'
            });
          } else {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 300); // Increased timeout to 300ms to ensure render
    },
    [highlightLineById]
  );

  // QA helpers: select & highlight a QA row
  const highlightQAItem = useCallback(
    (qaIndex: number) => {
      if (!qaItems || qaItems.length === 0) return;

      const clampedIndex = Math.max(0, Math.min(qaIndex, qaItems.length - 1));
      const qaItem = qaItems[clampedIndex];

      setQaSelectedIndex(clampedIndex);

      // Determine primary line for this QA row (first line number)
      const lineNumbers = qaItem.item.line_numbers || [];
      const primaryLine =
        lineNumbers.length > 0 ? Math.min(...lineNumbers) : null;

      if (primaryLine !== null) {
        // Find all QA items that share this primary line
        const sameLineItems = qaItems.filter(({ item }) => {
          const lns = item.line_numbers || [];
          if (!lns.length) return false;
          return Math.min(...lns) === primaryLine;
        });

        const indexInSameLine = sameLineItems.findIndex(
          ({ item }) => item === qaItem.item
        );

        if (sameLineItems.length > 1 && indexInSameLine >= 0) {
          // Progress from 0 (first item on that line) to 1 (last item)
          const progress =
            indexInSameLine / (sameLineItems.length - 1 || 1);
          qaHorizontalProgressRef.current = progress;
        } else {
          // Single item for this line -> keep at left
          qaHorizontalProgressRef.current = 0;
        }

        // If switching to a new line, reset progress state for the new line
        if (previousHighlightLineRef.current !== primaryLine) {
          previousHighlightLineRef.current = primaryLine;
          qaLineScrollStateRef.current = null; // force baseline recompute
        }
      } else {
        qaHorizontalProgressRef.current = null;
        qaLineScrollStateRef.current = null;
      }

      // Ensure selected row is visible in the QA panel
      requestAnimationFrame(() => {
        const row = qaRowRefs.current.get(clampedIndex);
        row?.scrollIntoView({ block: "center", behavior: "smooth" });
      });

      if (qaItem.item.line_numbers && qaItem.item.line_numbers.length > 0) {
        handleStructuredHighlight(qaItem.item.line_numbers, true);
      }
    },
    [qaItems, handleStructuredHighlight]
  );

  // Build searchable index from raw text and structured data
  type SearchResult = {
    type: 'text' | 'structured' | 'st' | 'qa';
    value: string;
    lineNumbers: number[];
    path?: string; // For structured data: section/claim/category/field
    elementId?: string; // For scrolling to element
    tab?: TabType;
  };

  // Handler for Text tab keyboard navigation
  const handleTextKeyDown = (e: React.KeyboardEvent) => {
     if (!layoutTextItems || layoutTextItems.length === 0) return;
     
     let newIndex = textSelectedIndex;
     let changed = false;

     if (e.key === "ArrowDown") {
         e.preventDefault();
         if (newIndex < layoutTextItems.length - 1) {
             newIndex++;
             changed = true;
         }
     } else if (e.key === "ArrowUp") {
         e.preventDefault();
         if (newIndex > 0) {
             newIndex--;
             changed = true;
         }
     }
     
     if (changed) {
         setTextSelectedIndex(newIndex);
         const item = layoutTextItems[newIndex];
         
         // Scroll item into view
         const el = textItemRefs.current.get(newIndex);
         el?.scrollIntoView({ block: "center", behavior: "smooth" });
         
         // Trigger highlight (using existing click handler logic effectively)
         // We reuse the click logic but programmatically
         // Extract line index from item.id (format: "line-{index}")
         const lineIndexMatch = item.id.match(/line-(\d+)/);
         const lineIndex = lineIndexMatch ? parseInt(lineIndexMatch[1], 10) : newIndex;
         
         // Highlight
         highlightLineById(lineIndex).then((bbox) => {
              setActiveBoundingBox(bbox);
              // Scroll PDF to highlight
              setTimeout(() => {
                  const pageElement = document.getElementById(`page_${bbox.page}`);
                  if (pageElement) {
                      pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
              }, 150);
         }).catch(err => console.warn("Highlight failed", err));
     }
  };

  const searchIndex = useMemo((): SearchResult[] => {
    const searchIndexArray: SearchResult[] = [];

    // Index raw text
    if (layoutTextItems && layoutTextItems.length > 0) {
      layoutTextItems.forEach((item, itemIndex) => {
        if (item.text && item.text.trim()) {
          // Use array index which corresponds to line number
          searchIndexArray.push({
            type: 'text',
            value: item.text,
            lineNumbers: [itemIndex],
            elementId: item.id,
          });
        }
      });
    }

    // Index structured data (Accordion View)
    if (structuredData && structuredData.sections) {
      const { sections } = structuredData;

      // Helper function to classify field key (same as in StructuredDataViewer)
      const classifyFieldKey = (key: string): string => {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey.includes("date") || normalizedKey.includes("reported") || normalizedKey.includes("notification")) {
          return "Dates";
        }
        if (normalizedKey.includes("paid") || normalizedKey.includes("incurred") || normalizedKey.includes("reserve") || normalizedKey.includes("amount") || normalizedKey.includes("total")) {
          return "Financials";
        }
        if (normalizedKey.includes("claimant") || normalizedKey.includes("insured") || normalizedKey.includes("party")) {
          return "Parties";
        }
        if (normalizedKey.includes("description") || normalizedKey.includes("desc") || normalizedKey.includes("cause") || (normalizedKey.includes("loss") && !normalizedKey.includes("date"))) {
          return "Description";
        }
        return "Other";
      };

      // Index Claims
      if (sections.Claims) {
        sections.Claims.forEach((claim, claimIdx) => {
          // Get Claim Number for stable ID
          const claimNumberValues = claim["Claim Number"] || claim["Claim #"] || [];
          const claimNumber = claimNumberValues.length > 0 
            ? claimNumberValues[0].value 
            : `${claimIdx + 1}`;
          
          Object.entries(claim).forEach(([key, values]) => {
            const category = classifyFieldKey(key);
            values.forEach((item) => {
              if (item.value && item.value.trim()) {
                searchIndexArray.push({
                  type: 'structured',
                  value: item.value,
                  lineNumbers: item.line_numbers || [],
                  path: `Claims/Claim ${claimNumber}/${category}/${key}`,
                  elementId: `claim-${claimNumber}-${key}`,
                  tab: 'tables'
                });
              }
            });
          });
        });
      }

      // Index Policy Info
      if (sections["Policy Info"]) {
        Object.entries(sections["Policy Info"]).forEach(([key, values]) => {
          values.forEach((item) => {
            if (item.value && item.value.trim()) {
              searchIndexArray.push({
                type: 'structured',
                value: item.value,
                lineNumbers: item.line_numbers || [],
                path: `Policy Info/${key}`,
                elementId: `policy-info-${key}`,
                tab: 'tables'
              });
            }
          });
        });
      }

      // Index Summary
      if (sections.Summary) {
        Object.entries(sections.Summary).forEach(([key, values]) => {
          values.forEach((item) => {
            if (item.value && item.value.trim()) {
              searchIndexArray.push({
                type: 'structured',
                value: item.value,
                lineNumbers: item.line_numbers || [],
                path: `Summary/${key}`,
                elementId: `summary-${key}`,
                tab: 'tables'
              });
            }
          });
        });
      }

      // Index Report Info
      if (sections["Report Info"]) {
        Object.entries(sections["Report Info"]).forEach(([key, values]) => {
          values.forEach((item) => {
            if (item.value && item.value.trim()) {
              searchIndexArray.push({
                type: 'structured',
                value: item.value,
                lineNumbers: item.line_numbers || [],
                path: `Report Info/${key}`,
                elementId: `report-info-${key}`,
                tab: 'tables'
              });
            }
          });
        });
      }

      // Index Other
      if (sections.Other) {
        Object.entries(sections.Other).forEach(([key, values]) => {
          values.forEach((item) => {
            if (item.value && item.value.trim()) {
              searchIndexArray.push({
                type: 'structured',
                value: item.value,
                lineNumbers: item.line_numbers || [],
                path: `Other/${key}`,
                elementId: `other-${key}`,
                tab: 'tables'
              });
            }
          });
        });
      }
    }

    // Index QA Items
    if (qaItems && qaItems.length > 0) {
      qaItems.forEach(({ item, index }) => {
        if (item.value && item.value.trim()) {
          searchIndexArray.push({
            type: 'qa',
            value: item.value,
            lineNumbers: item.line_numbers || [],
            elementId: `qa-row-${index}`,
            tab: 'qa'
          });
        }
        if (item.source_key && item.source_key.trim()) {
           searchIndexArray.push({
            type: 'qa',
            value: item.source_key,
            lineNumbers: item.line_numbers || [],
            elementId: `qa-row-${index}`,
            tab: 'qa'
          });
        }
      });
    }

    // Index ST Rows
    if (stRows && stRows.length > 0) {
      stRows.forEach((table) => {
         table.rows.forEach((row, rowIndex) => {
             row.forEach((cell, cellIndex) => {
                 if (cell.value && cell.value.trim()) {
                     searchIndexArray.push({
                         type: 'st',
                         value: cell.value,
                         lineNumbers: cell.lineIndices || [],
                         elementId: `st-cell-${rowIndex}-${cellIndex}`,
                         tab: 'st'
                     });
                 }
             });
         });
      });
    }

    return searchIndexArray;
  }, [layoutTextItems, structuredData, lineMetadata, qaItems, stRows]);

  // Search functionality
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return searchIndex.filter(item => 
      item.value.toLowerCase().includes(query)
    );
  }, [searchQuery, searchIndex]);

  // When switching to QA tab, auto-focus the QA container and highlight the first row
  useEffect(() => {
    if (activeTab !== "qa") return;
    if (!qaItems || qaItems.length === 0) return;

    const initialIndex = Math.min(qaSelectedIndex, qaItems.length - 1);
    highlightQAItem(initialIndex);

    requestAnimationFrame(() => {
      qaContainerRef.current?.focus();
    });
  }, [activeTab, qaItems, qaSelectedIndex, highlightQAItem]);

  // When switching to ST tab, auto-select and highlight the first row
  useEffect(() => {
    if (activeTab !== "st" || !stTable || !stTable.rows.length) return;

    if (stRows && stRows.length > 0 && stRows[0].rows.length > 0) {
        // Use backend rows if available
        const initial = Math.min(stSelectedIndex, stRows[0].rows.length - 1);
        setStSelectedIndex(initial);
        // Reset column if needed or keep it
        setStSelectedColIndex(prev => Math.min(prev, stRows[0].headers.length - 1));

        const row = stRows[0].rows[initial];
        // Trigger highlight if row has line indices (check first available cell if needed?)
        // Actually, we highlight the specific cell if possible, or just the row
        // For standard "row" highlight, we can use the line indices from any cell or aggregate
        
        // Simulating row highlight for now by picking a representative cell with lines
        const cellWithLines = row.find(c => c.lineIndices && c.lineIndices.length > 0);
        if (cellWithLines) {
           handleStructuredHighlight(cellWithLines.lineIndices, true);
        }

        requestAnimationFrame(() => {
            const el = stRowRefs.current.get(initial);
            el?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
    }
    
    // Fallback or secondary (local stTable logic if separate) - keeping original logic as backup or if used differently
    // The original code used stTable (local parse) vs stRows (backend)
    // We should prioritize stRows (backend) if that's what's being displayed
  }, [activeTab, stRows, stSelectedIndex, handleStructuredHighlight]);

  // Handler for ST keyboard navigation
  const handleStKeyDown = (e: React.KeyboardEvent) => {
      if (!stRows || stRows.length === 0 || stRows[0].rows.length === 0) return;
      
      const currentTable = stRows[0];
      const rows = currentTable.rows;
      const headers = currentTable.headers;
      
      let newRowIndex = stSelectedIndex;
      let newColIndex = stSelectedColIndex;
      let changed = false;

      if (e.key === "ArrowDown") {
          e.preventDefault();
          if (newRowIndex < rows.length - 1) {
              newRowIndex++;
              changed = true;
          }
      } else if (e.key === "ArrowUp") {
           e.preventDefault();
           if (newRowIndex > 0) {
               newRowIndex--;
               changed = true;
           }
      } else if (e.key === "ArrowRight") {
          e.preventDefault();
          if (newColIndex < headers.length - 1) {
              newColIndex++;
              changed = true;
          }
      } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (newColIndex > 0) {
              newColIndex--;
              changed = true;
          }
      }

      if (changed) {
          setStSelectedIndex(newRowIndex);
          setStSelectedColIndex(newColIndex);
          
          const row = rows[newRowIndex];
          const cell = row[newColIndex];
          
          // Scroll cell into view (handles both X and Y)
          const cellId = `st-cell-${newRowIndex}-${newColIndex}`;
          const cellEl = document.getElementById(cellId);
          if (cellEl) {
               cellEl.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          } else {
               // Fallback
               const el = stRowRefs.current.get(newRowIndex);
               el?.scrollIntoView({ block: "center", behavior: "smooth" });
          }
          
          // Trigger PDF highlight
          if (cell && cell.lineIndices && cell.lineIndices.length > 0) {
               handleStructuredHighlight(cell.lineIndices, true);
          }
      }
  };

  // Derive search-expanded accordions from search results (temporary, only when search is active)
  const searchExpandedAccordions = useMemo(() => {
    if (!searchQuery.trim() || searchResults.length === 0) return [];
    
    const accordionIds: string[] = [];
    
    // Collect all unique accordion IDs from search results
    searchResults.forEach(result => {
      if (result.type === 'structured' && result.path) {
        const pathParts = result.path.split('/');
        
        if (pathParts[0] === 'Claims') {
          const claimMatch = pathParts[1]?.match(/Claim (\d+)/);
          if (claimMatch) {
            const claimNumber = claimMatch[1];
            accordionIds.push(`claim-${claimNumber}`);
            
            // Category is in pathParts[2]
            if (pathParts[2]) {
              const category = pathParts[2].toLowerCase();
              accordionIds.push(`claim-${claimNumber}-category-${category}`);
            }
          }
        } else {
          const sectionName = pathParts[0]?.toLowerCase().replace(/\s+/g, '-');
          if (sectionName) {
            accordionIds.push(sectionName);
          }
        }
      }
    });
    
    return [...new Set(accordionIds)];
  }, [searchQuery, searchResults]);

  // Effective accordion state: merge user + search when search is active
  const effectiveExpandedAccordions = useMemo(() => {
    if (searchQuery.trim() && searchExpandedAccordions.length > 0) {
      // Merge user and search accordions, with search taking precedence
      return [...new Set([...userExpandedAccordions, ...searchExpandedAccordions])];
    }
    // When no search, only use user-controlled state
    return userExpandedAccordions;
  }, [userExpandedAccordions, searchExpandedAccordions, searchQuery]);

  // Handle search - scroll to first result in ACTIVE tab
  useEffect(() => {
    if (!searchQuery.trim() || searchResults.length === 0) return;
    
    // Find the first result that matches the ACTIVE tab
    const activeTabResult = searchResults.find(r => {
        if (activeTab === 'text') return r.type === 'text';
        if (activeTab === 'tables') return r.type === 'structured';
        if (activeTab === 'qa') return r.type === 'qa';
        if (activeTab === 'st') return r.type === 'st';
        return false;
    });

    // If no result in current tab, maybe fallback to first result (and let auto-switch handle it)?
    // But user asks for "when switch between tabs... automatically show".
    // So if I'm in QA, show QA result. If I switch to ST, show ST result (if any).
    
    const resultToScroll = activeTabResult || searchResults[0];

    // Scroll logic
    if (resultToScroll) {
       // Only scroll if the result is actually visible in the current tab
       // Or if we need to switch tabs (handled by auto-switch effect below)
       
       const isVisibleInCurrentTab = 
          (activeTab === 'text' && resultToScroll.type === 'text') ||
          (activeTab === 'tables' && resultToScroll.type === 'structured') ||
          (activeTab === 'qa' && resultToScroll.type === 'qa') ||
          (activeTab === 'st' && resultToScroll.type === 'st');

       if (isVisibleInCurrentTab) {
          setTimeout(() => {
              if (resultToScroll.elementId) {
                  let element = document.getElementById(resultToScroll.elementId);
                  
                  // Fallback for data attributes if ID not found directly
                  if (!element) {
                      element = document.querySelector(`[data-search-id="${resultToScroll.elementId}"]`);
                  }
                  
                  // Specific container refs check
                  if (!element && activeTab === 'qa' && qaContainerRef.current) {
                      // QA rows are looked up by ID `qa-row-X` which we added
                      element = document.getElementById(resultToScroll.elementId);
                  }
                  
                  if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      // Add temporary highlight class
                      element.classList.add('bg-yellow-500/20');
                      setTimeout(() => element?.classList.remove('bg-yellow-500/20'), 2000);
                      
                      // Simulate click or trigger highlight actions
                      if (activeTab === 'qa' && resultToScroll.type === 'qa') {
                         // Find index from ID "qa-row-X"
                         const match = resultToScroll.elementId.match(/qa-row-(\d+)/);
                         if (match) {
                             const idx = parseInt(match[1]);
                             highlightQAItem(idx);
                         }
                      }
                  }
              }
          }, 300); // 300ms delay to allow tab render
          
          // PDF Highlight
          if (resultToScroll.lineNumbers && resultToScroll.lineNumbers.length > 0) {
              handleStructuredHighlight(resultToScroll.lineNumbers, true);
          }
       }
    }
  }, [searchQuery, searchResults, activeTab, handleStructuredHighlight, highlightQAItem]);

  // Auto-switch tab based on search results
  useEffect(() => {
    if (!searchQuery.trim() || searchResults.length === 0) return;
    
    // Determine the best tab to switch to based on results
    // Priority: ST > Tables > QA > Text (if multiple matches)
    const hasSt = searchResults.some(r => r.type === 'st');
    const hasStructured = searchResults.some(r => r.type === 'structured');
    const hasQa = searchResults.some(r => r.type === 'qa');
    const hasText = searchResults.some(r => r.type === 'text');
    
    // Only switch if current tab has NO results
    const currentTabHasResults = 
        (activeTab === 'st' && hasSt) ||
        (activeTab === 'tables' && hasStructured) ||
        (activeTab === 'qa' && hasQa) ||
        (activeTab === 'text' && hasText);
        
    if (!currentTabHasResults) {
        if (hasSt) setActiveTab('st');
        else if (hasStructured) setActiveTab('tables');
        else if (hasQa) setActiveTab('qa');
        else if (hasText) setActiveTab('text');
    }
  }, [searchQuery, searchResults]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "text":
        return (
          <div 
             className="outline-none" 
             tabIndex={0} 
             onKeyDown={handleTextKeyDown}
             ref={extractedTextPanelRef} // Ref moves to wrapper to capture focus
          >
          <ExtractedTextPanel
            items={layoutTextItems}
            onItemHover={handleItemHover}
            onItemClick={(bbox, item, index) => {
                handleItemClick(bbox, item, index);
                setTextSelectedIndex(index); // Sync selection on click
            }}
            searchQuery={searchQuery}
            selectedIndex={textSelectedIndex}
            onItemRef={(index, el) => {
                const map = textItemRefs.current;
                if (el) map.set(index, el);
                else map.delete(index);
            }}
          />
          </div>
        );
      case "tables":
        return (
          <div className="space-y-4 min-w-[720px]">
            {!structuredData && !structureError && (
              <div className="text-sm text-muted-foreground">
                Run "Analyze with AI" to view structured data.
              </div>
            )}
            {structureError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="text-sm font-semibold text-destructive mb-2">Error</div>
                <p className="text-sm text-destructive">{structureError}</p>
                <Button
                  onClick={handleStructureDocument}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            )}
            {structuredData && structuredData.sections && structuredData.items && (
              <StructuredDataViewer
                sections={structuredData.sections}
                skipped_items={[]} // No skipped items in new format - everything is preserved
                onHighlight={handleStructuredHighlight}
                expandedAccordions={effectiveExpandedAccordions}
                onAccordionChange={setUserExpandedAccordions}
                searchQuery={searchQuery}
                onSave={handleStructureItemSave}
                savingId={structureSavingId}
                items={structuredData.items}
              />
            )}
          </div>
        );
      case "cn":
        return (
          <div className="space-y-4 min-w-[720px]">
            {!structuredData && !structureError && (
              <div className="text-sm text-muted-foreground">
                Run "Analyze with AI" to view canonical name data.
              </div>
            )}
            {structureError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="text-sm font-semibold text-destructive mb-2">Error</div>
                <p className="text-sm text-destructive">{structureError}</p>
                <Button
                  onClick={handleStructureDocument}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            )}
            {structuredData && structuredData.items && (
              <CanonicalNameViewer
                items={structuredData.items}
                onHighlight={handleStructuredHighlight}
                expandedAccordions={effectiveExpandedAccordions}
                onAccordionChange={setUserExpandedAccordions}
                onSave={handleStructureItemSave}
                savingId={structureSavingId}
              />
            )}
          </div>
        );
      case "qa":
        return (
          <div
            ref={qaContainerRef}
            tabIndex={0}
            className="space-y-4 min-w-[720px] outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!qaItems || qaItems.length === 0) return;
                const delta = e.key === "ArrowDown" ? 1 : -1;
                highlightQAItem(qaSelectedIndex + delta);
              }
            }}
          >
            {!structuredData && !structureError && (
              <div className="text-sm text-muted-foreground">
                Run "Analyze with AI" to view QA data.
              </div>
            )}
            {structureError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="text-sm font-semibold text-destructive mb-2">Error</div>
                <p className="text-sm text-destructive">{structureError}</p>
                <Button
                  onClick={handleStructureDocument}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            )}
            {qaError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-2 text-sm text-destructive">
                {qaError}
              </div>
            )}
            {qaItems && qaItems.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left p-2 font-semibold text-muted-foreground w-[30%]">
                        Source Key
                      </th>
                      <th className="text-left p-2 font-semibold text-muted-foreground">
                        Value
                      </th>
                      <th className="w-[60px] p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {qaItems.map(({ item, itemId }, index) => {
                      const isSelected = index === qaSelectedIndex;
                      const isEditing = qaEditingId === itemId;
                      const displayValue = item.value || "(no value)";

                      return (
                        <tr
                          key={itemId + index}
                          id={`qa-row-${index}`}
                          ref={(el) => {
                            const map = qaRowRefs.current;
                            if (el) {
                              map.set(index, el);
                            } else {
                              map.delete(index);
                            }
                          }}
                          className={cn(
                            "border-b border-border/20 hover:bg-muted/50 cursor-pointer",
                            isSelected && "bg-primary/5"
                          )}
                          onClick={() => highlightQAItem(index)}
                        >
                          <td className="p-2 text-muted-foreground whitespace-nowrap">
                            {isEditing ? (
                              <Input
                                value={qaDraftKey}
                                onChange={(e) => setQaDraftKey(e.target.value)}
                                className="text-sm"
                                placeholder="Source key"
                                autoFocus
                              />
                            ) : (
                              item.source_key || "(no key)"
                            )}
                          </td>
                          <td className="p-2">
                            {isEditing ? (
                              <Input
                                value={qaDraftValue}
                                onChange={(e) => setQaDraftValue(e.target.value)}
                                className="text-sm"
                              />
                            ) : (
                              <span className="break-words">
                                {displayValue}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-green-500 hover:text-green-600"
                                  disabled={qaSavingId === itemId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQASave(itemId, qaDraftKey, qaDraftValue);
                                  }}
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive/90"
                                  disabled={qaSavingId === itemId || qaDeletingId === itemId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQaEditingId(null);
                                    setQaDraftKey("");
                                    setQaDraftValue("");
                                    setQaError(null);
                                  }}
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-destructive hover:text-destructive/90"
                                      disabled={qaSavingId === itemId || qaDeletingId === itemId}
                                      onClick={(e) => e.stopPropagation()}
                                      title="Delete row"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete this row?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will remove the selected source key and value from the structured data. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQADelete(itemId);
                                        }}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQaEditingId(itemId);
                                  setQaDraftKey(item.source_key || "");
                                  setQaDraftValue(displayValue);
                                  setQaError(null);
                                }}
                                title="Edit row"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      case "st":
        // Use StructuredTablePanel with data from backend
        return (
           <div 
             className="space-y-4 min-w-[720px] outline-none"
             tabIndex={0}
             onKeyDown={handleStKeyDown}
           > 
              {!stRows && !stLoading && (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground bg-muted/20 rounded-xl border border-border/50">
                  <Table className="w-12 h-12 mb-4 opacity-20" />
                  <p className="mb-4">No structured table data available.</p>
                  <Button 
                    variant="outline" 
                    onClick={handleFetchStRows}
                    disabled={stLoading}
                  >
                     <RotateCcw className="w-4 h-4 mr-2" />
                     Load Tables
                  </Button>
                </div>
              )}
              
              {stLoading && (
                 <div className="flex items-center justify-center p-12">
                   <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
                 </div>
              )}

              {stRows && stRows.length > 0 && (
                <StructuredTablePanel
                  tables={stRows}
                  onTableHover={(bbox) => handleStructuredHighlight(bbox ? [bbox.page + 1] : [], false)} // Approximate hover highlight
                  onCellClick={(cell) => {
                      if (cell && cell.lineIndices && cell.lineIndices.length > 0) {
                           handleStructuredHighlight(cell.lineIndices, true);
                      }
                      
                      // Update selection on click
                      if (stRows && stRows.length > 0) {
                          // Find row and col index for this cell
                          // This is a bit inefficient (O(N*M)), but fine for typical table sizes
                          // Alternatively, we could pass indices in the cell object or from the child component
                          stRows[0].rows.forEach((r, rIdx) => {
                             r.forEach((c, cIdx) => {
                                 if (c === cell) {
                                     setStSelectedIndex(rIdx);
                                     setStSelectedColIndex(cIdx);
                                 }
                             });
                          });
                      }
                  }}
                  selectedRowIndex={stSelectedIndex}
                  selectedColIndex={stSelectedColIndex}
                  onRowRef={(index, el) => {
                      const map = stRowRefs.current;
                      if (el) map.set(index, el);
                      else map.delete(index);
                  }}
                />
              )}
           </div>
        );

      case "result":
        return <ResultTab onHighlight={(lines) => handleStructuredHighlight(lines, true)} />;
      case "compare":
        return <ComparisonTab whisperHash={whisperHash} onHighlight={(lines) => handleStructuredHighlight(lines, true)} />;
    }
  };



  if (!whisperHash) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No document hash provided. Redirecting...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading document data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">Error: {error}</p>
        </div>
      </div>
    );
  }

  const documentUrl = `${API_BASE}/document/${whisperHash}`;
  const fileType = guessFileType(fileName);
  const isPdf = fileType === 'pdf';

  return (
    <div className="min-h-screen pt-16">
      <ComparisonProvider whisperHash={whisperHash}>
      <TwoPaneLayout
        leftPane={
          isPdf ? (
            <PDFViewerWrapper
              documentId={whisperHash}
              pdfUrl={documentUrl}
              highlights={allHighlights}
              activeHighlight={activeBoundingBox}
              onPageDimensions={handlePageDimensions}
            />
          ) : (
            <DocumentViewer
              fileUrl={documentUrl}
              fileType={fileType}
              highlights={highlightRects}
              onPageDimensions={handlePageDimensions}
            />
          )
        }
        rightPane={
          <div className="h-full flex flex-col bg-background" ref={rightPaneRef}>
            {/* Header with file selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border/50">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileSelectorDropdown
                  files={documents
                    .filter((d) => d.status === "complete" && d.whisperHash)
                    .map((d) => ({
                      id: d.whisperHash!,
                      name: d.fileName || d.name,
                    }))}
                  selectedId={whisperHash || ""}
                  onSelect={(hash) => {
                    // Find document by hash
                    const doc = documents.find((d) => d.whisperHash === hash);
                    if (doc) {
                      setActiveDocument(doc.id);
                      setSearchParams(
                        { whisper_hash: hash, fileName: doc.fileName || doc.name },
                        { replace: true }
                      );
                    }
                  }}
                  onRemove={(hash) => {
                    // Find document by hash and remove it
                    const doc = documents.find((d) => d.whisperHash === hash);
                    if (doc) {
                      removeDocument(doc.id);
                      // If this was the active document, the context will auto-select another
                      // If no documents left, the sync effect will redirect to upload
                    }
                  }}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground hover:text-destructive shrink-0"
                      title="Clear all files and reset session"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden sm:inline">Reset Session</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset Session</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to reset the session? This will clear all uploaded files and their extracted data. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await apiResetSession();
                            clearDocuments();
                            navigate("/upload");
                          } catch (err) {
                            console.error("Failed to reset session:", err);
                            // Still clear local state? Maybe better to warn user.
                            // For now, proceed with clearing local state as fallback
                            clearDocuments();
                            navigate("/upload");
                          }
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Reset Session
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end w-full sm:w-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  title="Enter fullscreen"
                  onClick={async () => {
                    if (!rightPaneRef.current) return;
                    try {
                      if (rightPaneRef.current.requestFullscreen) {
                        await rightPaneRef.current.requestFullscreen();
                      } else if ((rightPaneRef.current as any).webkitRequestFullscreen) {
                        await (rightPaneRef.current as any).webkitRequestFullscreen();
                      }
                    } catch (err) {
                      console.error("[Workspace] Fullscreen error:", err);
                    }
                  }}
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
                {structuredData && structuredData.items && structuredData.items.length > 0 && activeTab !== "qa" && (
                  <>
                    {/* Row-level editing is now enabled by default */}
                  </>
                )}
                {activeTab === "qa" && structuredData?.items && structuredData.items.length > 0 && (
                  <Button
                    onClick={handleExportQA}
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0 whitespace-nowrap"
                    title="Export QA data to JSON"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Export JSON</span>
                  </Button>
                )}
                <Button
                  onClick={handleStructureDocument}
                  disabled={structureLoading || !resultText}
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0 whitespace-nowrap"
                >
                  {structureLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="hidden sm:inline">Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span className="hidden sm:inline">Analyze with AI</span>
                      <span className="sm:hidden">Analyze</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Tabs and Search */}
            <div className="flex items-center justify-between gap-4 p-4 border-b border-border/50">
              {/* Tabs */}
              <div className="flex items-center gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                      activeTab === tab.id
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/30"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                ))}
              </div>
              
              {/* Search Input */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {searchResults.length > 0 
                      ? `${searchResults.length} ${searchResults.length === 1 ? 'result' : 'results'}`
                      : 'No results'}
                  </div>
                )}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full"
                >
                  {activeTab === 'text' ? (
                    <div ref={extractedTextPanelRef}>
                      {renderTabContent()}
                    </div>
                  ) : (
                    <div ref={structuredDataViewerRef}>
                      {renderTabContent()}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        }
      />
      </ComparisonProvider>
    </div>
  );
}
