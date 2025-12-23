import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiDeleteKey, apiGetKeys, apiSetKey } from "@/lib/api";
import { Check, Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ApiKeyManagerProps {
  onKeysChanged?: () => void;
}

const PROVIDERS = [
  { id: "groq", name: "Groq", description: "Forever Free (Rate limits apply)", url: "https://console.groq.com/keys" },
  { id: "google", name: "Google Gemini", description: "Forever Free (Rate limits apply)", url: "https://aistudio.google.com/app/apikey" },
  { id: "huggingface", name: "Hugging Face", description: "Forever Free (Rate limits apply)", url: "https://huggingface.co/settings/tokens" },
  { id: "deepseek", name: "DeepSeek", description: "Free Trial (Credits expire)", url: "https://platform.deepseek.com/api_keys" },
  { id: "mistral", name: "Mistral", description: "Free Trial (Credits expire)", url: "https://console.mistral.ai/api-keys/" },
  { id: "openai", name: "OpenAI", description: "Paid (Credit card required)", url: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", description: "Paid (Credit card required)", url: "https://console.anthropic.com/settings/keys" },
  { id: "xai", name: "xAI (Grok)", description: "Paid (Credit card required)", url: "https://console.x.ai/" },
];

export function ApiKeyManager({ onKeysChanged }: ApiKeyManagerProps) {
  const [keysStatus, setKeysStatus] = useState<Record<string, boolean>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
        setLoading(true);
        const status = await apiGetKeys();
        setKeysStatus(status);
        if (onKeysChanged) onKeysChanged();
    } catch (err) {
        console.error("Failed to load keys", err);
        // toast.error("Failed to load API key status");
    } finally {
        setLoading(false);
    }
  };

  const handleSave = async (provider: string) => {
    const key = inputValues[provider];
    if (!key) return;

    setSavingKey(provider);
    try {
      await apiSetKey(provider, key);
      await loadKeys();
      setInputValues({ ...inputValues, [provider]: "" }); // Clear input on success
      toast.success(`${provider} API Key saved`);
    } catch (err) {
      toast.error(`Failed to save ${provider} key`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleDelete = async (provider: string) => {
    if (!confirm(`Are you sure you want to delete the API key for ${provider}?`)) return;
    
    setSavingKey(provider);
    try {
      await apiDeleteKey(provider);
      await loadKeys();
      toast.success(`${provider} API Key deleted`);
    } catch (err) {
      toast.error(`Failed to delete ${provider} key`);
    } finally {
        setSavingKey(null);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-md border border-border/50">
        <p className="font-semibold mb-1">API Key Management</p>
        <p>Save your API keys locally to use different LLM providers.</p>
        <p className="text-xs mt-1">Keys are stored securely in a local file and never sent to a cloud server other than the provider itself.</p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {PROVIDERS.map((provider) => (
          <AccordionItem value={provider.id} key={provider.id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center justify-between w-full mr-4">
                <span className="flex items-center gap-2">
                  {provider.name}
                  {keysStatus[provider.id] && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                       <Check className="w-3 h-3 mr-1" /> Configured
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground font-normal hidden sm:inline-block">
                  {provider.description.split(" (")[0]}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-1 pt-2 pb-4">
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        {provider.description}. Get your key from <a href={provider.url} target="_blank" rel="noreferrer" className="text-primary hover:underline underline-offset-2">{provider.url}</a>
                    </p>
                    <div className="flex gap-2 items-center">
                        {keysStatus[provider.id] && !inputValues[provider.id] ? (
                            <div className="flex-1 flex items-center justify-between p-2 bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-md">
                                <span className="text-xs font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                                    <Check className="w-3 h-3" />
                                    API Key stored securely
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => setInputValues({ ...inputValues, [provider.id]: " " })} // Set dummy space to trigger edit mode
                                    >
                                        Update Key
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDelete(provider.id)}
                                        title="Delete Key"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Input 
                                    type="password" 
                                    placeholder={keysStatus[provider.id] ? "Enter new key to replace..." : "Enter API Key sk-..."}
                                    value={inputValues[provider.id] === " " ? "" : (inputValues[provider.id] || "")}
                                    onChange={(e) => setInputValues({...inputValues, [provider.id]: e.target.value})}
                                    className="flex-1"
                                    autoFocus={inputValues[provider.id] === " "}
                                />
                                <Button 
                                    variant="default" 
                                    size="sm" 
                                    onClick={() => handleSave(provider.id)}
                                    disabled={!inputValues[provider.id] || inputValues[provider.id] === " " || savingKey === provider.id}
                                >
                                    {savingKey === provider.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save
                                </Button>
                                {inputValues[provider.id] === " " && keysStatus[provider.id] && (
                                     <Button 
                                     variant="ghost" 
                                     size="sm"
                                     onClick={() => setInputValues({ ...inputValues, [provider.id]: "" })}
                                 >
                                     Cancel
                                 </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
