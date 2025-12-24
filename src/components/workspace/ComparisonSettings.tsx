
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
import { Loader2, Play } from "lucide-react";

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
        loadingA,
        loadingB,
        runComparison,
        whisperHash
    } = useComparisonContext();

    const isNarrow = false; // Simplified layout for modal
    
    return (
        <div className="space-y-6">
             {/* Model Selection */}
             <div className="space-y-4 border rounded-md p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Model Selection</h3>
                    <Button size="sm" onClick={runComparison} disabled={loadingA || loadingB || !whisperHash}>
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

// Removing internal wrapper helper since we now use global context directly

