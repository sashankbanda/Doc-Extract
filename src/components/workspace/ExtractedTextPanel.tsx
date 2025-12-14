import { motion } from "framer-motion";
import { FileText, Heading1, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { LayoutText, BoundingBox } from "@/types/document";

interface ExtractedTextPanelProps {
  items: LayoutText[];
  onItemHover: (boundingBox: BoundingBox | null) => void;
  onItemClick: (boundingBox: BoundingBox, item: LayoutText, index: number) => void;
  searchQuery?: string;
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
  searchQuery = "",
}: ExtractedTextPanelProps) {
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);
    
    return (
      <>
        {before}
        <mark className="bg-primary/20 text-primary font-medium">{match}</mark>
        {after}
      </>
    );
  };
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
            onClick={() => onItemClick(item.boundingBox, item, index)}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
                  {item.type}
                </span>
                <div className="overflow-x-auto -mx-4 px-4">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre font-mono" style={{ minWidth: 'max-content' }}>
                    {highlightMatch(item.text, searchQuery)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
