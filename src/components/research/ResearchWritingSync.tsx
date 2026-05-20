import { useEffect, useRef } from "react";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";
import {
  looksLikeAbstractReply,
  looksLikeCaptionReply,
  looksLikeKeywordReply,
  parseAbstractVariants,
  parseCaptionSuggestions,
  parseKeywordSuggestions,
} from "@/lib/research/parseWritingAssist";
import { listLatexFloats } from "@/lib/research/latexTools";
import { useToast } from "@/components/ui/use-toast";

/** Watches the active chat thread and imports abstracts/keywords into the research project. */
export function ResearchWritingSync() {
  const { chats, currentChatId } = useChat();
  const { project, updateProject } = useResearchProject();
  const { toast } = useToast();
  const lastImportedId = useRef<string | null>(null);

  useEffect(() => {
    if (!project || !currentChatId) return;
    const chat = chats.find((c) => c.id === currentChatId);
    const lastAssistant = [...(chat?.messages ?? [])]
      .reverse()
      .find(
        (m) =>
          m.role === "assistant" &&
          !m.comparisonResponses?.length &&
          m.content.trim().length > 0
      );
    if (!lastAssistant || lastAssistant.id === lastImportedId.current) return;

    const plain = buildAssistantPlainText(lastAssistant);

    const floats = listLatexFloats(project.draftTex);
    const labels = floats.map((f) => f.label).filter(Boolean);
    const abstracts = looksLikeAbstractReply(plain) ? parseAbstractVariants(plain) : [];
    const keywords = looksLikeKeywordReply(plain) ? parseKeywordSuggestions(plain) : [];
    const captions = looksLikeCaptionReply(plain)
      ? parseCaptionSuggestions(plain, labels).map((c) => ({
          ...c,
          kind: floats.find((f) => f.label === c.label)?.kind,
        }))
      : [];
    if (abstracts.length === 0 && keywords.length === 0 && captions.length === 0) return;

    lastImportedId.current = lastAssistant.id;
    void updateProject({
      ...(abstracts.length > 0 ? { abstractVariants: abstracts } : {}),
      ...(keywords.length > 0 ? { keywordSuggestions: keywords } : {}),
      ...(captions.length > 0 ? { captionSuggestions: captions } : {}),
    }).then(() => {
      const parts: string[] = [];
      if (abstracts.length) parts.push(`${abstracts.length} abstract(s)`);
      if (keywords.length) parts.push(`${keywords.length} keyword(s)`);
      if (captions.length) parts.push(`${captions.length} caption(s)`);
      toast({
        title: "Imported from chat",
        description: parts.join(" · ") + " — see Notebook → Write.",
      });
    });
  }, [chats, currentChatId, project?.id, updateProject, toast]);

  return null;
}
