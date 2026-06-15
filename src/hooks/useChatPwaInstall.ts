import { useCallback, useEffect, useState } from "react";
import { isChatPwaStandalone, isIosSafari } from "@/lib/chatPwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function useChatPwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(() => isChatPwaStandalone());

  useEffect(() => {
    const onChange = () => setStandalone(isChatPwaStandalone());
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", onChange);
    setStandalone(isChatPwaStandalone());

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("beforeinstallprompt", onBip);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setStandalone(true);
    return outcome === "accepted";
  }, [deferred]);

  const ios = isIosSafari();
  const canNativeInstall = Boolean(deferred);
  const showMobileInstall = !standalone;

  return {
    standalone,
    canNativeInstall,
    showMobileInstall,
    isIos: ios,
    install,
  };
}
