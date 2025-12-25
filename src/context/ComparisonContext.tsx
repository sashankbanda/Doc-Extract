import { StructuredItem, structureDocument } from '@/lib/api';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDocumentContext } from './DocumentContext';

export interface ComparisonRow {
    key: string;
    valA: string;
    valB: string;
    isMatch: boolean;
    lineNumbers: number[];
    lineNumbersA: number[];
    lineNumbersB: number[];
    sortKey: number;
    // Source Indices for editing
    indexA?: number;
    indexB?: number;
    // Verification
    tier: "match" | "warning" | "mismatch";
    verificationReason?: string;
}

interface ComparisonContextType {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    modelA: string;
    modelB: string;
    setModelA: (model: string) => void;
    setModelB: (model: string) => void;
    customModelA: string;
    customModelB: string;
    setCustomModelA: (model: string) => void;
    setCustomModelB: (model: string) => void;
    isCustomA: boolean;
    isCustomB: boolean;
    setIsCustomA: (isCustom: boolean) => void;
    setIsCustomB: (isCustom: boolean) => void;
    dataA: StructuredItem[] | null;
    dataB: StructuredItem[] | null;
    setDataA: (data: StructuredItem[] | null) => void;
    setDataB: (data: StructuredItem[] | null) => void;
    filter: "all" | "mismatch" | "match" | "warning";
    setFilter: (filter: "all" | "mismatch" | "match" | "warning") => void;
    resultFilter: "all" | "approved" | "review";
    setResultFilter: (filter: "all" | "approved" | "review") => void;
    resetComparisonState: () => void;
    // Timings
    startTimeA: number | null;
    startTimeB: number | null;
    durationA: number | null;
    durationB: number | null;
    comparisonRows: ComparisonRow[];
    // Approval State
    approvedItems: Record<string, string>; // SourceKey -> ApprovedValue
    approveItem: (key: string, value: string) => void;
    deleteItem: (key: string) => void;
    // Update Logic
    updateItem: (model: 'A' | 'B', index: number, newKey: string, newValue: string) => void;
    whisperHash: string | undefined | null;
    loadingA: boolean;
    loadingB: boolean;
    runComparison: () => Promise<void>;
    focusKey: string | null;
    setFocusKey: (key: string | null) => void;
}

// ComparisonContextType definition remains same... (it is not included in this chunks replacement range)

const ComparisonContext = createContext<ComparisonContextType | undefined>(undefined);

export function ComparisonProvider({ children }: { children: ReactNode }) {
    const { activeDocumentId, documents } = useDocumentContext();
    
    // Derive active whisperHash from DocumentContext
    const validHash = useMemo(() => {
        if (!activeDocumentId) return null;
        const doc = documents.find(d => d.id === activeDocumentId);
        return doc?.whisperHash || null;
    }, [activeDocumentId, documents]);

    // Use a ref or state to track the "current" hash for effects, 
    // but simply using validHash directly is cleaner.
    const whisperHash = validHash;
    
    // Helper to load from storage
    const loadState = <T,>(key: string, defaultVal: T): T => {
        if (!whisperHash) return defaultVal; // Return default if no document active
        try {
            const stored = localStorage.getItem(`comparison_${whisperHash}_${key}`);
            return stored ? JSON.parse(stored) : defaultVal;
        } catch (e) {
            console.error("Failed to load comparison state", e);
            return defaultVal;
        }
    };

    // Default models
    const [modelA, setModelA] = useState<string>("groq/llama-3.3-70b-versatile");
    const [modelB, setModelB] = useState<string>("gemini/gemini-2.5-flash");
    const [customModelA, setCustomModelA] = useState("");
    const [customModelB, setCustomModelB] = useState("");
    const [isCustomA, setIsCustomA] = useState(false);
    const [isCustomB, setIsCustomB] = useState(false);
    const [dataA, setDataA] = useState<StructuredItem[] | null>(null);
    const [dataB, setDataB] = useState<StructuredItem[] | null>(null);
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);
    const [filter, setFilter] = useState<"all" | "mismatch" | "match" | "warning">("all");
    const [resultFilter, setResultFilter] = useState<"all" | "approved" | "review">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [approvedItems, setApprovedItems] = useState<Record<string, string>>({});
    const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
    
    // Timer state
    const [startTimeA, setStartTimeA] = useState<number | null>(null);
    const [startTimeB, setStartTimeB] = useState<number | null>(null);
    const [durationA, setDurationA] = useState<number | null>(null);
    const [durationB, setDurationB] = useState<number | null>(null);

    // Track which hash we have currently loaded state for
    const loadedHash = useRef<string | null>(null);

    // Save state on change
    // MOVED BEFORE LOAD EFFECT TO PREVENT RACE CONDITION IN STRICT MODE
    // If Save runs after Load in the same render cycle (before state update), 
    // it sees new Hash (from Load's ref update) but stale Data (from closure), overwriting the clean state.
    useEffect(() => {
        // Only save if we have a valid hash AND we have finished loading the initial state for it
        if (!whisperHash || loadedHash.current !== whisperHash) return;
        
        const save = (key: string, val: any) => {
            localStorage.setItem(`comparison_${whisperHash}_${key}`, JSON.stringify(val));
        };
        save("modelA", modelA);
        save("modelB", modelB);
        save("customModelA", customModelA);
        save("customModelB", customModelB);
        save("isCustomA", isCustomA);
        save("isCustomB", isCustomB);
        save("dataA", dataA);
        save("dataB", dataB);
        save("filter", filter);
        save("resultFilter", resultFilter);
        save("approvedItems", approvedItems);
        save("deletedKeys", Array.from(deletedKeys));
        save("startTimeA", startTimeA);
        save("startTimeB", startTimeB);
        save("durationA", durationA);
        save("durationB", durationB);
    }, [whisperHash, modelA, modelB, customModelA, customModelB, isCustomA, isCustomB, dataA, dataB, filter, resultFilter, approvedItems, deletedKeys, startTimeA, startTimeB, durationA, durationB]);


    // Effect: Reload state when whisperHash changes (handles both switch and upload if hash changes)
    useEffect(() => {
        // Always reset partially first to avoid stale data flicker
        setDataA(null);
        setDataB(null);
        setApprovedItems({});
        setDeletedKeys(new Set());
        setFilter("all");
        setResultFilter("all");
        setSearchQuery("");
        setLoadingA(false);
        setLoadingB(false);
        
        if (!whisperHash) {
            loadedHash.current = null;
            return;
        }

        const load = <T,>(key: string, defaultVal: T): T => {
            try {
                const stored = localStorage.getItem(`comparison_${whisperHash}_${key}`);
                return stored ? JSON.parse(stored) : defaultVal;
            } catch { return defaultVal; }
        };

        const loadedModelA = load("modelA", "groq/llama-3.3-70b-versatile");
        const loadedDataA = load("dataA", null);
        
        setModelA(loadedModelA);
        setModelB(load("modelB", "gemini/gemini-2.5-flash"));
        setCustomModelA(load("customModelA", ""));
        setCustomModelB(load("customModelB", ""));
        setIsCustomA(load("isCustomA", false));
        setIsCustomB(load("isCustomB", false));
        setDataA(loadedDataA);
        setDataB(load("dataB", null));
        setFilter(load("filter", "all"));
        setResultFilter(load("resultFilter", "all"));
        setApprovedItems(load("approvedItems", {}));
        setDeletedKeys(new Set(load("deletedKeys", [])));
        setStartTimeA(load("startTimeA", null));
        setStartTimeB(load("startTimeB", null));
        setDurationA(load("durationA", null));
        setDurationB(load("durationB", null));
        
        // Mark this hash as loaded so we can safely save updates to it
        loadedHash.current = whisperHash;
        
    }, [whisperHash]);


    const resetComparisonState = () => {
        setDataA(null);
        setDataB(null);
        setLoadingA(false);
        setLoadingB(false);
        setFilter("all");
        setResultFilter("all");
        setApprovedItems({});
        setDeletedKeys(new Set());
        setStartTimeA(null);
        setStartTimeB(null);
        setDurationA(null);
        setDurationB(null);
        if (whisperHash) {
             localStorage.removeItem(`comparison_${whisperHash}_dataA`);
             localStorage.removeItem(`comparison_${whisperHash}_dataB`);
             // We can keep the selected models as preference
        }
    };
    
    // Check key to focus on when switching tabs
    const [focusKey, setFocusKey] = useState<string | null>(null);

    // Run Comparison Logic
    const runComparison = async () => {
        if (!whisperHash) {
            toast.error("No active document selected for comparison");
            return;
        }
        
        const effectiveModelA = isCustomA ? customModelA : modelA;
        const effectiveModelB = isCustomB ? customModelB : modelB;
        
        if (!effectiveModelA || !effectiveModelB) {
            toast.error("Please select models for both panels");
            return;
        }

        setLoadingA(true);
        setLoadingB(true);
        // Reset timers
        const now = Date.now();
        setStartTimeA(now);
        setStartTimeB(now);
        setDurationA(null);
        setDurationB(null);
        
        // Launch A
        const promiseA = structureDocument(whisperHash, effectiveModelA, true)
            .then(res => {
                setDataA(res.items);
                toast.success(`Model A (${effectiveModelA}) complete`);
            })
            .catch(err => {
                console.error("Model A failed", err);
                toast.error(`Model A failed: ${err.message}`);
            })

            .finally(() => {
                setLoadingA(false);
                setDurationA(Date.now() - now);
                setStartTimeA(null);
            });

        // Launch B
        const promiseB = structureDocument(whisperHash, effectiveModelB, true)
            .then(res => {
                setDataB(res.items);
                toast.success(`Model B (${effectiveModelB}) complete`);
            })
            .catch(err => {
                console.error("Model B failed", err);
                toast.error(`Model B failed: ${err.message}`);
            })

            .finally(() => {
                setLoadingB(false);
                setDurationB(Date.now() - now);
                setStartTimeB(null);
            });
            
        await Promise.all([promiseA, promiseB]);
    };

    // Calculate Comparison Rows centrally
    const comparisonRows = useMemo(() => {
        if (!dataA && !dataB) return [];

        // Helper to group items by key. 
        // We also need the original index to allow editing.
        const groupByKey = (items: StructuredItem[] | null) => {
            const map = new Map<string, { item: StructuredItem, originalIndex: number }[]>();
            if (!items) return map;

            items.forEach((item, idx) => {
                const key = item.source_key || "(no key)";
                if (!map.has(key)) {
                    map.set(key, []);
                }
                map.get(key)!.push({ item, originalIndex: idx });
            });
            return map;
        };

        const mapA = groupByKey(dataA);
        const mapB = groupByKey(dataB);

        // Union of all keys
        const allKeys = new Set([...(mapA.keys()), ...(mapB.keys())]);

        const rows: ComparisonRow[] = [];

        allKeys.forEach(key => {
            const itemsA = mapA.get(key) || [];
            const itemsB = mapB.get(key) || [];

            // Align by index (zip)
            const maxLength = Math.max(itemsA.length, itemsB.length);

            for (let i = 0; i < maxLength; i++) {
                const uniqueKey = key + (maxLength > 1 ? ` [${i + 1}]` : "");
                
                // Skip if deleted
                if (deletedKeys.has(uniqueKey)) continue;

                const entryA = itemsA[i];
                const entryB = itemsB[i];

                const itemA = entryA?.item;
                const itemB = entryB?.item;

                const valA = itemA ? itemA.value : undefined;
                const valB = itemB ? itemB.value : undefined;

                // Simple string comparison for now.
                // Note: valA/valB can be numeric/boolean but 'value' is usually string in StructuredItem
                const isMatch = valA == valB; 
                const displayA = valA === undefined ? "(missing)" : String(valA);
                const displayB = valB === undefined ? "(missing)" : String(valB);

                // Verification Logic (Juror)
                // Default to verified if status is missing (backward compat)
                const statusA = itemA?.verification_status?.status || "verified";
                const statusB = itemB?.verification_status?.status || "verified";
                const reasonA = itemA?.verification_status?.reason;
                const reasonB = itemB?.verification_status?.reason;

                let tier: "match" | "warning" | "mismatch" = "mismatch";
                let verificationReason = undefined;

                if (isMatch) {
                    if (statusA === "suspicious" || statusB === "suspicious") {
                        tier = "warning";
                        verificationReason = reasonA || reasonB || "Juror marked this match as suspicious (potential truncation)";
                    } else if (statusA === "unverified" || statusB === "unverified") {
                         // Fallback for failing open or old data. Usually treat as verified if simple text match?
                         // Let's be strict: if explicit unverified, warn.
                         tier = "warning"; 
                         verificationReason = reasonA || reasonB || "Verification check failed";
                    } else {
                        tier = "match";
                    }
                } else {
                    tier = "mismatch";
                }

                // Collect line numbers for highlighting
                const linesA = itemA?.line_numbers || [];
                const linesB = itemB?.line_numbers || [];
                const allLines = Array.from(new Set([...linesA, ...linesB])).sort((a, b) => a - b);
                
                // Debug log for missing lines
                if (allLines.length === 0) {
                     // console.log(`[ComparisonContext] No lines for key ${uniqueKey}`, { itemA, itemB });
                }

                // Determine sort key (min line number -> document order)
                const minLine = allLines.length > 0 ? Math.min(...allLines) : Number.MAX_SAFE_INTEGER;

                rows.push({
                    key: uniqueKey, // Distinguish duplicates
                    valA: displayA,
                    valB: displayB,
                    isMatch,
                    tier, // NEW
                    verificationReason, // NEW
                    lineNumbers: allLines,
                    lineNumbersA: linesA,
                    lineNumbersB: linesB,
                    sortKey: minLine,
                    indexA: entryA?.originalIndex,
                    indexB: entryB?.originalIndex
                });
            }
        });

        // Sort by line number (document order)
        return rows.sort((a, b) => a.sortKey - b.sortKey);

    }, [dataA, dataB, deletedKeys]);

    const approveItem = (key: string, value: string) => {
        setApprovedItems(prev => ({
            ...prev,
            [key]: value
        }));
    };
    
    const deleteItem = (key: string) => {
        setDeletedKeys(prev => {
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    };

    const updateItem = (model: 'A' | 'B', index: number, newKey: string, newValue: string) => {
        const updateData = (prevData: StructuredItem[] | null) => {
            if (!prevData) return null;
            // We need to find the item. The comparison logic groups by keys, but here we might have the original index or need to find it.
            // However, the cleanest way (since we render aligned rows) is if we know the item's identity. 
            // BUT, our comparisonRows don't strictly Map 1:1 to indices if things are out of order.
            // Actually, the Comparison Tab loop iterates: 
            //    itemsA[i] which gives us the actual StructuredItem object. 
            // If we find that object in the main array, we can update it.
            
            // IMPROVEMENT: ResultTab/ComparisonTab should pass the index relative to the source data array?
            // "index" here will be treated as the index in the *source array* (dataA or dataB).
            
            const newData = [...prevData];
            if (index >= 0 && index < newData.length) {
                newData[index] = {
                    ...newData[index],
                    source_key: newKey,
                    value: newValue
                };
            }
            return newData;
        };

        if (model === 'A') {
            setDataA(updateData(dataA));
        } else {
            setDataB(updateData(dataB));
        }
    };

    const value = {
        searchQuery,
        setSearchQuery,
        modelA,
        modelB,
        setModelA,
        setModelB,
        customModelA,
        customModelB,
        setCustomModelA,
        setCustomModelB,
        isCustomA,
        isCustomB,
        setIsCustomA,
        setIsCustomB,
        dataA,
        dataB,
        setDataA,
        setDataB,
        loadingA,
        loadingB,
        runComparison,
        filter,
        setFilter,
        resultFilter,
        setResultFilter,
        resetComparisonState,
        comparisonRows,
        approvedItems,
        approveItem,
        updateItem,
        whisperHash,
        deleteItem,
        focusKey,
        setFocusKey,
        startTimeA,
        startTimeB,
        durationA,
        durationB
    };


    return (
        <ComparisonContext.Provider value={value}>
            {children}
        </ComparisonContext.Provider>
    );
}

export function useComparisonContext() {
    const context = useContext(ComparisonContext);
    if (context === undefined) {
        throw new Error('useComparisonContext must be used within a ComparisonProvider');
    }
    return context;
}
