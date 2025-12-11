import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { FileListItem } from "@/components/upload/FileListItem";
import { UploadFile } from "@/types/document";
import { Upload, ArrowRight, FileText } from "lucide-react";

export default function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: "pending" as const,
      file,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Simulate upload process
  const handleUpload = useCallback(() => {
    if (files.length === 0 || isUploading) return;
    setIsUploading(true);

    files.forEach((file, index) => {
      // Simulate upload progress
      let progress = 0;
      const uploadInterval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress >= 100) {
          progress = 100;
          clearInterval(uploadInterval);

          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, progress: 100, status: "processing" as const } : f
            )
          );

          // Simulate processing
          setTimeout(() => {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === file.id ? { ...f, status: "complete" as const } : f
              )
            );
          }, 1500 + index * 500);
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? { ...f, progress: Math.min(progress, 95), status: "uploading" as const }
                : f
            )
          );
        }
      }, 200);
    });
  }, [files, isUploading]);

  // Check if all files are complete
  const allComplete = files.length > 0 && files.every((f) => f.status === "complete");
  const hasFiles = files.length > 0;

  // Navigate to workspace when all complete
  useEffect(() => {
    if (allComplete) {
      setIsUploading(false);
    }
  }, [allComplete]);

  return (
    <div className="min-h-screen pt-24 pb-12 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Upload Documents
          </h1>
          <p className="text-muted-foreground">
            Drop your PDF files below to begin extraction
          </p>
        </motion.div>

        {/* Upload Card */}
        <GlassCard className="mb-6">
          <FileDropzone onFilesAdded={handleFilesAdded} disabled={isUploading} />
        </GlassCard>

        {/* File List */}
        <AnimatePresence mode="popLayout">
          {hasFiles && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Selected Files ({files.length})
                </h3>
              </div>

              <AnimatePresence mode="popLayout">
                {files.map((file) => (
                  <FileListItem
                    key={file.id}
                    file={file}
                    onRemove={handleRemoveFile}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          {!allComplete ? (
            <GlassButton
              variant="primary"
              size="lg"
              onClick={handleUpload}
              disabled={!hasFiles || isUploading}
              className="min-w-[200px]"
            >
              {isUploading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Upload className="w-5 h-5" />
                  </motion.div>
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload & Extract
                </>
              )}
            </GlassButton>
          ) : (
            <GlassButton
              variant="primary"
              size="lg"
              onClick={() => navigate("/workspace")}
              className="min-w-[200px]"
            >
              View Results
              <ArrowRight className="w-5 h-5" />
            </GlassButton>
          )}
        </motion.div>
      </div>
    </div>
  );
}
