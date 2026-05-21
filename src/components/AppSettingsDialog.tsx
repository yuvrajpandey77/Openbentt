import React, { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import SettingsPanel from "@/components/SettingsPanel";
import { cn } from "@/lib/utils";

function AppSettingsDialogBody() {
  return (
    <>
      <DialogHeader className="border-b border-border/60 px-6 py-4 text-left">
        <DialogTitle className="font-display text-xl font-semibold tracking-tight">Settings</DialogTitle>
        <p className="text-sm text-muted-foreground">
          AI providers, appearance, and developer tools (Benchmark, WebGPU) — stored locally.
        </p>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <SettingsPanel />
      </div>
    </>
  );
}

type AppSettingsDialogProps = {
  trigger: React.ReactNode;
  tooltip?: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
};

const dialogContentClassName =
  "app-shell dark z-[100] flex max-h-[min(92vh,860px)] w-[calc(100vw-1.25rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl";

function mergeTrigger(
  trigger: React.ReactNode,
  onOpen: () => void
): React.ReactNode {
  if (!React.isValidElement(trigger)) return trigger;

  const originalOnClick = trigger.props.onClick as React.MouseEventHandler | undefined;

  return React.cloneElement(trigger, {
    type: "button",
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      originalOnClick?.(event);
      if (!event.defaultPrevented) onOpen();
    },
  });
}

/** Main app settings (AI providers, appearance, dev tools) — same dialog as chat sidebar. */
export function AppSettingsDialog({ trigger, tooltip, tooltipSide = "right" }: AppSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const triggerNode = mergeTrigger(trigger, () => setOpen(true));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
          <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        triggerNode
      )}
      <DialogContent className={dialogContentClassName}>
        <AppSettingsDialogBody />
      </DialogContent>
    </Dialog>
  );
}

/** Icon trigger styled for the global bottom-left dock. Must forward ref/props for Radix + controlled open. */
export const AppSettingsDockButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    size="icon"
    variant="secondary"
    className={cn(
      "h-10 w-10 rounded-full shadow-lg",
      "border border-border/80 bg-card/95 backdrop-blur-sm",
      className
    )}
    aria-label="Settings"
    {...props}
  >
    <Settings className="h-4 w-4" />
  </Button>
));
AppSettingsDockButton.displayName = "AppSettingsDockButton";
