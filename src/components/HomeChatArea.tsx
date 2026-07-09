import React, { useEffect, useState } from "react";
import ChatMessages from "@/components/ChatMessages";
import { ModelDownloadProgressBar } from "@/components/ModelDownloadProgressBar";
import { useChat } from "@/context/ChatContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { enableChatPwa, disableChatPwa } from "@/lib/chatPwa";
import { getLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";
import { isLocalModelMarkedCached } from "@/lib/gemmaWebGpu/localModelCacheFlag";
import { isLocalGemmaWeightsLoaded } from "@/lib/gemmaWebGpu/localGemmaInference";
import { LOCAL_TINY_MODEL_ID } from "@/lib/gemmaWebGpu/models";
import { Badge } from "@/components/ui/badge";
import { Loader2, HardDrive } from "lucide-react";

/** Main thread view (route `/chat`) — messages scroll above the global composer. */
const HomeChatArea: React.FC = () => {
  const { chats, currentChatId, isLoading, apiConfig, webgpuModelDownloadProgress } = useChat();
  const isMobile = useIsMobile();
  const [ramReady, setRamReady] = useState(() => isLocalGemmaWeightsLoaded());

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];
  const isEmpty = messages.length === 0;
  const showOnDeviceDownload =
    isLoading &&
    apiConfig.aiProvider === "webgpu_gemma" &&
    webgpuModelDownloadProgress != null;

  const showCachedWarm =
    apiConfig.aiProvider === "webgpu_gemma" &&
    getLocalWeightsConsent() &&
    isLocalModelMarkedCached(LOCAL_TINY_MODEL_ID) &&
    !showOnDeviceDownload;

  useEffect(() => {
    if (!showCachedWarm) return;
    const id = window.setInterval(() => {
      setRamReady(isLocalGemmaWeightsLoaded());
    }, 500);
    return () => clearInterval(id);
  }, [showCachedWarm, isLoading]);

  useEffect(() => {
    void enableChatPwa();
    return () => {
      void disableChatPwa();
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isMobile]);

  return (
    <div className="web-chat-thread flex min-h-0 flex-1 flex-col overflow-hidden">
      {showOnDeviceDownload && (
        <div className="shrink-0 border-b border-border/50 px-3 py-2 sm:px-4">
          <div className="mx-auto max-w-3xl">
            <ModelDownloadProgressBar
              title="Downloading on-device model (Qwen 0.5B)"
              percentOnly
              progress={{
                percent: webgpuModelDownloadProgress,
                received: null,
                total: null,
                speedBps: null,
                etaSeconds: null,
              }}
              hint="One-time download. Keep this tab open until it finishes — then it stays cached."
            />
          </div>
        </div>
      )}
      {showCachedWarm && (
        <div className="shrink-0 border-b border-border/40 px-3 py-1.5 sm:px-4">
          <div className="mx-auto flex max-w-3xl items-center gap-2 text-[11px] text-muted-foreground">
            {ramReady ? (
              <>
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                  Cached
                </Badge>
                <span>Qwen 0.5B ready in this tab (no re-download).</span>
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Loading cached model into memory…</span>
              </>
            )}
          </div>
        </div>
      )}
      <ChatMessages messages={messages} isLoading={isLoading} webCleanEmpty={isEmpty} />
    </div>
  );
};

export default HomeChatArea;
