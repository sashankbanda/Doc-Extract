import { StructuredItem } from '@/lib/api';
import { createContext, ReactNode, useContext, useState } from 'react';

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

export function ComparisonProvider({ children }: { children: ReactNode }) {
    // Default models (matching the first two in AVAILABLE_MODELS)
    const [modelA, setModelA] = useState<string>("groq/llama-3.3-70b-versatile");
    const [modelB, setModelB] = useState<string>("gemini/gemini-1.5-flash"); // Check if this default matches ComparisonTab, updating to match logic

    const [customModelA, setCustomModelA] = useState("");
    const [customModelB, setCustomModelB] = useState("");
    const [isCustomA, setIsCustomA] = useState(false);
    const [isCustomB, setIsCustomB] = useState(false);

    const [dataA, setDataA] = useState<StructuredItem[] | null>(null);
    const [dataB, setDataB] = useState<StructuredItem[] | null>(null);
    
    const [filter, setFilter] = useState<"all" | "mismatch" | "match">("all");

    const resetComparisonState = () => {
        setDataA(null);
        setDataB(null);
        setFilter("all");
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
