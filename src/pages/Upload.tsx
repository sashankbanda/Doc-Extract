import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { FileListItem } from "@/components/upload/FileListItem";
import { useDocumentContext, Document } from "@/context/DocumentContext";
import { Upload, ArrowRight, FileText } from "lucide-react";
import { apiUpload, apiStatus } from "@/lib/api";

export default function UploadPage() {
  const navigate = useNavigate();
  const { documents, addDocument, updateDocumentStatus, removeDocument } = useDocumentContext();
  const [isUploading, setIsUploading] = useState(false);
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const progressRef = useRef<Map<string, number>>(new Map()); // Track progress per document
  
  // Get pending documents for upload (or all documents if we want to show all)
  const pendingDocuments = useMemo(() => 
    documents.filter((doc) => doc.status === "pending" || doc.status === "uploading" || doc.status === "processing"),
    [documents]
  );

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    console.log("[Upload] Files added:", newFiles.map(f => f.name));
    newFiles.forEach((file) => {
      const document: Document = {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        fileName: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "pending",
        file,
      };
      addDocument(document);
    });
  }, [addDocument]);

  const handleRemoveFile = useCallback((id: string) => {
    console.log("[Upload] Removing file:", id);
    // Clear polling interval if exists
    const interval = pollingIntervalsRef.current.get(id);
    if (interval) {
      clearInterval(interval);
      pollingIntervalsRef.current.delete(id);
    }
    // Clear progress ref
    progressRef.current.delete(id);
    removeDocument(id);
  }, [removeDocument]);

  // Real upload process with backend API
  const handleUpload = useCallback(async () => {
    // Get pending documents from context
    const filesToUpload = documents.filter(
      (doc) => (doc.status === "pending" || doc.status === "uploading" || doc.status === "processing") && doc.file
    );

    if (filesToUpload.length === 0 || isUploading) {
      console.log("[Upload] Upload blocked - files:", filesToUpload.length, "isUploading:", isUploading);
      return;
    }

    console.log("[Upload] Starting upload for", filesToUpload.length, "file(s)");
    setIsUploading(true);

    // Upload each file
    for (const fileItem of filesToUpload) {
      if (!fileItem.file) {
        console.error("[Upload] File object missing for:", fileItem.id);
        continue;
      }

      try {
        console.log("[Upload] Uploading file:", fileItem.name);
        
        // Update status to uploading
        updateDocumentStatus(fileItem.id, "uploading", 10);

        // Call upload API
        const uploadResponse = await apiUpload(fileItem.file);
        console.log("[Upload] Upload response:", uploadResponse);
        
        const whisperHash = uploadResponse.whisper_hash;
        if (!whisperHash) {
          throw new Error("No whisper_hash returned from API");
        }

        console.log("[Upload] Got whisper_hash:", whisperHash, "for file:", fileItem.name);

        // Update file with whisper_hash and set to processing
        updateDocumentStatus(fileItem.id, "processing", 50, whisperHash);
        progressRef.current.set(fileItem.id, 50);

        // Start polling for status
        const pollStatus = async () => {
          try {
            console.log("[Upload] Polling status for:", whisperHash);
            const statusResponse = await apiStatus(whisperHash);
            console.log("[Upload] Status response:", statusResponse);

            if (statusResponse.status === "processed") {
              console.log("[Upload] File processed:", fileItem.name);
              // Clear polling interval
              const interval = pollingIntervalsRef.current.get(fileItem.id);
              if (interval) {
                clearInterval(interval);
                pollingIntervalsRef.current.delete(fileItem.id);
              }
              progressRef.current.delete(fileItem.id);
              updateDocumentStatus(fileItem.id, "complete", 100);
            } else if (statusResponse.status === "error") {
              console.error("[Upload] Processing error for:", fileItem.name);
              const interval = pollingIntervalsRef.current.get(fileItem.id);
              if (interval) {
                clearInterval(interval);
                pollingIntervalsRef.current.delete(fileItem.id);
              }
              progressRef.current.delete(fileItem.id);
              updateDocumentStatus(fileItem.id, "error");
            } else {
              // Still processing - increment progress using ref
              const currentProgress = progressRef.current.get(fileItem.id) || 50;
              const newProgress = Math.min(currentProgress + 5, 95);
              progressRef.current.set(fileItem.id, newProgress);
              updateDocumentStatus(fileItem.id, "processing", newProgress);
            }
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
        updateDocumentStatus(fileItem.id, "error");
      }
    }

    setIsUploading(false);
  }, [documents, isUploading, updateDocumentStatus]);

  // Check if all files are complete (only check documents that were added on this page)
  // For simplicity, check all documents with file objects (recent uploads)
  const uploadDocuments = useMemo(() => 
    documents.filter((doc) => doc.file !== undefined),
    [documents]
  );
  const allComplete = uploadDocuments.length > 0 && uploadDocuments.every((f) => f.status === "complete");
  const hasFiles = uploadDocuments.length > 0;

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      const intervalCount = pollingIntervalsRef.current.size;
      if (intervalCount > 0) {
        console.log("[Upload] Cleaning up", intervalCount, "polling interval(s)");
      }
      pollingIntervalsRef.current.forEach((interval) => clearInterval(interval));
      pollingIntervalsRef.current.clear();
      progressRef.current.clear();
    };
  }, []);

  // Handle View Results click
  const handleViewResults = useCallback(() => {
    console.log("[Upload] View Results clicked. Documents:", uploadDocuments);
    
    // Get the first complete file's whisper_hash
    const completeFile = uploadDocuments.find((f) => f.status === "complete" && f.whisperHash);
    
    if (completeFile && completeFile.whisperHash) {
      console.log("[Upload] Navigating to workspace with hash:", completeFile.whisperHash);
      // Keep query params for compatibility/sharability
      navigate(`/workspace?whisper_hash=${completeFile.whisperHash}&fileName=${encodeURIComponent(completeFile.name)}`);
    } else {
      // Fallback: navigate without params (workspace can use context)
      console.log("[Upload] No complete file found, navigating to workspace");
      navigate("/workspace");
    }
  }, [uploadDocuments, navigate]);

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
                  Selected Files ({uploadDocuments.length})
                </h3>
              </div>

              <AnimatePresence mode="popLayout">
                {uploadDocuments.map((file) => (
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
