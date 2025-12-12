import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FileText, Table, Tag, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TwoPaneLayout } from "@/components/workspace/TwoPaneLayout";
import { FileSelectorDropdown } from "@/components/workspace/FileSelectorDropdown";
import { PDFViewerWrapper } from "@/components/workspace/PDFViewerWrapper";
import { ExtractedTextPanel } from "@/components/workspace/ExtractedTextPanel";
import { StructuredTablePanel } from "@/components/workspace/StructuredTablePanel";
import { TemplateFieldsPanel } from "@/components/workspace/TemplateFieldsPanel";
import { BoundingBox, LayoutText, ExtractedTable, ExtractedField } from "@/types/document";
import { apiRetrieve, apiHighlight, API_BASE, structureDocument, StructuredDataResponse } from "@/lib/api";
import DocumentViewer, { guessFileType } from "@/components/DocumentViewer";
import StructuredDataViewer from "@/components/StructuredDataViewer";
import { useDocumentContext } from "@/context/DocumentContext";

type TabType = "text" | "tables" | "fields";

const tabs: { id: TabType; label: string; icon: typeof FileText }[] = [
  { id: "text", label: "Raw Text", icon: FileText },
  { id: "tables", label: "Structured Data", icon: Table },
  { id: "fields", label: "Fields", icon: Tag },
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
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number, height: number }>>({});
  const [structuredData, setStructuredData] = useState<StructuredDataResponse | null>(null);
  const [structureLoading, setStructureLoading] = useState<boolean>(false);
  const [structureError, setStructureError] = useState<string | null>(null);

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
        
        // Also load cached structured data if available, otherwise clear it
        if (cachedData.structured) {
          console.log("[Workspace] Loading cached structured data");
          setStructuredData(cachedData.structured);
        } else {
          // Explicitly clear structured data if new file doesn't have it
          setStructuredData(null);
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
        
        // Clear structured data if not in cache (new file hasn't been analyzed yet)
        if (!cachedData?.structured) {
          setStructuredData(null);
        }
      } catch (err: any) {
        console.error("[Workspace] Error fetching data:", err);
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
        
        setTimeout(() => setActiveBoundingBox(null), 3000);
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

  // Collect all highlights
  const allHighlights = hoveredBoundingBox ? [hoveredBoundingBox] : [];

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
      const data = await structureDocument(whisperHash);
      
      // Save to cache (merge with existing cached data)
      cacheData(whisperHash, {
        ...cachedData,
        structured: data,
      });
      
      setStructuredData(data);
    } catch (err: any) {
      console.error("[Workspace] Structure error:", err);
      setStructureError(err.message || "Failed to structure document");
    } finally {
      setStructureLoading(false);
    }
  }, [whisperHash, dataCache, cacheData]);

  // Mock data for tables and fields (can be enhanced later)
  const mockTables: ExtractedTable[] = [];
  const mockFields: ExtractedField[] = [];

  // Highlight a specific line id (0-based) using existing highlight API
  const highlightLineById = useCallback(
    async (lineIndex: number) => {
      if (lineIndex == null || lineIndex < 0) {
        throw new Error(`Invalid line index: ${lineIndex}`);
      }
      const meta = lineMetadata?.[lineIndex];
      if (!meta || !Array.isArray(meta) || meta.length < 4) {
        throw new Error(`No line metadata for index ${lineIndex}`);
      }
      const pageZeroBased = meta[0] || 0;
      const displayPage = pageZeroBased + 1; // viewer uses 1-based
      const dims = pageDimensions[displayPage];
      if (!dims) {
        throw new Error(`Missing page dimensions for page ${displayPage}`);
      }
      try {
        const rect = await apiHighlight(
          whisperHash!,
          lineIndex,
          Math.round(dims.width),
          Math.round(dims.height)
        );
        const pdfPage = rect.page + 1;
        setActiveBoundingBox({
          x: rect.x1,
          y: rect.y1,
          width: rect.x2 - rect.x1,
          height: rect.y2 - rect.y1,
          page: pdfPage
        });
        setTimeout(() => setActiveBoundingBox(null), 3000);
      } catch (err: any) {
        // Re-throw with more context so Promise.allSettled can catch it
        const errorMessage = err?.message || String(err) || "Unknown error";
        throw new Error(`Failed to highlight line ${lineIndex}: ${errorMessage}`);
      }
    },
    [lineMetadata, pageDimensions, whisperHash]
  );

  const handleStructuredHighlight = useCallback(
    async (lineIds: number[]) => {
      if (!lineIds || lineIds.length === 0) return;
      
      // Filter valid line IDs
      const validIds = lineIds.filter(id => typeof id === "number" && id >= 0);
      if (validIds.length === 0) {
        console.warn("[Workspace] No valid line IDs provided for highlighting");
        return;
      }

      // Process all line IDs with Promise.allSettled to handle errors gracefully
      const results = await Promise.allSettled(
        validIds.map(id => highlightLineById(id))
      );

      // Collect successful results and log failures
      const successful: number[] = [];
      const failed: Array<{ id: number; reason: string }> = [];

      results.forEach((result, index) => {
        const lineId = validIds[index];
        if (result.status === "fulfilled") {
          successful.push(lineId);
        } else {
          const reason = result.reason?.message || String(result.reason) || "Unknown error";
          failed.push({ id: lineId, reason });
          console.warn(`[Workspace] Failed to highlight line ${lineId}:`, reason);
        }
      });

      // Log summary
      if (successful.length > 0) {
        console.log(`[Workspace] Successfully highlighted ${successful.length} line(s):`, successful);
      }
      if (failed.length > 0) {
        console.warn(`[Workspace] Failed to highlight ${failed.length} line(s):`, failed);
      }

      // If no lines succeeded, we've already logged warnings above
      // The first successful highlight will be shown (handled by highlightLineById)
    },
    [highlightLineById]
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "text":
        return (
          <ExtractedTextPanel
            items={layoutTextItems}
            onItemHover={handleItemHover}
            onItemClick={handleItemClick}
          />
        );
      case "tables":
        return (
          <div className="space-y-4 min-w-[720px]">
            {!structuredData && !structureError && (
              <div className="text-sm text-muted-foreground">
                Run “Analyze with AI” to view structured data.
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
            {structuredData && (
              <StructuredDataViewer
                data={structuredData.data}
                sourceRefs={structuredData._source_refs}
                onHighlight={handleStructuredHighlight}
              />
            )}
          </div>
        );
      case "fields":
        return (
          <TemplateFieldsPanel
            fields={mockFields}
            onFieldHover={handleItemHover}
            onFieldClick={handleItemClick}
          />
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
              highlights={allHighlights}
              onPageDimensions={handlePageDimensions}
            />
          )
        }
        rightPane={
          <div className="h-full flex flex-col">
            {/* Header with file selector */}
            <div className="flex items-center justify-between p-4 border-b border-border/50 gap-2">
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
                <Button
                  onClick={() => {
                    clearDocuments();
                    navigate("/upload");
                  }}
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-destructive shrink-0"
                  title="Clear all files and reset session"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">Reset Session</span>
                </Button>
              </div>
              <Button
                onClick={handleStructureDocument}
                disabled={structureLoading || !resultText}
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
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

            {/* Tabs */}
            <div className="flex items-center gap-1 p-4 border-b border-border/50">
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
                  {renderTabContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        }
      />
    </div>
  );
}
