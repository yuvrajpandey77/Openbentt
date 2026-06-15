import React, { useEffect, useState } from "react";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cloud, Cpu } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { defaultApiConfig, normalizeApiConfig, DEFAULT_MODEL_ID } from "@/types/chat";
import { ensureCloudInferenceForConfig } from "@/lib/privacy/privacyPreferences";
import { isWebClient } from "@/config/platformSurface";

const DISMISS_KEY = "openbentt-chat-or-key-dismissed";

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Web /chat: prompt for OpenRouter key when user lands without cloud credentials. */
export function OpenRouterKeyPrompt() {
  const { apiConfig, setApiConfig, isLoadingConfig } = useChat();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!isWebClient() || isLoadingConfig) return;
    if (apiConfig.apiKey.trim()) return;
    if (wasDismissed()) return;
    setOpen(true);
  }, [apiConfig.apiKey, isLoadingConfig]);

  if (!isWebClient() || apiConfig.apiKey.trim()) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast({
        title: "API key required",
        description: "Paste your OpenRouter key to continue.",
        variant: "destructive",
      });
      return;
    }
    const next = normalizeApiConfig({
      ...apiConfig,
      aiProvider: "openrouter",
      apiKey: apiKey.trim(),
      model: apiConfig.model || DEFAULT_MODEL_ID,
      comparisonModelIds: [apiConfig.model || DEFAULT_MODEL_ID],
    });
    ensureCloudInferenceForConfig(next);
    setApiConfig(next);
    setOpen(false);
    toast({
      title: "Connected to OpenRouter",
      description: "Your key is stored on this device only. Change models anytime.",
    });
  };

  const useOnDevice = () => {
    setApiConfig(normalizeApiConfig({ ...defaultApiConfig() }));
    markDismissed();
    setOpen(false);
    toast({
      title: "On-device model",
      description: "Complete the quick setup above the composer before your first message.",
    });
  };

  const onLater = () => {
    markDismissed();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onLater(); else setOpen(true); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-y-auto rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-xl">
        <DialogHeader className="space-y-1 px-5 pb-2 pt-6 text-left">
          <DialogTitle className="text-lg">Connect OpenRouter</DialogTitle>
          <DialogDescription className="text-sm">
            Paste your API key to use cloud models. Stored on this device only.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-5 pb-6">
          <p className="text-xs text-muted-foreground">
            Get a key at{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              openrouter.ai/keys
            </a>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="chat-or-key" className="text-xs font-medium">
              OpenRouter API key
            </Label>
            <Input
              id="chat-or-key"
              type="password"
              placeholder="sk-or-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              className="h-10"
            />
          </div>

          <DialogFooter className="flex-col gap-2 px-0 sm:flex-col">
            <Button type="submit" className="w-full gap-2">
              <Cloud className="h-4 w-4" />
              Connect to OpenRouter
            </Button>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={useOnDevice}>
              <Cpu className="h-4 w-4" />
              Use on-device model instead
            </Button>
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={onLater}>
              Later
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
