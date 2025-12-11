import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Table, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { TwoPaneLayout } from "@/components/workspace/TwoPaneLayout";
import { FileSelectorDropdown } from "@/components/workspace/FileSelectorDropdown";
import { PDFViewerWrapper } from "@/components/workspace/PDFViewerWrapper";
import { ExtractedTextPanel } from "@/components/workspace/ExtractedTextPanel";
import { StructuredTablePanel } from "@/components/workspace/StructuredTablePanel";
import { TemplateFieldsPanel } from "@/components/workspace/TemplateFieldsPanel";
import { BoundingBox, LayoutText, ExtractedTable, ExtractedField } from "@/types/document";

// Mock data
const mockFiles = [
  { id: "1", name: "Invoice_2024_001.pdf" },
  { id: "2", name: "Contract_Agreement.pdf" },
  { id: "3", name: "Financial_Report_Q4.pdf" },
];

const mockLayoutText: LayoutText[] = [
  { id: "1", type: "heading", text: "Invoice #INV-2024-001", boundingBox: { x: 50, y: 50, width: 200, height: 30, page: 1 } },
  { id: "2", type: "paragraph", text: "Thank you for your business. Please find the invoice details below.", boundingBox: { x: 50, y: 100, width: 400, height: 40, page: 1 } },
  { id: "3", type: "list-item", text: "• Web Development Services - 40 hours @ $40/hr", boundingBox: { x: 50, y: 200, width: 350, height: 20, page: 1 } },
  { id: "4", type: "list-item", text: "• UI/UX Design Services - 20 hours @ $42.50/hr", boundingBox: { x: 50, y: 230, width: 350, height: 20, page: 1 } },
];

const mockTables: ExtractedTable[] = [
  {
    id: "1",
    headers: ["Item", "Quantity", "Unit Price", "Total"],
    rows: [
      [{ value: "Web Development" }, { value: "40 hrs" }, { value: "$40.00" }, { value: "$1,600.00" }],
      [{ value: "UI Design" }, { value: "20 hrs" }, { value: "$42.50" }, { value: "$850.00" }],
      [{ value: "Subtotal" }, { value: "" }, { value: "" }, { value: "$2,450.00" }],
    ],
    boundingBox: { x: 50, y: 300, width: 450, height: 120, page: 1 },
  },
];

const mockFields: ExtractedField[] = [
  { id: "1", label: "Invoice Number", value: "INV-2024-001", confidence: 0.98, boundingBox: { x: 380, y: 50, width: 120, height: 20, page: 1 } },
  { id: "2", label: "Invoice Date", value: "December 10, 2024", confidence: 0.95, boundingBox: { x: 380, y: 80, width: 120, height: 20, page: 1 } },
  { id: "3", label: "Due Date", value: "January 10, 2025", confidence: 0.92, boundingBox: { x: 380, y: 110, width: 120, height: 20, page: 1 } },
  { id: "4", label: "Total Amount", value: "$2,450.00", confidence: 0.99, boundingBox: { x: 380, y: 420, width: 100, height: 25, page: 1 } },
  { id: "5", label: "Vendor Name", value: "Acme Corp", confidence: 0.88, boundingBox: { x: 50, y: 150, width: 100, height: 20, page: 1 } },
  { id: "6", label: "Payment Status", value: "Paid", confidence: 0.75, boundingBox: { x: 380, y: 450, width: 60, height: 20, page: 1 } },
];

type TabType = "text" | "tables" | "fields";

const tabs: { id: TabType; label: string; icon: typeof FileText }[] = [
  { id: "text", label: "Layout Text", icon: FileText },
  { id: "tables", label: "Tables", icon: Table },
  { id: "fields", label: "Fields", icon: Tag },
];

export default function Workspace() {
  const [selectedFileId, setSelectedFileId] = useState(mockFiles[0].id);
  const [activeTab, setActiveTab] = useState<TabType>("fields");
  const [hoveredBoundingBox, setHoveredBoundingBox] = useState<BoundingBox | null>(null);
  const [activeBoundingBox, setActiveBoundingBox] = useState<BoundingBox | null>(null);

  const handleItemHover = useCallback((boundingBox: BoundingBox | null) => {
    setHoveredBoundingBox(boundingBox);
  }, []);

  const handleItemClick = useCallback((boundingBox: BoundingBox) => {
    setActiveBoundingBox(boundingBox);
    setTimeout(() => setActiveBoundingBox(null), 2000);
  }, []);

  // Collect all highlights
  const allHighlights = hoveredBoundingBox ? [hoveredBoundingBox] : [];

  const renderTabContent = () => {
    switch (activeTab) {
      case "text":
        return (
          <ExtractedTextPanel
            items={mockLayoutText}
            onItemHover={handleItemHover}
            onItemClick={handleItemClick}
          />
        );
      case "tables":
        return (
          <StructuredTablePanel
            tables={mockTables}
            onTableHover={handleItemHover}
            onCellClick={handleItemClick}
          />
        );
      case "fields":
        return (
          <TemplateFieldsPanel
            fields={mockFields}
            onFieldHover={handleItemHover}
            onFieldClick={handleItemClick}
          />
        );
    }
  };

  return (
    <div className="min-h-screen pt-16">
      <TwoPaneLayout
        leftPane={
          <PDFViewerWrapper
            documentId={selectedFileId}
            highlights={allHighlights}
            activeHighlight={activeBoundingBox}
          />
        }
        rightPane={
          <div className="h-full flex flex-col">
            {/* Header with file selector */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <FileSelectorDropdown
                files={mockFiles}
                selectedId={selectedFileId}
                onSelect={setSelectedFileId}
              />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 p-4 border-b border-border/50">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                    activeTab === tab.id
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/30"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderTabContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        }
      />
    </div>
  );
}
