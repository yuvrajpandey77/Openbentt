import { FileText, GraduationCap, HardDrive, Calendar, Mail, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_BUTTONS = [
  { icon: FileText, label: "Write", prompt: "Help me write or improve a draft." },
  { icon: GraduationCap, label: "Learn", prompt: "Help me learn about a topic." },
] as const;

const INTEGRATIONS = [
  { icon: HardDrive, label: "From Drive", comingSoon: true },
  { icon: Calendar, label: "From Calendar", comingSoon: true },
  { icon: Mail, label: "From Gmail", comingSoon: true },
] as const;

type WebChatStarterPromptsProps = {
  onSelect: (prompt: string) => void;
  className?: string;
};

export function WebChatStarterPrompts({ onSelect, className }: WebChatStarterPromptsProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="flex flex-wrap items-center justify-center gap-1.5 md:gap-2">
        {ACTION_BUTTONS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(prompt)}
            className="web-quick-pill"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" strokeWidth={1.5} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5 md:gap-2">
        {INTEGRATIONS.map(({ icon: Icon, label, comingSoon }) => (
          <button
            key={label}
            type="button"
            disabled
            className="web-quick-pill web-quick-pill--integration"
            title={comingSoon ? "Coming soon — integrate to use" : label}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" strokeWidth={1.5} />
            <span>{label}</span>
            <Zap className="h-2.5 w-2.5 text-[#16A34A]/60" strokeWidth={2} />
          </button>
        ))}
      </div>
    </div>
  );
}
