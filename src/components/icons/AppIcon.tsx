/**
 * Gentleface icon wrapper — line (idle) / solid (active|pressed).
 * Colors via tone (OpenAI dots / Grok accents) or currentColor.
 * MIT: https://gentleface.com
 */
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type GentleVariant =
  | "line-round"
  | "line-soft"
  | "line-sharp"
  | "solid-round"
  | "solid-soft"
  | "solid-sharp";

export type IconTone =
  | "inherit"
  | "muted"
  | "openai"
  | "openai-teal"
  | "openai-violet"
  | "openai-blue"
  | "grok"
  | "grok-amber"
  | "grok-orange"
  | "warn"
  | "success";

export type AppIconSize = 16 | 20 | 24 | 32 | 48;

type GentleIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  variant?: GentleVariant;
  title?: string;
};

export type AppIconProps = {
  /** Gentleface icon component from @gentleface/react(-20|-24) */
  icon: ComponentType<GentleIconProps>;
  active?: boolean;
  pressed?: boolean;
  tone?: IconTone;
  size?: AppIconSize;
  className?: string;
  title?: string;
};

const TONE_CLASS: Record<IconTone, string> = {
  inherit: "",
  muted: "text-muted-foreground",
  openai: "text-[var(--icon-openai)]",
  "openai-teal": "text-[var(--icon-openai-teal)]",
  "openai-violet": "text-[var(--icon-openai-violet)]",
  "openai-blue": "text-[var(--icon-openai-blue)]",
  grok: "text-[var(--icon-grok)]",
  "grok-amber": "text-[var(--icon-grok-amber)]",
  "grok-orange": "text-[var(--icon-grok-orange)]",
  warn: "text-amber-500 dark:text-amber-400",
  success: "text-emerald-500 dark:text-emerald-400",
};

/** Snap display size to a Gentleface master (or exact multiple of 16). */
export function resolveIconMaster(size: number): { master: 16 | 20 | 24; render: number } {
  if (size >= 44) return { master: 24, render: 48 };
  if (size >= 28) return { master: 16, render: 32 };
  if (size >= 22) return { master: 24, render: 24 };
  if (size >= 18) return { master: 20, render: 20 };
  return { master: 16, render: 16 };
}

export function AppIcon({
  icon: Icon,
  active = false,
  pressed = false,
  tone = "inherit",
  size = 16,
  className,
  title,
}: AppIconProps) {
  const solid = active || pressed;
  const { render } = resolveIconMaster(size);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none",
        TONE_CLASS[tone],
        className
      )}
      style={{ width: render, height: render }}
    >
      <Icon
        size={render}
        variant={solid ? "solid-round" : "line-round"}
        title={title}
        aria-hidden={title ? undefined : true}
      />
    </span>
  );
}

/** Factory: lucide-like component API (className + size) with optional active. */
export function createGfIcon(
  Icon16: ComponentType<GentleIconProps>,
  Icon20?: ComponentType<GentleIconProps>,
  Icon24?: ComponentType<GentleIconProps>
) {
  const Comp = ({
    className,
    size = 16,
    active = false,
    pressed = false,
    tone = "inherit",
    title,
    ...rest
  }: {
    className?: string;
    size?: number | string;
    active?: boolean;
    pressed?: boolean;
    tone?: IconTone;
    title?: string;
  } & SVGProps<SVGSVGElement>) => {
    const n = typeof size === "string" ? parseInt(size, 10) || 16 : size;
    const { master, render } = resolveIconMaster(n);
    const Icon =
      master === 24 && Icon24 ? Icon24 : master === 20 && Icon20 ? Icon20 : Icon16;
    const solid = active || pressed;
    void rest;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none",
          TONE_CLASS[tone],
          className
        )}
        style={{ width: render, height: render }}
      >
        <Icon
          size={render}
          variant={solid ? "solid-round" : "line-round"}
          title={title}
          aria-hidden={title ? undefined : true}
        />
      </span>
    );
  };
  Comp.displayName = "GfIcon";
  return Comp;
}
