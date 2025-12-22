/**
 * Frontend organizer for flat structured data.
 * 
 * Groups items for DISPLAY ONLY - all items are preserved, no data loss.
 * 
 * CORE PRINCIPLES:
 * - Backend output is source of truth
 * - Line numbers NEVER modified
 * - No merging values with "|"
 * - Multiple values for same key shown as list
 * - Claims grouped by deterministic line number windows
 */

import { StructuredItem, OrganizedStructuredData } from "./api";

/**
 * Organize flat items into UI sections.
 * 
 * This is frontend-only grouping for display purposes.
 * All items are preserved - nothing is dropped.
 */
export function organizeStructuredData(
  items: StructuredItem[]
): OrganizedStructuredData {
  const sections: OrganizedStructuredData["sections"] = {};

  // Group items by semantic type for section assignment
  const claimItems: StructuredItem[] = [];
  const policyItems: StructuredItem[] = [];
  const reportItems: StructuredItem[] = [];
  const summaryItems: StructuredItem[] = [];
  const otherItems: StructuredItem[] = [];

  for (const item of items) {
    const semanticType = item.semantic_type || "unknown";
    
    if (semanticType.startsWith("claim.")) {
      claimItems.push(item);
    } else if (semanticType.startsWith("policy.")) {
      policyItems.push(item);
    } else if (semanticType.startsWith("report.")) {
      reportItems.push(item);
    } else if (semanticType.startsWith("summary.") || semanticType.includes("total")) {
      summaryItems.push(item);
    } else {
      otherItems.push(item);
    }
  }

  // Build Claims section: deterministic positional association using line number windows
  // Track which items were assigned to claims
  const assignedClaimItems = new Set<StructuredItem>();
  if (claimItems.length > 0) {
    const claims = buildClaimsByLineWindows(claimItems, assignedClaimItems);
    if (claims.length > 0) {
      sections.Claims = claims;
    }
    
    // Move unassigned claim items to "Other" section (preserve all data)
    const unassignedClaimItems = claimItems.filter(item => !assignedClaimItems.has(item));
    otherItems.push(...unassignedClaimItems);
  }

  // Build Policy Info section: key → list of values (no merging)
  if (policyItems.length > 0) {
    const policyInfo = buildFlatSectionWithLists(policyItems);
    if (Object.keys(policyInfo).length > 0) {
      sections["Policy Info"] = policyInfo;
    }
  }

  // Build Report Info section: key → list of values (no merging)
  if (reportItems.length > 0) {
    const reportInfo = buildFlatSectionWithLists(reportItems);
    if (Object.keys(reportInfo).length > 0) {
      sections["Report Info"] = reportInfo;
    }
  }

  // Build Summary section: key → list of values (no merging)
  if (summaryItems.length > 0) {
    const summary = buildFlatSectionWithLists(summaryItems);
    if (Object.keys(summary).length > 0) {
      sections.Summary = summary;
    }
  }

  // Build Other section: key → list of values (no merging)
  // REQUIRED: Show everything that doesn't fit known sections
  if (otherItems.length > 0) {
    const other = buildFlatSectionWithLists(otherItems);
    if (Object.keys(other).length > 0) {
      sections.Other = other;
    }
  }

  // Preserve original flat items alongside organized sections so
  // downstream layout builders can reason about document flow.
  return { items, sections };
}

/**
 * Build claims using deterministic positional association with line number windows.
 * 
 * Algorithm:
 * 1. Each Claim Number defines a claim anchor
 * 2. Sort claim anchors by their first line number
 * 3. A claim's line window is: from its claim number line up to (but not including) the next claim number line
 * 4. A field belongs to a claim only if ALL its line_numbers fall inside that window
 * 5. If a field overlaps multiple claim windows → do NOT attach it (goes to "Other")
 * 
 * NO semantic guessing. Position only.
 */
function buildClaimsByLineWindows(
  items: StructuredItem[],
  assignedItems: Set<StructuredItem>
): Array<Record<string, Array<{ value: string; line_numbers: number[] }>>> {
  // Helper to check if an item is a claim number
  const isClaimNumber = (item: StructuredItem): boolean => {
    const label = item.canonical_name || item.source_key;
    const normalizedKey = label.trim().toLowerCase().replace(/[:.]$/, "");
    return (
      normalizedKey === "claim number" ||
      normalizedKey === "claim #" ||
      normalizedKey.startsWith("claim number") ||
      item.semantic_type === "claim.number"
    );
  };

  // Find all claim number items
  const claimNumberItems: StructuredItem[] = [];
  for (const item of items) {
    if (isClaimNumber(item)) {
      claimNumberItems.push(item);
    }
  }

  // If no claim numbers found, return empty array
  if (claimNumberItems.length === 0) {
    return [];
  }

  // Sort claim anchors by their first line number
  claimNumberItems.sort((a, b) => {
    const aLine = Math.min(...a.line_numbers);
    const bLine = Math.min(...b.line_numbers);
    return aLine - bLine;
  });

  // Build claims with line number windows
  const claims: Array<Record<string, Array<{ value: string; line_numbers: number[] }>>> = [];
  const assignedItemIds = new Set<string>();

  for (let i = 0; i < claimNumberItems.length; i++) {
    const claimNumItem = claimNumberItems[i];
    const claimStartLine = Math.min(...claimNumItem.line_numbers);
    
    // Window end: next claim number's first line (or Infinity if last claim)
    const claimEndLine = i + 1 < claimNumberItems.length
      ? Math.min(...claimNumberItems[i + 1].line_numbers)
      : Infinity;

    // Create claim object with Claim Number
    const claim: Record<string, Array<{ value: string; line_numbers: number[] }>> = {
      "Claim Number": [{
        value: claimNumItem.value,
        line_numbers: claimNumItem.line_numbers,
      }],
    };

    // Mark claim number as assigned
    const claimNumId = `${claimNumItem.source_key}|${claimNumItem.value}|${claimNumItem.line_numbers.join(',')}`;
    assignedItemIds.add(claimNumId);
    assignedItems.add(claimNumItem);

    // Find fields that belong to this claim window
    // Rule: ALL line_numbers must fall inside the window
    for (const item of items) {
      // Skip if already assigned or if it's a claim number (already added)
      const itemId = `${item.source_key}|${item.value}|${item.line_numbers.join(',')}`;
      if (assignedItemIds.has(itemId)) {
        continue;
      }
      
      if (isClaimNumber(item)) {
        continue; // Claim numbers are handled separately
      }

      // Check if ALL line_numbers fall inside the window
      const itemMinLine = Math.min(...item.line_numbers);
      const itemMaxLine = Math.max(...item.line_numbers);
      
      // ALL lines must be >= claimStartLine AND < claimEndLine
      const allLinesInWindow = itemMinLine >= claimStartLine && itemMaxLine < claimEndLine;

      if (allLinesInWindow) {
        // Field belongs to this claim
        const keyLabel = item.canonical_name || item.source_key;
        const key = keyLabel.trim().replace(/[:.]$/, "") || "(no key)";
        if (!claim[key]) {
          claim[key] = [];
        }
        claim[key].push({
          value: item.value,
          line_numbers: item.line_numbers,
        });
        assignedItemIds.add(itemId);
        assignedItems.add(item);
      }
      // If field overlaps multiple windows or is outside all windows, it remains unassigned
      // (will appear in "Other" section)
    }

    // Add claim even if it only has Claim Number (preserve all data)
    claims.push(claim);
  }

  return claims;
}

/**
 * Build a flat section with key → list of values.
 * 
 * Multiple values for the same key are preserved as separate entries in the list.
 * NO merging with "|" or commas.
 */
function buildFlatSectionWithLists(
  items: StructuredItem[]
): Record<string, Array<{ value: string; line_numbers: number[] }>> {
  const section: Record<string, Array<{ value: string; line_numbers: number[] }>> = {};

  for (const item of items) {
    const keyLabel = item.canonical_name || item.source_key;
    const key = keyLabel.trim().replace(/[:.]$/, "") || "(no key)";
    
    if (!section[key]) {
      section[key] = [];
    }
    
    // Add as separate entry - preserve all values, no merging
    section[key].push({
      value: item.value,
      line_numbers: item.line_numbers,
    });
  }

  return section;
}
