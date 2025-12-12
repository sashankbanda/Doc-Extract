import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { UploadFile } from "@/types/document";

/**
 * Document interface extending UploadFile with additional fields
 */
export interface Document extends UploadFile {
  whisperHash?: string;
  fileName: string; // Alias for name, but explicitly required
}

/**
 * Document context type definition
 */
export interface DocumentContextType {
  documents: Document[];
  activeDocumentId: string | null;
  addDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;
  updateDocumentStatus: (id: string, status: Document["status"], progress?: number, hash?: string) => void;
  setActiveDocument: (id: string) => void;
  clearDocuments: () => void;
  dataCache: Record<string, any>; // In-memory cache for API results (raw text, structured data)
  cacheData: (hash: string, data: any) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

const STORAGE_KEY = "doc_extract_files";

/**
 * Helper function to convert UploadFile to Document format for storage
 */
function documentToStorageFormat(doc: Document): Partial<Document> {
  return {
    id: doc.id,
    name: doc.name,
    fileName: doc.fileName || doc.name,
    size: doc.size,
    type: doc.type,
    progress: doc.progress,
    status: doc.status,
    whisperHash: doc.whisperHash,
    // Do NOT save file object or any other non-serializable data
  };
}

/**
 * Helper function to restore Document from storage format
 */
function storageFormatToDocument(stored: any): Document {
  return {
    id: stored.id,
    name: stored.name,
    fileName: stored.fileName || stored.name,
    size: stored.size || 0,
    type: stored.type || "",
    progress: stored.progress || 0,
    status: stored.status || "pending",
    whisperHash: stored.whisperHash,
    // file is not restored from storage (user would need to re-upload)
  };
}

/**
 * DocumentProvider component
 */
export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocumentId, setActiveDocumentIdState] = useState<string | null>(null);
  const [dataCache, setDataCache] = useState<Record<string, any>>({});
  const [isHydrated, setIsHydrated] = useState(false);

  // Load documents from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const restoredDocs = parsed.map(storageFormatToDocument);
          setDocuments(restoredDocs);
          
          // Auto-select the most recent document if none is active
          if (restoredDocs.length > 0) {
            // Find the most recent document (by id timestamp or status)
            const mostRecent = restoredDocs.reduce((latest, current) => {
              // Prefer complete documents, then by id (which contains timestamp)
              if (current.status === "complete" && latest.status !== "complete") {
                return current;
              }
              if (latest.status === "complete" && current.status !== "complete") {
                return latest;
              }
              // Compare by id (which contains timestamp)
              return current.id > latest.id ? current : latest;
            });
            setActiveDocumentIdState(mostRecent.id);
          }
        }
      }
    } catch (error) {
      console.error("[DocumentContext] Failed to load from localStorage:", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Save documents to localStorage whenever they change (but not dataCache)
  useEffect(() => {
    if (!isHydrated) return; // Don't save during initial hydration
    
    try {
      const storageData = documents.map(documentToStorageFormat);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
    } catch (error) {
      console.error("[DocumentContext] Failed to save to localStorage:", error);
    }
  }, [documents, isHydrated]);

  // Auto-select most recent document if activeDocumentId is null but documents exist
  useEffect(() => {
    if (activeDocumentId === null && documents.length > 0 && isHydrated) {
      const mostRecent = documents.reduce((latest, current) => {
        // Prefer complete documents, then by id (which contains timestamp)
        if (current.status === "complete" && latest.status !== "complete") {
          return current;
        }
        if (latest.status === "complete" && current.status !== "complete") {
          return latest;
        }
        // Compare by id (which contains timestamp)
        return current.id > latest.id ? current : latest;
      });
      setActiveDocumentIdState(mostRecent.id);
    }
  }, [activeDocumentId, documents, isHydrated]);

  const addDocument = useCallback((doc: Document) => {
    setDocuments((prev) => {
      // Ensure fileName is set (use name if fileName is missing)
      const document: Document = {
        ...doc,
        fileName: doc.fileName || doc.name,
      };
      
      // Check if document with same id already exists
      const exists = prev.find((d) => d.id === document.id);
      if (exists) {
        // Update existing document
        return prev.map((d) => (d.id === document.id ? document : d));
      }
      
      // Add new document
      return [...prev, document];
    });
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => {
      const docToRemove = prev.find((d) => d.id === id);
      const filtered = prev.filter((d) => d.id !== id);
      
      // If removing the active document, select another one
      if (activeDocumentId === id && filtered.length > 0) {
        const mostRecent = filtered.reduce((latest, current) => {
          if (current.status === "complete" && latest.status !== "complete") {
            return current;
          }
          if (latest.status === "complete" && current.status !== "complete") {
            return latest;
          }
          return current.id > latest.id ? current : latest;
        });
        setActiveDocumentIdState(mostRecent.id);
      } else if (activeDocumentId === id) {
        // No documents left, clear active
        setActiveDocumentIdState(null);
      }
      
      // Clear cache for removed document if it had a hash
      if (docToRemove?.whisperHash) {
        setDataCache((cache) => {
          const { [docToRemove.whisperHash!]: _, ...rest } = cache;
          return rest;
        });
      }
      
      return filtered;
    });
  }, [activeDocumentId]);

  const updateDocumentStatus = useCallback(
    (id: string, status: Document["status"], progress?: number, hash?: string) => {
      setDocuments((prev) =>
        prev.map((doc) => {
          if (doc.id === id) {
            return {
              ...doc,
              status,
              progress: progress !== undefined ? progress : doc.progress,
              whisperHash: hash !== undefined ? hash : doc.whisperHash,
            };
          }
          return doc;
        })
      );
    },
    []
  );

  const setActiveDocument = useCallback((id: string) => {
    setActiveDocumentIdState(id);
  }, []);

  const cacheData = useCallback((hash: string, data: any) => {
    setDataCache((prev) => ({
      ...prev,
      [hash]: data,
    }));
  }, []);

  const clearDocuments = useCallback(() => {
    console.log("[DocumentContext] Clearing all documents (factory reset)");
    setDocuments([]);
    setActiveDocumentIdState(null);
    setDataCache({});
    // Clear localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("[DocumentContext] Failed to clear localStorage:", error);
    }
  }, []);

  const value: DocumentContextType = {
    documents,
    activeDocumentId,
    addDocument,
    removeDocument,
    updateDocumentStatus,
    setActiveDocument,
    clearDocuments,
    dataCache,
    cacheData,
  };

  // Prevent rendering children until hydration is complete to avoid flickering
  if (!isHydrated) {
    return null; // or a loading spinner
  }

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
}

/**
 * Hook to access DocumentContext
 */
export function useDocumentContext(): DocumentContextType {
  const context = useContext(DocumentContext);
  if (context === undefined) {
    throw new Error("useDocumentContext must be used within a DocumentProvider");
  }
  return context;
}

