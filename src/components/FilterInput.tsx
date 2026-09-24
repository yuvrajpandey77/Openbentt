import React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Consistent list filter used across Tasks / Files / Documents / Projects. */
export const FilterInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = "Filter…", className }) => (
  <div className={cn("relative", className)}>
    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 pl-8 pr-7 text-xs"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label="Clear filter"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X size={13} />
      </button>
    )}
  </div>
);
