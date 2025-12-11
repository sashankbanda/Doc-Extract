import { motion } from "framer-motion";
import { Tag, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExtractedField, BoundingBox } from "@/types/document";

interface TemplateFieldsPanelProps {
  fields: ExtractedField[];
  onFieldHover: (boundingBox: BoundingBox | null) => void;
  onFieldClick: (boundingBox: BoundingBox) => void;
}

export function TemplateFieldsPanel({
  fields,
  onFieldHover,
  onFieldClick,
}: TemplateFieldsPanelProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-400";
    if (confidence >= 0.7) return "text-yellow-400";
    return "text-orange-400";
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((field, index) => (
        <motion.div
          key={field.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05 }}
          className={cn(
            "p-4 rounded-xl glass cursor-pointer transition-all duration-200",
            "hover:bg-[hsl(var(--glass-bg)/0.8)] hover:border-primary/30 hover:glow-primary-subtle"
          )}
          onMouseEnter={() => onFieldHover(field.boundingBox)}
          onMouseLeave={() => onFieldHover(null)}
          onClick={() => onFieldClick(field.boundingBox)}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {field.label}
              </span>
            </div>
            <div className={cn("flex items-center gap-1 text-xs", getConfidenceColor(field.confidence))}>
              <Sparkles className="w-3 h-3" />
              {Math.round(field.confidence * 100)}%
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">{field.value}</p>
        </motion.div>
      ))}
    </div>
  );
}
