/** Web: marketing `/`. Desktop shell: workspace `/chat` (no standalone landing in the window). */
export function appHomePath(): string {
  if (typeof window === "undefined") return "/";
  return window.openbenttDesktop?.isElectron ? "/chat" : "/";
}
