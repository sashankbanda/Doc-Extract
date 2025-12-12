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

const StructuredDataViewer: React.FC<StructuredDataViewerProps> = ({ data, sourceRefs, onHighlight }) => {
  const policy = data?.policy_info || {};
  const claims: any[] = Array.isArray(data?.claims) ? data.claims : [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-6">
      {/* Policy Info */}
      <div className={sectionCard}>
        <h3 className="text-sm font-semibold mb-3">Policy Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Policy Number</span>
            <HighlightValue path="data.policy_info.policy_number" sourceRefs={sourceRefs} onHighlight={onHighlight}>
              {policy.policy_number || "—"}
            </HighlightValue>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Insured Name</span>
            <HighlightValue path="data.policy_info.insured_name" sourceRefs={sourceRefs} onHighlight={onHighlight}>
              {policy.insured_name || "—"}
            </HighlightValue>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Policy Term Start</span>
            <HighlightValue path="data.policy_info.policy_term.start" sourceRefs={sourceRefs} onHighlight={onHighlight}>
              {policy?.policy_term?.start || "—"}
            </HighlightValue>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Policy Term End</span>
            <HighlightValue path="data.policy_info.policy_term.end" sourceRefs={sourceRefs} onHighlight={onHighlight}>
              {policy?.policy_term?.end || "—"}
            </HighlightValue>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Division</span>
            <HighlightValue path="data.policy_info.division" sourceRefs={sourceRefs} onHighlight={onHighlight}>
              {policy.division || "—"}
            </HighlightValue>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">PAC</span>
            <HighlightValue path="data.policy_info.pac" sourceRefs={sourceRefs} onHighlight={onHighlight}>
              {policy.pac || "—"}
            </HighlightValue>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Master Producer</span>
            <HighlightValue path="data.policy_info.master_producer" sourceRefs={sourceRefs} onHighlight={onHighlight}>
              {policy.master_producer || "—"}
            </HighlightValue>
          </div>
        </div>
      </div>

      {/* Claims */}
      <div className={sectionCard}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Claims</h3>
          <span className="text-xs text-muted-foreground">{claims.length} rows</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Claim #</th>
                <th className="text-left px-3 py-2 font-medium">Claimant</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-left px-3 py-2 font-medium">Event Date</th>
                <th className="text-left px-3 py-2 font-medium">Report Date</th>
                <th className="text-left px-3 py-2 font-medium">Closed Date</th>
                <th className="text-right px-3 py-2 font-medium">Paid</th>
                <th className="text-right px-3 py-2 font-medium">Expense</th>
                <th className="text-right px-3 py-2 font-medium">Outstanding</th>
                <th className="text-right px-3 py-2 font-medium">Incurred</th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-muted-foreground text-center" colSpan={11}>
                    No claims found.
                  </td>
                </tr>
              )}
              {claims.map((claim, idx) => (
                <tr key={idx} className="border-t border-border/50">
                  <td className="px-3 py-2">
                    <HighlightValue
                      path={`data.claims[${idx}].claim_number`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim.claim_number || "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2">
                    <HighlightValue
                      path={`data.claims[${idx}].claimant`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim.claimant || "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2">
                    <HighlightValue
                      path={`data.claims[${idx}].status`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim.status || "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2 max-w-[220px]">
                    <HighlightValue
                      path={`data.claims[${idx}].description`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim.description || "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2">
                    <HighlightValue
                      path={`data.claims[${idx}].dates.event`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim?.dates?.event || "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2">
                    <HighlightValue
                      path={`data.claims[${idx}].dates.report`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim?.dates?.report || "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2">
                    <HighlightValue
                      path={`data.claims[${idx}].dates.closed`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim?.dates?.closed || "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <HighlightValue
                      path={`data.claims[${idx}].amounts.paid`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim?.amounts?.paid ?? "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <HighlightValue
                      path={`data.claims[${idx}].amounts.expense`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim?.amounts?.expense ?? "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <HighlightValue
                      path={`data.claims[${idx}].amounts.outstanding`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim?.amounts?.outstanding ?? "—"}
                    </HighlightValue>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <HighlightValue
                      path={`data.claims[${idx}].amounts.incurred`}
                      sourceRefs={sourceRefs}
                      onHighlight={onHighlight}
                    >
                      {claim?.amounts?.incurred ?? "—"}
                    </HighlightValue>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className={sectionCard}>
        <h3 className="text-sm font-semibold mb-3">Totals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Subtotal</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex justify-between">
                <span>Paid</span>
                <HighlightValue path="data.totals.subtotal.paid" sourceRefs={sourceRefs} onHighlight={onHighlight}>
                  {totals?.subtotal?.paid ?? "—"}
                </HighlightValue>
              </div>
              <div className="flex justify-between">
                <span>Expense</span>
                <HighlightValue path="data.totals.subtotal.expense" sourceRefs={sourceRefs} onHighlight={onHighlight}>
                  {totals?.subtotal?.expense ?? "—"}
                </HighlightValue>
              </div>
              <div className="flex justify-between">
                <span>Outstanding</span>
                <HighlightValue
                  path="data.totals.subtotal.outstanding"
                  sourceRefs={sourceRefs}
                  onHighlight={onHighlight}
                >
                  {totals?.subtotal?.outstanding ?? "—"}
                </HighlightValue>
              </div>
              <div className="flex justify-between">
                <span>Incurred</span>
                <HighlightValue path="data.totals.subtotal.incurred" sourceRefs={sourceRefs} onHighlight={onHighlight}>
                  {totals?.subtotal?.incurred ?? "—"}
                </HighlightValue>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Grand Total</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex justify-between">
                <span>Paid</span>
                <HighlightValue path="data.totals.grand_total.paid" sourceRefs={sourceRefs} onHighlight={onHighlight}>
                  {totals?.grand_total?.paid ?? "—"}
                </HighlightValue>
              </div>
              <div className="flex justify-between">
                <span>Expense</span>
                <HighlightValue
                  path="data.totals.grand_total.expense"
                  sourceRefs={sourceRefs}
                  onHighlight={onHighlight}
                >
                  {totals?.grand_total?.expense ?? "—"}
                </HighlightValue>
              </div>
              <div className="flex justify-between">
                <span>Outstanding</span>
                <HighlightValue
                  path="data.totals.grand_total.outstanding"
                  sourceRefs={sourceRefs}
                  onHighlight={onHighlight}
                >
                  {totals?.grand_total?.outstanding ?? "—"}
                </HighlightValue>
              </div>
              <div className="flex justify-between">
                <span>Incurred</span>
                <HighlightValue
                  path="data.totals.grand_total.incurred"
                  sourceRefs={sourceRefs}
                  onHighlight={onHighlight}
                >
                  {totals?.grand_total?.incurred ?? "—"}
                </HighlightValue>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StructuredDataViewer;

