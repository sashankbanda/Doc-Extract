import { motion } from "framer-motion";
import { FileText, X, Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadFile } from "@/types/document";
import { ProgressBar } from "./ProgressBar";

interface FileListItemProps {
  file: UploadFile;
  onRemove: (id: string) => void;
}

const statusConfig = {
  pending: { icon: FileText, color: "text-muted-foreground", label: "Pending" },
  uploading: { icon: Loader2, color: "text-primary", label: "Uploading" },
  processing: { icon: Loader2, color: "text-secondary", label: "Processing" },
  complete: { icon: Check, color: "text-green-400", label: "Complete" },
  error: { icon: AlertCircle, color: "text-destructive", label: "Error" },
};

export function FileListItem({ file, onRemove }: FileListItemProps) {
  const status = statusConfig[file.status];
  const StatusIcon = status.icon;
  const isLoading = file.status === "uploading" || file.status === "processing";

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: "auto" }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="glass rounded-xl p-4 mb-3"
    >
      <div className="flex items-center gap-4">
        {/* File Icon */}
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-6 h-6 text-primary" />
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-medium text-foreground truncate pr-4">
              {file.name}
            </h4>
            <button
              onClick={() => onRemove(file.id)}
              className="p-1 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span>{formatSize(file.size)}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            <span className={cn("flex items-center gap-1", status.color)}>
              <StatusIcon className={cn("w-3 h-3", isLoading && "animate-spin")} />
              {status.label}
            </span>
          </div>

          {/* Progress Bar */}
          <ProgressBar progress={file.progress} status={file.status} />
        </div>
      </div>
    </motion.div>
  );
}
