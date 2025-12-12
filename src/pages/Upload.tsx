import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { FileListItem } from "@/components/upload/FileListItem";
import { UploadFile } from "@/types/document";
import { Upload, ArrowRight, FileText } from "lucide-react";
import { apiUpload, apiStatus } from "@/lib/api";

interface FileWithHash extends UploadFile {
  whisperHash?: string;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileWithHash[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    console.log("[Upload] Files added:", newFiles.map(f => f.name));
    const uploadFiles: FileWithHash[] = newFiles.map((file) => ({
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
    console.log("[Upload] Removing file:", id);
    // Clear polling interval if exists
    const interval = pollingIntervalsRef.current.get(id);
    if (interval) {
      clearInterval(interval);
      pollingIntervalsRef.current.delete(id);
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Real upload process with backend API
  const handleUpload = useCallback(async () => {
    if (files.length === 0 || isUploading) {
      console.log("[Upload] Upload blocked - files:", files.length, "isUploading:", isUploading);
      return;
    }

    console.log("[Upload] Starting upload for", files.length, "file(s)");
    setIsUploading(true);

    // Upload each file
    for (const fileItem of files) {
      if (!fileItem.file) {
        console.error("[Upload] File object missing for:", fileItem.id);
        continue;
      }

      try {
        console.log("[Upload] Uploading file:", fileItem.name);
        
        // Update status to uploading
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, progress: 10, status: "uploading" as const }
              : f
          )
        );

        // Call upload API
        const uploadResponse = await apiUpload(fileItem.file);
        console.log("[Upload] Upload response:", uploadResponse);
        
        const whisperHash = uploadResponse.whisper_hash;
        if (!whisperHash) {
          throw new Error("No whisper_hash returned from API");
        }

        console.log("[Upload] Got whisper_hash:", whisperHash, "for file:", fileItem.name);

        // Update file with whisper_hash and set to processing
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, progress: 50, status: "processing" as const, whisperHash }
              : f
          )
        );

        // Save to localStorage
        const jobItem = {
          whisperHash,
          fileName: fileItem.name,
          timestamp: Date.now()
        };
        localStorage.setItem(`job_${whisperHash}`, JSON.stringify(jobItem));
        console.log("[Upload] Saved job to localStorage:", jobItem);

        // Start polling for status
        const pollStatus = async () => {
          try {
            console.log("[Upload] Polling status for:", whisperHash);
            const statusResponse = await apiStatus(whisperHash);
            console.log("[Upload] Status response:", statusResponse);

            setFiles((prev) =>
              prev.map((f) => {
                if (f.id === fileItem.id) {
                  if (statusResponse.status === "processed") {
                    console.log("[Upload] File processed:", fileItem.name);
                    // Clear polling interval
                    const interval = pollingIntervalsRef.current.get(fileItem.id);
                    if (interval) {
                      clearInterval(interval);
                      pollingIntervalsRef.current.delete(fileItem.id);
                    }
                    return { ...f, progress: 100, status: "complete" as const };
                  } else if (statusResponse.status === "error") {
                    console.error("[Upload] Processing error for:", fileItem.name);
                    const interval = pollingIntervalsRef.current.get(fileItem.id);
                    if (interval) {
                      clearInterval(interval);
                      pollingIntervalsRef.current.delete(fileItem.id);
                    }
                    return { ...f, status: "error" as const };
                  } else {
                    // Still processing
                    return { ...f, progress: Math.min(f.progress + 5, 95) };
                  }
                }
                return f;
              })
            );
          } catch (err) {
            console.error("[Upload] Polling error for", whisperHash, ":", err);
          }
        };

        // Initial status check
        await pollStatus();

        // Poll every 2 seconds
        const interval = setInterval(pollStatus, 2000);
        pollingIntervalsRef.current.set(fileItem.id, interval);

      } catch (error: any) {
        console.error("[Upload] Upload error for", fileItem.name, ":", error);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, status: "error" as const }
              : f
          )
        );
      }
    }

    setIsUploading(false);
  }, [files, isUploading]);

  // Check if all files are complete
  const allComplete = files.length > 0 && files.every((f) => f.status === "complete");
  const hasFiles = files.length > 0;

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      const intervalCount = pollingIntervalsRef.current.size;
      if (intervalCount > 0) {
        console.log("[Upload] Cleaning up", intervalCount, "polling interval(s)");
      }
      pollingIntervalsRef.current.forEach((interval) => clearInterval(interval));
      pollingIntervalsRef.current.clear();
    };
  }, []);

  // Handle View Results click
  const handleViewResults = useCallback(() => {
    console.log("[Upload] View Results clicked. Files:", files);
    
    // Get the first complete file's whisper_hash
    const completeFile = files.find((f) => f.status === "complete" && f.whisperHash);
    
    if (completeFile && completeFile.whisperHash) {
      console.log("[Upload] Navigating to workspace with hash:", completeFile.whisperHash);
      navigate(`/workspace?whisper_hash=${completeFile.whisperHash}&fileName=${encodeURIComponent(completeFile.name)}`);
    } else {
      console.error("[Upload] No complete file with whisper_hash found. Files:", files);
      // Fallback: try to get from localStorage
      const keys = Object.keys(localStorage).filter(key => key.startsWith("job_"));
      if (keys.length > 0) {
        const latestKey = keys.sort().reverse()[0];
        const jobItem = JSON.parse(localStorage.getItem(latestKey) || "{}");
        if (jobItem.whisperHash) {
          console.log("[Upload] Using hash from localStorage:", jobItem.whisperHash);
          navigate(`/workspace?whisper_hash=${jobItem.whisperHash}&fileName=${encodeURIComponent(jobItem.fileName || "document")}`);
        } else {
          console.error("[Upload] No valid hash found anywhere");
        }
      }
    }
  }, [files, navigate]);

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
              onClick={handleViewResults}
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
