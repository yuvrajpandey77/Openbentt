import { WebChatLogo } from "@/components/web/WebChatLogo";

/** Centered logo splash while web /chat restores session state. */
export function WebChatSplash() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6">
      <WebChatLogo size="lg" />
      <p className="mt-5 font-display text-lg font-semibold tracking-tight text-foreground">Cobentt</p>
      <div className="mt-6 h-1 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-muted-foreground/35" />
      </div>
    </div>
  );
}
