import { isDesktopApp } from "@/lib/isDesktopApp";
import { isChatPwaStandalone } from "@/lib/chatPwa";

/** Web: marketing `/`. Desktop: projects hub. Installed chat PWA: `/chat` only. */
export function appHomePath(): string {
  if (typeof window === "undefined") return "/";
  if (isChatPwaStandalone()) return "/chat";
  return isDesktopApp() ? "/projects" : "/";
}
