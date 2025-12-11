import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileSelectorDropdownProps {
  files: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function FileSelectorDropdown({
  files,
  selectedId,
  onSelect,
}: FileSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedFile = files.find((f) => f.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl glass glass-hover w-full max-w-xs",
          "text-sm font-medium text-foreground transition-all duration-200"
        )}
      >
        <FileText className="w-4 h-4 text-primary" />
        <span className="truncate flex-1 text-left">{selectedFile?.name || "Select file"}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 mt-2 w-full max-w-xs glass rounded-xl overflow-hidden z-50 shadow-xl"
            >
              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => {
                    onSelect(file.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 w-full text-left text-sm",
                    "hover:bg-muted/50 transition-colors",
                    file.id === selectedId
                      ? "text-primary bg-primary/5"
                      : "text-foreground"
                  )}
                >
                  <FileText className="w-4 h-4" />
                  <span className="truncate flex-1">{file.name}</span>
                  {file.id === selectedId && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
