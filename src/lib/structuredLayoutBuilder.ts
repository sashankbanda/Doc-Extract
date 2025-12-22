import { StructuredItem } from "./api";
import { organizeStructuredData } from "./organizeStructuredData";

export type LayoutBlock =
  | {
      type: "header";
      items: {
        label: string;
        value: string;
        lines: number[];
        section?: "Policy Info" | "Report Info";
      }[];
    }
  | {
      type: "claims";
      columns: string[];
      rows: Record<string, { value: string; lines: number[] }>[];
    }
  | {
      type: "summary_table";
      title: string;
      columns: string[];
      rows: Record<string, { value: string; lines: number[] }>[];
    }
  | {
      type: "subtotal";
      label: string;
      values: Record<string, { value: string; lines: number[] }>;
    }
  | {
      type: "summary";
      title: string;
      columns: string[];
      rows: Record<string, { value: string; lines: number[] }>[];
    }
  | {
      type: "grand_total";
      values: Record<string, { value: string; lines: number[] }>;
    };

/**
 * Build high-level layout blocks from flat structured items.
 *
 * This is a FRONTEND-ONLY normalization layer:
 * - Does not change or merge backend data
 * - Never alters line_numbers
 * - Focuses on layout intent (header, claims table, summaries, totals)
 */
export function buildStructuredLayout(items: StructuredItem[]): LayoutBlock[] {
  if (!items || items.length === 0) return [];

  const HEADER_LINE_CUTOFF = 15;

  const headerAllowList = new Set([
    "insured name",
    "policy number",
    "effective date",
    "expiration date",
    "run as of",
    "program",
    "division",
    "pac",
    "mcc",
  ]);

  const headerExcludeList = [
    "policy period",
    "policy #",
    "policy number", // allow only first occurrence
    "claim number",
    "totals",
    "total",
    "# claims",
    "grand total",
  ];

  const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[:.]$/, "");
  const firstLine = (lines: number[]) =>
    !lines || lines.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...lines);

  // Re‑use existing deterministic organizer so we don't duplicate
  // claim window logic or section classification heuristics.
  const organized = organizeStructuredData(items);
  const { sections } = organized;

  const blocks: LayoutBlock[] = [];

  // HEADER: strictly from top of page 1 with cutoff and allow list
  const headerItems: {
    label: string;
    value: string;
    lines: number[];
    section?: "Policy Info" | "Report Info";
  }[] = [];

  const seenHeaderKeys = new Set<string>();

  for (const item of items) {
    const keyNorm = normalizeKey(item.key);
    const itemFirstLine = firstLine(item.line_numbers || []);

    // Hard cutoff: only top-of-page lines
    if (itemFirstLine > HEADER_LINE_CUTOFF) continue;

    // Exclude disallowed keys
    if (headerExcludeList.some((ex) => keyNorm.includes(ex))) continue;

    // Only allow specific header keys
    if (!headerAllowList.has(keyNorm)) continue;

    // Only take first occurrence of each allowed key
    if (seenHeaderKeys.has(keyNorm)) continue;
    seenHeaderKeys.add(keyNorm);

    const sectionGuess: "Policy Info" | "Report Info" | undefined =
      item.semantic_type?.startsWith("report.") ? "Report Info" : "Policy Info";

    headerItems.push({
      label: item.key,
      value: item.value,
      lines: item.line_numbers ?? [],
      section: sectionGuess,
    });
  }

  if (headerItems.length > 0) {
    // Keep document flow by sorting by first line number
    headerItems.sort((a, b) => {
      const aLine = a.lines.length ? Math.min(...a.lines) : Number.MAX_SAFE_INTEGER;
      const bLine = b.lines.length ? Math.min(...b.lines) : Number.MAX_SAFE_INTEGER;
      return aLine - bLine;
    });

    blocks.push({
      type: "header",
      items: headerItems,
    });
  }

  // CLAIMS WINDOW: restrict to lines that look like claims
  const claimHeaderKeywords = ["claim number", "loss date", "claimant"];
  const isClaimHeaderLike = (key: string) =>
    claimHeaderKeywords.some((kw) => key.includes(kw));
  const isClaimRowLike = (item: StructuredItem) => {
    const keyNorm = normalizeKey(item.key);
    return (
      isClaimHeaderLike(keyNorm) ||
      item.semantic_type?.startsWith("claim.") ||
      keyNorm.includes("claim")
    );
  };

  const claimHeaderLines = items
    .filter((it) => isClaimHeaderLike(normalizeKey(it.key)))
    .map((it) => firstLine(it.line_numbers || []));
  const claimRowLines = items
    .filter((it) => isClaimRowLike(it))
    .map((it) => firstLine(it.line_numbers || []));

  const claimStartLine = claimHeaderLines.length
    ? Math.min(...claimHeaderLines)
    : Number.MAX_SAFE_INTEGER;
  const claimEndLine =
    claimRowLines.length && claimStartLine !== Number.MAX_SAFE_INTEGER
      ? Math.max(...claimRowLines)
      : Number.MAX_SAFE_INTEGER;

  const isWithinClaimsWindow = (lines: number[] | undefined) => {
    if (!lines || lines.length === 0) return false;
    const minL = Math.min(...lines);
    const maxL = Math.max(...lines);
    return minL >= claimStartLine && maxL <= claimEndLine;
  };

  // CLAIMS: Anchor-based grouping with vertical tolerance inside claims window
  if (
    claimStartLine !== Number.MAX_SAFE_INTEGER &&
    claimEndLine !== Number.MAX_SAFE_INTEGER
  ) {
    const CLAIM_ROW_TOLERANCE = 3;
    const allowedClaimKeys = new Set([
      "claim number",
      "policy number",
      "loss date",
      "notification date",
      "claim status",
      "claimant",
      "claim description",
      "coverage",
      "coverage section",
      "cause of loss",
      "paid loss",
      "paid alae",
      "outstanding",
      "incurred",
      "total paid",
    ]);

    const isClaimNumberKey = (key: string) => {
      const k = normalizeKey(key);
      return (
        k === "claim number" ||
        k === "claim #" ||
        k.startsWith("claim number") ||
        k === "claim no" ||
        k === "claim no." ||
        k === "claim"
      );
    };

    // Anchors: claim number items within the claims window
    const anchorItems = items
      .filter(
        (it) =>
          isClaimNumberKey(it.key) &&
          isWithinClaimsWindow(it.line_numbers)
      )
      .map((it) => ({
        anchorLine: firstLine(it.line_numbers || []),
        value: it.value,
        lines: it.line_numbers ?? [],
      }))
      .sort((a, b) => a.anchorLine - b.anchorLine);

    if (anchorItems.length > 0) {
      const rows: Record<string, { value: string; lines: number[] }>[] = [];
      const columnSet = new Set<string>();
      const keyLabels: Record<string, string> = {};
      const usedItemIds = new Set<string>();

      const summaryLike = (key: string) => {
        const k = normalizeKey(key);
        return (
          k.includes("total") ||
          k.includes("summary") ||
          k.includes("grand total") ||
          k.includes("policy period")
        );
      };
      const descriptionLike = (key: string) => {
        const k = normalizeKey(key);
        return (
          k.includes("description") ||
          k.includes("desc") ||
          k.includes("cause")
        );
      };

      const itemsInWindow = items.filter((it) => {
        const keyNorm = normalizeKey(it.key);
        if (!allowedClaimKeys.has(keyNorm)) return false;
        if (summaryLike(it.key)) return false;
        return isWithinClaimsWindow(it.line_numbers);
      });

      for (const anchor of anchorItems) {
        const row: Record<string, { value: string; lines: number[] }> = {
          "Claim Number": {
            value: anchor.value,
            lines: anchor.lines,
          },
        };

        // Map key -> best candidate(s) with distance for merging
        const candidates: Record<
          string,
          { distance: number; value: string; lines: number[] }[]
        > = {};

        for (const item of itemsInWindow) {
          if (isClaimNumberKey(item.key)) continue;

          const itemId = `${normalizeKey(item.key)}|${item.value}|${(item.line_numbers || []).join(",")}`;
          if (usedItemIds.has(itemId)) continue;

          const dist =
            item.line_numbers && item.line_numbers.length
              ? Math.min(
                  ...item.line_numbers.map((ln) =>
                    Math.abs(ln - anchor.anchorLine)
                  )
                )
              : Number.MAX_SAFE_INTEGER;

          if (dist > CLAIM_ROW_TOLERANCE) continue;

          const keyNorm = normalizeKey(item.key);
          if (!keyLabels[keyNorm]) {
            const cleaned = item.key.trim().replace(/[:.]$/, "");
            keyLabels[keyNorm] = cleaned || item.key;
          }
          if (!candidates[keyNorm]) {
            candidates[keyNorm] = [];
          }
          candidates[keyNorm].push({
            distance: dist,
            value: item.value,
            lines: item.line_numbers ?? [],
          });
        }

        for (const [keyNorm, vals] of Object.entries(candidates)) {
          const label = keyLabels[keyNorm] || keyNorm;
          // Pick closest; for description-like, merge sorted by distance
          vals.sort((a, b) => a.distance - b.distance);
          if (descriptionLike(keyNorm)) {
            const closest = vals.filter((v) => v.distance <= CLAIM_ROW_TOLERANCE);
            if (closest.length > 0) {
              const mergedValue = closest.map((v) => v.value).join(" ");
              const mergedLines = Array.from(
                new Set(closest.flatMap((v) => v.lines))
              );
              row[label] = {
                value: mergedValue,
                lines: mergedLines,
              };
              closest.forEach((v) => {
                const id = `${keyNorm}|${v.value}|${v.lines.join(",")}`;
                usedItemIds.add(id);
              });
            }
          } else {
            const best = vals[0];
            row[label] = {
              value: best.value,
              lines: best.lines,
            };
            const id = `${keyNorm}|${best.value}|${best.lines.join(",")}`;
            usedItemIds.add(id);
          }
          columnSet.add(label);
        }

        rows.push(row);
      }

      const columns = Array.from(columnSet).filter(
        (c) => !isClaimNumberKey(c)
      );
      const finalColumns =
        anchorItems.length > 0 && !columns.includes("Claim Number")
          ? ["Claim Number", ...columns]
          : columns;

      blocks.push({
        type: "claims",
        columns: finalColumns,
        rows,
      });
    }
  }

  // SUMMARY + TOTALS:
  // Use Summary section plus any obvious total-like keys from Other.
  const summarySection = sections.Summary;

  if (summarySection && Object.keys(summarySection).length > 0) {
    const grandTotalValues: Record<string, { value: string; lines: number[] }> = {};

    // Filter summary values to be outside header and claims windows to keep blocks isolated
    const filteredSummaryEntries = Object.entries(summarySection).map(
      ([key, values]) => {
        const validValues = values.filter((v) => {
          const minL = firstLine(v.line_numbers || []);
          // Exclude anything in header cutoff
          if (minL <= HEADER_LINE_CUTOFF) return false;
          // Exclude anything inside claims window
          if (
            claimStartLine !== Number.MAX_SAFE_INTEGER &&
            claimEndLine !== Number.MAX_SAFE_INTEGER &&
            isWithinClaimsWindow(v.line_numbers)
          ) {
            return false;
          }
          return true;
        });
        return [key, validValues] as const;
      }
    );

    // Detect summary table: >=3 columns and >=2 rows (values)
    const summaryCols: string[] = [];
    let summaryRowCount = 0;
    for (const [key, values] of filteredSummaryEntries) {
      const normKey = normalizeKey(key);
      if (normKey.includes("grand total")) {
        if (values[0]) {
          grandTotalValues[key] = {
            value: values[0].value,
            lines: values[0].line_numbers ?? [],
          };
        }
        continue;
      }
      if (values.length > 0) {
        summaryCols.push(key);
        summaryRowCount = Math.max(summaryRowCount, values.length);
      }
    }

    const isSummaryTable = summaryCols.length >= 3 && summaryRowCount >= 2;

    if (isSummaryTable) {
      const rows: Record<string, { value: string; lines: number[] }>[] = [];
      for (let i = 0; i < summaryRowCount; i++) {
        const row: Record<string, { value: string; lines: number[] }> = {};
        for (const [key, values] of filteredSummaryEntries) {
          const normKey = normalizeKey(key);
          if (normKey.includes("grand total")) continue;
          const v = values[i];
          if (v) {
            row[key] = {
              value: v.value,
              lines: v.line_numbers ?? [],
            };
          } else {
            // keep structure; empty cells won't highlight
            row[key] = {
              value: "—",
              lines: [],
            };
          }
        }
        rows.push(row);
      }

      blocks.push({
        type: "summary_table",
        title: "Summary",
        columns: summaryCols,
        rows,
      });
    } else {
      // Fallback to key-value summary (excluding grand total)
      const summaryRows: Record<string, { value: string; lines: number[] }>[] =
        [];

      for (const [key, values] of filteredSummaryEntries) {
        const normKey = normalizeKey(key);
        if (normKey.includes("grand total")) continue;
        if (!values || values.length === 0) continue;
        const primary = values[0];

        summaryRows.push({
          Label: { value: key, lines: [] },
          Value: {
            value: primary.value,
            lines: primary.line_numbers ?? [],
          },
        });
      }

      if (summaryRows.length > 0) {
        blocks.push({
          type: "summary",
          title: "Summary",
          columns: ["Label", "Value"],
          rows: summaryRows,
        });
      }
    }

    if (Object.keys(grandTotalValues).length > 0) {
      blocks.push({
        type: "grand_total",
        values: grandTotalValues,
      });
    }
  }

  // As a conservative first pass, we do not synthesize additional subtotal
  // blocks from arbitrary sections. Those can be added later once we have
  // more real‑world patterns to key off.

  // Order blocks by their earliest line number to better follow document flow.
  return blocks.sort((a, b) => {
    const aLine = getBlockMinLine(a);
    const bLine = getBlockMinLine(b);
    return aLine - bLine;
  });
}

function claimNumberValuesExist(
  claims: Array<Record<string, Array<{ value: string; line_numbers: number[] }>>>
): boolean {
  return claims.some(
    (claim) =>
      (claim["Claim Number"] && claim["Claim Number"].length > 0) ||
      (claim["Claim #"] && claim["Claim #"].length > 0)
  );
}

function getBlockMinLine(block: LayoutBlock): number {
  const max = Number.MAX_SAFE_INTEGER;

  switch (block.type) {
    case "header": {
      const mins = block.items
        .map((i) => (i.lines && i.lines.length ? Math.min(...i.lines) : max))
        .filter((n) => n !== max);
      return mins.length ? Math.min(...mins) : max;
    }
    case "claims": {
      const mins: number[] = [];
      for (const row of block.rows) {
        for (const cell of Object.values(row)) {
          if (cell.lines && cell.lines.length) {
            mins.push(Math.min(...cell.lines));
          }
        }
      }
      return mins.length ? Math.min(...mins) : max;
    }
    case "summary_table": {
      const mins: number[] = [];
      for (const row of block.rows) {
        for (const cell of Object.values(row)) {
          if (cell.lines && cell.lines.length) {
            mins.push(Math.min(...cell.lines));
          }
        }
      }
      return mins.length ? Math.min(...mins) : max;
    }
    case "subtotal": {
      const mins = Object.values(block.values)
        .map((v) => (v.lines && v.lines.length ? Math.min(...v.lines) : max))
        .filter((n) => n !== max);
      return mins.length ? Math.min(...mins) : max;
    }
    case "summary": {
      const mins: number[] = [];
      for (const row of block.rows) {
        for (const cell of Object.values(row)) {
          if (cell.lines && cell.lines.length) {
            mins.push(Math.min(...cell.lines));
          }
        }
      }
      return mins.length ? Math.min(...mins) : max;
    }
    case "grand_total": {
      const mins = Object.values(block.values)
        .map((v) => (v.lines && v.lines.length ? Math.min(...v.lines) : max))
        .filter((n) => n !== max);
      return mins.length ? Math.min(...mins) : max;
    }
    default:
      return max;
  }
}


