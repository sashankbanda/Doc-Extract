import { ReactNode, useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TwoPaneLayoutProps {
  leftPane: ReactNode;
  rightPane: ReactNode;
  leftWidth?: string;
}

export function TwoPaneLayout({
  leftPane,
  rightPane,
  leftWidth: initialLeftWidth = "55%",
}: TwoPaneLayoutProps) {
  const [leftWidth, setLeftWidth] = useState<string>(initialLeftWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      // Calculate percentage, ensuring minimum 30% for each pane
      const minWidth = containerWidth * 0.3;
      const maxWidth = containerWidth * 0.7;
      
      let newLeftWidth = mouseX;
      
      if (newLeftWidth < minWidth) {
        newLeftWidth = minWidth;
      } else if (newLeftWidth > maxWidth) {
        newLeftWidth = maxWidth;
      }

      const percentage = (newLeftWidth / containerWidth) * 100;
      setLeftWidth(`${percentage}%`);
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-4rem)] gap-0 p-4">
      {/* Left Pane - PDF Viewer */}
      <div
        ref={leftPaneRef}
        className="glass rounded-2xl overflow-hidden flex-shrink-0"
        style={{ width: leftWidth }}
      >
        {leftPane}
      </div>

      {/* Resizer */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 bg-border/50 hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0",
          isResizing && "bg-primary"
        )}
        style={{ margin: "0 0.5rem" }}
      />

      {/* Right Pane - Extracted Data */}
      <div className="flex-1 glass rounded-2xl overflow-hidden flex flex-col min-w-0">
        {rightPane}
      </div>
    </div>
  );
}
