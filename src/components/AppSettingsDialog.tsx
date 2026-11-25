import React, { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsShell } from "@/pages/SettingsPage";
import { cn } from "@/lib/utils";

const dialogContentClassName =
  "app-shell z-[100] flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-card p-0 shadow-2xl sm:h-[min(88vh,820px)] sm:max-h-[min(88vh,820px)] sm:w-[calc(100vw-2rem)] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-border";

type ControlledProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TriggerProps = {
  trigger: React.ReactNode;
  tooltip?: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
};

function SettingsDialogFrame({
  open,
  onOpenChange,
}: ControlledProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClassName} aria-describedby={undefined}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3 pr-12">
          <DialogTitle className="text-base font-semibold tracking-tight">Settings</DialogTitle>
        </div>
        <SettingsShell className="min-h-0 flex-1" />
      </DialogContent>
    </Dialog>
  );
}

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

/** Controlled floating settings card (preferred from AppLayout). */
export function AppSettingsDialogControlled({ open, onOpenChange }: ControlledProps) {
  return <SettingsDialogFrame open={open} onOpenChange={onOpenChange} />;
}

/** Trigger-owned settings dialog (dock / one-off buttons). */
export function AppSettingsDialog({ trigger, tooltip, tooltipSide = "right" }: TriggerProps) {
  const [open, setOpen] = useState(false);
  const triggerNode = mergeTrigger(trigger, () => setOpen(true));

  return (
    <>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
          <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        triggerNode
      )}
      <SettingsDialogFrame open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Icon trigger styled for the global bottom-left dock. */
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
