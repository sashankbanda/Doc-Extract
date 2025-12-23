import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useComparisonContext } from "@/context/ComparisonContext";
import { getStructuredDocument, structureDocument } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2, Play, Settings2 } from "lucide-react";
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
        filter, setFilter
    } = useComparisonContext();
    
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Determine if we are "narrow" (like standard sm/md breakpoint)
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

    // Calculate Comparison
    const comparisonRows = useMemo(() => {
        if (!dataA && !dataB) return [];
        
        // Helper to group items by key
        const groupByKey = (items: typeof dataA) => {
            const map = new Map<string, typeof items>();
            if (!items) return map;
            
            items.forEach(item => {
                const key = item.source_key || "(no key)";
                if (!map.has(key)) {
                    map.set(key, []);
                }
                map.get(key)!.push(item);
            });
            return map;
        };

        const mapA = groupByKey(dataA);
        const mapB = groupByKey(dataB);
        
        // Union of all keys
        const allKeys = new Set([...(mapA.keys()), ...(mapB.keys())]);
        
        const rows: {
            key: string;
            valA: string;
            valB: string;
            isMatch: boolean;
            lineNumbers: number[];
            sortKey: number;
        }[] = [];

        allKeys.forEach(key => {
            const itemsA = mapA.get(key) || [];
            const itemsB = mapB.get(key) || [];
            
            // Align by index (zip)
            const maxLength = Math.max(itemsA.length, itemsB.length);
            
            for (let i = 0; i < maxLength; i++) {
                const itemA = itemsA[i];
                const itemB = itemsB[i];
                
                const valA = itemA ? itemA.value : undefined;
                const valB = itemB ? itemB.value : undefined;
                
                const isMatch = valA === valB;
                const displayA = valA === undefined ? "(missing)" : valA;
                const displayB = valB === undefined ? "(missing)" : valB;
                
                // Collect line numbers for highlighting
                const linesA = itemA?.line_numbers || [];
                const linesB = itemB?.line_numbers || [];
                const allLines = Array.from(new Set([...linesA, ...linesB])).sort((a,b) => a - b);
                
                // Determine sort key (min line number -> document order)
                // Default to infinity if no lines (bottom of list)
                const minLine = allLines.length > 0 ? Math.min(...allLines) : Number.MAX_SAFE_INTEGER;

                rows.push({
                    key: key + (maxLength > 1 ? ` [${i+1}]` : ""), // Distinguish duplicates if needed visually
                    valA: displayA,
                    valB: displayB,
                    isMatch,
                    lineNumbers: allLines,
                    sortKey: minLine
                });
            }
        });
        
        // Sort by line number (document order)
        return rows.sort((a, b) => a.sortKey - b.sortKey);
        
    }, [dataA, dataB]);

    const filteredRows = useMemo(() => {
        if (filter === "all") return comparisonRows;
        if (filter === "mismatch") return comparisonRows.filter(r => !r.isMatch);
        if (filter === "match") return comparisonRows.filter(r => r.isMatch);
        return comparisonRows;
    }, [comparisonRows, filter]);

    return (
        <div ref={containerRef} className="flex flex-col h-full bg-background/50">
            {/* Header / Controls */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 space-y-4">
                 <Accordion type="single" collapsible className="w-full border rounded-lg bg-card" defaultValue="settings">
                    <AccordionItem value="settings" className="border-none">
                        <AccordionTrigger className="px-4 py-2 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-primary" />
                                <span className="font-semibold text-sm">Comparison Settings</span>
                                <span className="text-xs text-muted-foreground ml-2 font-normal">
                                    Configure models and API keys
                                </span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 pt-0">
                           <div className={cn("grid gap-6 pt-4", isNarrow ? "grid-cols-1" : "grid-cols-2")}>
                                {/* Model Selection */}
                                <div className="space-y-4 border rounded-md p-4 bg-muted/20">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-sm">Model Selection</h3>
                                        <Button size="sm" onClick={handleRunComparison} disabled={loadingA || loadingB}>
                                            {(loadingA || loadingB) ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-2" />}
                                            Run Comparison
                                        </Button>
                                    </div>
                                    
                                    <div className={cn("grid gap-4", isNarrow ? "grid-cols-1" : "grid-cols-2")}>
                                        {/* Model A */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-medium text-muted-foreground">Model A (Baseline)</label>
                                                <Button variant="ghost" size="sm" onClick={() => setIsCustomA(!isCustomA)} className="h-5 text-[10px] px-2">
                                                    {isCustomA ? "Use Preset" : "Use Custom"}
                                                </Button>
                                            </div>
                                            {isCustomA ? (
                                                 <Input placeholder="provider/model-name" value={customModelA} onChange={e => setCustomModelA(e.target.value)} className="h-8 text-xs" />
                                            ) : (
                                                <Select value={modelA} onValueChange={setModelA}>
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {AVAILABLE_MODELS.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            {loadingA && <div className="text-xs text-blue-500 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin"/>Extracting...</div>}
                                        </div>

                                        {/* Model B */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-medium text-muted-foreground">Model B (Challenger)</label>
                                                 <Button variant="ghost" size="sm" onClick={() => setIsCustomB(!isCustomB)} className="h-5 text-[10px] px-2">
                                                    {isCustomB ? "Use Preset" : "Use Custom"}
                                                </Button>
                                            </div>
                                             {isCustomB ? (
                                                 <Input placeholder="provider/model-name" value={customModelB} onChange={e => setCustomModelB(e.target.value)} className="h-8 text-xs" />
                                            ) : (
                                                <Select value={modelB} onValueChange={setModelB}>
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {AVAILABLE_MODELS.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                           {loadingB && <div className="text-xs text-blue-500 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin"/>Extracting...</div>}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* API Key Manager */}
                                <div className="space-y-2">
                                    <ApiKeyManager />
                                </div>
                           </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                
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
                "flex-1 overflow-hidden grid",
                isNarrow ? "grid-cols-1 grid-rows-2 divide-y" : "grid-cols-2 divide-x"
            )}>
                {/* Panel A */}
                <ScrollArea className="h-full bg-card/30">
                    <div className="p-4 space-y-1">
                        {!dataA && !loadingA && (
                            <div className="text-center text-muted-foreground py-10 text-sm">
                                No data loaded. Run comparison to start.
                            </div>
                        )}
                        {filteredRows.map((row, i) => (
                           <div 
                                key={`a-${i}`} 
                                onClick={() => onHighlight?.(row.lineNumbers)}
                                className={cn(
                                   "p-3 rounded border text-sm grid gap-1 cursor-pointer transition-colors hover:bg-muted/50",
                                   !row.isMatch && "border-destructive/20 bg-destructive/5"
                               )}
                           >
                               <div className="flex justify-between items-center">
                                    <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">{row.key}</div>
                                    {row.sortKey !== Number.MAX_SAFE_INTEGER && (
                                        <div className="text-[10px] text-muted-foreground opacity-50">L{row.sortKey}</div>
                                    )}
                               </div>
                               <div className="font-medium break-words">{row.valA}</div>
                           </div> 
                        ))}
                    </div>
                </ScrollArea>
                
                {/* Panel B */}
                 <ScrollArea className="h-full bg-card/30">
                    <div className="p-4 space-y-1">
                        {!dataB && !loadingB && (
                            <div className="text-center text-muted-foreground py-10 text-sm">
                                No data loaded. Run comparison to start.
                            </div>
                        )}
                         {filteredRows.map((row, i) => (
                           <div 
                                key={`b-${i}`} 
                                onClick={() => onHighlight?.(row.lineNumbers)}
                                className={cn(
                                   "p-3 rounded border text-sm grid gap-1 cursor-pointer transition-colors hover:bg-muted/50",
                                   !row.isMatch && "border-destructive/20 bg-destructive/5"
                               )}
                           >
                                <div className="flex justify-between items-center">
                                    <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">{row.key}</div>
                                    {row.sortKey !== Number.MAX_SAFE_INTEGER && (
                                        <div className="text-[10px] text-muted-foreground opacity-50">L{row.sortKey}</div>
                                    )}
                               </div>
                               <div className="font-medium break-words">{row.valB}</div>
                           </div> 
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
