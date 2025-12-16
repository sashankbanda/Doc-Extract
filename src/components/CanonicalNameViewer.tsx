import React from "react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { StructuredItem } from "@/lib/api";

type HighlightHandler = (lineIds: number[], isFirstLine: boolean) => void;

export interface CanonicalNameViewerProps {
  items: StructuredItem[];
  onHighlight: HighlightHandler;
  expandedAccordions?: string[];
  onAccordionChange?: (value: string[]) => void;
}

// Canonical name order as specified
const CANONICAL_NAME_ORDER = [
  "lob",
  "insured",
  "dba",
  "policyNumber",
  "effdate",
  "expdate",
  "carrier",
  "valuedDate",
  "claimNumber",
  "claimant",
  "claimStatus",
  "closedDate",
  "reportedDate",
  "dateOfLoss",
  "lossDescription",
  "lossLocation",
  "state",
  "city",
  "medicalPaid",
  "medicalReserves",
  "indemnityPaid",
  "indemnityReserves",
  "expensesPaid",
  "expensesReserves",
  "totalPaid",
  "totalReserve",
  "totalIndemnity",
  "totalExpenses",
  "totalIncurredSource",
  "recoveries",
];

const sectionCard = "rounded-lg border border-border/50 bg-muted/30 p-4";

function formatCanonicalName(canonicalName: string): string {
  // Convert camelCase to Title Case
  return canonicalName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function HighlightValue({
  children,
  lineNumbers,
  onHighlight,
}: {
  children: React.ReactNode;
  lineNumbers: number[];
  onHighlight: HighlightHandler;
}) {
  const clickable = lineNumbers && lineNumbers.length > 0;

  const handleClick = () => {
    if (!clickable || !lineNumbers || lineNumbers.length === 0) {
      console.warn(`[CanonicalNameViewer] Cannot highlight - no line numbers found`);
      return;
    }

    console.log(`[CanonicalNameViewer] Highlighting with line numbers:`, lineNumbers);
    onHighlight(lineNumbers, true);
  };

  return (
    <span
      className={cn(
        clickable ? "cursor-pointer hover:bg-primary/10 transition-colors rounded px-1 inline-flex" : "",
        "flex items-center gap-1"
      )}
      onClick={clickable ? handleClick : undefined}
      title={clickable ? "Click to highlight source text" : undefined}
    >
      {children ?? "—"}
    </span>
  );
}

const CanonicalNameViewer: React.FC<CanonicalNameViewerProps> = ({
  items,
  onHighlight,
  expandedAccordions = [],
  onAccordionChange,
}) => {
  // Group items by canonical_name
  const itemsByCanonical: Record<string, StructuredItem[]> = {};
  
  for (const item of items) {
    const canonicalName = item.canonical_name;
    if (canonicalName) {
      if (!itemsByCanonical[canonicalName]) {
        itemsByCanonical[canonicalName] = [];
      }
      itemsByCanonical[canonicalName].push(item);
    }
  }

  // Sort canonical names according to the specified order
  const sortedCanonicalNames = CANONICAL_NAME_ORDER.filter(
    (name) => itemsByCanonical[name] && itemsByCanonical[name].length > 0
  );

  // Add any canonical names that are not in the order list (shouldn't happen, but just in case)
  const otherCanonicalNames = Object.keys(itemsByCanonical).filter(
    (name) => !CANONICAL_NAME_ORDER.includes(name)
  );
  sortedCanonicalNames.push(...otherCanonicalNames);

  if (sortedCanonicalNames.length === 0) {
    return (
      <div className={sectionCard}>
        <p className="text-sm text-muted-foreground text-center py-4">
          No canonical name data found. Run "Analyze with AI" to extract structured data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={sectionCard}>
        <Accordion
          type="multiple"
          value={expandedAccordions}
          onValueChange={onAccordionChange}
          className="w-full"
        >
          {sortedCanonicalNames.map((canonicalName) => {
            const canonicalItems = itemsByCanonical[canonicalName];
            const itemCount = canonicalItems.length;

            return (
              <AccordionItem
                key={canonicalName}
                value={canonicalName}
                className="border-b border-border/50"
              >
                <AccordionTrigger className="text-sm font-medium hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <span>{formatCanonicalName(canonicalName)}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-border/30">
                            <th className="text-left p-2 font-semibold text-muted-foreground">
                              SK (Source Key)
                            </th>
                            <th className="text-left p-2 font-semibold text-muted-foreground">
                              Value
                            </th>
                            <th className="text-left p-2 font-semibold text-muted-foreground">
                              LN (Line Numbers)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {canonicalItems.map((item, idx) => (
                            <tr
                              key={idx}
                              className="border-b border-border/20 hover:bg-muted/50"
                            >
                              <td className="p-2 text-muted-foreground">
                                {item.source_key || "(no key)"}
                              </td>
                              <td className="p-2">
                                <HighlightValue
                                  lineNumbers={item.line_numbers}
                                  onHighlight={onHighlight}
                                >
                                  {item.value || "(no value)"}
                                </HighlightValue>
                              </td>
                              <td className="p-2 text-muted-foreground font-mono text-xs">
                                {item.line_numbers.length > 0
                                  ? item.line_numbers.join(", ")
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
};

export default CanonicalNameViewer;

