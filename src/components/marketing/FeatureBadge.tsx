export function FeatureBadge({ label }: { label: "Web" | "Desktop" | "Both" }) {
  return (
    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      {label}
    </span>
  );
}
