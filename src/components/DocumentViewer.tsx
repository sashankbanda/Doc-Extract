import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import PdfViewer, { PdfViewerHandle } from './PdfViewer';
// Note: These imports assume packages are installed.
// User must run: npm install xlsx docx-preview
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';

export type FileType = "pdf" | "image" | "text" | "excel" | "docx" | "unknown";

export function guessFileType(filename: string): FileType {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/)) return 'image';
    if (lower.match(/\.(txt|md|log|json|csv)$/)) return 'text';
    if (lower.match(/\.(xls|xlsx)$/)) return 'excel';
    if (lower.match(/\.(doc|docx)$/)) return 'docx';
    return 'unknown';
}

interface HighlightRect {
    page: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface DocumentViewerProps {
    fileUrl: string;
    fileType: FileType;
    highlights?: HighlightRect[];
    onPageDimensions?: (page: number, width: number, height: number) => void;
    currentPage?: number; // Used for PDF navigation
}

export interface DocumentViewerHandle {
    scrollToPage?: (page: number) => void; 
}

const DocumentViewer = forwardRef<DocumentViewerHandle, DocumentViewerProps>(({ 
    fileUrl, 
    fileType, 
    highlights = [], 
    onPageDimensions, 
    currentPage 
}, ref) => {
    
    // PDF Ref
    const pdfRef = useRef<PdfViewerHandle>(null);
    
    // Expose methods
    useImperativeHandle(ref, () => ({
        scrollToPage: (page: number) => {
            if (fileType === 'pdf') {
                pdfRef.current?.scrollToPage(page);
            } else {
                // For other types, page scrolling might not apply or be different
                console.warn("Scroll to page not implemented for", fileType);
            }
        }
    }));

    // --- Renderers ---

    // 1. PDF
    if (fileType === 'pdf') {
        return (
            <PdfViewer
                ref={pdfRef}
                pdfUrl={fileUrl}
                highlights={highlights}
                onPageDimensions={onPageDimensions}
            />
        );
    }

    // 2. Image
    if (fileType === 'image') {
        return <ImageViewer fileUrl={fileUrl} highlights={highlights} />;
    }

    // 3. Text
    if (fileType === 'text') {
        return <TextViewer fileUrl={fileUrl} />;
    }

    // 4. Excel
    if (fileType === 'excel') {
        return <ExcelViewer fileUrl={fileUrl} />;
    }

    // 5. DOCX
    if (fileType === 'docx') {
        return <DocxViewer fileUrl={fileUrl} />;
    }

    return <div className="p-10 text-gray-500">Unsupported file type</div>;
});

// --- Sub-Components ---

const ImageViewer = ({ fileUrl, highlights }: { fileUrl: string, highlights: HighlightRect[] }) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dims, setDims] = useState<{w: number, h: number} | null>(null);

    const handleLoad = () => {
        if (imgRef.current) {
            setDims({ w: imgRef.current.width, h: imgRef.current.height });
        }
    };

    // Draw highlights
    useEffect(() => {
        if (!canvasRef.current || !dims) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Match exact size of image
        canvasRef.current.width = dims.w;
        canvasRef.current.height = dims.h;

        ctx.clearRect(0, 0, dims.w, dims.h);
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;

        highlights.forEach(h => {
             // Assuming image is "Page 1" (index 1) usually. 
             // Or if single image, ignore page index? 
             // Let's draw all passed highlights.
             ctx.strokeRect(h.x1, h.y1, h.x2 - h.x1, h.y2 - h.y1);
        });
    }, [dims, highlights]);

    return (
        <div className="relative inline-block">
            <img 
                ref={imgRef} 
                src={fileUrl} 
                onLoad={handleLoad} 
                alt="Document" 
                className="max-w-full h-auto block"
            />
            {dims && (
                <canvas 
                    ref={canvasRef}
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{ width: '100%', height: '100%' }} // scale visually
                />
            )}
        </div>
    );
};

const TextViewer = ({ fileUrl }: { fileUrl: string }) => {
    const [text, setText] = useState<string>("");
    
    useEffect(() => {
        fetch(fileUrl).then(r => r.text()).then(setText).catch(console.error);
    }, [fileUrl]);

    return (
        <div className="p-4 bg-white overflow-auto h-full">
            <pre className="whitespace-pre-wrap font-mono text-sm">{text}</pre>
        </div>
    );
};

const ExcelViewer = ({ fileUrl }: { fileUrl: string }) => {
    const [data, setData] = useState<any[][]>([]);

    useEffect(() => {
        const load = async () => {
            try {
                const f = await fetch(fileUrl);
                const ab = await f.arrayBuffer();
                const wb = XLSX.read(ab, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]]; // First sheet
                const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                setData(json);
            } catch (e) {
                console.error("Excel load error", e);
            }
        };
        load();
    }, [fileUrl]);

    return (
        <div className="overflow-auto p-4 bg-white h-full">
            <table className="border-collapse border border-gray-300 min-w-full text-sm">
                <tbody>
                    {data.map((row, r) => (
                        <tr key={r}>
                            {row.map((cell, c) => (
                                <td key={c} className="border border-gray-300 p-1 px-2 whitespace-nowrap">
                                    {cell !== null ? String(cell) : ""}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const DocxViewer = ({ fileUrl }: { fileUrl: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const load = async () => {
             try {
                const f = await fetch(fileUrl);
                const blob = await f.blob();
                if (containerRef.current) {
                    await renderAsync(blob, containerRef.current);
                }
             } catch (e) {
                 console.error("Docx load error", e);
             }
        };
        load();
    }, [fileUrl]);

    return <div ref={containerRef} className="bg-white p-8 overflow-auto h-full" />;
};

export default DocumentViewer;
