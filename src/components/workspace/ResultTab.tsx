
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComparisonContext } from "@/context/ComparisonContext";
import { cn } from "@/lib/utils";

interface ResultTabProps {
    onHighlight?: (lines: number[]) => void;
}

export function ResultTab({ onHighlight }: ResultTabProps) {
    const { comparisonRows, dataA, dataB, approvedItems } = useComparisonContext();

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

                                    return (
                                        <TableRow 
                                            key={i} 
                                            className={cn(
                                                "cursor-pointer hover:bg-muted/50 transition-colors",
                                                isMiss && "text-muted-foreground italic bg-destructive/5",
                                                isApproved && "bg-green-50/50"
                                            )}
                                            onClick={() => onHighlight?.(row.lineNumbers)}
                                        >
                                            <TableCell className="font-medium align-top">
                                                {row.key}
                                                {isApproved && <span className="ml-2 text-green-600 text-[10px] uppercase border border-green-200 px-1 rounded bg-green-50">Approved</span>}
                                            </TableCell>
                                            <TableCell className={cn("align-top whitespace-pre-wrap break-words min-w-0", isApproved && "font-medium text-green-900")}>
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
