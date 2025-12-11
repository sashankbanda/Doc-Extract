import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { UploadFile } from "@/types/document";

interface ProgressBarProps {
  progress: number;
  status: UploadFile["status"];
}

export function ProgressBar({ progress, status }: ProgressBarProps) {
  const colorMap = {
    pending: "bg-muted",
    uploading: "bg-gradient-to-r from-primary to-primary/70",
    processing: "bg-gradient-to-r from-secondary to-secondary/70",
    complete: "bg-green-500",
    error: "bg-destructive",
  };

  return (
    <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
      <motion.div
        className={cn("h-full rounded-full", colorMap[status])}
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}
