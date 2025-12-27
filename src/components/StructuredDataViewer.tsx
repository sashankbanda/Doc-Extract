import { EditableValue } from "@/components/EditableValue";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import React from "react";

type HighlightHandler = (lineIds: number[], isFirstLine: boolean) => void;

export interface StructuredDataViewerProps {
  sections: {
    Claims?: Array<Record<string, Array<{ value: string; line_numbers: number[]; confidence?: number }>>>;
    "Policy Info"?: Record<string, Array<{ value: string; line_numbers: number[]; confidence?: number }>>;
    Summary?: Record<string, Array<{ value: string; line_numbers: number[]; confidence?: number }>>;
    "Report Info"?: Record<string, Array<{ value: string; line_numbers: number[]; confidence?: number }>>;
    Other?: Record<string, Array<{ value: string; line_numbers: number[]; confidence?: number }>>;
  };
  skipped_items?: Array<{
    source_key: string;
    canonical_name?: string | null;
    value: string;
    line_numbers: number[];
    reason: string;
  }>;
  onHighlight: HighlightHandler;
  expandedAccordions?: string[];
  onAccordionChange?: (value: string[]) => void;
  searchQuery?: string;
  onSearchResultClick?: (result: any) => void;
  searchResults?: any[];
  onSave?: (itemId: string, newValue: string) => Promise<void>;
  savingId?: string | null;
  items?: Array<{
    source_key: string;
    canonical_name?: string | null;
    value: string;
    line_numbers: number[];
    value: string;
    line_numbers: number[];
    semantic_type: string;
    confidence?: number;
  }>;
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
 * Classify a field key into a category for nested accordion grouping
 */
function classifyFieldKey(key: string, semanticType?: string): string {
  const normalizedKey = key.toLowerCase();
  
  // Dates
  if (
    normalizedKey.includes("date") ||
    normalizedKey.includes("loss") && normalizedKey.includes("date") ||
    normalizedKey.includes("reported") ||
    normalizedKey.includes("notification")
  ) {
    return "Dates";
  }
  
  // Financials
  if (
    normalizedKey.includes("paid") ||
    normalizedKey.includes("incurred") ||
    normalizedKey.includes("reserve") ||
    normalizedKey.includes("amount") ||
    normalizedKey.includes("total") ||
    semanticType?.includes("paid") ||
    semanticType?.includes("financial")
  ) {
    return "Financials";
  }
  
  // Parties
  if (
    normalizedKey.includes("claimant") ||
    normalizedKey.includes("insured") ||
    normalizedKey.includes("party") ||
    semanticType?.includes("claimant")
  ) {
    return "Parties";
  }
  
  // Description
  if (
    normalizedKey.includes("description") ||
    normalizedKey.includes("desc") ||
    normalizedKey.includes("cause") ||
    normalizedKey.includes("loss") && !normalizedKey.includes("date")
  ) {
    return "Description";
  }
  
  // Default to Other
  return "Other";
}

function HighlightValue({
  children,
  lineNumbers,
  onHighlight,
  showLineNumbers = false,
}: {
  children: React.ReactNode;
  lineNumbers: number[];
  onHighlight: HighlightHandler;
  showLineNumbers?: boolean;
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

  // Format: [line 45] or [line 45, 46, 47]
  const lineNumbersText = lineNumbers.length > 0 
    ? lineNumbers.length === 1
      ? `[line ${lineNumbers[0]}]`
      : `[line ${lineNumbers.join(", ")}]`
    : "";

  return (
    <span
      className={cn(clickable ? cellHighlight : "", "flex items-center gap-1")}
      onClick={clickable ? handleClick : undefined}
      title={clickable ? "Click to highlight source text" : undefined}
    >
      {showLineNumbers && lineNumbersText && (
        <span className="text-xs text-muted-foreground font-mono">
          {lineNumbersText}
        </span>
      )}
      {children ?? "—"}
    </span>
  );
}

const StructuredDataViewer: React.FC<StructuredDataViewerProps> = ({
  sections,
  skipped_items = [],
  onHighlight,
  expandedAccordions = [],
  onAccordionChange,
  searchQuery = "",
  onSave,
  savingId,
  items = [],
}) => {
  // Helper to find item ID from value and line_numbers
  const getItemId = (value: string, lineNumbers: number[]): string => {
    const matchingItem = items.find(
      (item) => item.value === value && 
      JSON.stringify(item.line_numbers.sort()) === JSON.stringify(lineNumbers.sort())
    );
    if (matchingItem) {
      return `${matchingItem.source_key}|${matchingItem.value}|${matchingItem.line_numbers.join(',')}`;
    }
    // Fallback: create ID from value and line_numbers
    return `|${value}|${lineNumbers.join(',')}`;
  };

  if (!sections || Object.keys(sections).length === 0) {
    return (
      <div className={sectionCard}>
        <p className="text-sm text-muted-foreground text-center py-4">
          No structured data found.
        </p>
      </div>
    );
  }

  // Render Claims section with accordion per claim and nested accordions
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

        <Accordion 
          type="multiple" 
          value={expandedAccordions.filter(id => {
            // Match claim-{number} but not claim-{number}-category-{category}
            return /^claim-\d+$/.test(id);
          })}
          onValueChange={(value) => {
            if (onAccordionChange) {
              // Get current category accordions
              const categoryAccordions = expandedAccordions.filter(id => 
                /^claim-\d+-category-/.test(id)
              );
              // Merge with new claim accordions
              onAccordionChange([...value, ...categoryAccordions]);
            }
          }}
          className="w-full"
        >
          {claims.map((claim, claimIdx) => {
            // Get Claim Number for display and use it as stable ID
            const claimNumberValues = claim["Claim Number"] || claim["Claim #"] || [];
            const claimNumber = claimNumberValues.length > 0 
              ? claimNumberValues[0].value 
              : `${claimIdx + 1}`;

            // Separate Claim Number from other fields
            const claimKeys = Object.keys(claim).filter(
              (key) => key !== "Claim Number" && key !== "Claim #"
            );
            
            // Check if claim has any fields beyond Claim Number
            const hasFields = claimKeys.some(key => claim[key] && claim[key].length > 0);

            // Group fields by category for nested accordions
            const fieldsByCategory: Record<string, Array<{ key: string; values: Array<{ value: string; line_numbers: number[]; confidence?: number }> }>> = {
              Dates: [],
              Financials: [],
              Parties: [],
              Description: [],
              Other: [],
            };

            for (const key of claimKeys) {
              const valueList = claim[key] || [];
              if (valueList.length === 0) continue;

              const category = classifyFieldKey(key);
              fieldsByCategory[category].push({
                key,
                values: valueList as any, // Cast to any or fix Section type
              });
            }

            // Remove empty categories
            const nonEmptyCategories = Object.entries(fieldsByCategory)
              .filter(([_, fields]) => fields.length > 0)
              .map(([category, fields]) => ({ category, fields }));

            return (
              <AccordionItem key={claimIdx} value={`claim-${claimNumber}`} className="border-b border-border/50">
                <AccordionTrigger className="text-sm font-medium hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span>Claim {claimNumber}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({hasFields ? nonEmptyCategories.length : 0} categories)
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {/* Claim Number (always shown) */}
                    {claimNumberValues.length > 0 && (
                      <div className="space-y-1 pb-2 border-b border-border/30">
                        <div className="text-xs font-medium text-muted-foreground">
                          Claim Number:
                        </div>
                        <div className="space-y-1 pl-2">
                          {claimNumberValues.map((item, valueIdx) => (
                            <div
                              key={valueIdx}
                              className="text-sm flex items-start gap-2"
                            >
                              <span className="text-muted-foreground">•</span>
                              <EditableValue
                                value={item.value}
                                onSave={onSave ? async (newValue) => {
                                  const itemId = getItemId(item.value, item.line_numbers);
                                  await onSave(itemId, newValue);
                                } : undefined}
                                isSaving={savingId === getItemId(item.value, item.line_numbers)}
                                onHighlight={() => onHighlight(item.line_numbers, true)}
                                lineNumbers={item.line_numbers}
                                showLineNumbers={true}
                                // @ts-ignore
                                confidence={item.confidence}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show message if no fields */}
                    {!hasFields && (
                      <div className="text-sm text-muted-foreground italic py-2">
                        No safely associated fields found for this claim.
                        Related values may appear in "Other / Unclassified".
                      </div>
                    )}

                    {/* Nested accordions for field categories */}
                    {hasFields && (
                      <Accordion 
                        type="multiple" 
                        value={expandedAccordions.filter(id => id.startsWith(`claim-${claimNumber}-category-`))}
                        onValueChange={(value) => {
                          if (onAccordionChange) {
                            // Get current claim accordions and other category accordions
                            const claimAccordions = expandedAccordions.filter(id => 
                              id === `claim-${claimNumber}` || (/^claim-\d+$/.test(id) && id !== `claim-${claimNumber}`)
                            );
                            const otherCategoryAccordions = expandedAccordions.filter(id => 
                              !id.startsWith(`claim-${claimNumber}-category-`)
                            );
                            // Map category values to full IDs
                            const categoryIds = value.map(v => 
                              v.startsWith(`claim-${claimNumber}-category-`) ? v : `claim-${claimNumber}-category-${v}`
                            );
                            // Merge all accordions
                            onAccordionChange([...claimAccordions, ...otherCategoryAccordions, ...categoryIds]);
                          }
                        }}
                        className="w-full"
                      >
                        {nonEmptyCategories.map(({ category, fields }) => (
                          <AccordionItem
                            key={category}
                            value={`claim-${claimNumber}-category-${category.toLowerCase()}`}
                            className="border-b border-border/30"
                          >
                            <AccordionTrigger className="text-xs font-medium hover:no-underline py-2">
                              {category} ({fields.length} {fields.length === 1 ? "field" : "fields"})
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pt-2 pl-2">
                                {fields.map(({ key, values }) => (
                                  <div key={key} className="space-y-1" data-search-id={`claim-${claimNumber}-${key}`}>
                                    <div className="text-xs font-medium text-muted-foreground">
                                      {formatKey(key)}:
                                    </div>
                                    <div className="space-y-1 pl-2">
                                      {values.map((item, valueIdx) => {
                                        const isMatch = searchQuery && item.value.toLowerCase().includes(searchQuery.toLowerCase());
                                        return (
                                          <div
                                            key={valueIdx}
                                            className={cn(
                                              "text-sm flex items-start gap-2",
                                              isMatch && "bg-primary/10 rounded px-1"
                                            )}
                                          >
                                            <span className="text-muted-foreground">•</span>
                                            <HighlightValue
                                              lineNumbers={item.line_numbers}
                                              onHighlight={onHighlight}
                                              onHighlight={onHighlight}
                                              showLineNumbers={true}
                                            >
                                              {item.value}
                                              {item.confidence !== undefined && (
                                                <span className="ml-1 text-[9px] text-muted-foreground opacity-70">
                                                  ({item.confidence}%)
                                                </span>
                                              )}
                                            </HighlightValue>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    );
  };

  // Render flat section (Policy Info, Summary, Report Info) with accordion
  const renderFlatSection = (
    title: string,
    fields: Record<string, Array<{ value: string; line_numbers: number[] }>>
  ) => {
    if (!fields || Object.keys(fields).length === 0) return null;

    const fieldKeys = Object.keys(fields).sort();

    const sectionId = title.toLowerCase().replace(/\s+/g, "-");
    
    return (
      <div className={sectionCard}>
        <Accordion 
          type="single" 
          collapsible 
          value={expandedAccordions.includes(sectionId) ? sectionId : undefined}
          onValueChange={(value) => {
            if (onAccordionChange) {
              // Get all other accordions
              const otherAccordions = expandedAccordions.filter(id => id !== sectionId);
              // Add or remove this section
              if (value) {
                onAccordionChange([...otherAccordions, value]);
              } else {
                onAccordionChange(otherAccordions);
              }
            }
          }}
          className="w-full"
        >
          <AccordionItem value={sectionId} className="border-none">
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
                    <div key={key} className="flex flex-col space-y-1" data-search-id={`${sectionId}-${key}`}>
                      <span className="text-muted-foreground text-xs font-medium">
                        {formatKey(key)}
                      </span>
                      <div className="space-y-1">
                        {valueList.map((item, valueIdx) => {
                          const isMatch = searchQuery && item.value.toLowerCase().includes(searchQuery.toLowerCase());
                          return (
                            <div 
                              key={valueIdx} 
                              className={cn(
                                "flex items-start gap-2",
                                isMatch && "bg-primary/10 rounded px-1"
                              )}
                            >
                              <span className="text-muted-foreground text-xs">•</span>
                              <EditableValue
                                value={item.value}
                                onSave={onSave ? async (newValue) => {
                                  const itemId = getItemId(item.value, item.line_numbers);
                                  await onSave(itemId, newValue);
                                } : undefined}
                                isSaving={savingId === getItemId(item.value, item.line_numbers)}
                                onHighlight={() => onHighlight(item.line_numbers, true)}
                                lineNumbers={item.line_numbers}
                                showLineNumbers={true}
                              />
                            </div>
                          );
                        })}
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

  // Render Other section with visual grouping (Dates, Amounts, Names, Codes, Free text)
  const renderOtherSection = (
    fields: Record<string, Array<{ value: string; line_numbers: number[] }>>
  ) => {
    if (!fields || Object.keys(fields).length === 0) return null;

    const fieldKeys = Object.keys(fields);

    // Group fields by visual category (for readability only, no data loss)
    const groupedFields: Record<string, Array<{ key: string; values: Array<{ value: string; line_numbers: number[]; confidence?: number }> }>> = {
      Dates: [],
      Amounts: [],
      Names: [],
      Codes: [],
      "Free text": [],
    };

    for (const key of fieldKeys) {
      const valueList = fields[key] || [];
      if (valueList.length === 0) continue;

      const normalizedKey = key.toLowerCase();
      const firstValue = valueList[0].value.toLowerCase();

      // Classify for visual grouping
      let category = "Free text";
      if (
        normalizedKey.includes("date") ||
        normalizedKey.includes("time") ||
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(firstValue) ||
        /^\d{4}-\d{2}-\d{2}$/.test(firstValue)
      ) {
        category = "Dates";
      } else if (
        normalizedKey.includes("amount") ||
        normalizedKey.includes("paid") ||
        normalizedKey.includes("total") ||
        normalizedKey.includes("cost") ||
        /^\$?[\d,]+\.?\d*$/.test(firstValue) ||
        /^\d+\.\d{2}$/.test(firstValue)
      ) {
        category = "Amounts";
      } else if (
        normalizedKey.includes("name") ||
        normalizedKey.includes("claimant") ||
        normalizedKey.includes("insured") ||
        /^[A-Z][a-z]+ [A-Z]/.test(firstValue) // Looks like a name
      ) {
        category = "Names";
      } else if (
        normalizedKey.includes("code") ||
        normalizedKey.includes("id") ||
        normalizedKey.includes("number") ||
        /^[A-Z0-9-]{3,}$/.test(firstValue) // Looks like a code
      ) {
        category = "Codes";
      }

      groupedFields[category].push({
        key,
        values: valueList as any,
      });
    }

    // Remove empty categories
    const nonEmptyGroups = Object.entries(groupedFields)
      .filter(([_, fields]) => fields.length > 0)
      .map(([category, fields]) => ({ category, fields }));

    return (
      <div className={sectionCard}>
        <Accordion 
          type="single" 
          collapsible 
          value={expandedAccordions.includes("other-unclassified") ? "other-unclassified" : undefined}
          onValueChange={(value) => {
            if (onAccordionChange) {
              // Get all other accordions
              const otherAccordions = expandedAccordions.filter(id => id !== "other-unclassified");
              // Add or remove this section
              if (value) {
                onAccordionChange([...otherAccordions, value]);
              } else {
                onAccordionChange(otherAccordions);
              }
            }
          }}
          className="w-full"
        >
          <AccordionItem value="other-unclassified" className="border-none">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline py-2">
              <div className="flex items-center justify-between w-full pr-4">
                <span>Other / Unclassified</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {fieldKeys.length} {fieldKeys.length === 1 ? "field" : "fields"}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                {nonEmptyGroups.map(({ category, fields }) => (
                  <div key={category} className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {category}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm pl-2">
                      {fields.map(({ key, values }) => (
                        <div key={key} className="flex flex-col space-y-1" data-search-id={`other-${key}`}>
                          <span className="text-muted-foreground text-xs font-medium">
                            {formatKey(key)}
                          </span>
                          <div className="space-y-1">
                            {values.map((item, valueIdx) => {
                              const isMatch = searchQuery && item.value.toLowerCase().includes(searchQuery.toLowerCase());
                              return (
                                <div 
                                  key={valueIdx} 
                                  className={cn(
                                    "flex items-start gap-2",
                                    isMatch && "bg-primary/10 rounded px-1"
                                  )}
                                >
                                  <span className="text-muted-foreground text-xs">•</span>
                                  <EditableValue
                                    value={item.value}
                                    onSave={onSave ? async (newValue) => {
                                      const itemId = getItemId(item.value, item.line_numbers);
                                      await onSave(itemId, newValue);
                                    } : undefined}
                                    isSaving={savingId === getItemId(item.value, item.line_numbers)}
                                    onHighlight={() => onHighlight(item.line_numbers, true)}
                                    lineNumbers={item.line_numbers}
                                    showLineNumbers={true}
                                confidence={item.confidence}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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

      {/* Other Section - Collapsed by default, REQUIRED, with visual grouping */}
      {sections.Other && renderOtherSection(sections.Other)}

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
                          <div className="font-medium">
                            {item.canonical_name ? (
                              <span>
                                <span className="text-muted-foreground">{item.source_key || "(no key)"}</span>
                                <span className="mx-2">→</span>
                                <span>{formatKey(item.canonical_name)}</span>
                              </span>
                            ) : (
                              item.source_key || "(no key)"
                            )}
                          </div>
                          <HighlightValue
                            lineNumbers={item.line_numbers}
                            onHighlight={onHighlight}
                            showLineNumbers={true}
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
