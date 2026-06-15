import { isWebClient } from "@/config/platformSurface";

export function isWebChatRoute(pathname: string): boolean {
  return isWebClient() && pathname === "/chat";
}
