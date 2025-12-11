import { motion } from "framer-motion";
import { Table } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExtractedTable, BoundingBox } from "@/types/document";

interface StructuredTablePanelProps {
  tables: ExtractedTable[];
  onTableHover: (boundingBox: BoundingBox | null) => void;
  onCellClick: (boundingBox: BoundingBox) => void;
}

export function StructuredTablePanel({
  tables,
  onTableHover,
  onCellClick,
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

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  {table.headers.map((header, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
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
                    className="border-t border-border/30 hover:bg-muted/20 transition-colors"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cn(
                          "px-4 py-3 text-foreground whitespace-nowrap cursor-pointer",
                          "hover:bg-primary/10 transition-colors"
                        )}
                        onClick={() =>
                          cell.boundingBox && onCellClick(cell.boundingBox)
                        }
                      >
                        {cell.value}
                      </td>
                    ))}
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
