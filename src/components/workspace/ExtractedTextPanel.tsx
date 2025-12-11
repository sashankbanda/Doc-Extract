import { motion } from "framer-motion";
import { FileText, Heading1, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { LayoutText, BoundingBox } from "@/types/document";

interface ExtractedTextPanelProps {
  items: LayoutText[];
  onItemHover: (boundingBox: BoundingBox | null) => void;
  onItemClick: (boundingBox: BoundingBox) => void;
}

const iconMap = {
  paragraph: FileText,
  heading: Heading1,
  "list-item": List,
};

export function ExtractedTextPanel({
  items,
  onItemHover,
  onItemClick,
}: ExtractedTextPanelProps) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const Icon = iconMap[item.type];
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              "p-4 rounded-xl glass cursor-pointer transition-all duration-200",
              "hover:bg-[hsl(var(--glass-bg)/0.8)] hover:border-primary/30 hover:glow-primary-subtle"
            )}
            onMouseEnter={() => onItemHover(item.boundingBox)}
            onMouseLeave={() => onItemHover(null)}
            onClick={() => onItemClick(item.boundingBox)}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
                  {item.type}
                </span>
                <p className="text-sm text-foreground leading-relaxed">
                  {item.text}
                </p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
