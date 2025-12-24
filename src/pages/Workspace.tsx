import DocumentViewer, { guessFileType } from "@/components/DocumentViewer";
import { Input } from "@/components/ui/input";
import { ComparisonTab } from "@/components/workspace/ComparisonTab";
import { ExtractedTextPanel } from "@/components/workspace/ExtractedTextPanel";
import { PDFViewerWrapper } from "@/components/workspace/PDFViewerWrapper";
import { ResultTab } from "@/components/workspace/ResultTab";
import { TwoPaneLayout } from "@/components/workspace/TwoPaneLayout";
import { ComparisonProvider } from "@/context/ComparisonContext";
import { useDocumentContext } from "@/context/DocumentContext";
import { API_BASE, apiHighlight, apiRetrieve } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BoundingBox, LayoutText } from "@/types/document";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2, FileText, GitCompare, Maximize2,
  Minimize2,
  Search,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type TabType = "text" | "compare" | "result";

const tabs: { id: TabType; label: string; icon: typeof FileText }[] = [
  { id: "result", label: "Result", icon: CheckCircle2 },
  { id: "compare", label: "Compare Models", icon: GitCompare },
  { id: "text", label: "Raw Text", icon: FileText },
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
  const [activeTab, setActiveTab] = useState<TabType>("result");
  const [hoveredBoundingBox, setHoveredBoundingBox] = useState<BoundingBox | null>(null);
  const [activeBoundingBox, setActiveBoundingBox] = useState<BoundingBox | null>(null);
  const [secondaryHighlights, setSecondaryHighlights] = useState<BoundingBox[]>([]);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number, height: number }>>({});

  
  // Text tab state
  const [textSelectedIndex, setTextSelectedIndex] = useState<number>(-1);
  const textItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());


  const [searchQuery, setSearchQuery] = useState<string>("");
  const extractedTextPanelRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  // Read-Through Cache Pattern: Fetch data with caching
  useEffect(() => {
    if (!whisperHash) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      // Check cache first
      const cachedData = dataCache[whisperHash];
      if (cachedData && cachedData.result_text !== undefined) {
        setResultText(cachedData.result_text || "");
        setLineMetadata(cachedData.line_metadata || []);
        setLoading(false);
        return;
      }

      // Cache miss - fetch from API
      setLoading(true);
      try {
        const data = await apiRetrieve(whisperHash);
        
        // Save to cache
        cacheData(whisperHash, {
          ...cachedData,
          result_text: data.result_text || "",
          line_metadata: data.line_metadata || [],
        });
        
        setResultText(data.result_text || "");
        setLineMetadata(data.line_metadata || []);
      } catch (err: any) {
        console.error("[Workspace] Error fetching data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [whisperHash, dataCache, cacheData]);

  // Convert result_text to LayoutText[] format
  const layoutTextItems: LayoutText[] = useMemo(() => {
    if (!resultText) return [];
    const lines = resultText.split('\n');
    return lines.map((line, index) => {
      const metadata = lineMetadata[index];
      let page = 1;
      if (metadata && Array.isArray(metadata) && metadata.length > 0) {
        page = (metadata[0] || 0) + 1;
      }
      
      const text = line.trim();
      let type: 'paragraph' | 'heading' | 'list-item' = 'paragraph';
      if (text.length === 0) return null;
      
      if (text.match(/^0x[0-9A-F]+:\s+[A-Z]/)) type = 'heading';
      else if (text.match(/^0x[0-9A-F]+:\s+[•\-]/)) type = 'list-item';
      else if (text.match(/^0x[0-9A-F]+:\s*$/)) return null;

      return {
        id: `line-${index}`,
        text: text,
        type,
        boundingBox: { x: 0, y: 0, width: 0, height: 0, page }
      };
    }).filter((item): item is LayoutText => item !== null);
  }, [resultText, lineMetadata]);



  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = document.fullscreenElement === rightPaneRef.current;
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    // Webkit fallback
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
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
            const scrollContainer = pageElement.closest('.overflow-auto');
            if (scrollContainer) {
              const canvas = pageElement.querySelector('canvas') as HTMLCanvasElement;
              const viewportWidth = dims.width; 
              const displayWidth = canvas ? parseFloat(canvas.style.width || '0') : viewportWidth;
              const zoom = displayWidth > 0 ? (displayWidth / viewportWidth) * 100 : 100;
              const highlightY = rect.y1 * (zoom / 100);
              const pageRect = pageElement.getBoundingClientRect();
              const containerRect = scrollContainer.getBoundingClientRect();
              const canvasRect = canvas?.getBoundingClientRect();
              const canvasOffsetY = canvasRect ? canvasRect.top - pageRect.top : 0;
              const pageTop = pageRect.top - containerRect.top + scrollContainer.scrollTop;
              const targetScrollTop = pageTop + canvasOffsetY + highlightY - (containerRect.height / 2);
              
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
      } catch (e: any) {
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

      // Process all line IDs with Promise.allSettled
      // Convert 1-based line numbers (from LLM) to 0-based indices for array access
      const results = await Promise.allSettled(
        validIds.map(id => highlightLineById(id > 0 ? id - 1 : id)) 
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



  // Build searchable index from raw text and structured data
  type SearchResult = {
    type: 'text';
    value: string;
    lineNumbers: number[];
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

    return searchIndexArray;
  }, [layoutTextItems, lineMetadata]);

  // Search functionality
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return searchIndex.filter(item => 
      item.value.toLowerCase().includes(query)
    );
  }, [searchQuery, searchIndex]);







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
      <ComparisonProvider key={whisperHash} whisperHash={whisperHash}>
      <TwoPaneLayout
        leftPane={
          isPdf ? (
            <PDFViewerWrapper
              documentId={whisperHash}
              pdfUrl={documentUrl}
              highlights={allHighlights}
              activeHighlight={activeBoundingBox}
              onPageDimensions={handlePageDimensions}
              files={documents
                .filter((d) => d.status === "complete" && d.whisperHash)
                .map((d) => ({
                  id: d.whisperHash!,
                  name: d.fileName || d.name,
                }))}
              selectedFileId={whisperHash || ""}
              onSelectFile={(hash) => {
                const doc = documents.find((d) => d.whisperHash === hash);
                if (doc) {
                  setActiveDocument(doc.id);
                  setSearchParams(
                    { whisper_hash: hash, fileName: doc.fileName || doc.name },
                    { replace: true }
                  );
                }
              }}
              onRemoveFile={(hash) => {
                const doc = documents.find((d) => d.whisperHash === hash);
                if (doc) {
                  removeDocument(doc.id);
                }
              }}
            />
          ) : (
            <DocumentViewer
              fileUrl={documentUrl}
              fileType={fileType}
              highlights={highlightRects}
              onPageDimensions={handlePageDimensions}
              files={documents
                .filter((d) => d.status === "complete" && d.whisperHash)
                .map((d) => ({
                  id: d.whisperHash!,
                  name: d.fileName || d.name,
                }))}
              selectedFileId={whisperHash || ""}
              onSelectFile={(hash) => {
                const doc = documents.find((d) => d.whisperHash === hash);
                if (doc) {
                  setActiveDocument(doc.id);
                  setSearchParams(
                    { whisper_hash: hash, fileName: doc.fileName || doc.name },
                    { replace: true }
                  );
                }
              }}
              onRemoveFile={(hash) => {
                const doc = documents.find((d) => d.whisperHash === hash);
                if (doc) {
                  removeDocument(doc.id);
                }
              }}
            />
          )
        }
        rightPane={
          <div className="h-full flex flex-col bg-background" ref={rightPaneRef}>
            {/* Header with file selector */}
            {/* Header - now mostly empty as file selector moved to left pane */}


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


                <button
                  className="p-1 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground shrink-0"
                  title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  onClick={async () => {
                    if (!rightPaneRef.current) return;
                    try {
                      if (!isFullscreen) {
                        if (rightPaneRef.current.requestFullscreen) {
                          await rightPaneRef.current.requestFullscreen();
                        } else if ((rightPaneRef.current as any).webkitRequestFullscreen) {
                          await (rightPaneRef.current as any).webkitRequestFullscreen();
                        }
                      } else {
                        if (document.exitFullscreen) {
                          await document.exitFullscreen();
                        } else if ((document as any).webkitExitFullscreen) {
                          await (document as any).webkitExitFullscreen();
                        }
                      }
                    } catch (err) {
                      console.error("[Workspace] Fullscreen error:", err);
                    }
                  }}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex h-[calc(100vh-4rem)] overflow-hidden overflow-y-auto overflow-x-auto p-4">
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
                    <div>
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
