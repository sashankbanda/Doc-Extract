import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EditableValueProps {
  value: string;
  isEditMode: boolean;
  onChange: (newValue: string) => void;
  onHighlight?: () => void;
  lineNumbers?: number[];
  showLineNumbers?: boolean;
  className?: string;
}

export const EditableValue: React.FC<EditableValueProps> = ({
  value,
  isEditMode,
  onChange,
  onHighlight,
  lineNumbers = [],
  showLineNumbers = false,
  className,
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
  };

  const lineNumbersText = lineNumbers.length > 0 
    ? lineNumbers.length === 1
      ? `[line ${lineNumbers[0]}]`
      : `[line ${lineNumbers.join(", ")}]`
    : "";

  if (isEditMode) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {showLineNumbers && lineNumbersText && (
          <span className="text-xs text-muted-foreground font-mono">
            {lineNumbersText}
          </span>
        )}
        <Input
          value={localValue}
          onChange={handleChange}
          className="h-7 text-sm"
          placeholder="Enter value..."
        />
      </div>
    );
  }

  const clickable = lineNumbers && lineNumbers.length > 0;

  return (
    <span
      className={cn(
        clickable ? "cursor-pointer hover:bg-primary/10 transition-colors rounded px-1 inline-flex" : "",
        "flex items-center gap-1",
        className
      )}
      onClick={clickable ? onHighlight : undefined}
      title={clickable ? "Click to highlight source text" : undefined}
    >
      {showLineNumbers && lineNumbersText && (
        <span className="text-xs text-muted-foreground font-mono">
          {lineNumbersText}
        </span>
      )}
      {localValue ?? "—"}
    </span>
  );
};

