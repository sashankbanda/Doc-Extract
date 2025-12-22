export type FixedWidthColumn = {
  name: string;
  start: number;
  end: number;
};

export type FixedWidthRow = {
  id: string;
  lineIndices: number[]; // 0-based indices into layoutText or raw text lines
  values: Record<string, string>;
};

export type FixedWidthTable = {
  columns: FixedWidthColumn[];
  rows: FixedWidthRow[];
};

// Canonical field ordering for ST (Structured Table) view
export const ST_CANONICAL_FIELDS: string[] = [
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
  "medicalPaid2",
  "medicalPaid3",
  "medicalReserves",
  "medicalReserves2",
  "medicalReserves3",
  "indemnityPaid",
  "indemnityPaid2",
  "indemnityPaid3",
  "indemnityPaid4",
  "indemnityPaid5",
  "indemnityPaid6",
  "indemnityReserves",
  "indemnityReserves2",
  "indemnityReserves3",
  "indemnityReserves4",
  "indemnityReserves5",
  "indemnityReserves6",
  "expensesPaid",
  "expensesPaid2",
  "expensesPaid3",
  "expensesPaid4",
  "expensesPaid5",
  "expensesPaid6",
  "expensesReserves",
  "expensesReserves2",
  "expensesReserves3",
  "expensesReserves4",
  "expensesReserves5",
  "expensesReserves6",
  "totalPaid",
  "totalPaid2",
  "totalReserve",
  "totalReserve2",
  "totalIncurredSource",
  "recoveries",
  "recoveries2",
  "recoveries3",
  "recoveries4",
  "recoveries5",
  "recoveries6",
  "totalMedical",
  "totalIndemnity",
  "totalExpenses",
  "inferredCurrency",
  "pageNumber",
  "sheetName",
];

/**
 * Infer fixed-width columns from a single header line by treating runs of 2+ spaces
 * as column separators. This is robust for classic loss-run style reports where
 * labels are separated by large gaps.
 */
export function inferColumnsFromHeader(header: string): FixedWidthColumn[] {
  const cols: FixedWidthColumn[] = [];
  const text = header.replace(/\s+$/g, " "); // normalize trailing spaces

  const separatorRegex = / {2,}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = separatorRegex.exec(text)) !== null) {
    const segment = text.slice(lastIndex, match.index);
    if (segment.trim()) {
      cols.push({
        name: segment.trimEnd(),
        start: lastIndex,
        end: match.index,
      });
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex);
  if (tail.trim()) {
    cols.push({
      name: tail.trimEnd(),
      start: lastIndex,
      end: text.length,
    });
  }

  return cols;
}

/**
 * Generic helper to slice a fixed-width line into column values using
 * pre-computed column boundaries.
 */
export function sliceLineIntoColumns(
  line: string,
  columns: FixedWidthColumn[]
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const col of columns) {
    const raw = line.slice(col.start, col.end);
    values[col.name] = raw.trimEnd();
  }
  return values;
}

/**
 * Parse loss-run style tables for the sample in 78f7e86d_* (simple single-header table)
 * using raw text lines (without the 0xNN: prefix). Returns one table per document.
 */
export function parseSimpleLossRunTable(
  lines: { index: number; text: string }[]
): FixedWidthTable | null {
  // Find header line: contains "Claim Number" and "Policy Number"
  const headerIdx = lines.findIndex(
    (l) =>
      l.text.includes("Claim Number") &&
      l.text.includes("Policy Number") &&
      l.text.includes("Loss Date")
  );
  if (headerIdx === -1) return null;

  const headerLine = lines[headerIdx].text;
  const columns = inferColumnsFromHeader(headerLine);
  if (columns.length === 0) return null;

  const rows: FixedWidthRow[] = [];
  let currentRow: FixedWidthRow | null = null;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const { index, text } = lines[i];
    const trimmed = text.trimEnd();

    if (!trimmed) {
      // Blank line: end of current row, but keep going for next data rows
      continue;
    }

    // Totals line marks the end of the main table
    if (trimmed.startsWith("Total # Claims")) {
      break;
    }

    const claimRow = /^\s*\d{8}\s+/.test(text);
    if (claimRow) {
      // Start a new logical row
      const values = sliceLineIntoColumns(text, columns);
      currentRow = {
        id: `row-${index}`,
        lineIndices: [index],
        values,
      };
      rows.push(currentRow);
      continue;
    }

    // Continuation lines: attach to the "Description" or last column
    if (currentRow) {
      // Find description-like column: first that includes "Description" or "Desc"
      const descCol =
        columns.find((c) =>
          /description|desc/i.test(c.name.replace(/\s+/g, " "))
        ) || columns[columns.length - 1];

      const existing = currentRow.values[descCol.name] || "";
      const extra = text
        .slice(descCol.start, descCol.end)
        .trimEnd();
      if (extra) {
        currentRow.values[descCol.name] = existing
          ? `${existing} ${extra}`
          : extra;
        currentRow.lineIndices.push(index);
      }
    }
  }

  if (rows.length === 0) return null;

  return { columns, rows };
}

/**
 * Parse the repeated-header loss-run style table for the 5917f7f1_* sample.
 * This report has repeated two-line headers per claim block. We treat each
 * header block the same and stitch all data rows into one table.
 */
export function parseMultiHeaderLossRunTable(
  lines: { index: number; text: string }[]
): FixedWidthTable | null {
  const tables: FixedWidthTable[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i].text;
    const l2 = lines[i + 1].text;

    // Detect the two-line header pattern
    const isHeaderBlock =
      l1.includes("Sub") &&
      l1.includes("Proc Event") &&
      l2.includes("Ltr") &&
      l2.includes("Occurrence ID");

    if (!isHeaderBlock) continue;

    const headerIndex = i + 1; // use the second line for precise columns
    const headerLine = lines[headerIndex].text;
    const columns = inferColumnsFromHeader(headerLine);
    if (columns.length === 0) continue;

    const rows: FixedWidthRow[] = [];
    let currentRow: FixedWidthRow | null = null;

    // Data starts after the second header line
    for (let j = headerIndex + 1; j < lines.length; j++) {
      const { index, text } = lines[j];
      const trimmed = text.trimEnd();

      if (!trimmed) {
        // Blank line: end of this header block
        break;
      }

      // New row starts with the Sub letter ("A") under the first column
      const isSubRow = /^\s*A\s+/.test(text);
      if (isSubRow) {
        const values = sliceLineIntoColumns(text, columns);
        currentRow = {
          id: `row-${index}`,
          lineIndices: [index],
          values,
        };
        rows.push(currentRow);
        continue;
      }

      // Continuation description lines (indented under "Desc")
      if (currentRow) {
        const descCol =
          columns.find((c) =>
            /desc/i.test(c.name.replace(/\s+/g, " "))
          ) || columns[columns.length - 1];

        const extra = text
          .slice(descCol.start, descCol.end)
          .trimEnd();
        if (extra) {
          const existing = currentRow.values[descCol.name] || "";
          currentRow.values[descCol.name] = existing
            ? `${existing} ${extra}`
            : extra;
          currentRow.lineIndices.push(index);
        }
      }
    }

    if (rows.length > 0) {
      tables.push({ columns, rows });
    }
  }

  if (tables.length === 0) return null;

  // For now, flatten all blocks into a single table with the same columns
  const primary = tables[0];
  const allRows = tables.flatMap((t) => t.rows);
  return { columns: primary.columns, rows: allRows };
}





