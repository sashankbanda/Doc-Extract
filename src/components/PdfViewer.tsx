import * as pdfjsLib from 'pdfjs-dist';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

// Ensure worker is set up.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface HighlightRect {
    page: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface PdfViewerProps {
    pdfUrl: string;
    highlights: HighlightRect[];
    // currentPage prop is less relevant for rendering now, but can be used for initial scroll if needed.
    onPageDimensions?: (pageNumber: number, width: number, height: number) => void;
}

export interface PdfViewerHandle {
    scrollToPage: (pageIndex: number) => void;
    clearHighlights: () => void; // Keeping for compatibility, though props drive it.
}

// --- Sub-component for individual page ---
const PdfPage = ({ 
    pdfDoc, 
    pageNum, 
    highlights, 
    onPageDimensions 
}: { 
    pdfDoc: pdfjsLib.PDFDocumentProxy; 
    pageNum: number; 
    highlights: HighlightRect[]; 
    onPageDimensions?: (p: number, w: number, h: number) => void;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);

    // Filter highlights for this page
    const pageHighlights = useMemo(() => 
        highlights.filter(h => h.page === pageNum), 
    [highlights, pageNum]);

    useEffect(() => {
        const renderPage = async () => {
            if (!pdfDoc || !canvasRef.current || !overlayRef.current) return;
            
            try {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1.5 });
                
                const width = viewport.width;
                const height = viewport.height;

                // Setup Canvas A (PDF)
                const canvas = canvasRef.current;
                canvas.width = width;
                canvas.height = height;

                // Setup Canvas B (Overlay)
                const overlay = overlayRef.current;
                overlay.width = width;
                overlay.height = height;

                // Render PDF
                const renderContext = {
                    canvasContext: canvas.getContext('2d')!,
                    viewport: viewport
                };
                await page.render(renderContext).promise;

                // Notify dimensions
                if (onPageDimensions) {
                    onPageDimensions(pageNum, width, height);
                }
            } catch (err) {
                console.error(`Error rendering page ${pageNum}:`, err);
            }
        };
        renderPage();
    }, [pdfDoc, pageNum]);

    // Draw Highlights
    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const ctx = overlay.getContext('2d');
        if (!ctx) return;

        // Clear existing
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Draw new
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        pageHighlights.forEach(rect => {
            ctx.strokeRect(rect.x1, rect.y1, rect.x2 - rect.x1, rect.y2 - rect.y1);
        });

    }, [pageHighlights]);  // Re-run only when THIS page's highlights change

    return (
        <div id={`page_${pageNum}`} className="relative mb-4 shadow-md inline-block">
            <canvas ref={canvasRef} className="block" />
            <canvas 
                ref={overlayRef} 
                className="absolute top-0 left-0 pointer-events-none"
            />
        </div>
    );
};

// --- Main Viewer ---
const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(({ pdfUrl, highlights, onPageDimensions }, ref) => {
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

    useImperativeHandle(ref, () => ({
        scrollToPage: (pageIndex: number) => {
            const el = document.getElementById(`page_${pageIndex}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        clearHighlights: () => {
            // No-op here because we rely on 'highlights' prop being updated by parent.
            // If parent passes empty array, PdfPage effects will clear canvases.
        }
    }));

    useEffect(() => {
        const loadPdf = async () => {
            try {
                const loadingTask = pdfjsLib.getDocument(pdfUrl);
                const doc = await loadingTask.promise;
                setPdfDoc(doc);
            } catch (error) {
                console.error("Error loading PDF:", error);
            }
        };
        if (pdfUrl) loadPdf();
    }, [pdfUrl]);

    return (
        <div className="flex flex-col items-center bg-gray-100 p-4 min-h-full">
            {pdfDoc && Array.from({ length: pdfDoc.numPages }, (_, i) => (
                <PdfPage
                    key={i + 1}
                    pageNum={i + 1}
                    pdfDoc={pdfDoc}
                    highlights={highlights}
                    onPageDimensions={onPageDimensions}
                />
            ))}
        </div>
    );
});

export default PdfViewer;
