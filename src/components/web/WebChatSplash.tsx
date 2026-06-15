import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Centered logo splash while web /chat restores session state. */
export function WebChatSplash() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6">
      <Avatar className="h-16 w-16 rounded-2xl shadow-md ring-1 ring-border/40">
        <AvatarImage src="/openbentt-logo.svg" alt="" />
        <AvatarFallback className="font-display text-sm">OB</AvatarFallback>
      </Avatar>
      <p className="mt-5 font-display text-lg font-semibold tracking-tight text-foreground">Openbentt</p>
      <div className="mt-6 h-1 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
      </div>
    </div>
  );
}
