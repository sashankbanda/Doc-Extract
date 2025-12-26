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

interface TableGroup {
    id: string;
    columns: string[];
    rows: ProcessedRow[];
}

export function TableTab({ onHighlight }: TableTabProps) {
    const { comparisonRows, approvedItems } = useComparisonContext();

    // 1. Group Data by Line Number and Split into Tables
    const { tableGroups, infoRows } = useMemo(() => {
        const lineMap = new Map<number, ProcessedRow>();
        
        // --- Step 1: Basic grouping by Line Number ---
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
            
            // Note: If multiple keys map to same baseKey on same line (e.g. "Amount [1]" and "Amount [2]"), 
            // the last one overrides. For tables, unique headers per line are assumed.
            lineGroup.data[baseKey] = {
                value: displayValue,
                isApproved,
                ismatch: row.isMatch,
                originalKey: row.key,
                lineNumbers: row.lineNumbers
            };
            lineGroup.density += 1;
        });

        const sortedLines = Array.from(lineMap.values()).sort((a, b) => a.lineNumber - b.lineNumber);
        
        // --- Step 2: Identify Potential Table Columns ---
        const keyFrequency = new Map<string, number>();
        sortedLines.forEach(line => {
            Object.keys(line.data).forEach(key => {
                keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
            });
        });

        const potentialTableKeys = new Set<string>();
        // Heuristic: If key appears > 1 times, it's a table column.
        keyFrequency.forEach((count, key) => {
            if (count > 1) potentialTableKeys.add(key);
        });

        // --- Step 3: Classify Rows (Table vs Info) ---
        const tableRowsPlaceholder: ProcessedRow[] = [];
        const finalInfoRows: ProcessedRow[] = [];

        sortedLines.forEach(line => {
            const rowKeys = Object.keys(line.data);
            const hasRepeatingKey = rowKeys.some(k => potentialTableKeys.has(k));
            const isDense = line.density > 2; 

            if (hasRepeatingKey || isDense) {
                tableRowsPlaceholder.push(line);
                // If it's a table row, ALL its keys are effectively part of the table structure
                rowKeys.forEach(k => potentialTableKeys.add(k));
            } else {
                finalInfoRows.push(line);
            }
        });

        // --- Step 4: Cluster Columns into Disjoint Tables (Connected Components) ---
        // Build Graph: Nodes = Columns, Edges = Co-occurrence in a row
        const adjacency = new Map<string, Set<string>>();
        tableRowsPlaceholder.forEach(row => {
            const keys = Object.keys(row.data);
            keys.forEach(k => {
                if (!adjacency.has(k)) adjacency.set(k, new Set());
            });
            
            // Connect all keys in this row to each other
            for (let i = 0; i < keys.length; i++) {
                for (let j = i + 1; j < keys.length; j++) {
                    const u = keys[i];
                    const v = keys[j];
                    adjacency.get(u)!.add(v);
                    adjacency.get(v)!.add(u);
                }
            }
        });

        const visited = new Set<string>();
        const clusters: string[][] = [];

        // Find connected components
        adjacency.forEach((_, startNode) => {
            if (visited.has(startNode)) return;

            const component: string[] = [];
            const queue = [startNode];
            visited.add(startNode);

            while (queue.length > 0) {
                const node = queue.shift()!;
                component.push(node);

                const neighbors = adjacency.get(node);
                if (neighbors) {
                    neighbors.forEach(neighbor => {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push(neighbor);
                        }
                    });
                }
            }
            clusters.push(component.sort()); 
        });

        // --- Step 5: Assign Rows to Clusters ---
        // A row belongs to a cluster if ANY of its keys are in that cluster.
        // Since clusters are disjoint (by definition of connected components), a row maps to exactly one cluster.
        // (Unless a row bridges two clusters, but then they would have been one component).
        
        const finalGroups: TableGroup[] = clusters.map((cols, idx) => ({
            id: `table-${idx}`,
            columns: cols,
            rows: []
        }));

        tableRowsPlaceholder.forEach(row => {
            const rowKeys = Object.keys(row.data);
            if (rowKeys.length === 0) return; 

            // Find matching cluster
            const targetGroup = finalGroups.find(g => 
                rowKeys.some(k => g.columns.includes(k))
            );

            if (targetGroup) {
                targetGroup.rows.push(row);
            } else {
                // Should theoretically involve rows with keys that were not "potentialTableKeys"?
                // But we used tableRowsPlaceholder to build the graph, so keys SHOULD be there.
                // UNLESS potentialTableKeys logic excluded some unique keys that we still allowed pass?
                // Logic: "rowKeys.forEach(k => potentialTableKeys.add(k))" ensures ALL keys of a table row are in the set.
                // So this branch should be unreachable.
                console.warn("[TableTab] Orphan row found:", row);
            }
        });

        // Filter out empty groups and Sort groups by position of first row
        const activeGroups = finalGroups
            .filter(g => g.rows.length > 0)
            .sort((a, b) => {
                const minA = Math.min(...a.rows.map(r => r.lineNumber));
                const minB = Math.min(...b.rows.map(r => r.lineNumber));
                return minA - minB;
            });

        return {
            tableGroups: activeGroups,
            infoRows: finalInfoRows
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

                    {/* 2. Structured Table Section(s) */}
                    {tableGroups.map((group, groupIdx) => (
                        <div key={group.id} className="space-y-4">
                             <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs border border-primary/20">
                                    Table {groupIdx + 1}
                                </span>
                                <span className="text-xs text-muted-foreground font-normal">
                                    ({group.rows.length} rows)
                                </span>
                            </h2>
                            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                                <ScrollArea className="w-full">
                                    <div className="w-max">
                                        <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                                {/* Left Buffer for Line # */}
                                                <TableHead className="w-[50px] text-center text-xs font-bold text-muted-foreground">#</TableHead>
                                                
                                                {group.columns.map(col => (
                                                    <TableHead key={col} className="text-xs font-bold whitespace-nowrap min-w-[120px]">
                                                        {col}
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {group.rows.map((row) => (
                                                <TableRow key={row.lineNumber} className="group hover:bg-muted/30">
                                                    {/* Line Number Badge */}
                                                    <TableCell className="text-center py-2 h-auto">
                                                        <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono w-8 justify-center">
                                                            {row.lineNumber > 0 ? `L${row.lineNumber}` : '-'}
                                                        </Badge>
                                                    </TableCell>

                                                    {/* Data Cells */}
                                                    {group.columns.map(col => {
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
                    ))}

                    {infoRows.length === 0 && tableGroups.length === 0 && (
                         <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                            <p>No processed data available to display.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
