import React, { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { defaultApiConfig, normalizeApiConfig, canSendChat } from "@/types/chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ModelSelectionFormValues {
  apiKey: string;
}

interface ModelSelectionProps {
  onComplete: () => void;
}

const ModelSelection: React.FC<ModelSelectionProps> = ({ onComplete }) => {
  const { setApiConfig, apiConfig } = useChat();
  const { toast } = useToast();
  const [showLocal, setShowLocal] = useState(false);

  const form = useForm<ModelSelectionFormValues>({
    defaultValues: {
      apiKey: "",
    },
  });

  if (canSendChat(apiConfig)) {
    return null;
  }

  const onSubmit = (data: ModelSelectionFormValues) => {
    if (!data.apiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Enter your OpenRouter API key or use local inference below.",
        variant: "destructive",
      });
      return;
    }

    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        aiProvider: "openrouter",
        apiKey: data.apiKey,
        model: apiConfig.model || defaultApiConfig().model,
      })
    );

    toast({
      title: "Configuration Complete",
      description: "Your chat is ready. You can change models in settings.",
    });

    onComplete();
  };

  const useLocalOllama = () => {
    setApiConfig(
      normalizeApiConfig({
        ...defaultApiConfig(),
        aiProvider: "openai_compatible",
        apiKey: "",
        openAiCompatibleBaseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.2",
      })
    );
    toast({
      title: "Local inference",
      description: "Using Ollama-compatible URL. Ensure Ollama is running and pull a model if needed.",
    });
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-lg shadow-lg p-6 w-full max-w-md">
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Setup Your Chat</h2>
            <p className="text-muted-foreground">
              OpenRouter cloud models, or a local OpenAI-compatible server (Ollama, LM Studio).
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-muted-foreground">
                <p>Keys stay in this browser only.</p>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get an OpenRouter key
                </a>
              </div>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="apiKey" className="text-sm font-medium">
                OpenRouter API key
              </label>
              <Input
                id="apiKey"
                placeholder="sk-or-..."
                type="password"
                {...form.register("apiKey")}
              />
            </div>

            <Button type="submit" className="w-full">
              Start with OpenRouter
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          {!showLocal ? (
            <Button type="button" variant="secondary" className="w-full" onClick={() => setShowLocal(true)}>
              Use local Ollama (127.0.0.1:11434)
            </Button>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground text-xs">
                Sets base URL to <code className="text-[10px]">http://127.0.0.1:11434/v1</code> and model{" "}
                <code className="text-[10px]">llama3.2</code>. Adjust in Settings after start.
              </p>
              <Button type="button" className="w-full" onClick={useLocalOllama}>
                Connect to Ollama
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelSelection;
