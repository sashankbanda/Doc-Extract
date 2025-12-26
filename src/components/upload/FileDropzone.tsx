import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Upload } from "lucide-react";
import { useCallback, useState } from "react";

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

    // Accept multiple file types: PDF, images, Excel, CSV, Office docs
    const acceptedTypes = [
      'application/pdf',
      'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', 'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/plain'
    ];
    
    const files = Array.from(e.dataTransfer.files).filter((file) => {
      // Check by MIME type or file extension
      const lowerName = file.name.toLowerCase();
      const hasValidExtension = 
        lowerName.endsWith('.pdf') ||
        lowerName.match(/\.(png|jpg|jpeg|gif|bmp|webp|tiff)$/) ||
        lowerName.match(/\.(xlsx|xls|ods)$/) ||
        lowerName.endsWith('.csv') ||
        lowerName.match(/\.(docx|doc|pptx)$/) ||
        lowerName.match(/\.(txt|md|log|json)$/);
      
      return acceptedTypes.includes(file.type) || hasValidExtension;
    });
    if (files.length > 0) onFilesAdded(files);
  }, [onFilesAdded, disabled]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    
    // Filter files by type/extension (same logic as handleDrop)
    const acceptedTypes = [
      'application/pdf',
      'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', 'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/plain'
    ];
    
    const filteredFiles = files.filter((file) => {
      const lowerName = file.name.toLowerCase();
      const hasValidExtension = 
        lowerName.endsWith('.pdf') ||
        lowerName.match(/\.(png|jpg|jpeg|gif|bmp|webp|tiff)$/) ||
        lowerName.match(/\.(xlsx|xls|ods)$/) ||
        lowerName.endsWith('.csv') ||
        lowerName.match(/\.(docx|doc|pptx)$/) ||
        lowerName.match(/\.(txt|md|log|json)$/);
      
      return acceptedTypes.includes(file.type) || hasValidExtension;
    });
    
    if (filteredFiles.length > 0) onFilesAdded(filteredFiles);
    e.target.value = "";
  }, [onFilesAdded]);

  return (
    <motion.div
      className={cn(
        "relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden",
        "flex flex-col items-center justify-center p-12 text-center",
        isDragOver
          ? "border-primary bg-primary/5 glow-primary-subtle"
          : "border-input hover:border-primary/50 hover:bg-muted/30",
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
        accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tiff,.xlsx,.xls,.ods,.csv,.docx,.doc,.pptx,.txt,.md,.log,.json,application/pdf,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
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
        {isDragOver ? "Drop your files here" : "Drag & drop your documents"}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        or click to browse from your device
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="w-4 h-4" />
        <span>PDF, Images, Excel, CSV, Word, PowerPoint, Text files - up to 50MB each</span>
      </div>
    </motion.div>
  );
}
