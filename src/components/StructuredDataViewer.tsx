import React from "react";
import { cn } from "@/lib/utils";

type HighlightHandler = (lineIds: number[], isFirstLine: boolean) => void;

export interface StructuredDataViewerProps {
  items: Array<{
    key: string;
    value: string;
    line_numbers: number[];
  }>;
  onHighlight: HighlightHandler;
}

const sectionCard = "rounded-lg border border-border/50 bg-muted/30 p-4";
const cellHighlight =
  "cursor-pointer hover:bg-primary/10 transition-colors rounded px-1 inline-flex";

/**
 * Formats a key for display (handles camelCase, snake_case, etc.)
 */
function formatKey(key: string): string {
  // Handle camelCase: insert space before capital letters
  const camelCaseFormatted = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Handle snake_case: replace underscores with spaces
  const snakeCaseFormatted = camelCaseFormatted.replace(/_/g, " ");
  // Capitalize first letter of each word
  return snakeCaseFormatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Checks if a value should be right-aligned (typically numbers)
 */
function isNumericValue(value: string): boolean {
  return /^-?\d+\.?\d*$/.test(value.trim());
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
      console.warn(`[StructuredDataViewer] Cannot highlight - no line numbers found`);
      return;
    }

    // First line gets strong highlight, rest get lighter
    // Pass all line numbers and indicate which is first
    console.log(`[StructuredDataViewer] Highlighting with line numbers:`, lineNumbers);
    onHighlight(lineNumbers, true); // true indicates this is the first/primary highlight
  };

  return (
    <span
      className={cn(clickable ? cellHighlight : "")}
      onClick={clickable ? handleClick : undefined}
      title={clickable ? "Click to highlight source text" : undefined}
    >
      {children ?? "—"}
    </span>
  );
}

const StructuredDataViewer: React.FC<StructuredDataViewerProps> = ({ items, onHighlight }) => {
  if (!items || items.length === 0) {
    return (
      <div className={sectionCard}>
        <p className="text-sm text-muted-foreground text-center py-4">
          No structured data found.
        </p>
      </div>
    );
  }

  // Group items by key for better organization
  const groupedByKey = items.reduce((acc, item) => {
    const key = item.key;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  const keys = Object.keys(groupedByKey).sort();

  return (
    <div className="space-y-6">
      {keys.map((key) => {
        const keyItems = groupedByKey[key];
        const isNumeric = keyItems.length > 0 && isNumericValue(keyItems[0].value);

        return (
          <div key={key} className={sectionCard}>
            <h3 className="text-sm font-semibold mb-3">{formatKey(key)}</h3>
            <div className="space-y-2">
              {keyItems.map((item, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "text-sm",
                    isNumeric && "text-right"
                  )}
                >
                  <HighlightValue
                    lineNumbers={item.line_numbers}
                    onHighlight={onHighlight}
                  >
                    {item.value}
                  </HighlightValue>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StructuredDataViewer;
