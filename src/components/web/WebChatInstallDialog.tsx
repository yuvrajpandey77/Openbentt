import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share, Smartphone } from "lucide-react";
import { useChatPwaInstall } from "@/hooks/useChatPwaInstall";

type WebChatInstallDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WebChatInstallDialog({ open, onOpenChange }: WebChatInstallDialogProps) {
  const { canNativeInstall, isIos, install, standalone } = useChatPwaInstall();

  if (standalone) return null;

  const onInstall = async () => {
    const ok = await install();
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Smartphone className="h-5 w-5 text-primary" />
            Use Cobentt on mobile
          </DialogTitle>
          <DialogDescription>
            Install Cobentt on your phone for a full-screen app — same chats and API key, no app store.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          {canNativeInstall ? (
            <p>Tap Install below, then open Cobentt from your home screen.</p>
          ) : isIos ? (
            <ol className="list-decimal space-y-2 pl-4">
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                <span>
                  In Safari, tap <strong className="text-foreground">Share</strong> at the bottom of the screen.
                </span>
              </li>
              <li>
                Choose <strong className="text-foreground">Add to Home Screen</strong>, then tap Add.
              </li>
              <li>Open <strong className="text-foreground">Cobentt</strong> from your home screen.</li>
            </ol>
          ) : (
            <p>
              In Chrome or Edge, open the browser menu and choose <strong className="text-foreground">Install app</strong>{" "}
              or <strong className="text-foreground">Add to Home screen</strong>.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {canNativeInstall && (
            <Button type="button" className="w-full gap-2" onClick={() => void onInstall()}>
              <Download className="h-4 w-4" />
              Install Cobentt
            </Button>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Continue in browser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
