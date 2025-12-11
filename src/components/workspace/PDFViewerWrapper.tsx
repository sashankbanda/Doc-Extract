import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoundingBox } from "@/types/document";
import { HighlightOverlay } from "./HighlightOverlay";

interface PDFViewerWrapperProps {
  documentId: string;
  highlights?: BoundingBox[];
  activeHighlight?: BoundingBox | null;
}

export function PDFViewerWrapper({
  documentId,
  highlights = [],
  activeHighlight,
}: PDFViewerWrapperProps) {
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 5; // Mock value
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));

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
        <motion.div
          className="relative mx-auto bg-white rounded-lg shadow-2xl overflow-hidden"
          style={{
            width: `${(595 * zoom) / 100}px`,
            height: `${(842 * zoom) / 100}px`,
            transformOrigin: "top center",
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Mock PDF Content */}
          <div className="absolute inset-0 p-8 text-gray-800 text-sm leading-relaxed">
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-gray-900">Sample Document</h1>
              <div className="h-px bg-gray-200" />
              <p className="text-gray-600">
                This is a preview of your uploaded PDF document. The actual PDF.js
                integration will render the real document content here.
              </p>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Invoice Number</span>
                  <p className="font-medium">INV-2024-001</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Date</span>
                  <p className="font-medium">Dec 10, 2024</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Amount</span>
                  <p className="font-medium">$2,450.00</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Status</span>
                  <p className="font-medium text-green-600">Paid</p>
                </div>
              </div>
              <div className="mt-6">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-2">Web Development</td>
                      <td className="p-2 text-right">40</td>
                      <td className="p-2 text-right">$1,600</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2">UI Design</td>
                      <td className="p-2 text-right">20</td>
                      <td className="p-2 text-right">$850</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Highlight Overlay */}
          <HighlightOverlay
            highlights={highlights}
            activeHighlight={activeHighlight}
            scale={zoom / 100}
          />
        </motion.div>
      </div>
    </div>
  );
}
