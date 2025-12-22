import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Edit2, Loader2, X } from "lucide-react";
import React, { useEffect, useState } from "react";

interface EditableValueProps {
  value: string;
  onSave?: (newValue: string) => Promise<void>;
  isSaving?: boolean;
  onHighlight?: () => void;
  lineNumbers?: number[];
  showLineNumbers?: boolean;
  className?: string;
}

export const EditableValue: React.FC<EditableValueProps> = ({
  value,
  onSave,
  isSaving = false,
  onHighlight,
  lineNumbers = [],
  showLineNumbers = false,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleSave = async () => {
    if (onSave) {
      await onSave(localValue);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setLocalValue(value);
    setIsEditing(false);
  };

  const lineNumbersText = lineNumbers.length > 0 
    ? lineNumbers.length === 1
      ? `[line ${lineNumbers[0]}]`
      : `[line ${lineNumbers.join(", ")}]`
    : "";

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {showLineNumbers && lineNumbersText && (
          <span className="text-xs text-muted-foreground font-mono">
            {lineNumbersText}
          </span>
        )}
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="h-7 text-sm min-w-[200px]"
          placeholder="Enter value..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <div className="flex items-center gap-1">
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-green-500 hover:text-green-600"
                onClick={handleSave}
                disabled={isSaving}
                title="Save"
            >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive/90"
                onClick={handleCancel}
                disabled={isSaving}
                title="Cancel"
            >
                <X className="w-4 h-4" />
            </Button>
        </div>
      </div>
    );
  }

  const clickable = lineNumbers && lineNumbers.length > 0;

  return (
    <div className={cn("flex items-center gap-2 group", className)}>
        <span
        className={cn(
            clickable ? "cursor-pointer hover:bg-primary/10 transition-colors rounded px-1 inline-flex" : "",
            "flex items-center gap-1"
        )}
        onClick={clickable ? onHighlight : undefined}
        title={clickable ? "Click to highlight source text" : undefined}
        >
        {showLineNumbers && lineNumbersText && (
            <span className="text-xs text-muted-foreground font-mono">
            {lineNumbersText}
            </span>
        )}
        {value ?? "—"}
        </span>
        
        {onSave && (
            <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditing(true)}
                title="Edit"
            >
                <Edit2 className="w-3 h-3" />
            </Button>
        )}
    </div>
  );
};

