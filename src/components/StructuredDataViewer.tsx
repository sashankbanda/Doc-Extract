import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type HighlightHandler = (lineIds: number[], isFirstLine: boolean) => void;

export interface StructuredDataViewerProps {
  sections: {
    Claims?: Array<Record<string, Array<{ value: string; line_numbers: number[] }>>>;
    "Policy Info"?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
    Summary?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
    "Report Info"?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
    Other?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
  };
  skipped_items?: Array<{
    key: string;
    value: string;
    line_numbers: number[];
    reason: string;
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

const StructuredDataViewer: React.FC<StructuredDataViewerProps> = ({
  sections,
  skipped_items = [],
  onHighlight,
}) => {
  if (!sections || Object.keys(sections).length === 0) {
    return (
      <div className={sectionCard}>
        <p className="text-sm text-muted-foreground text-center py-4">
          No structured data found.
        </p>
      </div>
    );
  }

  // Render Claims section with accordion per claim
  const renderClaimsSection = (
    claims: Array<Record<string, Array<{ value: string; line_numbers: number[] }>>>
  ) => {
    if (!claims || claims.length === 0) return null;

    return (
      <div className={sectionCard}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Claims</h3>
          <span className="text-xs text-muted-foreground">
            {claims.length} {claims.length === 1 ? "claim" : "claims"}
          </span>
        </div>

        <Accordion type="multiple" defaultValue={claims.map((_, idx) => `claim-${idx}`)} className="w-full">
          {claims.map((claim, claimIdx) => {
            // Get Claim Number for display
            const claimNumberValues = claim["Claim Number"] || claim["Claim #"] || [];
            const claimNumber = claimNumberValues.length > 0 
              ? claimNumberValues[0].value 
              : `Claim ${claimIdx + 1}`;

            const claimKeys = Object.keys(claim).filter(
              (key) => key !== "Claim Number" && key !== "Claim #"
            );
            const allKeys = ["Claim Number", ...claimKeys].filter(
              (key) => claim[key] && claim[key].length > 0
            );

            return (
              <AccordionItem key={claimIdx} value={`claim-${claimIdx}`} className="border-b border-border/50">
                <AccordionTrigger className="text-sm font-medium hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span>Claim {claimNumber}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({allKeys.length - 1} fields)
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {allKeys.map((key) => {
                      const valueList = claim[key] || [];
                      if (valueList.length === 0) return null;

                      return (
                        <div key={key} className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">
                            {formatKey(key)}:
                          </div>
                          <div className="space-y-1 pl-2">
                            {valueList.map((item, valueIdx) => (
                              <div
                                key={valueIdx}
                                className="text-sm flex items-start gap-2"
                              >
                                <span className="text-muted-foreground">•</span>
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
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    );
  };

  // Render flat section (Policy Info, Summary, Report Info, Other) with accordion
  const renderFlatSection = (
    title: string,
    fields: Record<string, Array<{ value: string; line_numbers: number[] }>>
  ) => {
    if (!fields || Object.keys(fields).length === 0) return null;

    const fieldKeys = Object.keys(fields).sort();

    return (
      <div className={sectionCard}>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value={title.toLowerCase().replace(/\s+/g, "-")} className="border-none">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline py-2">
              <div className="flex items-center justify-between w-full pr-4">
                <span>{title}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {fieldKeys.length} {fieldKeys.length === 1 ? "field" : "fields"}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
                {fieldKeys.map((key) => {
                  const valueList = fields[key] || [];
                  if (valueList.length === 0) return null;

                  return (
                    <div key={key} className="flex flex-col space-y-1">
                      <span className="text-muted-foreground text-xs font-medium">
                        {formatKey(key)}
                      </span>
                      <div className="space-y-1">
                        {valueList.map((item, valueIdx) => (
                          <div key={valueIdx} className="flex items-start gap-2">
                            <span className="text-muted-foreground text-xs">•</span>
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Claims Section - Accordion per claim, default open */}
      {sections.Claims && renderClaimsSection(sections.Claims)}

      {/* Report Info Section - Collapsed by default */}
      {sections["Report Info"] &&
        renderFlatSection("Report Info", sections["Report Info"])}

      {/* Policy Info Section - Collapsed by default */}
      {sections["Policy Info"] &&
        renderFlatSection("Policy Info", sections["Policy Info"])}

      {/* Summary Section - Collapsed by default */}
      {sections.Summary && renderFlatSection("Summary", sections.Summary)}

      {/* Other Section - Collapsed by default, REQUIRED */}
      {sections.Other && renderFlatSection("Other / Unclassified", sections.Other)}

      {/* Skipped Items Section - Only if items exist (should be empty in new format) */}
      {skipped_items && skipped_items.length > 0 && (
        <div className={sectionCard}>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="skipped" className="border-none">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline py-2">
                <div className="flex items-center justify-between w-full pr-4">
                  <span>Skipped / Unplaced Fields</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {skipped_items.length} {skipped_items.length === 1 ? "item" : "items"}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  {skipped_items.map((item, idx) => (
                    <div key={idx} className="text-sm border-l-2 border-muted pl-3 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{item.key || "(no key)"}</div>
                          <HighlightValue
                            lineNumbers={item.line_numbers}
                            onHighlight={onHighlight}
                          >
                            {item.value}
                          </HighlightValue>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {item.reason}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
};

export default StructuredDataViewer;
