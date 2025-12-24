import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useComparisonContext } from "@/context/ComparisonContext";
import { getStructuredDocument, structureDocument } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Check, CheckCircle2, Edit2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
    isMatch, 
    isApproved,
    onApprove, 
    onUpdate 
}: {
    model: 'A' | 'B';
    index?: number;
    uniqueKey: string;
    rawKey: string;
    value: string;
    isMatch: boolean;
    isApproved: boolean;
    onApprove: (key: string, val: string) => void;
    onUpdate: (model: 'A' | 'B', index: number, k: string, v: string) => void;
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

    return (
        <div className="group relative pr-16 min-h-[2rem] flex items-center">
            <span className={cn("break-words", isApproved && "font-bold text-green-700")}>
                {value}
                {isApproved && <CheckCircle2 className="w-3 h-3 inline-block ml-1 opacity-70" />}
            </span>
            
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
        filter, setFilter,
        comparisonRows,
        approvedItems, 
        approveItem,
        updateItem,
        deleteItem
    } = useComparisonContext();
    
    // ... (rest of local state) ...
    // Note: I will only replace the rendering part, but since this tool replaces chunks, I need the context destructuring to be updated too.
    
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

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
    
    // Load initial data for Model A if available (Baseline)
    useEffect(() => {
        if (!whisperHash) return;
        
        // Only load if dataA is empty (first time or clear)
        if (!dataA) {
            // Try to load existing data for the initial view (assuming it was run with default model)
            const loadInitial = async () => {
                try {
                    const existing = await getStructuredDocument(whisperHash);
                    if (existing && existing.items) {
                        setDataA(existing.items);
                    }
                } catch (e) {
                    // ignore
                }
            };
            loadInitial();
        }
    }, [whisperHash, dataA, setDataA]);

    const handleRunComparison = async () => {
        if (!whisperHash) return;
        
        const effectiveModelA = isCustomA ? customModelA : modelA;
        const effectiveModelB = isCustomB ? customModelB : modelB;
        
        if (!effectiveModelA || !effectiveModelB) {
            toast.error("Please select models for both panels");
            return;
        }

        // Run in parallel
        setLoadingA(true);
        setLoadingB(true);
        
        // Launch A
        const promiseA = structureDocument(whisperHash, effectiveModelA, true)
            .then(res => {
                setDataA(res.items);
                toast.success(`Model A (${effectiveModelA}) complete`);
            })
            .catch(err => {
                console.error("Model A failed", err);
                toast.error(`Model A failed: ${err.message}`);
            })
            .finally(() => setLoadingA(false));

        // Launch B
        const promiseB = structureDocument(whisperHash, effectiveModelB, true)
            .then(res => {
                setDataB(res.items);
                toast.success(`Model B (${effectiveModelB}) complete`);
            })
            .catch(err => {
                console.error("Model B failed", err);
                toast.error(`Model B failed: ${err.message}`);
            })
            .finally(() => setLoadingB(false));
            
        await Promise.all([promiseA, promiseB]);
    };

    const filteredRows = useMemo(() => {
        if (filter === "all") return comparisonRows;
        if (filter === "mismatch") return comparisonRows.filter(r => !r.isMatch);
        if (filter === "match") return comparisonRows.filter(r => r.isMatch);
        return comparisonRows;
    }, [comparisonRows, filter]);

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
            onHighlight?.(row.lineNumbers);
            
            // Scroll into view
            const element = document.getElementById(`row-${selectedPanel.toLowerCase()}-${selectedRow}`);
            element?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            
            // Update last processed selection
            lastSelectionRef.current = { row: selectedRow, panel: selectedPanel };
        }
    }, [selectedRow, selectedPanel, filteredRows, onHighlight]);

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
           {/* ... Header ... */}
           {/* (I am skipping replacing the header code blocks to avoid huge diffs, will target the specific container) */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 space-y-4">
                 {/* ... content of header ... */}
                 {/* I will invoke replace_file_content separately for the header if needed, but the main change is the ScrollArea content */}
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
                            className="h-7 text-green-600 hover:text-green-600"
                        >
                            Matches Only
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Comparing {filteredRows.length} fields
                    </div>
                </div>
            </div>
            
            {/* Split View Results */}
            <div className={cn(
                "flex-1 overflow-hidden grid min-h-0",
                isNarrow ? "grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] divide-y" : "grid-cols-2 grid-rows-[minmax(0,1fr)] divide-x"
            )}>
                {/* Panel A */}
                <ScrollArea className="h-full bg-card/30 min-w-0">
                    <div className="p-4 space-y-1">
                        {!dataA && !loadingA && (
                            <div className="text-center text-muted-foreground py-10 text-sm">
                                No data loaded. Run comparison to start.
                            </div>
                        )}
                        {filteredRows.map((row, i) => {
                           const isSelected = selectedRow === i && selectedPanel === 'A';
                           return (
                           <div 
                                key={`a-${i}`}
                                id={`row-a-${i}`}
                                onClick={() => {
                                    // Highlight handled by effect
                                    setSelectedRow(i);
                                    setSelectedPanel('A');
                                }}
                                className={cn(
                                   "p-3 rounded border text-sm grid gap-1 cursor-pointer transition-colors group",
                                   !isSelected && "hover:bg-muted/50",
                                   isSelected ? "bg-accent border-primary ring-1 ring-primary/20" : "border-border",
                                   !row.isMatch && !isSelected && "border-destructive/20 bg-destructive/5"
                               )}
                           >
                               <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">{row.key}</div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
                                    isMatch={row.isMatch}
                                    isApproved={approvedItems[row.key] === row.valA}
                                    onApprove={approveItem}
                                    onUpdate={updateItem}
                               />
                           </div> 
                           );
                        })}
                    </div>
                </ScrollArea>
                
                {/* Panel B */}
                 <ScrollArea className="h-full bg-card/30 min-w-0">
                    <div className="p-4 space-y-1">
                        {!dataB && !loadingB && (
                            <div className="text-center text-muted-foreground py-10 text-sm">
                                No data loaded. Run comparison to start.
                            </div>
                        )}
                        {filteredRows.map((row, i) => {
                           const isSelected = selectedRow === i && selectedPanel === 'B';
                           return (
                           <div 
                                key={`b-${i}`} 
                                id={`row-b-${i}`}
                                onClick={() => {
                                    // Highlight handled by effect
                                    setSelectedRow(i);
                                    setSelectedPanel('B');
                                }}
                                className={cn(
                                   "p-3 rounded border text-sm grid gap-1 cursor-pointer transition-colors group",
                                   !isSelected && "hover:bg-muted/50",
                                   isSelected ? "bg-accent border-primary ring-1 ring-primary/20" : "border-border",
                                   !row.isMatch && !isSelected && "border-destructive/20 bg-destructive/5"
                               )}
                           >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">{row.key}</div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
                                    {row.sortKey !== Number.MAX_SAFE_INTEGER && (
                                        <div className="text-[10px] text-muted-foreground opacity-50">L{row.sortKey}</div>
                                    )}
                               </div>
                               <ComparisonCell 
                                    model="B"
                                    index={row.indexB}
                                    uniqueKey={row.key}
                                    rawKey={row.key.replace(/ \[\d+\]$/, '')}
                                    value={row.valB}
                                    isMatch={row.isMatch}
                                    isApproved={approvedItems[row.key] === row.valB}
                                    onApprove={approveItem}
                                    onUpdate={updateItem}
                               />
                           </div> 
                           );
                        })}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
