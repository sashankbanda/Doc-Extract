import React from "react";
import { cn } from "@/lib/utils";

type HighlightHandler = (lineIds: number[], isFirstLine: boolean) => void;

export interface StructuredDataViewerProps {
  sections: {
    Claims?: Array<Record<string, { value: string; line_numbers: number[] }>>;
    "Policy Info"?: Record<string, { value: string; line_numbers: number[] }>;
    Summary?: Record<string, { value: string; line_numbers: number[] }>;
    "Report Info"?: Record<string, { value: string; line_numbers: number[] }>;
    Other?: Record<string, { value: string; line_numbers: number[] }>;
  };
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

const StructuredDataViewer: React.FC<StructuredDataViewerProps> = ({ sections, onHighlight }) => {
  if (!sections || Object.keys(sections).length === 0) {
    return (
      <div className={sectionCard}>
        <p className="text-sm text-muted-foreground text-center py-4">
          No structured data found.
        </p>
      </div>
    );
  }

  // Render Claims section as a table
  const renderClaimsSection = (claims: Array<Record<string, { value: string; line_numbers: number[] }>>) => {
    if (!claims || claims.length === 0) return null;

    // Get all unique field keys from all claims
    const allKeys = new Set<string>();
    claims.forEach((claim) => {
      Object.keys(claim).forEach((key) => allKeys.add(key));
    });
    const columnKeys = Array.from(allKeys).sort();

    return (
      <div className={sectionCard}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Claims</h3>
          <span className="text-xs text-muted-foreground">
            {claims.length} {claims.length === 1 ? "claim" : "claims"}
          </span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                {columnKeys.map((colKey) => (
                  <th
                    key={colKey}
                    className={cn(
                      "text-left px-3 py-2 font-medium",
                      claims[0]?.[colKey] && isNumericValue(claims[0][colKey].value) && "text-right"
                    )}
                  >
                    {formatKey(colKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claims.map((claim, idx) => (
                <tr key={idx} className="border-t border-border/50">
                  {columnKeys.map((colKey) => {
                    const field = claim[colKey];
                    const isNumeric = field && isNumericValue(field.value);
                    return (
                      <td
                        key={colKey}
                        className={cn(
                          "px-3 py-2",
                          isNumeric && "text-right",
                          colKey.toLowerCase().includes("description") && "max-w-[220px]"
                        )}
                      >
                        {field ? (
                          <HighlightValue
                            lineNumbers={field.line_numbers}
                            onHighlight={onHighlight}
                          >
                            {field.value}
                          </HighlightValue>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render flat section (Policy Info, Summary, Report Info, Other) as a grid
  const renderFlatSection = (
    title: string,
    fields: Record<string, { value: string; line_numbers: number[] }>
  ) => {
    if (!fields || Object.keys(fields).length === 0) return null;

    const fieldKeys = Object.keys(fields).sort();

    return (
      <div className={sectionCard}>
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {fieldKeys.map((key) => {
            const field = fields[key];
            const isNumeric = field && isNumericValue(field.value);
            return (
              <div key={key} className="flex flex-col">
                <span className="text-muted-foreground">{formatKey(key)}</span>
                {field ? (
                  <HighlightValue
                    lineNumbers={field.line_numbers}
                    onHighlight={onHighlight}
                  >
                    {field.value}
                  </HighlightValue>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Claims Section - Table */}
      {sections.Claims && renderClaimsSection(sections.Claims)}

      {/* Report Info Section */}
      {sections["Report Info"] && renderFlatSection("Report Info", sections["Report Info"])}

      {/* Policy Info Section */}
      {sections["Policy Info"] && renderFlatSection("Policy Info", sections["Policy Info"])}

      {/* Summary Section */}
      {sections.Summary && renderFlatSection("Summary", sections.Summary)}

      {/* Other Section */}
      {sections.Other && renderFlatSection("Other", sections.Other)}
    </div>
  );
};

export default StructuredDataViewer;
