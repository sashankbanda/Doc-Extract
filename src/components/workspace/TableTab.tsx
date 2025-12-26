import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
import { useMemo } from "react";

interface TableTabProps {
    onHighlight?: (lines: number[]) => void;
}

interface ProcessedRow {
    lineNumber: number;
    data: Record<string, CellData>;
    density: number; // Count of items in this line
}

interface CellData {
    value: string;
    isApproved: boolean;
    ismatch: boolean;
    originalKey: string;
    lineNumbers: number[];
}

export function TableTab({ onHighlight }: TableTabProps) {
    const { comparisonRows, approvedItems } = useComparisonContext();

    // 1. Group Data by Line Number
    const { tableRows, infoRows, allColumns } = useMemo(() => {
        const lineMap = new Map<number, ProcessedRow>();
        const columnSet = new Set<string>();

        // Phase 1: Grouping
        comparisonRows.forEach(row => {
            // Determine Value (Reactive to approvedItems)
            const approvedVal = approvedItems[row.key];
            const isApproved = approvedVal !== undefined;
            let displayValue = "null";
            
            if (isApproved) {
                displayValue = approvedVal;
            } else if (row.isMatch) {
                displayValue = row.valA || "null";
            }

            // Determine Line Number (Primary Sort Key)
            // Use the first line number from Model A (primary) or Model B
            // If empty, dump into a "0" or "-1" bucket
            const primaryLine = (row.lineNumbersA && row.lineNumbersA.length > 0) 
                ? Math.min(...row.lineNumbersA) 
                : (row.lineNumbersB && row.lineNumbersB.length > 0 ? Math.min(...row.lineNumbersB) : 0);

            // Determine Base Key (Column Name)
            // Regex: Remove trailing index like " [1]"
            const baseKeyMatch = row.key.match(/^(.*?)(\s\[\d+\])?$/);
            const baseKey = baseKeyMatch ? baseKeyMatch[1] : row.key;

            if (!lineMap.has(primaryLine)) {
                lineMap.set(primaryLine, {
                    lineNumber: primaryLine,
                    data: {},
                    density: 0
                });
            }

            const lineGroup = lineMap.get(primaryLine)!;
            
            // Allow multiple items with same baseKey on same line (edge case)?
            // If so, append? For now, we assume unique per line per column logic.
            // If data is dense (L17), we likely have unique headers.
            
            lineGroup.data[baseKey] = {
                value: displayValue,
                isApproved,
                ismatch: row.isMatch,
                originalKey: row.key,
                lineNumbers: row.lineNumbers
            };
            lineGroup.density += 1;
            
            // Collect potential columns
            columnSet.add(baseKey);
        });

        // Phase 2: Classification (Table vs Info)
        const sortedLines = Array.from(lineMap.values()).sort((a, b) => a.lineNumber - b.lineNumber);
        
        // Strategy: 
        // If a BaseKey appears in > 1 line, it's a Table Column.
        // If a Line has > 3 items, it's likely a Table Row.
        // Everything else is General Info.

        const tableBaseKeys = new Set<string>();
        const keyFrequency = new Map<string, number>();

        sortedLines.forEach(line => {
            Object.keys(line.data).forEach(key => {
                keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
            });
        });

        keyFrequency.forEach((count, key) => {
            if (count > 1) tableBaseKeys.add(key);
        });
        
        // Force keys on "dense" lines (>2 items) to be table columns even if single occurrence?
        // User example: L17 has many items. L7 has 1.
        
        const finalTableRows: ProcessedRow[] = [];
        const finalInfoRows: ProcessedRow[] = [];

        sortedLines.forEach(line => {
            // Is this a "Table Line" or "Info Line"?
            // If it has any key that is part of a multi-line pattern -> Table
            // OR if it's very dense (>3 cols) -> Table (Singleton Row of a big table)
            
            const hasRepeatingKey = Object.keys(line.data).some(k => tableBaseKeys.has(k));
            const isDense = line.density > 2; 

            if (hasRepeatingKey || isDense) {
                finalTableRows.push(line);
                // Ensure all keys in this dense row are considered table columns
                Object.keys(line.data).forEach(k => tableBaseKeys.add(k)); 
            } else {
                finalInfoRows.push(line);
            }
        });

        // Final Columns for the Table
        const finalColumns = Array.from(tableBaseKeys).sort();

        return {
            tableRows: finalTableRows,
            infoRows: finalInfoRows,
            allColumns: finalColumns
        };

    }, [comparisonRows, approvedItems]);

    return (
        <div className="flex flex-col h-full bg-muted/10">
            <div className="flex-1 p-6 overflow-y-auto">
                <div className="space-y-8 pb-10">
                    
                    {/* 1. General Info Section */}
                    {infoRows.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs border border-primary/20">General Info</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {infoRows.map((row) => (
                                    Object.entries(row.data).map(([key, cell]) => (
                                        <Card 
                                            key={`${row.lineNumber}-${key}`}
                                            className={cn(
                                                "cursor-pointer hover:border-primary/50 transition-all hover:shadow-sm group",
                                                cell.isApproved && "bg-green-50/50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                            )}
                                            onClick={() => onHighlight?.(cell.lineNumbers)}
                                        >
                                            <CardHeader className="p-3 pb-1 space-y-0">
                                                <CardTitle className="text-xs font-medium text-muted-foreground truncate" title={key}>
                                                    {key}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-3 pt-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={cn(
                                                        "text-sm font-semibold truncate",
                                                        cell.value === "null" && "text-muted-foreground/50 italic font-normal"
                                                    )}>
                                                        {cell.value}
                                                    </span>
                                                    {row.lineNumber > 0 && (
                                                        <Badge variant="secondary" className="text-[10px] h-4 px-1 text-muted-foreground opacity-50 group-hover:opacity-100">
                                                            L{row.lineNumber}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 2. Structured Table Section */}
                    {tableRows.length > 0 && (
                        <div className="space-y-4">
                             <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs border border-primary/20">Line Items</span>
                            </h2>
                            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                                <ScrollArea className="w-full">
                                    <div className="w-max">
                                        <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                                {/* Left Buffer for Line # */}
                                                <TableHead className="w-[50px] text-center text-xs font-bold text-muted-foreground">#</TableHead>
                                                
                                                {allColumns.map(col => (
                                                    <TableHead key={col} className="text-xs font-bold whitespace-nowrap min-w-[120px]">
                                                        {col}
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {tableRows.map((row) => (
                                                <TableRow key={row.lineNumber} className="group hover:bg-muted/30">
                                                    {/* Line Number Badge */}
                                                    <TableCell className="text-center py-2 h-auto">
                                                        <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono w-8 justify-center">
                                                            {row.lineNumber > 0 ? `L${row.lineNumber}` : '-'}
                                                        </Badge>
                                                    </TableCell>

                                                    {/* Data Cells */}
                                                    {allColumns.map(col => {
                                                        const cell = row.data[col];
                                                        return (
                                                            <TableCell 
                                                                key={col} 
                                                                className={cn(
                                                                    "py-2 h-auto text-sm cursor-pointer border-l first:border-l-0 border-dashed border-border/50",
                                                                    !cell && "bg-muted/5", // Empty cell
                                                                    cell?.isApproved && "bg-green-50/30 dark:bg-green-900/20 text-green-900 dark:text-green-300 font-medium",
                                                                    "hover:bg-primary/5 transition-colors relative"
                                                                )}
                                                                onClick={() => cell && onHighlight?.(cell.lineNumbers)}
                                                            >
                                                                {cell ? (
                                                                    <span className={cn(cell.value === "null" && "text-muted-foreground/40 italic")}>
                                                                        {cell.value}
                                                                    </span>
                                                                ) : (
                                                                     <span className="text-muted-foreground/20 text-xs">-</span>
                                                                )}
                                                            </TableCell>
                                                        );
                                                    })}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    </div>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </div>
                        </div>
                    )}

                    {infoRows.length === 0 && tableRows.length === 0 && (
                         <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                            <p>No processed data available to display.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

