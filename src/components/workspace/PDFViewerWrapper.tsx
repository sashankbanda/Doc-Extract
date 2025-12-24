import { cn } from "@/lib/utils";
import { BoundingBox } from "@/types/document";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjsLib from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from "react";
import { FileSelectorDropdown } from "./FileSelectorDropdown";
import { HighlightOverlay } from "./HighlightOverlay";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerWrapperProps {
  documentId: string;
  pdfUrl?: string;
  highlights?: BoundingBox[];
  activeHighlight?: BoundingBox | null;
  onPageDimensions?: (pageNum: number, width: number, height: number) => void;
  // File props
  files: { id: string; name: string }[];
  selectedFileId: string;
  onSelectFile: (id: string) => void;
  onRemoveFile?: (id: string) => void;
}

export function PDFViewerWrapper({
  documentId,
  pdfUrl,
  highlights = [],
  activeHighlight,
  onPageDimensions,
  files,
  selectedFileId,
  onSelectFile,
  onRemoveFile,
}: PDFViewerWrapperProps) {
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<Map<number, { width: number, height: number }>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfViewerAreaRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));

  // Reset View: Reset zoom to 100%, scroll to top-left, go to page 1
  const handleResetView = useCallback(() => {
    // Reset zoom to 100%
    setZoom(100);
    
    // Reset page to 1
    setCurrentPage(1);
    
    // Reset scroll position to top-left
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
      
      // Also scroll to page 1 element after a brief delay to ensure zoom has updated
      setTimeout(() => {
        scrollToPage(1);
      }, 100);
    }
  }, []);

  // Fullscreen toggle
  const handleToggleFullscreen = useCallback(async () => {
    if (!pdfViewerAreaRef.current) return;

    try {
      if (!isFullscreen) {
        // Enter fullscreen
        if (pdfViewerAreaRef.current.requestFullscreen) {
          await pdfViewerAreaRef.current.requestFullscreen();
        } else if ((pdfViewerAreaRef.current as any).webkitRequestFullscreen) {
          // Safari support
          await (pdfViewerAreaRef.current as any).webkitRequestFullscreen();
        } else if ((pdfViewerAreaRef.current as any).mozRequestFullScreen) {
          // Firefox support
          await (pdfViewerAreaRef.current as any).mozRequestFullScreen();
        } else if ((pdfViewerAreaRef.current as any).msRequestFullscreen) {
          // IE/Edge support
          await (pdfViewerAreaRef.current as any).msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (error) {
      console.error("[PDFViewerWrapper] Fullscreen error:", error);
    }
  }, [isFullscreen]);

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Handle Esc key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleToggleFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isFullscreen, handleToggleFullscreen]);

  // Page navigation handlers
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") {
      return; // Allow empty input while typing
    }
    const pageNum = parseInt(value, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      scrollToPage(pageNum);
    }
  };

  const handlePageInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || isNaN(parseInt(value, 10))) {
      // Reset to current page if invalid
      e.target.value = currentPage.toString();
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      scrollToPage(newPage);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      scrollToPage(newPage);
    }
  };

  const scrollToPage = (pageNum: number) => {
    const pageElement = document.getElementById(`page_${pageNum}`);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Fit to width helper
  const fitToWidth = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, containerWidth: number) => {
      if (!doc || containerWidth <= 0) return;
      
      try {
          const page = await doc.getPage(1);
          const viewport = page.getViewport({ scale: 1 });
          
          // p-6 (48px) + scrollbar buffer (~16px) = ~64px
          const availableWidth = containerWidth - 64; 
          const fitScale = availableWidth / viewport.width;
          
          // Clamp min zoom to 20%, max to 150% (fit shouldn't explode small docs)
          const targetZoom = Math.min(Math.max(20, Math.floor(fitScale * 100)), 150);
          
          console.log(`[PDFViewerWrapper] Fitting to width: Container=${containerWidth}, Page=${viewport.width}, Zoom=${targetZoom}%`);
          setZoom(targetZoom);
      } catch (e) {
          console.warn("[PDFViewerWrapper] Error calculating fit zoom:", e);
      }
  }, []);

  // Load PDF
  useEffect(() => {
    if (!pdfUrl) return;

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        
        // Try initial fit if container is ready
        if (containerRef.current) {
            fitToWidth(doc, containerRef.current.clientWidth);
        }
      } catch (error) {
        console.error("[PDFViewerWrapper] Error loading PDF:", error);
      }
    };

    loadPdf();
  }, [pdfUrl, fitToWidth]);

  // Handle Resize for initial fit
  useEffect(() => {
      if (!containerRef.current || !pdfDoc) return;
      
      // Only fit automatically if we haven't manually zoomed? 
      // For now, let's just ensure we fit at least once on load.
      // We can use a ref to track if 'initial fit' is done for this current doc.
      // But simpler: Just rely on the ResizeObserver to catch the first stable width.
      
      const observer = new ResizeObserver(entries => {
          for (const entry of entries) {
              if (entry.contentRect.width > 0) {
                 // We could limit this to run only once per document load if desired.
                 // But since the user might resize the pane, auto-refitting might be annoying if they zoomed in.
                 // Ideally we only do it on "mount" / "doc change".
                 // BUT: The previous attempt failed because measuring happened too early.
                 // So we need to ensure it runs when layout is ready.
                 
                 // Let's rely on the dependency logic: This effect runs when pdfDoc changes.
                 // We just want to trigger it once.
              }
          }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
  }, [pdfDoc]);

  // Use a ref to track if we've performed the initial fit for the *current* pdfDoc
  const initialFitDoneRef = useRef<string | null>(null);

  useEffect(() => {
      if (!containerRef.current || !pdfDoc || !pdfUrl) return;
      
      if (initialFitDoneRef.current === pdfUrl) return; // Already fitted this doc

      const observer = new ResizeObserver(entries => {
          for (const entry of entries) {
              if (entry.contentRect.width > 0) {
                  fitToWidth(pdfDoc, entry.contentRect.width);
                  initialFitDoneRef.current = pdfUrl; // Mark as done
                  observer.disconnect(); // Stop observing once fitted
                  break;
              }
          }
      });
      
      observer.observe(containerRef.current);
      return () => observer.disconnect();
  }, [pdfDoc, pdfUrl, fitToWidth]);


  // Render PDF pages
  useEffect(() => {
    if (!pdfDoc) return;

    const renderPages = async () => {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const canvas = canvasRefs.current.get(pageNum);
        if (!canvas) continue;

        try {
          const page = await pdfDoc.getPage(pageNum);
          
          // 1. Calculate Display Size (CSS) based on Zoom
          // Scale 1 = 100% zoom = 72 DPI (Standard PDF point size)
          const viewportStandard = page.getViewport({ scale: 1 });
          const displayWidth = viewportStandard.width * (zoom / 100);
          const displayHeight = viewportStandard.height * (zoom / 100);
          
          // 2. Calculate Render Resolution (Canvas) for High DPI
          // Use devicePixelRatio for crisp text, defaulting to at least 1.5 if ratio is low
          const dpr = window.devicePixelRatio || 1;
          const renderScale = (zoom / 100) * Math.max(dpr, 1.5);
          const viewportRender = page.getViewport({ scale: renderScale });
          
          // Set canvas resolution
          canvas.width = viewportRender.width;
          canvas.height = viewportRender.height;
          
          // Set display size via CSS
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;

          const context = canvas.getContext('2d');
          if (!context) continue;

          const renderContext = {
            canvasContext: context,
            viewport: viewportRender
          };

          await page.render(renderContext).promise;
          
          // Store canvas dimensions for overlay positioning (use display size)
          setCanvasDimensions(prev => {
            const newMap = new Map(prev);
            newMap.set(pageNum, { width: displayWidth, height: displayHeight });
            return newMap;
          });
          
          // Report dimensions at layout scale (typically standard viewport width/height is useful for relative coords)
          // But our highlighter uses the display dimension percentages.
          // Let's pass the standard viewport for coordinate mapping ref.
          if (onPageDimensions) {
            onPageDimensions(pageNum, displayWidth, displayHeight);
          }
        } catch (error) {
          console.error(`[PDFViewerWrapper] Error rendering page ${pageNum}:`, error);
        }
      }
    };

    renderPages();
  }, [pdfDoc, zoom, onPageDimensions]);

  // Track current page based on scroll position
  useEffect(() => {
    if (!containerRef.current || totalPages === 0) return;

    const container = containerRef.current;
    
    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;
      
      let closestPage = 1;
      let closestDistance = Infinity;
      
      for (let i = 1; i <= totalPages; i++) {
        const pageElement = document.getElementById(`page_${i}`);
        if (pageElement) {
          const pageRect = pageElement.getBoundingClientRect();
          const pageCenter = pageRect.top + pageRect.height / 2;
          const distance = Math.abs(containerCenter - pageCenter);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestPage = i;
          }
        }
      }
      
      if (closestPage !== currentPage) {
        setCurrentPage(closestPage);
      }
    };

    container.addEventListener('scroll', handleScroll);
    // Also check on initial load
    handleScroll();
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [totalPages, currentPage]);

  return (
    <div 
      ref={pdfViewerAreaRef}
      className={cn(
        "h-full flex flex-col",
        isFullscreen && "fixed inset-0 z-50 bg-background"
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 gap-4">
        <div className="flex items-center gap-2">
            <FileSelectorDropdown
                files={files}
                selectedId={selectedFileId}
                onSelect={onSelectFile}
                onRemove={onRemoveFile}
            />
            <div className="w-px h-5 bg-border mx-2" />
          <button
            onClick={handlePreviousPage}
            disabled={currentPage <= 1}
            className="p-1 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={handlePageInputChange}
              onBlur={handlePageInputBlur}
              onKeyDown={handlePageInputKeyDown}
              className="w-12 px-2 py-1 text-sm text-center border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-sm text-muted-foreground">
              of {totalPages}
            </span>
          </div>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="p-1 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground w-14 text-center">{zoom}%</span>
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-2" />
          <button 
            onClick={handleResetView}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Reset view (zoom 100%, page 1, top)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button 
            onClick={handleToggleFullscreen}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* PDF Viewer Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-6 relative"
        style={{ backgroundColor: "hsl(var(--muted) / 0.3)" }}
      >
        {pdfDoc ? (
          <div className="flex flex-col items-center gap-4" style={{ minWidth: 'max-content', width: '100%' }}>
            {Array.from({ length: totalPages }, (_, i) => {
              const pageNum = i + 1;
              const dims = canvasDimensions.get(pageNum);
              return (
                <motion.div
                  key={pageNum}
                  id={`page_${pageNum}`}
                  className="relative bg-white rounded-lg shadow-2xl overflow-visible mb-4"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.1 }}
                  style={{
                    minWidth: dims?.width ? `${dims.width}px` : 'auto',
                    minHeight: dims?.height ? `${dims.height}px` : 'auto'
                  }}
                >
                  <div 
                    className="relative"
                    style={{ 
                      width: dims?.width ? `${dims.width}px` : 'auto',
                      height: dims?.height ? `${dims.height}px` : 'auto',
                      display: 'inline-block'
                    }}
                  >
                    <canvas
                      ref={(el) => {
                        if (el) canvasRefs.current.set(pageNum, el);
                      }}
                      className="block"
                    />
                    {/* Highlight Overlay for this page - positioned absolutely over canvas */}
                    {(highlights.some(h => h.page === pageNum) || activeHighlight?.page === pageNum) && (
                      <HighlightOverlay
                        highlights={highlights.filter(h => h.page === pageNum)}
                        activeHighlight={activeHighlight?.page === pageNum ? activeHighlight : null}
                        scale={zoom / 100}
                        canvasWidth={dims?.width || 0}
                        canvasHeight={dims?.height || 0}
                      />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Loading PDF...</p>
          </div>
        )}
      </div>
    </div>
  );
}
