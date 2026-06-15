import { FileText, Globe, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STARTERS = [
  { icon: ImageIcon, label: "Analyze an image", prompt: "Help me understand what's in an image I'll attach." },
  { icon: FileText, label: "Write or edit", prompt: "Help me write or improve a draft." },
  { icon: Globe, label: "Look something up", prompt: "Look up the latest on: " },
] as const;

type WebChatStarterPromptsProps = {
  onSelect: (prompt: string) => void;
  className?: string;
};

export function WebChatStarterPrompts({ onSelect, className }: WebChatStarterPromptsProps) {
  return (
    <ul className={cn("flex flex-col gap-1 px-1 md:gap-1.5", className)}>
      {STARTERS.map(({ icon: Icon, label, prompt }) => (
        <li key={label}>
          <button
            type="button"
            onClick={() => onSelect(prompt)}
            className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left text-sm text-foreground/90 transition-colors hover:bg-muted/40 active:bg-muted/55 md:gap-3.5 md:px-4 md:py-3 md:text-[15px]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60 md:h-11 md:w-11">
              <Icon className="h-4 w-4 text-foreground/80 md:h-[1.1rem] md:w-[1.1rem]" strokeWidth={1.75} />
            </span>
            <span>{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
