import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useComparisonContext } from "@/context/ComparisonContext";
import { cn } from "@/lib/utils";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Edit2, Loader2, Play, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DiffViewer } from "./DiffViewer";

// Available models
const AVAILABLE_MODELS = [
    { id: "groq/llama-3.3-70b-versatile", name: "Groq (Llama 3.3 70B)", provider: "groq" },
    { id: "gemini/gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "google" },
    { id: "gemini/gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "google" },
    { id: "gemini/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
    { id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet", provider: "anthropic" },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "anthropic" },
    { id: "mistral/mistral-large-latest", name: "Mistral Large", provider: "mistral" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", provider: "deepseek" },
];

interface ComparisonTabProps {
    whisperHash: string | null;
}

// Sub-component for a single cell (Model A or B)
function ComparisonCell({ 
    model, 
    index, 
    uniqueKey, // For approval (includes suffix)
    rawKey,    // For editing (actual key)
    value, 
    diffValue, // The other model's value for diffing
    isMatch, 
    tier,
    verificationReason,
    isApproved,
    onApprove, 
    onUpdate,
    loading 
}: {
    model: 'A' | 'B';
    index?: number;
    uniqueKey: string;
    rawKey: string;
    value: string;
    diffValue?: string;
    isMatch: boolean;
    tier?: "match" | "warning" | "mismatch";
    verificationReason?: string;
    isApproved: boolean;
    onApprove: (key: string, val: string) => void;
    onUpdate: (model: 'A' | 'B', index: number, k: string, v: string) => void;
    loading?: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editKey, setEditKey] = useState(rawKey);
    const [editVal, setEditVal] = useState(value);

    // Update local state when prop changes (unless editing)
    useEffect(() => {
        if (!isEditing) {
            setEditKey(rawKey);
            setEditVal(value);
        }
    }, [rawKey, value, isEditing]);

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (index === undefined) return;
        onUpdate(model, index, editKey, editVal);
        setIsEditing(false);
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(false);
        setEditKey(rawKey);
        setEditVal(value);
    };

    const handleApprove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onApprove(uniqueKey, value);
    };



    if (isEditing) {
        return (
            <div className="flex flex-col gap-2 p-1" onClick={e => e.stopPropagation()}>
                <Input 
                    value={editKey} 
                    onChange={e => setEditKey(e.target.value)} 
                    className="h-6 text-xs" 
                    placeholder="Key"
                />
                <textarea 
                    value={editVal} 
                    onChange={e => setEditVal(e.target.value)}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[60px]"
                />
                <div className="flex gap-2 justify-end">
                     <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-100" onClick={handleSave} title="Save">
                        <Check className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-red-100" onClick={handleCancel} title="Cancel">
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        );
    }

    // Helper to check if value is effectively missing
    const isMissing = (val: string | null | undefined) => !val || val === "(missing)" || val === "null" || val === "undefined";
    const hasMissingSide = isMissing(value) || isMissing(diffValue);

    if (loading) {
        return (
            <div className="group relative pr-16 min-h-[2rem] flex items-center group/cell">
                <Skeleton className="h-4 w-full" />
            </div>
        );
    }

    const isWarning = tier === "warning";

    return (
        <div className="group relative pr-16 min-h-[2rem] flex items-center group/cell">
             <div className="text-sm font-mono break-all whitespace-pre-wrap flex-1">
                {!isMatch && !isApproved && !hasMissingSide ? (
                    <DiffViewer 
                        oldValue={model === 'A' ? value : diffValue} 
                        newValue={model === 'A' ? diffValue : value} 
                        mode={model === 'A' ? 'old' : 'new'} 
                    />
                ) : (
                    <span 
                        className={cn(
                            "break-words", 
                            isApproved && "font-bold text-green-700",
                            isWarning && !isApproved && "bg-yellow-100/50 text-yellow-900 px-1 rounded border border-yellow-200"
                        )}
                        title={isWarning ? verificationReason : undefined}
                    >
                        {value === "null" || value === "undefined" ? <span className="text-muted-foreground italic">{value}</span> : value}
                        {isApproved && <CheckCircle2 className="w-3 h-3 inline-block ml-1 opacity-70" />}
                        {isWarning && !isApproved && <span className="text-xs ml-2 cursor-help font-sans">⚠️</span>}
                    </span>
                )}
            </div>
            
            {/* Actions (Visible on hover) */}
            <div className="absolute right-0 top-0 hidden group-hover:flex items-center bg-background/80 backdrop-blur-sm rounded-md shadow-sm border">
                <Button 
                    size="icon" 
                    variant="ghost" 
                    className={cn("h-7 w-7", isApproved ? "text-green-600" : "text-muted-foreground hover:text-green-600")}
                    onClick={handleApprove}
                    title="Approve this value"
                >
                    <CheckCircle2 className="w-4 h-4" />
                </Button>
                {index !== undefined && (
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                        }}
                        title="Edit"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}

const LoadingTimer = ({ isLoading, startTime, duration }: { isLoading: boolean, startTime: number | null, duration: number | null }) => {
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isLoading && startTime) {
            setElapsed(Date.now() - startTime);
            intervalRef.current = setInterval(() => {
                setElapsed(Date.now() - startTime);
            }, 50);
        } else if (duration !== null) {
            setElapsed(duration);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        } else {
            setElapsed(0);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isLoading, startTime, duration]);

    if (!isLoading && elapsed === 0 && duration === null) return null;

    return (
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground ml-2">
            {(elapsed / 1000).toFixed(2)}s
        </span>
    );
};

export function ComparisonTab({ whisperHash, onHighlight }: ComparisonTabProps & { onHighlight?: (lines: number[]) => void }) {
    const {
        modelA, setModelA,
        modelB, setModelB,
        customModelA, setCustomModelA,
        customModelB, setCustomModelB,
        isCustomA, setIsCustomA,
        isCustomB, setIsCustomB,
        dataA, setDataA,
        dataB, setDataB,
        loadingA,
        loadingB,
        runComparison,
        filter, setFilter,
        comparisonRows,
        approvedItems, 
        approveItem,
        updateItem,

        deleteItem,
        focusKey, setFocusKey,
        searchQuery,
        startTimeA,
        startTimeB,
        durationA,
        durationB,
        whisperHash: contextHash
    } = useComparisonContext();

    // Safety check: specific hash request vs context hash
    const isContextStale = whisperHash && contextHash !== whisperHash;

    // Use derived state for rendering to prevent flicker of old data
    const safeDataA = isContextStale ? null : dataA;
    const safeDataB = isContextStale ? null : dataB;
    const safeLoadingA = isContextStale ? true : loadingA;
    const safeLoadingB = isContextStale ? true : loadingB;

    
    // Local run extraction removed, using context runComparison

    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    // Alert Dialog State
    const [alertConfig, setAlertConfig] = useState<{
        open: boolean;
        title: string;
        description: string;
        actionLabel?: string;
        onAction?: () => void;
        variant?: "default" | "destructive";
        showCancel?: boolean;
    }>({
        open: false,
        title: "",
        description: "",
    });
    
    const closeAlert = () => setAlertConfig(prev => ({ ...prev, open: false }));
    
    // Search Logic
    const [searchMatches, setSearchMatches] = useState<number[]>([]); // Indicies of rows
    const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);

    useEffect(() => {
        if (!searchQuery) {
            setSearchMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const query = searchQuery.toLowerCase();
        const matches: number[] = [];

        comparisonRows.forEach((row, index) => {
            // Respect Filter
            if (filter === 'mismatch' && row.isMatch) return;
            if (filter === 'match' && !row.isMatch) return;

            const approvedVal = approvedItems[row.key];
            const valA = approvedVal !== undefined ? approvedVal : row.valA;
            const valB = approvedVal !== undefined ? approvedVal : row.valB;

            if (
                row.key.toLowerCase().includes(query) ||
                valA.toLowerCase().includes(query) ||
                valB.toLowerCase().includes(query)
            ) {
                matches.push(index);
            }
        });

        setSearchMatches(matches);
        if (matches.length > 0) {
            setCurrentMatchIndex(0);
            // Optional: Auto-scroll to first match? 
            // Might conflict with user focus, but requested "auto scroll to exact match"
            setSelectedRow(matches[0]);
        } else {
            setCurrentMatchIndex(-1);
        }
    }, [searchQuery, comparisonRows, filter, approvedItems]);

    const nextMatch = () => {
        if (searchMatches.length === 0) return;
        const next = (currentMatchIndex + 1) % searchMatches.length;
        setCurrentMatchIndex(next);
        setSelectedRow(searchMatches[next]);
    };

    const prevMatch = () => {
        if (searchMatches.length === 0) return;
        const prev = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
        setCurrentMatchIndex(prev);
        setSelectedRow(searchMatches[prev]);
    };
    
    // Clear search
    const { setSearchQuery } = useComparisonContext(); // Need setter locally if not destructured

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 640);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);
    
    // Load initial data logic kept for now, but context usually handles state. 
    // If context loads from localStorage, this effect might be redundant or safe to keep as sync.
    // We'll keep it simple: relying on Context's internal initialization mostly, 
    // but if we want to ensure data pulls from API on fresh load if empty (and available on server), we can keep it.
    // For now, let's trust the Context's localStorage init.
    // Actually, the original code loaded from `getStructuredDocument`. The Context loads from `localStorage`. 
    // If `localStorage` is empty, we might want to fetch? 
    // The user's request focuses on explicitly running extraction. So let's leave auto-fetch out for now unless it was critical.
    
    const filteredRows = useMemo(() => {
        if (isContextStale) return [];
        if (filter === "all") return comparisonRows;
        if (filter === "mismatch") return comparisonRows.filter(r => !r.isMatch);
        if (filter === "match") return comparisonRows.filter(r => r.isMatch);
        if (filter === "warning") return comparisonRows.filter(r => r.tier === "warning");
        return comparisonRows;
    }, [comparisonRows, filter, isContextStale]);

    const [selectedRow, setSelectedRow] = useState<number | null>(null);
    const [selectedPanel, setSelectedPanel] = useState<'A' | 'B'>('A');

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (filteredRows.length === 0) return;
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedRow(prev => {
                    if (prev === null) return 0;
                    return Math.min(prev + 1, filteredRows.length - 1);
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedRow(prev => {
                    if (prev === null) return filteredRows.length - 1;
                    return Math.max(prev - 1, 0);
                });
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (selectedPanel === 'A') setSelectedPanel('B');
                break;
            case 'ArrowLeft':
                 e.preventDefault();
                 if (selectedPanel === 'B') setSelectedPanel('A');
                 break;
        }
    };

    // Use a ref to track the last processed selection to prevent running the effect on every render
    const lastSelectionRef = useRef<{row: number | null, panel: 'A' | 'B'}>({ row: null, panel: 'A' });

    // Auto-highlight and scroll
    useEffect(() => {
        // Only run if the selection actually changed
        if (lastSelectionRef.current.row === selectedRow && lastSelectionRef.current.panel === selectedPanel) {
            return;
        }

        if (selectedRow !== null && filteredRows[selectedRow]) {
            const row = filteredRows[selectedRow];
            
            // Highlight based on selected panel
            const linesToHighlight = selectedPanel === 'A' ? row.lineNumbersA : row.lineNumbersB;
            
            // If the specific panel has no lines (e.g. missing value), falling back to other panel might be misleading.
            // But showing *nothing* might feel broken.
            // Current decision: Accuracy is paramount. Show only what the selected model "saw".
            // If it saw nothing, show nothing. 
            // Exception: If both are empty (rare if data exists), maybe fallback to allLines? 
            // Let's stick to specific lines first.
            
            onHighlight?.(linesToHighlight || []);
            
            // Scroll into view
            const element = document.getElementById(`row-${selectedPanel.toLowerCase()}-${selectedRow}`);
            element?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            
            // Update last processed selection
            lastSelectionRef.current = { row: selectedRow, panel: selectedPanel };
        }
    }, [selectedRow, selectedPanel, filteredRows, onHighlight]);
    


    // Handle focusKey change (from ResultTab redirect)
    useEffect(() => {
        if (focusKey) {
            // Force reset filter if needed so we can find the item
            if (filter !== 'all') {
                setFilter('all');
                // The filter state update is async, so we might need to rely on the next render cycle 
                // or memo dependency to catch it. However, setting it here queues the re-render.
                // We should wait effectively? 
                
                // Better approach: Let this effect run, set filter, then when filteredRows updates, 
                // we check focusKey again (handled by the dependency on filter/filteredRows).
                 return; 
            }
            
            // Now try to find it
            const index = filteredRows.findIndex(r => r.key === focusKey);
            if (index !== -1) {
                // Found it!
                setSelectedRow(index);
                // Also explicitly scroll to it now
                // setTimeout ensures DOM is reflected if just switched tabs
                setTimeout(() => {
                    const rowId = `row-unified-${index}`;
                     const element = document.getElementById(rowId);
                     if (element) {
                         element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                         // Also trigger highlight for that row
                         const row = filteredRows[index];
                         if (row) {
                             const lines = row.lineNumbersA.length > 0 ? row.lineNumbersA : row.lineNumbersB;
                             onHighlight?.(lines);
                         }
                     } else {
                         console.warn("[ComparisonTab] Could not find element", rowId);
                     }
                }, 100);
                
                // Clear the focus key so it doesn't re-trigger
                setFocusKey(null);
            } else {
                 // Not found yet (maybe data loading?)
                 // If data is loaded and still not found, then it's actually missing.
            }
        }
    }, [focusKey, filteredRows, setFocusKey, filter, setFilter, onHighlight]);
    
    // Model Names for Headers
    const getModelName = (id: string, isCustom: boolean, custom: string) => {
        if (isCustom) return custom || "Custom Model";
        const found = AVAILABLE_MODELS.find(m => m.id === id);
        return found ? found.name : id;
    };
    
    const nameA = getModelName(modelA, isCustomA, customModelA);
    const nameB = getModelName(modelB, isCustomB, customModelB);

    return (
        <div 
            ref={containerRef} 
            className="flex flex-col h-full bg-background/50 outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onClick={(e) => {
                // Only capture focus if clicking on empty space, otherwise child elements handle it
                if (e.target === e.currentTarget) e.currentTarget.focus();
            }}
        >
             <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2">
                {/* Filters */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 bg-muted/50 p-1 rounded-md border text-xs">
                        <Button 
                            variant={filter === "all" ? "secondary" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilter("all")}
                            className="h-7"
                        >
                            Show All
                        </Button>
                        <Button 
                            variant={filter === "mismatch" ? "secondary" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilter("mismatch")}
                            className="h-7 text-destructive hover:text-destructive"
                        >
                            Mismatches Only
                        </Button>
                        <Button 
                            variant={filter === "match" ? "secondary" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilter("match")}
                            className="h-7 text-green-600 hover:text-green-700"
                        >
                            Matches Only
                        </Button>
                        <Button 
                            variant={filter === "warning" ? "secondary" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilter("warning")}
                            className="h-7 text-yellow-600 hover:text-yellow-700"
                        >
                            Suspicious
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Comparing {filteredRows.length} fields
                    </div>
                </div>
            </div>
            
            {/* Search Overlay */}
            {searchQuery && (
                <div className="fixed top-32 right-6 z-50 flex items-center bg-background/95 backdrop-blur-sm border rounded-full shadow-lg h-10 px-3 gap-2 animate-in slide-in-from-top-4 items-center">
                    <span className="text-sm font-medium text-foreground mr-1 font-mono w-12 text-center">
                        {searchMatches.length > 0 ? currentMatchIndex + 1 : 0} / {searchMatches.length}
                    </span>
                    <div className="h-5 w-[1px] bg-border mx-1" />
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-full hover:bg-muted" 
                        onClick={prevMatch}
                        disabled={searchMatches.length === 0}
                    >
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-full hover:bg-muted" 
                        onClick={nextMatch}
                        disabled={searchMatches.length === 0}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                    <div className="h-5 w-[1px] bg-border mx-1" />
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive" 
                        onClick={() => setSearchQuery("")}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            
            {/* Unified Results List */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                
                {/* Unified Header */}
                {(safeDataA || safeDataB || safeLoadingA || safeLoadingB) && (
                     <div className={cn(
                        "bg-muted/30 border-b px-4 py-2 text-xs font-medium text-muted-foreground grid gap-4 sticky top-0 z-10 backdrop-blur-sm",
                        isNarrow ? "grid-cols-1" : "grid-cols-2"
                      )}>
                        <div className="flex items-center justify-between min-w-0">
                             <div className="flex items-center min-w-0 flex-1 mr-2">
                                <span className="truncate max-w-[80%]">{nameA}</span>
                                <LoadingTimer isLoading={safeLoadingA} startTime={startTimeA} duration={durationA} />
                             </div>
                             {safeLoadingA && <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />}
                        </div>
                        {!isNarrow && (
                            <div className="flex items-center justify-between min-w-0 pl-4 border-l">
                                 <div className="flex items-center min-w-0 flex-1 mr-2">
                                    <span className="truncate max-w-[80%]">{nameB}</span>
                                    <LoadingTimer isLoading={safeLoadingB} startTime={startTimeB} duration={durationB} />
                                 </div>
                                 {safeLoadingB && <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />}
                            </div>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {(!safeDataA && !safeDataB && !safeLoadingA && !safeLoadingB) && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 text-center">
                         <h3 className="text-lg font-semibold text-foreground">Ready to Compare</h3>
                         <p className="text-sm text-muted-foreground max-w-sm">
                             Extract data using two different models to compare their accuracy and performance.
                         </p>
                         <Button onClick={runComparison} size="lg" className="mt-4">
                             <Play className="w-4 h-4 mr-2" />
                             Run Extraction
                         </Button>
                         <div className="text-xs text-muted-foreground mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-left border p-3 rounded-md bg-muted/20">
                             <span className="font-medium">Model A:</span> <span>{nameA}</span>
                             <span className="font-medium">Model B:</span> <span>{nameB}</span>
                         </div>
                    </div>
                )}

                {/* Main Content ScrollArea */}
                {((safeDataA || safeDataB) || (safeLoadingA || safeLoadingB)) && (
                    <ScrollArea className="flex-1 bg-card/30">
                        <div className="p-4 space-y-4">
                            {(safeLoadingA || safeLoadingB) && !safeDataA && !safeDataB ? (
                                 <div className="space-y-4">
                                     {Array.from({length: 6}).map((_, i) => (
                                         <div key={i} className={cn(
                                            "grid gap-4 border rounded-md p-3",
                                            isNarrow ? "grid-cols-1" : "grid-cols-2"
                                         )}>
                                             <div className="space-y-2">
                                                 <Skeleton className="h-3 w-24" />
                                                 <Skeleton className="h-4 w-full" />
                                             </div>
                                             <div className="space-y-2">
                                                 <Skeleton className="h-3 w-24" />
                                                 <Skeleton className="h-4 w-full" />
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                            ) : (
                                filteredRows.map((row, i) => {
                                   const isSelected = selectedRow === i;
                                   
                                   return (
                                     <div 
                                        key={row.key}
                                        id={`row-unified-${i}`} // Unified ID
                                        onClick={() => {
                                            setSelectedRow(i);
                                            // Panel selection logic could be refined based on click target, 
                                            // but generally row selection is primary now.
                                        }}
                                        className={cn(
                                           "rounded border grid transition-colors group/row",
                                           isNarrow ? "grid-cols-1 divide-y" : "grid-cols-2 divide-x",
                                           !isSelected && "hover:bg-muted/30 border-border",
                                           isSelected ? "bg-accent/50 border-primary ring-1 ring-primary/20" : "",
                                           !row.isMatch && !isSelected && "border-destructive/20 bg-destructive/5",
                                           row.tier === "warning" && !isSelected && "border-yellow-200 bg-yellow-50/50" // Warning style
                                       )}
                                     >
                                        {/* Model A Cell */}
                                        <div className="p-3 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider truncate">{row.key}</div>
                                                {row.sortKey !== Number.MAX_SAFE_INTEGER && (
                                                    <div className="text-[10px] text-muted-foreground opacity-50">L{row.sortKey}</div>
                                                )}
                                            </div>
                                            <ComparisonCell 
                                                model="A"
                                                index={row.indexA}
                                                uniqueKey={row.key}
                                                rawKey={row.key.replace(/ \[\d+\]$/, '')}
                                                value={row.valA}
                                                diffValue={row.valB}
                                                isMatch={row.isMatch}
                                                tier={row.tier}
                                                verificationReason={row.verificationReason}
                                                isApproved={approvedItems[row.key] === row.valA}
                                                onApprove={approveItem}
                                                onUpdate={updateItem}
                                                loading={safeLoadingA}
                                            />
                                        </div>

                                        {/* Model B Cell */}
                                        <div className="p-3 min-w-0">
                                             <div className="flex justify-between items-center mb-1">
                                                <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider truncate opacity-50">{row.key}</div> {/* Dimmed key for B since redundant */}
                                                 <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-4 w-4 text-muted-foreground hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity ml-auto"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm("Are you sure you want to delete this row? This action will remove it from the final result.")) {
                                                            deleteItem(row.key);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                            <ComparisonCell 
                                                model="B"
                                                index={row.indexB}
                                                uniqueKey={row.key}
                                                rawKey={row.key.replace(/ \[\d+\]$/, '')}
                                                value={row.valB}
                                                diffValue={row.valA} // Pass A as diff for B
                                                isMatch={row.isMatch}
                                                tier={row.tier}
                                                verificationReason={row.verificationReason}
                                                isApproved={approvedItems[row.key] === row.valB}
                                                onApprove={approveItem}
                                                onUpdate={updateItem}
                                                loading={safeLoadingB}
                                            />
                                        </div>
                                     </div>
                                   );
                                })
                            )}
                            
                            {!safeLoadingA && !safeLoadingB && filteredRows.length === 0 && (safeDataA || safeDataB) && (
                                <div className="text-center text-muted-foreground py-10 text-sm italic col-span-2">
                                    No common data found to compare.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}
            </div>

            
            <AlertDialog open={alertConfig.open} onOpenChange={closeAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{alertConfig.title}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {alertConfig.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        {alertConfig.showCancel && (
                            <AlertDialogCancel onClick={closeAlert}>Cancel</AlertDialogCancel>
                        )}
                        <AlertDialogAction 
                            onClick={(e) => {
                                if (alertConfig.onAction) {
                                    alertConfig.onAction();
                                }
                                closeAlert();
                            }}
                            className={cn(alertConfig.variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                        >
                            {alertConfig.actionLabel || "Continue"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
