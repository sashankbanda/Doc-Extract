
import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useComparisonContext } from "@/context/ComparisonContext";
import { structureDocument } from "@/lib/api";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Available models
const AVAILABLE_MODELS = [
    { id: "groq/llama-3.3-70b-versatile", name: "Groq (Llama 3.3 70B)", provider: "groq" },
    { id: "gemini/gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "google" },
    { id: "gemini/gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "google" },
    { id: "gemini/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
    { id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet", provider: "anthropic" },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "anthropic" },
    { id: "mistral/mistral-large-latest", name: "Mistral Large", provider: "mistral" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", provider: "deepseek" },
];

export function ComparisonSettings() {
    const {
        modelA, setModelA,
        modelB, setModelB,
        customModelA, setCustomModelA,
        customModelB, setCustomModelB,
        isCustomA, setIsCustomA,
        isCustomB, setIsCustomB,
        setDataA,
        setDataB,
    } = useComparisonContext();

    // We need whisperHash to run comparison - get it from active document context
    // Ideally ComparisonContext should hold the active whisperHash, but currently it's passed as prop to ComparisonTab
    // Let's grab it from URL or DocumentContext if possible
    // Actually, looking at Workspace.tsx, whisperHash comes from URL params.
    // We can use useSearchParams here or rely on ComparisonContext if we add whisperHash to it.
    // For now, let's assume we can get it from the URL since this is a global setting.
    
    // WAIT: Workspace.tsx passes `whisperHash` to `ComparisonProvider`? No, it passes it to `ComparisonTab`.
    // `ComparisonContext` does NOT have whisperHash currently.
    // I should update `ComparisonContext` to include `whisperHash` so this component can access it.
    // Or I can use `useSearchParams` hook here.
    
    // Let's use useSearchParams for now.
    
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);
    
    // Helper to get hash from URL manually if needed, 
    // but better to fix the architecture properly.
    // Let's try to get it from the URL using standard hook.
    // import { useSearchParams } from "react-router-dom"; 
    // (Added import below)
    
    const isNarrow = false; // Simplified layout for modal
    
    // Re-implementing handleRunComparison locally since it was in ComparisonTab
    // We need the hash.
    
    return (
        <div className="space-y-6">
            <ComparisonSettingsContent 
                loadingA={loadingA} 
                setLoadingA={setLoadingA}
                loadingB={loadingB} 
                setLoadingB={setLoadingB}
                setDataA={setDataA}
                setDataB={setDataB}
                modelA={modelA} setModelA={setModelA}
                modelB={modelB} setModelB={setModelB}
                customModelA={customModelA} setCustomModelA={setCustomModelA}
                customModelB={customModelB} setCustomModelB={setCustomModelB}
                isCustomA={isCustomA} setIsCustomA={setIsCustomA}
                isCustomB={isCustomB} setIsCustomB={setIsCustomB}
            />
        </div>
    );
}

// Inner component to handle logic with hooks
import { useSearchParams } from "react-router-dom";

function ComparisonSettingsContent({
    loadingA, setLoadingA,
    loadingB, setLoadingB,
    setDataA, setDataB,
    modelA, setModelA,
    modelB, setModelB,
    customModelA, setCustomModelA,
    customModelB, setCustomModelB,
    isCustomA, setIsCustomA,
    isCustomB, setIsCustomB
}: any) {
    const [searchParams] = useSearchParams();
    const whisperHash = searchParams.get("whisper_hash");

    const handleRunComparison = async () => {
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

    return (
        <div className="grid gap-6">
             {/* Model Selection */}
             <div className="space-y-4 border rounded-md p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Model Selection</h3>
                    <Button size="sm" onClick={handleRunComparison} disabled={loadingA || loadingB || !whisperHash}>
                        {(loadingA || loadingB) ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-2" />}
                        Run Comparison
                    </Button>
                </div>
                
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    {/* Model A */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Model A (Baseline)</label>
                            <Button variant="ghost" size="sm" onClick={() => setIsCustomA(!isCustomA)} className="h-5 text-[10px] px-2">
                                {isCustomA ? "Use Preset" : "Use Custom"}
                            </Button>
                        </div>
                        {isCustomA ? (
                                <Input placeholder="provider/model-name" value={customModelA} onChange={e => setCustomModelA(e.target.value)} className="h-8 text-xs" />
                        ) : (
                            <Select value={modelA} onValueChange={setModelA}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {AVAILABLE_MODELS.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        {loadingA && <div className="text-xs text-blue-500 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin"/>Extracting...</div>}
                    </div>

                    {/* Model B */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Model B (Challenger)</label>
                                <Button variant="ghost" size="sm" onClick={() => setIsCustomB(!isCustomB)} className="h-5 text-[10px] px-2">
                                {isCustomB ? "Use Preset" : "Use Custom"}
                            </Button>
                        </div>
                            {isCustomB ? (
                                <Input placeholder="provider/model-name" value={customModelB} onChange={e => setCustomModelB(e.target.value)} className="h-8 text-xs" />
                        ) : (
                            <Select value={modelB} onValueChange={setModelB}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {AVAILABLE_MODELS.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        {loadingB && <div className="text-xs text-blue-500 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin"/>Extracting...</div>}
                    </div>
                </div>
            </div>
            
            {/* API Key Manager */}
            <div className="space-y-2">
                <ApiKeyManager />
            </div>
        </div>
    );
}
