export type ClientPlatform = "windows" | "mac" | "linux" | "unknown";

/** Best-effort OS family from `navigator` (for highlighting the right download). */
export function getClientPlatform(): ClientPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("android")) return "unknown";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}
