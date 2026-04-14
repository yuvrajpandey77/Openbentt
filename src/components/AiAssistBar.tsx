import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { canSendChat } from "@/types/chat";
import { MessageSquare } from "lucide-react";
import { shortModelLabel } from "@/lib/openrouter";

interface AiAssistBarProps {
  /** Seed text (e.g. pasted context). */
  initialText?: string;
  label?: string;
  placeholder?: string;
}

/** Compose a prompt and send it to the main Home chat composer (same AI provider as Settings). */
export const AiAssistBar: React.FC<AiAssistBarProps> = ({
  initialText = "",
  label = "AI assistant (main chat)",
  placeholder = "Write a prompt. It will load on the Home chat using your configured provider and model.",
}) => {
  const [text, setText] = useState(initialText);
  const { queuePromptInComposer, apiConfig } = useChat();
  const navigate = useNavigate();

  const pipeline =
    canSendChat(apiConfig) &&
    `${apiConfig.aiProvider} · ${shortModelLabel(apiConfig.model)} · research ${apiConfig.researchEnabled ? apiConfig.researchDepth : "off"}`;

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" />
          {label}
        </div>
        {pipeline && (
          <p className="text-[11px] text-muted-foreground font-mono pl-6">
            Same pipeline as Home: {pipeline}
          </p>
        )}
      </div>
      <Label className="text-[11px] text-muted-foreground sr-only">Prompt</Label>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="min-h-[88px] text-sm font-mono"
      />
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          size="sm"
          disabled={!text.trim() || !canSendChat(apiConfig)}
          onClick={() => {
            queuePromptInComposer(text.trim());
            navigate("/chat");
          }}
        >
          Open in Home chat
        </Button>
        {!canSendChat(apiConfig) && (
          <span className="text-[11px] text-muted-foreground">Configure API keys on Home → Settings first.</span>
        )}
      </div>
    </div>
  );
};
