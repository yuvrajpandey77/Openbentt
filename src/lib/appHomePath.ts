import { isDesktopApp } from "@/lib/isDesktopApp";

/** Web: marketing `/`. Desktop: projects hub. */
export function appHomePath(): string {
  if (typeof window === "undefined") return "/";
  return isDesktopApp() ? "/projects" : "/";
}
