import { StructuredItem, structureDocument } from '@/lib/api';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

export interface ComparisonRow {
    key: string;
    valA: string;
    valB: string;
    isMatch: boolean;
    lineNumbers: number[];
    sortKey: number;
    // Source Indices for editing
    indexA?: number;
    indexB?: number;
}

interface ComparisonContextType {
    searchQuery: string;
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
    filter: "all" | "mismatch" | "match";
    setFilter: (filter: "all" | "mismatch" | "match") => void;
    resetComparisonState: () => void;
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
}

const ComparisonContext = createContext<ComparisonContextType | undefined>(undefined);

export function ComparisonProvider({ children, whisperHash }: { children: ReactNode, whisperHash?: string | null }) {
    
    // Helper to load from storage
    const loadState = <T,>(key: string, defaultVal: T): T => {
        if (!whisperHash) return defaultVal;
        try {
            const stored = localStorage.getItem(`comparison_${whisperHash}_${key}`);
            return stored ? JSON.parse(stored) : defaultVal;
        } catch (e) {
            console.error("Failed to load comparison state", e);
            return defaultVal;
        }
    };

    // Default models (matching the first two in AVAILABLE_MODELS)
    const [modelA, setModelA] = useState<string>(() => loadState("modelA", "groq/llama-3.3-70b-versatile"));
    const [modelB, setModelB] = useState<string>(() => loadState("modelB", "gemini/gemini-2.5-flash")); // Updated default

    const [customModelA, setCustomModelA] = useState(() => loadState("customModelA", ""));
    const [customModelB, setCustomModelB] = useState(() => loadState("customModelB", ""));
    const [isCustomA, setIsCustomA] = useState(() => loadState("isCustomA", false));
    const [isCustomB, setIsCustomB] = useState(() => loadState("isCustomB", false));

    const [dataA, setDataA] = useState<StructuredItem[] | null>(() => loadState("dataA", null));
    const [dataB, setDataB] = useState<StructuredItem[] | null>(() => loadState("dataB", null));
    
    // Loading states moved to context
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);

    const [filter, setFilter] = useState<"all" | "mismatch" | "match">(() => loadState("filter", "all"));

    // Keyed by source_key. Stores the definitive value.
    const [approvedItems, setApprovedItems] = useState<Record<string, string>>(() => loadState("approvedItems", {}));
    
    // Set of keys that have been deleted by the user
    // We use a Set<string> but store as array in localStorage
    const [deletedKeys, setDeletedKeys] = useState<Set<string>>(() => new Set(loadState("deletedKeys", [])));

    // Save state on change
    useEffect(() => {
        if (!whisperHash) return;
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
        save("approvedItems", approvedItems);
        save("deletedKeys", Array.from(deletedKeys));
    }, [whisperHash, modelA, modelB, customModelA, customModelB, isCustomA, isCustomB, dataA, dataB, filter, approvedItems, deletedKeys]);


    const resetComparisonState = () => {
        setDataA(null);
        setDataB(null);
        setLoadingA(false);
        setLoadingB(false);
        setFilter("all");
        setApprovedItems({});
        setDeletedKeys(new Set());
        if (whisperHash) {
             localStorage.removeItem(`comparison_${whisperHash}_dataA`);
             localStorage.removeItem(`comparison_${whisperHash}_dataB`);
             // We can keep the selected models as preference
        }
    };
    
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
            .finally(() => setLoadingA(false));

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
            .finally(() => setLoadingB(false));
            
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

                // Collect line numbers for highlighting
                const linesA = itemA?.line_numbers || [];
                const linesB = itemB?.line_numbers || [];
                const allLines = Array.from(new Set([...linesA, ...linesB])).sort((a, b) => a - b);

                // Determine sort key (min line number -> document order)
                const minLine = allLines.length > 0 ? Math.min(...allLines) : Number.MAX_SAFE_INTEGER;

                rows.push({
                    key: uniqueKey, // Distinguish duplicates
                    valA: displayA,
                    valB: displayB,
                    isMatch,
                    lineNumbers: allLines,
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
        searchQuery: "", // Placeholder if needed or remove
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
        resetComparisonState,
        comparisonRows,
        approvedItems,
        approveItem,
        updateItem,
        whisperHash,
        deleteItem
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
