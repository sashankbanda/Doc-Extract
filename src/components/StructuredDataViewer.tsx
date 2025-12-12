import React from "react";
import { cn } from "@/lib/utils";

type HighlightHandler = (lineIds: number[]) => void;

export interface StructuredDataViewerProps {
  data: any;
  sourceRefs?: Record<string, number[]>;
  onHighlight: HighlightHandler;
}

const sectionCard = "rounded-lg border border-border/50 bg-muted/30 p-4";
const cellHighlight =
  "cursor-pointer hover:bg-primary/10 transition-colors rounded px-1 inline-flex";

function getRefs(sourceRefs: Record<string, number[]>, path: string): number[] | undefined {
  if (!sourceRefs) return undefined;
  // Try exact path, and with/without leading "data."
  if (sourceRefs[path]) return sourceRefs[path];
  if (!path.startsWith("data.") && sourceRefs[`data.${path}`]) return sourceRefs[`data.${path}`];
  if (path.startsWith("data.") && sourceRefs[path.slice(5)]) return sourceRefs[path.slice(5)];
  return undefined;
}

function HighlightValue({
  children,
  path,
  sourceRefs,
  onHighlight,
}: {
  children: React.ReactNode;
  path: string;
  sourceRefs: Record<string, number[]> | undefined;
  onHighlight: HighlightHandler;
}) {
  const lineIds = sourceRefs ? getRefs(sourceRefs, path) : undefined;
  const clickable = lineIds && lineIds.length > 0;

  const handleClick = () => {
    if (clickable) {
      onHighlight(lineIds!);
    }
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

/**
 * Converts camelCase or snake_case keys to a human-readable format.
 * Examples: "policyNumber" -> "Policy Number", "claim_number" -> "Claim Number"
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
 * Formats a value for display, handling nested objects and arrays.
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(", ") : "—";
    }
    // For nested objects, show a summary or stringify
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    // Format numbers with commas for thousands
    return value.toLocaleString();
  }
  return String(value);
}

/**
 * Checks if a value should be right-aligned (typically numbers)
 */
function isNumericValue(value: any): boolean {
  return typeof value === "number" || (typeof value === "string" && /^-?\d+\.?\d*$/.test(value.trim()));
}

const StructuredDataViewer: React.FC<StructuredDataViewerProps> = ({ data, sourceRefs, onHighlight }) => {
  const summary = data?.summary || {};
  const claims: any[] = Array.isArray(data?.claims) ? data.claims : [];

  // Get all keys from summary, filtering out null/undefined values
  const summaryKeys = Object.keys(summary).filter((key) => {
    const value = summary[key];
    return value !== null && value !== undefined && value !== "";
  });

  // Get column keys from the first claim object (if claims exist)
  const claimColumns: string[] = claims.length > 0 ? Object.keys(claims[0]) : [];

  return (
    <div className="space-y-6">
      {/* Summary Section - Dynamic */}
      {summaryKeys.length > 0 && (
        <div className={sectionCard}>
          <h3 className="text-sm font-semibold mb-3">Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {summaryKeys.map((key) => {
              const value = summary[key];
              const path = `summary.${key}`;
              return (
                <div key={key} className="flex flex-col">
                  <span className="text-muted-foreground">{formatKey(key)}</span>
                  <HighlightValue path={path} sourceRefs={sourceRefs} onHighlight={onHighlight}>
                    {formatValue(value)}
                  </HighlightValue>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Claims Section - Dynamic */}
      {claims.length > 0 && (
        <div className={sectionCard}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Claims</h3>
            <span className="text-xs text-muted-foreground">{claims.length} {claims.length === 1 ? "row" : "rows"}</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  {claimColumns.map((colKey) => (
                    <th
                      key={colKey}
                      className={cn(
                        "text-left px-3 py-2 font-medium",
                        isNumericValue(claims[0]?.[colKey]) && "text-right"
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
                    {claimColumns.map((colKey) => {
                      const value = claim[colKey];
                      const path = `claims[${idx}].${colKey}`;
                      const isNumeric = isNumericValue(value);
                      return (
                        <td
                          key={colKey}
                          className={cn(
                            "px-3 py-2",
                            isNumeric && "text-right",
                            colKey.toLowerCase().includes("description") && "max-w-[220px]"
                          )}
                        >
                          <HighlightValue path={path} sourceRefs={sourceRefs} onHighlight={onHighlight}>
                            {formatValue(value)}
                          </HighlightValue>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {summaryKeys.length === 0 && claims.length === 0 && (
        <div className={sectionCard}>
          <p className="text-sm text-muted-foreground text-center py-4">
            No structured data found.
          </p>
        </div>
      )}
    </div>
  );
};

export default StructuredDataViewer;
