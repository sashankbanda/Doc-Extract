import { StructuredItem } from '@/lib/api';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

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
    const [modelB, setModelB] = useState<string>(() => loadState("modelB", "gemini/gemini-1.5-flash")); 

    const [customModelA, setCustomModelA] = useState(() => loadState("customModelA", ""));
    const [customModelB, setCustomModelB] = useState(() => loadState("customModelB", ""));
    const [isCustomA, setIsCustomA] = useState(() => loadState("isCustomA", false));
    const [isCustomB, setIsCustomB] = useState(() => loadState("isCustomB", false));

    const [dataA, setDataA] = useState<StructuredItem[] | null>(() => loadState("dataA", null));
    const [dataB, setDataB] = useState<StructuredItem[] | null>(() => loadState("dataB", null));
    
    const [filter, setFilter] = useState<"all" | "mismatch" | "match">(() => loadState("filter", "all"));

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
    }, [whisperHash, modelA, modelB, customModelA, customModelB, isCustomA, isCustomB, dataA, dataB, filter]);


    const resetComparisonState = () => {
        setDataA(null);
        setDataB(null);
        setFilter("all");
        if (whisperHash) {
             localStorage.removeItem(`comparison_${whisperHash}_dataA`);
             localStorage.removeItem(`comparison_${whisperHash}_dataB`);
             // We can keep the selected models as preference
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
        filter,
        setFilter,
        resetComparisonState
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
