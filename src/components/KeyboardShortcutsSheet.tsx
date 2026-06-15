import React from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Keyboard } from "lucide-react";

const rows: { action: string; keys: string }[] = [
  { action: "Send message", keys: "Enter" },
  { action: "New line in composer", keys: "Shift + Enter" },
  { action: "Stop generation", keys: "Escape" },
  { action: "Chat search / export", keys: "Bar above messages on Home" },
];

type KeyboardShortcutsSheetProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When false, only the sheet panel is rendered (for menu-driven open). */
  showTrigger?: boolean;
};

export const KeyboardShortcutsSheet: React.FC<KeyboardShortcutsSheetProps> = ({
  open,
  onOpenChange,
  showTrigger = true,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Keyboard shortcuts">
            <Keyboard className="h-4 w-4" />
          </Button>
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Shortcuts</SheetTitle>
          <SheetDescription>Composer and chat tools. Keys depend on your OS layout.</SheetDescription>
        </SheetHeader>
        <ul className="mt-6 space-y-3 text-sm">
          {rows.map((r) => (
            <li key={r.action} className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 last:border-0">
              <span className="text-foreground">{r.action}</span>
              <kbd className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {r.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
};
