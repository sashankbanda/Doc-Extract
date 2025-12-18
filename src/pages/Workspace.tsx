import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FileText, Table, Sparkles, Loader2, RotateCcw, Search, X, Hash, Edit2, Save, XCircle, Maximize2, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { TwoPaneLayout } from "@/components/workspace/TwoPaneLayout";
import { FileSelectorDropdown } from "@/components/workspace/FileSelectorDropdown";
import { PDFViewerWrapper } from "@/components/workspace/PDFViewerWrapper";
import { ExtractedTextPanel } from "@/components/workspace/ExtractedTextPanel";
import { StructuredTablePanel } from "@/components/workspace/StructuredTablePanel";
import { BoundingBox, LayoutText, ExtractedTable } from "@/types/document";
import { apiRetrieve, apiHighlight, API_BASE, structureDocument, getStructuredDocument, updateStructuredDocument, StructuredDataResponse, OrganizedStructuredData, StructuredItem } from "@/lib/api";
import { organizeStructuredData } from "@/lib/organizeStructuredData";
import DocumentViewer, { guessFileType } from "@/components/DocumentViewer";
import StructuredDataViewer from "@/components/StructuredDataViewer";
import CanonicalNameViewer from "@/components/CanonicalNameViewer";
import { useDocumentContext } from "@/context/DocumentContext";

type TabType = "text" | "tables" | "cn" | "qa";

const tabs: { id: TabType; label: string; icon: typeof FileText }[] = [
  { id: "text", label: "Raw Text", icon: FileText },
  { id: "tables", label: "Structured Data", icon: Table },
  { id: "cn", label: "CN", icon: Hash },
  { id: "qa", label: "QA", icon: Sparkles },
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
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [editedItems, setEditedItems] = useState<Map<string, StructuredItem>>(new Map());
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const structuredDataViewerRef = useRef<HTMLDivElement>(null);
  const extractedTextPanelRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const qaContainerRef = useRef<HTMLDivElement>(null);
  const qaRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [qaSelectedIndex, setQaSelectedIndex] = useState<number>(0);
  const [qaEditingId, setQaEditingId] = useState<string | null>(null);
  const [qaDraftKey, setQaDraftKey] = useState<string>("");
  const [qaDraftValue, setQaDraftValue] = useState<string>("");
  const [qaSavingId, setQaSavingId] = useState<string | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaDeletingId, setQaDeletingId] = useState<string | null>(null);

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
  const handleEditModeToggle = useCallback(() => {
    if (isEditMode) {
      // Cancel edit mode - discard changes
      setEditedItems(new Map());
      setIsEditMode(false);
    } else {
      // Enter edit mode
      setIsEditMode(true);
    }
  }, [isEditMode]);

  const handleItemValueChange = useCallback((itemId: string, newValue: string) => {
    if (!structuredData || !structuredData.items) return;
    
    const item = structuredData.items.find((it) => buildItemId(it) === itemId);
    
    if (!item) return;
    
    setEditedItems((prev) => {
      const updated = new Map(prev);
      updated.set(itemId, {
        ...item,
        value: newValue,
      });
      return updated;
    });
  }, [structuredData]);

  const handleSaveChanges = useCallback(async () => {
    if (!whisperHash || !structuredData || !structuredData.items) return;
    
    setIsSaving(true);
    try {
      // Merge edited items with original items
      const updatedItems = structuredData.items.map((item) => {
        const itemId = buildItemId(item);
        const editedItem = editedItems.get(itemId);
        return editedItem || item;
      });
      
      // Update backend
      await updateStructuredDocument(whisperHash, updatedItems);
      
      // Reorganize with updated items
      const organized = organizeStructuredData(updatedItems);
      
      // Update state and cache
      setStructuredData(organized);
      const cachedData = dataCache[whisperHash];
      cacheData(whisperHash, {
        ...cachedData,
        structured: organized,
      });
      
      // Clear edited items and exit edit mode
      setEditedItems(new Map());
      setIsEditMode(false);
    } catch (err: any) {
      console.error("[Workspace] Save changes error:", err);
      setStructureError(err.message || "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }, [whisperHash, structuredData, editedItems, dataCache, cacheData]);

  // Get edited item value or original
  const getItemValue = useCallback((item: StructuredItem | { value: string; line_numbers: number[]; source_key?: string }, itemId?: string): string => {
    if (!itemId) {
      // Fallback: create ID from item
      const structuredItem = item as StructuredItem;
      itemId = buildItemId(structuredItem);
    }
    const editedItem = editedItems.get(itemId);
    return editedItem ? editedItem.value : item.value;
  }, [editedItems]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = editedItems.size > 0;

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
            
            scrollContainer.scrollTo({
              top: Math.max(0, targetScrollTop),
              left: scrollContainer.scrollLeft,
              behavior: 'smooth'
            });
          } else {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 150);
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

      // Ensure selected row is visible in the QA panel
      requestAnimationFrame(() => {
        const row = qaRowRefs.current.get(clampedIndex);
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });

      if (qaItem.item.line_numbers && qaItem.item.line_numbers.length > 0) {
        handleStructuredHighlight(qaItem.item.line_numbers, true);
      }
    },
    [qaItems, handleStructuredHighlight]
  );

  // Build searchable index from raw text and structured data
  type SearchResult = {
    type: 'text' | 'structured';
    value: string;
    lineNumbers: number[];
    path?: string; // For structured data: section/claim/category/field
    elementId?: string; // For scrolling to element
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

    // Index structured data
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
              });
            }
          });
        });
      }
    }

    return searchIndexArray;
  }, [layoutTextItems, structuredData, lineMetadata]);

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

  // Handle search - when user types, auto-navigate to first result
  useEffect(() => {
    if (!searchQuery.trim() || searchResults.length === 0) return;
    
    const firstResult = searchResults[0];
    
    // Scroll to element after accordions expand
    if (firstResult.type === 'structured') {
      setTimeout(() => {
        if (firstResult.elementId && structuredDataViewerRef.current) {
          const element = document.querySelector(`[data-search-id="${firstResult.elementId}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 300);
      
      // Highlight in PDF
      if (firstResult.lineNumbers && firstResult.lineNumbers.length > 0) {
        handleStructuredHighlight(firstResult.lineNumbers, true);
      }
    } else if (firstResult.type === 'text') {
      // Scroll to line in raw text
      setTimeout(() => {
        if (firstResult.elementId && extractedTextPanelRef.current) {
          const element = document.getElementById(firstResult.elementId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
      
      // Highlight in PDF
      if (firstResult.lineNumbers && firstResult.lineNumbers.length > 0) {
        const lineIndex = firstResult.lineNumbers[0];
        if (lineMetadata && lineMetadata[lineIndex]) {
          highlightLineById(lineIndex)
            .then(bbox => {
              setActiveBoundingBox(bbox);
              setTimeout(() => setActiveBoundingBox(null), 5000);
            })
            .catch(e => {
              console.warn("[Workspace] Failed to highlight line:", e);
            });
        }
      }
    }
  }, [searchQuery, searchResults, handleStructuredHighlight, highlightLineById, lineMetadata]);

  // Auto-switch tab based on search results
  useEffect(() => {
    if (!searchQuery.trim() || searchResults.length === 0) return;
    
    const hasStructured = searchResults.some(r => r.type === 'structured');
    const hasText = searchResults.some(r => r.type === 'text');
    
    if (hasStructured && !hasText) {
      setActiveTab('tables');
    } else if (hasText && !hasStructured) {
      setActiveTab('text');
    } else if (hasStructured && hasText) {
      // If both exist, prefer structured data
      setActiveTab('tables');
    }
  }, [searchQuery, searchResults]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "text":
        return (
          <ExtractedTextPanel
            items={layoutTextItems}
            onItemHover={handleItemHover}
            onItemClick={handleItemClick}
            searchQuery={searchQuery}
          />
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
                isEditMode={isEditMode}
                onValueChange={handleItemValueChange}
                getItemValue={getItemValue}
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
                isEditMode={isEditMode}
                onValueChange={handleItemValueChange}
                getItemValue={getItemValue}
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
                      <th className="text-left p-2 font-semibold text-muted-foreground">
                        Source Key
                      </th>
                      <th className="text-left p-2 font-semibold text-muted-foreground">
                        Value
                      </th>
                      <th className="w-24 p-2" />
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
          <div className="h-full flex flex-col" ref={rightPaneRef}>
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
                        onClick={() => {
                          clearDocuments();
                          navigate("/upload");
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
                    {!isEditMode ? (
                      <Button
                        onClick={handleEditModeToggle}
                        variant="outline"
                        size="sm"
                        className="gap-2 whitespace-nowrap"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={handleSaveChanges}
                          disabled={isSaving || !hasUnsavedChanges}
                          variant="default"
                          size="sm"
                          className="gap-2 whitespace-nowrap"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="hidden sm:inline">Saving...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span className="hidden sm:inline">Save Changes</span>
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleEditModeToggle}
                          variant="outline"
                          size="sm"
                          className="gap-2 whitespace-nowrap"
                          disabled={isSaving}
                        >
                          <XCircle className="w-4 h-4" />
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                      </>
                    )}
                  </>
                )}
                <Button
                  onClick={handleStructureDocument}
                  disabled={structureLoading || !resultText || isEditMode}
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
                  className="min-w-max"
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
    </div>
  );
}
