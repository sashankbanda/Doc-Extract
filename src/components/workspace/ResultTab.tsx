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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useComparisonContext } from "@/context/ComparisonContext";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Play, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface ResultTabProps {
    whisperHash?: string | null;
    onHighlight?: (lines: number[]) => void;
    onRequestCompare?: () => void;
}

export function ResultTab({ whisperHash: targetHash, onHighlight, onRequestCompare }: ResultTabProps) {
    const { 
        comparisonRows, 
        dataA, 
        dataB, 
        approvedItems, 
        whisperHash, 
        deleteItem,
        runComparison, 
        loadingA, 
        loadingB, 
        setFocusKey,
        resultFilter,
        setResultFilter,
        searchQuery,
        setSearchQuery
    } = useComparisonContext(); 
    
    // Safety check: specific hash request vs context hash
    // If we are looking at Doc B (targetHash), but Context is still on Doc A (contextHash/whisperHash),
    // we should wait (show loading) instead of showing Doc A's data.
    const isContextStale = targetHash && whisperHash !== targetHash;

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    // Search State
    const [searchMatches, setSearchMatches] = useState<number[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);

    const filteredRows = useMemo(() => {
        if (isContextStale) return [];
        return comparisonRows.filter(row => {
            if (resultFilter === 'all') return true;
            const approvedVal = approvedItems[row.key];
            if (resultFilter === 'approved') return approvedVal !== undefined;
            // 'review' (formerly 'null') means mismatch and not approved
            if (resultFilter === 'review') return approvedVal === undefined && !row.isMatch;
            return true;
        });
    }, [comparisonRows, resultFilter, approvedItems, isContextStale]);


    // Calculate matches when query or rows change
    useEffect(() => {
        if (!searchQuery) {
            setSearchMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const query = searchQuery.toLowerCase();
        const matches: number[] = [];

        filteredRows.forEach((row, index) => {
            const approvedVal = approvedItems[row.key];
            const valToCheck = approvedVal !== undefined ? approvedVal : (row.isMatch ? row.valA : "null");
            
            if (
                row.key.toLowerCase().includes(query) ||
                String(valToCheck).toLowerCase().includes(query)
            ) {
                matches.push(index);
            }
        });

        setSearchMatches(matches);
        // If we have matches, select the first one if none selected, or try to keep current relative selection?
        // Simple behavior: jump to first match on new search
        if (matches.length > 0) {
            setCurrentMatchIndex(0);
            setSelectedIndex(matches[0]); // Auto-select/scroll
        } else {
            setCurrentMatchIndex(-1);
        }
    }, [searchQuery, filteredRows, approvedItems]); // approvedItems dependency ensures value updates re-trigger search

    // Navigation handlers
    const nextMatch = () => {
        if (searchMatches.length === 0) return;
        const next = (currentMatchIndex + 1) % searchMatches.length;
        setCurrentMatchIndex(next);
        setSelectedIndex(searchMatches[next]);
    };

    const prevMatch = () => {
        if (searchMatches.length === 0) return;
        const prev = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
        setCurrentMatchIndex(prev);
        setSelectedIndex(searchMatches[prev]);
    };

    const clearSearch = () => {
        setSearchQuery("");
    };


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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (filteredRows.length === 0) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => {
                if (prev === null) return 0;
                return Math.min(prev + 1, filteredRows.length - 1);
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => {
                if (prev === null) return filteredRows.length - 1;
                return Math.max(prev - 1, 0);
            });
        }
    };



    // Auto-highlight and scroll when selectedIndex changes
    // Use a ref to track the last processed selection
    const lastSelectionRef = useRef<number | null>(null);

    // Auto-highlight and scroll when selectedIndex changes
    useEffect(() => {
        // Only run if the selection actually changed
        if (lastSelectionRef.current === selectedIndex) {
            return;
        }

        if (selectedIndex !== null && filteredRows[selectedIndex]) {
            const row = filteredRows[selectedIndex];
            
            let lines: number[] = [];
            const approvedVal = approvedItems[row.key];
            
            if (approvedVal !== undefined) {
                // If specific approval matches a model, use its lines
                if (approvedVal === row.valA) {
                    lines = row.lineNumbersA;
                } else if (approvedVal === row.valB) {
                    lines = row.lineNumbersB;
                }
                // If custom edit (matches neither), highlight nothing to avoid confusion
            } else if (row.isMatch) {
                // If auto-match, prefer Model A's lines (primary) to avoid union noise
                lines = row.lineNumbersA;
            }
            
            // Only highlight if we have lines (don't highlight on null/mismatch unless approved)
            if (lines.length > 0) {
                 onHighlight?.(lines);
            }

            // Scroll into view
            const el = document.getElementById(`result-row-${selectedIndex}`);
            el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            
            lastSelectionRef.current = selectedIndex;
        }
    }, [selectedIndex, filteredRows, onHighlight]);

    // Effect: Mark as In Progress when user makes first approval/edit
    const hasUpdatedStatusRef = useRef(false);
    useEffect(() => {
        if (hasUpdatedStatusRef.current || !whisperHash) return;
        
        // Check if there are any approvals
        const approvalCount = Object.keys(approvedItems).length;
        if (approvalCount > 0) {
            // Fire and forget status update
             fetch("http://localhost:8005/dashboard/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    whisper_hash: whisperHash,
                    status: "In Progress"
                })
            }).catch(console.error);
            hasUpdatedStatusRef.current = true;
        }
    }, [approvedItems, whisperHash]);


    const handleExport = async () => {
        if (!whisperHash) return;

        const itemsToExport = comparisonRows.map(row => {
            const approvedVal = approvedItems[row.key];
            const isApproved = approvedVal !== undefined;
            const finalValue = isApproved ? approvedVal : (row.isMatch ? row.valA : "null");
            
            return {
                key: row.key,
                source_key: row.key.replace(/ \[\d+\]$/, ''),
                value: finalValue,
                line_numbers: row.lineNumbers,
                is_approved: isApproved,
                is_match: row.isMatch
            };
        });

        try {
            const res = await fetch("http://localhost:8005/export/save_result", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    whisper_hash: whisperHash,
                    items: itemsToExport
                })
            });
            
            if (!res.ok) throw new Error("Failed to save export");

            setAlertConfig({
                open: true,
                title: "Export Successful",
                description: "Export saved successfully!",
                showCancel: false,
                actionLabel: "OK"
            });
        } catch (e) {
            console.error(e);
            setAlertConfig({
                open: true,
                title: "Export Failed",
                description: "Failed to save export. Please try again.",
                showCancel: false,
                actionLabel: "OK",
                variant: "destructive"
            });
        }
    };

    if (loadingA || loadingB || isContextStale) {
        return (
            <div className="flex flex-col h-full bg-background/50">
                <div className="border-b bg-background/95 backdrop-blur px-4 py-3 sticky top-0 z-10">
                    <div className="flex items-center gap-2 font-medium">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <h2 className="text-lg font-semibold">{isContextStale ? "Loading document..." : "Extracting Data..."}</h2>
                    </div>
                </div>
                <div className="p-8 space-y-4">
                     <div className="space-y-4">
                        {Array.from({length: 8}).map((_, i) => (
                            <div key={i} className="flex gap-4 items-center">
                                <Skeleton className="h-4 w-[200px]" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        ))}
                     </div>
                     <div className="flex justify-center text-muted-foreground text-sm pt-4 animate-pulse">
                        {isContextStale ? "Syncing context..." : "Comparing models, please wait..."}
                     </div>
                </div>
            </div>
        );
    }

    if (!dataA && !dataB) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <p>No comparison data available.</p>
                <p className="text-sm mt-2 mb-6">Please run a comparison to view results.</p>
                <Button onClick={runComparison} size="lg">
                    <Play className="w-4 h-4 mr-2" />
                    Run Extraction
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background/50">
             <div className="border-b bg-background/95 backdrop-blur px-4 py-3 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-2 bg-muted/50 p-1 rounded-md border text-xs">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setResultFilter("all")}
                            className={cn("h-7", resultFilter === "all" && "bg-secondary text-secondary-foreground shadow-sm")}
                        >
                            All
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setResultFilter("approved")}
                            className={cn(
                                "h-7 transition-colors",
                                resultFilter === "approved" 
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 shadow-sm" 
                                    : "text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-100/50"
                            )}
                        >
                            Approved
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setResultFilter("review")}
                            className={cn(
                                "h-7 transition-colors",
                                resultFilter === "review" 
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 shadow-sm" 
                                    : "text-destructive hover:text-destructive hover:bg-red-100/50"
                            )}
                        >
                            Review
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground ml-4">
                        {filteredRows.length} fields
                    </div>

                </div>
                
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button 
                        size="sm" 
                        variant="default" 
                        className="h-9 gap-2 bg-green-600 hover:bg-green-700"
                        onClick={async () => {
                            if (!whisperHash) return;
                            
                            // 0. Validation: Ensure all items are resolved
                             const unresolvedCount = comparisonRows.reduce((acc, row) => {
                                const approvedVal = approvedItems[row.key];
                                const isResolved = approvedVal !== undefined || row.isMatch;
                                return isResolved ? acc : acc + 1;
                            }, 0);

                            if (unresolvedCount > 0) {
                                setAlertConfig({
                                    open: true,
                                    title: "Cannot Finish Review",
                                    description: `There are ${unresolvedCount} unresolved items (marked in red). Please approve or edit them.`,
                                    showCancel: false,
                                    actionLabel: "OK",
                                    variant: "destructive"
                                });
                                
                                // Auto-update status to In Progress since user tried to finish but couldn't
                                try {
                                     await fetch("http://localhost:8005/dashboard/status", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            whisper_hash: whisperHash,
                                            status: "In Progress"
                                        })
                                    });
                                } catch (e) {
                                    console.error("Failed to update status to In Progress", e);
                                }
                                return;
                            }

                            // 1. Prepare Export Data (Auto-save)
                            const itemsToExport = comparisonRows.map(row => {
                                const approvedVal = approvedItems[row.key];
                                const isApproved = approvedVal !== undefined;
                                const finalValue = isApproved ? approvedVal : (row.isMatch ? row.valA : "null");
                                
                                return {
                                    key: row.key,
                                    source_key: row.key.replace(/ \[\d+\]$/, ''),
                                    value: finalValue,
                                    line_numbers: row.lineNumbers,
                                    is_approved: isApproved,
                                    is_match: row.isMatch
                                };
                            });

                            try {
                                // 2. Save Result (Creates _result.json which Dashboard needs)
                                const saveRes = await fetch("http://localhost:8005/export/save_result", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        whisper_hash: whisperHash,
                                        items: itemsToExport
                                    })
                                });
                                
                                if (!saveRes.ok) throw new Error("Failed to save result");

                                // 3. Update Status
                                const statusRes = await fetch("http://localhost:8005/dashboard/status", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        whisper_hash: whisperHash,
                                        status: "Completed"
                                    })
                                });
                                
                                if (!statusRes.ok) throw new Error("Failed to update status");
                                
                                // 4. Redirect
                                window.location.href = "/dashboard";
                            } catch (e) {
                                console.error("Failed to finish review", e);
                                setAlertConfig({
                                    open: true,
                                    title: "Error",
                                    description: "Failed to finish review. Please try again.",
                                    showCancel: false,
                                    actionLabel: "OK",
                                    variant: "destructive"
                                });
                            }
                        }}
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Finish Review
                    </Button>
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
                        onClick={clearSearch}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <ScrollArea className="flex-1 h-full bg-background">
                <div 
                    className="p-4 outline-none min-h-full" 
                    tabIndex={0} 
                    onKeyDown={handleKeyDown}
                    // Auto-focus on mount or click
                    onClick={(e) => e.currentTarget.focus()}
                >

                    <div className="rounded-md border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[300px]">Source Key</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead className="w-[100px] text-right">L#</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRows.map((row, i) => {
                                    // Logic: 
                                    // 1. If Approved -> Show Approved Value
                                    // 2. If Match -> Show Value
                                    // 3. Else -> "null"
                                    
                                    const approvedVal = approvedItems[row.key];
                                    
                                    let displayValue = "";
                                    let isMiss = false;
                                    let isApproved = false;
                                    
                                    if (approvedVal !== undefined) {
                                        // Approved override
                                        displayValue = approvedVal;
                                        isApproved = true;
                                    } else if (!row.isMatch) {
                                        displayValue = "null"; 
                                        isMiss = true;
                                    } else {
                                        // Match
                                        displayValue = row.valA;
                                    }
                                    
                                    // Determine confidence to display
                                    // If match, Model A confidence is usually representative? Or average?
                                    // If approved, approvedItems is a simple map key->value without confidence stored.
                                    // So we can fallback to the confidence of the model that produced the value if possible.
                                    // But comparisonRows doesn't store confidence easily accessible in this loop without diving into itemA/B.
                                    
                                    // We need to access the underlying item confidence.
                                    // Ideally, comparisonRows should expose it.
                                    // For now, let's try to grab it from row.itemA or row.itemB
                                    
                                    let displayConf: number | undefined;
                                    if (row.isMatch) displayConf = row.itemA?.confidence;
                                    else if (approvedVal === row.valA) displayConf = row.itemA?.confidence;
                                    else if (approvedVal === row.valB) displayConf = row.itemB?.confidence;
                                    
                                    const isSelected = i === selectedIndex;

                                    return (
                                        <TableRow 
                                            key={i}
                                            id={`result-row-${i}`}
                                            className={cn(
                                                "cursor-pointer transition-colors border-l-4 border-l-transparent",
                                                isMiss && "text-muted-foreground italic bg-destructive/5 dark:bg-red-900/10",
                                                isApproved && "bg-green-50/50 dark:bg-green-900/20",
                                                isSelected && "bg-accent border-l-primary ring-1 ring-inset ring-primary/20",
                                                !isSelected && "hover:bg-muted/50"
                                            )}
                                            onClick={() => {
                                                setSelectedIndex(i);
                                                
                                                if (isMiss && onRequestCompare) {
                                                    // Redirect to compare tab
                                                    setFocusKey(row.key);
                                                    onRequestCompare();
                                                    return;
                                                }

                                                // onHighlight handled by effect
                                            }}
                                        >
                                            <TableCell className="font-medium align-top">
                                                {row.key}
                                                {isApproved && <span className="ml-2 text-green-600 dark:text-green-400 text-[10px] uppercase border border-green-200 dark:border-green-800 px-1 rounded bg-green-50 dark:bg-green-900/40">Approved</span>}
                                            </TableCell>
                                            <TableCell className={cn("align-top whitespace-pre-wrap break-words min-w-0", isApproved && "font-medium text-green-900 dark:text-green-300")}>
                                                {displayValue}
                                                {displayConf !== undefined && displayConf !== null && (
                                                    <span className={cn(
                                                        "ml-2 text-[9px] px-1 rounded border opacity-70 font-mono inline-block align-middle",
                                                        displayConf >= 90 ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" :
                                                        displayConf >= 70 ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800" :
                                                        "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                                                    )}>
                                                        {displayConf}%
                                                    </span>
                                                )}
                                            </TableCell>
                                             <TableCell className="align-top text-right text-xs text-muted-foreground w-[50px]">
                                                {row.sortKey !== Number.MAX_SAFE_INTEGER ? `L${row.sortKey}` : "-"}
                                            </TableCell>
                                            <TableCell className="align-top w-[40px] p-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAlertConfig({
                                                            open: true,
                                                            title: "Delete Row",
                                                            description: "Are you sure you want to delete this row? This action will remove it from the final result.",
                                                            showCancel: true,
                                                            actionLabel: "Delete",
                                                            variant: "destructive",
                                                            onAction: () => deleteItem(row.key)
                                                        });
                                                    }}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </ScrollArea>
            
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
