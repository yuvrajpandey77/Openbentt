import { cn } from "@/lib/utils";

type WebChatLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "h-11 w-11",
  md: "h-14 w-14",
  lg: "h-16 w-16",
} as const;

const sizePx = {
  sm: 44,
  md: 56,
  lg: 64,
} as const;

/** Crisp raster logo for web /chat (SVG avatars blur on some mobile PWAs). */
export function WebChatLogo({ className, size = "md" }: WebChatLogoProps) {
  const px = sizePx[size];
  return (
    <img
      src="/pwa-chat-icon-192.png"
      srcSet="/pwa-chat-icon-192.png 1x, /pwa-chat-icon.png 2x, /pwa-chat-icon-1024.png 3x"
      width={px}
      height={px}
      alt=""
      decoding="async"
      className={cn("shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-border/40", sizeClass[size], className)}
    />
  );
}
