import type { Message, ResearchSourceRef } from "@/types/chat";
import { shortModelLabel } from "@/lib/openrouter";

function appendSources(sources: ResearchSourceRef[] | undefined): string {
  if (!sources?.length) return "";
  let x = "\n\n## References (sources)\n\n";
  for (const s of sources) {
    x += `- ${s.title}${s.url ? `\n  ${s.url}` : ""}\n`;
    if (s.snippet?.trim()) x += `  ${s.snippet.trim()}\n`;
  }
  return x;
}

/** Plain text for clipboard / exports (includes comparison headers and research URLs). */
export function buildAssistantPlainText(message: Message): string {
  if (message.comparisonResponses?.length) {
    const body = message.comparisonResponses
      .map((p) => {
        const head = `## ${shortModelLabel(p.model)}`;
        if (p.error) return `${head}\n\nError: ${p.error}`;
        return `${head}\n\n${p.content.trim()}`;
      })
      .join("\n\n---\n\n");
    return body + appendSources(message.researchSources);
  }
  return message.content.trim() + appendSources(message.researchSources);
}
