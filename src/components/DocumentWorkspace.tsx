import React, { useEffect, useRef, useState } from 'react';
import PdfViewer, { PdfViewerHandle } from './PdfViewer';
import TextPanel from './TextPanel';
import { apiRetrieve, apiHighlight, API_BASE } from '@/lib/api';

interface DocumentWorkspaceProps {
    whisperHash: string;
}

const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({ whisperHash }) => {
    // Data State
    const [resultText, setResultText] = useState<string>("");
    const [lineMetadata, setLineMetadata] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // UI State
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [highlights, setHighlights] = useState<any[]>([]);
    const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number, height: number }>>({});
    
    // Refs
    const pdfViewerRef = useRef<PdfViewerHandle>(null);

    // 1. Fetch Retrieve Data on Mount
    useEffect(() => {
        const fetchData = async () => {
            console.log("[DocumentWorkspace] Fetching data for whisperHash:", whisperHash);
            setLoading(true);
            try {
                const data = await apiRetrieve(whisperHash);
                console.log("[DocumentWorkspace] Retrieved data:", {
                    resultTextLength: data.result_text?.length,
                    lineMetadataLength: data.line_metadata?.length
                });
                setResultText(data.result_text || "");
                setLineMetadata(data.line_metadata || []);
                
                // Optional: set initial page from metadata if desirable, default is 1
            } catch (err: any) {
                console.error("[DocumentWorkspace] Error fetching data:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (whisperHash) {
            fetchData();
        } else {
            console.warn("[DocumentWorkspace] No whisperHash provided");
        }
    }, [whisperHash]);

    // 2. Handle Line Click
    const handleLineClick = async (lineIndex: number) => {
        console.log("[DocumentWorkspace] Line clicked:", lineIndex);
        if (!lineMetadata[lineIndex]) {
            console.warn("[DocumentWorkspace] No metadata for line:", lineIndex);
            return;
        }

        // Check page of line
        // raw structure: [page, base_y, height, page_height]
        // Note: page is 1-based usually in LLMWhisperer, but let's check. 
        // Docs say page_number in metadata is 0-based index? 
        // Let's assume raw[0] is 0-based, so +1 for PDF.js which is 1-based.
        // Wait, reviewing previous JSON: "page_number": 0. "Page 1 of 2".
        // Usually raw[0] corresponds to the 0-based page index.
        const raw = lineMetadata[lineIndex];
        
        let pageIndex = 0; 
        if (Array.isArray(raw) && raw.length > 0) {
            pageIndex = raw[0];
        } else if (raw && raw.raw && Array.isArray(raw.raw)) {
             // Handle case if metadata structure varies (unlikely given previous fixes)
             pageIndex = raw.raw[0];
        }

        const targetPage = pageIndex + 1; // Convert 0-based to 1-based for PDF.js

        // Scroll to page if needed
        if (targetPage !== currentPage) {
            setCurrentPage(targetPage);
            pdfViewerRef.current?.scrollToPage(targetPage);
        } else {
             // Even if same page, ensure we verify it's visible?
             // Optional: pdfViewerRef.current?.scrollToPage(targetPage);
        }

        // Get dimensions
        const dims = pageDimensions[targetPage];
        if (!dims) {
            console.warn("[DocumentWorkspace] Dimensions not loaded for page", targetPage, "Available pages:", Object.keys(pageDimensions));
            return;
        }

        console.log("[DocumentWorkspace] Calling highlight API with dimensions:", dims);

        // Call Highlight API
        try {
            const rect = await apiHighlight(
                whisperHash,
                lineIndex,
                dims.width,
                dims.height
            );
            
            console.log("[DocumentWorkspace] Got highlight rect:", rect);
            
            // Add to highlights list
            setHighlights([{ 
                ...rect, 
                page: targetPage 
            }]);
            
            // Also ensure we scroll to this page now that we have highlight? 
            // We did it above, but safe to do it here too if logic requires it.
            pdfViewerRef.current?.scrollToPage(targetPage);

        } catch (e: any) {
            // Check for 400 errors (invalid line index or invalid bbox)
            if (e.message && (e.message.includes("Invalid") || e.message.includes("no valid bounding box"))) {
                console.warn("[DocumentWorkspace] Line skipped by backend:", e.message);
                return;
            }
            console.error("[DocumentWorkspace] Highlight error:", e);
        }
    };

    const handlePageDimensions = (pageNum: number, width: number, height: number) => {
        setPageDimensions(prev => ({
            ...prev,
            [pageNum]: { width, height }
        }));
    };

    const handleClearHighlights = () => {
        setHighlights([]);
        // pdfViewerRef.current?.clearHighlights(); // Not needed as props drive it
    };

    if (loading) return <div className="p-10 text-center">Loading document data...</div>;
    if (error) return <div className="p-10 text-red-500">Error: {error}</div>;

    // PDF URL
    const pdfUrl = `${API_BASE}/document/${whisperHash}`;

    return (
        <div className="flex h-screen w-full bg-gray-50 flex-col">
            <header className="bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm z-10">
                <h1 className="font-semibold text-lg text-gray-700">Document Workspace</h1>
                <div className="flex gap-2">
                     <span className="text-sm text-gray-500 self-center mr-4">Page {currentPage}</span>
                     <button 
                        onClick={handleClearHighlights}
                        className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                     >
                        Clear Highlights
                     </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Left: Text Panel */}
                <div className="w-1/3 min-w-[300px] border-r border-gray-200 bg-white h-full">
                    <TextPanel 
                        resultText={resultText} 
                        onLineClick={handleLineClick}
                    />
                </div>

                {/* Right: PDF Viewer */}
                <div className="flex-1 bg-gray-100 overflow-auto flex justify-center p-8 relative">
                    <PdfViewer
                        ref={pdfViewerRef}
                        pdfUrl={pdfUrl}
                        highlights={highlights}
                        onPageDimensions={handlePageDimensions}
                    />
                </div>
            </div>
        </div>
    );
};

export default DocumentWorkspace;
