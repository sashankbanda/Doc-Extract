import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadFile } from "@/types/document";

interface FileDropzoneProps {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
}

export function FileDropzone({ onFilesAdded, disabled }: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === "application/pdf"
    );
    if (files.length > 0) onFilesAdded(files);
  }, [onFilesAdded, disabled]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) onFilesAdded(files);
    e.target.value = "";
  }, [onFilesAdded]);

  return (
    <motion.div
      className={cn(
        "relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden",
        "flex flex-col items-center justify-center p-12 text-center",
        isDragOver
          ? "border-primary bg-primary/5 glow-primary-subtle"
          : "border-border hover:border-primary/50 hover:bg-muted/30",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      whileHover={!disabled ? { scale: 1.01 } : {}}
      transition={{ duration: 0.2 }}
    >
      {/* Background glow effect on drag */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent"
          />
        )}
      </AnimatePresence>

      <input
        type="file"
        accept=".pdf,application/pdf"
        multiple
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={disabled}
      />

      <motion.div
        animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors duration-300",
          isDragOver ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <Upload className="w-8 h-8" />
      </motion.div>

      <h3 className="text-lg font-semibold text-foreground mb-2">
        {isDragOver ? "Drop your files here" : "Drag & drop your PDFs"}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        or click to browse from your device
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="w-4 h-4" />
        <span>PDF files only, up to 50MB each</span>
      </div>
    </motion.div>
  );
}
