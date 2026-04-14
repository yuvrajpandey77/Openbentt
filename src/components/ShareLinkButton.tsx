import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { buildShareUrl, chatToShareSnapshot, encodeShareSnapshot } from "@/lib/shareRun";
import { useToast } from "@/components/ui/use-toast";

export function ShareLinkButton() {
  const { chats, currentChatId } = useChat();
  const { toast } = useToast();
  const chat = chats.find((c) => c.id === currentChatId);
  if (!chat?.messages.length) return null;

  const onClick = () => {
    const snap = chatToShareSnapshot(chat);
    const enc = encodeShareSnapshot(snap);
    const url = buildShareUrl(window.location.origin, enc);
    void navigator.clipboard.writeText(url);
    toast({
      title: "Share link copied",
      description: "Recipients open a read-only snapshot (frozen sources in messages).",
    });
  };

  return (
    <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={onClick}>
      <Share2 className="h-3.5 w-3.5" />
      Share run
    </Button>
  );
}
