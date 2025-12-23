
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComparisonContext } from "@/context/ComparisonContext";
import { cn } from "@/lib/utils";

interface ResultTabProps {
    onHighlight?: (lines: number[]) => void;
}

export function ResultTab({ onHighlight }: ResultTabProps) {
    const { comparisonRows, dataA, dataB } = useComparisonContext();

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
            <ScrollArea className="flex-1 h-full"> 
                <div className="p-4">
                    <div className="rounded-md border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[300px]">Source Key</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead className="w-[100px] text-right">L#</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonRows.map((row, i) => {
                                    // Logic: If mismatch, show empty/null. If match, show the value (valA or valB are same).
                                    // Note: comparisonRows.valA already handles "(missing)" text, but here user specifically asked for "null" behavior for mismatches.
                                    // Actually, let's look at the requirement: "mismatched ones keep as null for now".
                                    
                                    // Our context logic for valA/valB returns "(missing)" if undefined, or the value strings.
                                    // But we have row.isMatch.
                                    
                                    let displayValue = "";
                                    let isMiss = false;
                                    
                                    if (!row.isMatch) {
                                        displayValue = "null"; // Explicitly requested "null"
                                        isMiss = true;
                                    } else {
                                        // It's a match, so valA == valB. 
                                        // However, if both are "(missing)", then it's effectively empty. 
                                        // But if isMatch is true, they are equal.
                                        displayValue = row.valA;
                                    }

                                    return (
                                        <TableRow 
                                            key={i} 
                                            className={cn(
                                                "cursor-pointer hover:bg-muted/50 transition-colors",
                                                isMiss && "text-muted-foreground italic bg-destructive/5"
                                            )}
                                            onClick={() => onHighlight?.(row.lineNumbers)}
                                        >
                                            <TableCell className="font-medium align-top">
                                                {row.key}
                                            </TableCell>
                                            <TableCell className="align-top whitespace-pre-wrap break-words min-w-0">
                                                {displayValue}
                                            </TableCell>
                                             <TableCell className="align-top text-right text-xs text-muted-foreground">
                                                {row.sortKey !== Number.MAX_SAFE_INTEGER ? `L${row.sortKey}` : "-"}
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
