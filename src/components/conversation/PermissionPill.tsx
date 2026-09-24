import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, X, Check, Shield } from "lucide-react";
import { FileText, Terminal, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/utils";

export const PermissionPill: React.FC = () => {
  const { fullAccessGranted, setFullAccessGranted } = useChat();
  const [showDetails, setShowDetails] = useState(false);
  const autoApproveRef = useRef<number | null>(null);

  const startAutoApprove = () => {
    setFullAccessGranted(true);
  };

  const cancelAutoApprove = () => {
    if (autoApproveRef.current) {
      clearTimeout(autoApproveRef.current);
      autoApproveRef.current = null;
    }
    setFullAccessGranted(false);
  };

  const handleDismiss = () => {
    cancelAutoApprove();
    setShowDetails(false);
  };

  useEffect(() => {
    return () => {
      if (autoApproveRef.current) clearTimeout(autoApproveRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors",
                fullAccessGranted
                  ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-muted-foreground/20 bg-muted/30 text-muted-foreground/80 hover:bg-muted/40 hover:text-muted-foreground"
              )}
              aria-expanded={showDetails}
              aria-label={showDetails ? "Hide permission details" : "Show permission details"}
            >
              {fullAccessGranted ? (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 truncate font-medium">Full Access</span>
              {fullAccessGranted && (
                <span className="flex items-center gap-1 text-[10px] opacity-70">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Active
                </span>
              )}
              <X className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-xs">
            <p className="text-xs text-muted-foreground">
              Click to expand permission details
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {showDetails && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-80 rounded-lg border border-border bg-card p-3 shadow-lg animate-fade-in-up">
          <div className="flex items-start gap-2">
            {fullAccessGranted ? (
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            ) : (
              <ShieldAlert className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm text-foreground">Turn on Full Access?</h4>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Openbentt will be able to run commands, use the internet, and create and edit files anywhere on this computer without your permission.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
            <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
              <FileText className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Files and folders</p>
                <p>Read, create, modify, upload, or delete files anywhere on this computer</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
              <Terminal className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Terminal commands</p>
                <p>Run commands, install software, and change system settings</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
              <Globe className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Internet and connected apps</p>
                <p>Access websites, send data, and use enabled plugins</p>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-destructive/80">
            This comes with risks like loss or exposure of sensitive data and prompt injection. You can turn this off.
            <a href="#" className="text-primary hover:underline ml-1">Learn more</a>
          </p>

          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={fullAccessGranted}
                onChange={(e) => {
                  if (e.target.checked) startAutoApprove();
                  else cancelAutoApprove();
                }}
                className="h-3 w-3 rounded border-border bg-background text-primary focus:ring-primary"
              />
              <span>Approve for me (auto-approve after 5s)</span>
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => {
                if (fullAccessGranted) {
                  cancelAutoApprove();
                } else {
                  startAutoApprove();
                }
              }}
            >
              {fullAccessGranted ? (
                <>
                  <X className="h-3 w-3 mr-1" />
                  Turn Off
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Confirm
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Terminal, Globe } from "lucide-react";