import { cn } from "@/lib/utils";
import { BoundingBox, ExtractedTable } from "@/types/document";
import { motion } from "framer-motion";
import { Table } from "lucide-react";

interface StructuredTablePanelProps {
  tables: ExtractedTable[];
  onTableHover: (boundingBox: BoundingBox | null) => void;
  onCellClick: (cell: any) => void;
  selectedRowIndex?: number;
  selectedColIndex?: number;
  onRowRef?: (index: number, el: HTMLTableRowElement | null) => void;
}

export function StructuredTablePanel({
  tables,
  onTableHover,
  onCellClick,
  selectedRowIndex,
  selectedColIndex,
  onRowRef,
}: StructuredTablePanelProps) {
  return (
    <div className="space-y-6">
      {tables.map((table, tableIndex) => (
        <motion.div
          key={table.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: tableIndex * 0.1 }}
          className="glass rounded-xl overflow-hidden"
          onMouseEnter={() => onTableHover(table.boundingBox)}
          onMouseLeave={() => onTableHover(null)}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
            <Table className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Table {tableIndex + 1}
            </span>
          </div>

          <div className="overflow-x-auto p-2">
            <table className="w-full text-sm border-collapse border border-border/50">
              <thead>
                <tr className="bg-muted/10">
                  {table.headers.map((header, i) => (
                    <th
                      key={i}
                      className="border border-border/50 px-6 py-4 text-left font-bold text-foreground whitespace-nowrap text-base"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    id={`st-row-${rowIndex}`}
                    ref={(el) => onRowRef?.(rowIndex, el)}
                    className={cn(
                        "transition-colors",
                        selectedRowIndex === rowIndex ? "bg-primary/5" : "hover:bg-muted/10"
                    )}
                  >
                    {row.map((cell, cellIndex) => {
                       const isSelected = selectedRowIndex === rowIndex && selectedColIndex === cellIndex;
                       return (
                          <td
                            key={cellIndex}
                            id={`st-cell-${rowIndex}-${cellIndex}`}
                            className={cn(
                              "border border-border/50 px-6 py-4 text-foreground whitespace-nowrap cursor-pointer transition-colors text-base",
                              isSelected 
                                ? "bg-primary/20 ring-inset ring-primary/30 font-medium" 
                                : "hover:bg-primary/5"
                            )}
                            onClick={() => onCellClick(cell)}
                          >
                            {cell.value}
                          </td>
                       );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
