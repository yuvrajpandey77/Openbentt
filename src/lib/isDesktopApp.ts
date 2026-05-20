/** True when running inside the Electron desktop shell (not a normal browser tab). */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && window.openbenttDesktop?.isElectron === true;
}
