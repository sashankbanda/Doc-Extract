import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoundingBox } from "@/types/document";
import { HighlightOverlay } from "./HighlightOverlay";
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerWrapperProps {
  documentId: string;
  pdfUrl?: string;
  highlights?: BoundingBox[];
  activeHighlight?: BoundingBox | null;
  onPageDimensions?: (pageNum: number, width: number, height: number) => void;
}

export function PDFViewerWrapper({
  documentId,
  pdfUrl,
  highlights = [],
  activeHighlight,
  onPageDimensions,
}: PDFViewerWrapperProps) {
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<Map<number, { width: number, height: number }>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));

  // Load PDF
  useEffect(() => {
    if (!pdfUrl) return;

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (error) {
        console.error("[PDFViewerWrapper] Error loading PDF:", error);
      }
    };

    loadPdf();
  }, [pdfUrl]);

  // Render PDF pages
  useEffect(() => {
    if (!pdfDoc) return;

    const renderPages = async () => {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const canvas = canvasRefs.current.get(pageNum);
        if (!canvas) continue;

        try {
          const page = await pdfDoc.getPage(pageNum);
          // Use a fixed scale for consistent rendering, zoom affects display size
          const baseScale = 1.5; // Base scale for rendering
          const viewport = page.getViewport({ scale: baseScale });
          
          // Set canvas size based on zoom
          const displayWidth = viewport.width * (zoom / 100);
          const displayHeight = viewport.height * (zoom / 100);
          
          // Set actual canvas resolution (for rendering quality)
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          // Set display size via CSS
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;

          const context = canvas.getContext('2d');
          if (!context) continue;

          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };

          await page.render(renderContext).promise;
          
          // Store canvas dimensions for overlay positioning
          setCanvasDimensions(prev => {
            const newMap = new Map(prev);
            newMap.set(pageNum, { width: displayWidth, height: displayHeight });
            return newMap;
          });
          
          // Report dimensions at the actual rendering scale (for highlight calculations)
          // These dimensions match what the canvas is actually rendered at
          if (onPageDimensions) {
            onPageDimensions(pageNum, viewport.width, viewport.height);
          }
        } catch (error) {
          console.error(`[PDFViewerWrapper] Error rendering page ${pageNum}:`, error);
        }
      }
    };

    renderPages();
  }, [pdfDoc, zoom, onPageDimensions]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
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
          <button className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
            <RotateCw className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
            <Maximize2 className="w-4 h-4" />
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
