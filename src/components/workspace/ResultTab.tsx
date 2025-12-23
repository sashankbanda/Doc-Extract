import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComparisonContext } from "@/context/ComparisonContext";
import { cn } from "@/lib/utils";
import { CheckCircle2, Download, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ResultTabProps {
    onHighlight?: (lines: number[]) => void;
}

export function ResultTab({ onHighlight }: ResultTabProps) {
    const { comparisonRows, dataA, dataB, approvedItems, whisperHash, deleteItem } = useComparisonContext(); // Assume whisperHash is exposed
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
            onHighlight?.(row.lineNumbers);

            // Scroll into view
            const el = document.getElementById(`result-row-${selectedIndex}`);
            el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            
            lastSelectionRef.current = selectedIndex;
        }
    }, [selectedIndex, filteredRows, onHighlight]);

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

    if (!dataA && !dataB) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <p>No comparison data available.</p>
                <p className="text-sm mt-2">Please run a comparison in the "Compare Models" tab first.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background/50">
             <div className="border-b bg-background/95 backdrop-blur px-4 py-3 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2 font-medium min-w-fit">
                     <CheckCircle2 className="w-5 h-5 text-green-600" />
                     <h2 className="text-lg font-semibold">Final Result</h2>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap justify-end">
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
                    
                    <Button size="sm" variant="outline" className="h-9 gap-2" onClick={handleExport} disabled={!whisperHash}>
                        <Download className="w-4 h-4" />
                        Export JSON
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
