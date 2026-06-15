import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatPwaInstall } from "@/hooks/useChatPwaInstall";
import { enableChatPwa, isChatPwaStandalone } from "@/lib/chatPwa";
import { WebChatInstallDialog } from "@/components/web/WebChatInstallDialog";

/** Mobile-only: install Cobentt PWA from the marketing landing page. */
export function LandingMobileInstallCta() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { standalone, canNativeInstall, install } = useChatPwaInstall();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!isMobile || standalone) return;
    void enableChatPwa();
  }, [isMobile, standalone]);

  if (!isMobile || standalone) return null;

  const onInstallClick = async () => {
    if (canNativeInstall) {
      const ok = await install();
      if (!ok) setDialogOpen(true);
      return;
    }
    navigate("/chat?install=1");
  };

  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="secondary"
        className="h-12 w-full gap-2.5 rounded-xl px-6 text-base font-semibold md:hidden"
        onClick={() => void onInstallClick()}
      >
        <Smartphone className="h-5 w-5" />
        Install Cobentt
      </Button>

      <WebChatInstallDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
