import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComparisonContext } from "@/context/ComparisonContext";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, Play, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ResultTabProps {
    onHighlight?: (lines: number[]) => void;
    onRequestCompare?: () => void;
}

export function ResultTab({ onHighlight, onRequestCompare }: ResultTabProps) {
    const { comparisonRows, dataA, dataB, approvedItems, whisperHash, deleteItem, runComparison, loadingA, loadingB, setFocusKey } = useComparisonContext(); // Assume whisperHash is exposed
    const [filter, setFilter] = useState<'all' | 'approved' | 'null'>('all');
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    const filteredRows = comparisonRows.filter(row => {
        if (filter === 'all') return true;
        const approvedVal = approvedItems[row.key];
        if (filter === 'approved') return approvedVal !== undefined;
        // null means mismatch and not approved
        if (filter === 'null') return approvedVal === undefined && !row.isMatch;
        return true;
    });

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
                source_key: row.key.replace(/ \[\d+\]$/, ''), // simplified
                value: finalValue,
                line_numbers: row.lineNumbers,
                is_approved: isApproved,
                is_match: row.isMatch
            };
        });

        try {
            await fetch("http://localhost:8005/export/save_result", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    whisper_hash: whisperHash,
                    items: itemsToExport
                })
            });
            alert("Export saved successfully!");
        } catch (e) {
            console.error(e);
            alert("Export failed");
        }
    };

    if (loadingA || loadingB) {
        return (
            <div className="flex flex-col h-full bg-background/50">
                <div className="border-b bg-background/95 backdrop-blur px-4 py-3 sticky top-0 z-10">
                    <div className="flex items-center gap-2 font-medium">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <h2 className="text-lg font-semibold">Extracting Data...</h2>
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
                        Comparing models, please wait...
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
                            variant={filter === "all" ? "secondary" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilter("all")}
                            className="h-7"
                        >
                            All
                        </Button>
                        <Button 
                            variant={filter === "approved" ? "secondary" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilter("approved")}
                            className="h-7 text-green-600 hover:text-green-600"
                        >
                            Approved
                        </Button>
                        <Button 
                            variant={filter === "null" ? "secondary" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilter("null")}
                            className="h-7 text-destructive hover:text-destructive"
                        >
                            Review
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground ml-4">
                        Comparing {filteredRows.length} fields
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
                                alert(`Cannot finish review. There are ${unresolvedCount} unresolved items (marked in red). Please approve or edit them.`);
                                
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
                                await fetch("http://localhost:8005/export/save_result", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        whisper_hash: whisperHash,
                                        items: itemsToExport
                                    })
                                });

                                // 3. Update Status
                                await fetch("http://localhost:8005/dashboard/status", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        whisper_hash: whisperHash,
                                        status: "Completed"
                                    })
                                });
                                
                                // 4. Redirect
                                window.location.href = "/dashboard";
                            } catch (e) {
                                console.error("Failed to finish review", e);
                                alert("Failed to finish review. Please try again.");
                            }
                        }}
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Finish Review
                    </Button>
                </div>
            </div>

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
                                    
                                    const isSelected = i === selectedIndex;

                                    return (
                                        <TableRow 
                                            key={i}
                                            id={`result-row-${i}`}
                                            className={cn(
                                                "cursor-pointer transition-colors border-l-4 border-l-transparent",
                                                isMiss && "text-muted-foreground italic bg-destructive/5",
                                                isApproved && "bg-green-50/50",
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
                                                {isApproved && <span className="ml-2 text-green-600 text-[10px] uppercase border border-green-200 px-1 rounded bg-green-50">Approved</span>}
                                            </TableCell>
                                            <TableCell className={cn("align-top whitespace-pre-wrap break-words min-w-0", isApproved && "font-medium text-green-900")}>
                                                {displayValue}
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
                                                        if (window.confirm("Are you sure you want to delete this row? This action will remove it from the final result.")) {
                                                            deleteItem(row.key);
                                                        }
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
        </div>
    );
}
