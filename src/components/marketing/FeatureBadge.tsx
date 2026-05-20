import { cn } from "@/lib/utils";

export function FeatureBadge({ label }: { label: "Web" | "Desktop" | "Both" }) {
  const styles =
    label === "Desktop"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : label === "Web"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : "border-primary/30 bg-primary/10 text-primary";

  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", styles)}>
      {label}
    </span>
  );
}
