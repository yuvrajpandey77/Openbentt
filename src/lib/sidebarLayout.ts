/** Shared sidebar dimensions — keep AppLayout margin in sync. */
export const SIDEBAR_WIDTH_ICON = "3.75rem";
export const SIDEBAR_WIDTH_EXPANDED = "12.5rem";

/** Tailwind classes for main content offset (desktop). */
export function sidebarMainMarginClass(collapsed: boolean): string {
  return collapsed ? "md:ml-[3.5rem]" : "md:ml-[15rem]";
}
