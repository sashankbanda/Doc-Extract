import { cn } from "@/lib/utils";
import * as Diff from "diff";
import { useMemo } from "react";

interface DiffViewerProps {
    oldValue: string | undefined | null;
    newValue: string | undefined | null;
    mode: 'old' | 'new'; // 'old' = reference (show what was removed in red), 'new' = candidate (show what was added in green)
    className?: string;
}

export function DiffViewer({ oldValue, newValue, mode, className }: DiffViewerProps) {
    const safeOld = String(oldValue ?? "");
    const safeNew = String(newValue ?? "");

    const diffs = useMemo(() => {
        try {
            return Diff.diffChars(safeOld, safeNew);
        } catch (e) {
            console.error("Diff execution failed", e);
            return [];
        }
    }, [safeOld, safeNew]);

    if (!oldValue && !newValue) return <span className="text-muted-foreground italic">(empty)</span>;

    return (
        <span className={cn("whitespace-pre-wrap break-all font-mono text-sm leading-relaxed", className)}>
            {diffs.map((part, i) => {
                // Mode OLD: Show Removed (Red) + Unchanged. Hide Added.
                if (mode === 'old') {
                    if (part.added) return null; // Don't show what's new in the old view

                    const isRemoved = part.removed;
                    return (
                        <span 
                            key={i} 
                            className={cn(
                                isRemoved && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 decoration-red-400/50"
                            )}
                        >
                            {part.value}
                        </span>
                    );
                }

                // Mode NEW: Show Added (Green) + Unchanged. Hide Removed.
                if (mode === 'new') {
                    if (part.removed) return null; // Don't show what's removed in the new view

                    const isAdded = part.added;
                    return (
                        <span 
                            key={i} 
                            className={cn(
                                isAdded && "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                            )}
                        >
                            {part.value}
                        </span>
                    );
                }

                return null;
            })}
        </span>
    );
}
