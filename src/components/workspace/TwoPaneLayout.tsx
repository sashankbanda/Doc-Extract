import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TwoPaneLayoutProps {
  leftPane: ReactNode;
  rightPane: ReactNode;
  leftWidth?: string;
}

export function TwoPaneLayout({
  leftPane,
  rightPane,
  leftWidth = "55%",
}: TwoPaneLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Left Pane - PDF Viewer */}
      <div
        className="glass rounded-2xl overflow-hidden flex-shrink-0"
        style={{ width: leftWidth }}
      >
        {leftPane}
      </div>

      {/* Right Pane - Extracted Data */}
      <div className="flex-1 glass rounded-2xl overflow-hidden">
        {rightPane}
      </div>
    </div>
  );
}
