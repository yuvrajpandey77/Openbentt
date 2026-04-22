/**
 * Build a Gemma 4 IT-style multi-turn prompt from OpenAI-compatible chat messages.
 * Format matches Gemma Gem `agent/prompt-builder.ts` (without tools).
 */

function contentToPlain(content: unknown): { text: string; hadNonText: boolean } {
  if (typeof content === "string") {
    return { text: content, hadNonText: false };
  }
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    let hadNonText = false;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && typeof p.text === "string") {
        textParts.push(p.text);
      } else if (p.type === "image_url" || p.type === "input_audio") {
        hadNonText = true;
      }
    }
    let text = textParts.join("\n").trim();
    if (hadNonText) {
      text = text
        ? `${text}\n\n[Note: image/audio parts are omitted for the on-device model.]`
        : "[Note: image/audio parts are omitted for the on-device model.]";
    }
    return { text, hadNonText };
  }
  return { text: JSON.stringify(content), hadNonText: false };
}

export function chatCompletionMessagesToGemmaPrompt(
  apiMessages: Array<{ role: string; content: unknown }>
): string {
  const parts: string[] = [];
  for (const m of apiMessages) {
    const { text } = contentToPlain(m.content);
    const role = m.role;
    if (role === "system") {
      parts.push(`<|turn>system\n${text}<turn|>`);
    } else if (role === "user") {
      parts.push(`<|turn>user\n${text}<turn|>`);
    } else if (role === "assistant") {
      parts.push(`<|turn>model\n${text}<turn|>`);
    }
  }
  parts.push("<|turn>model");
  return parts.join("\n");
}
