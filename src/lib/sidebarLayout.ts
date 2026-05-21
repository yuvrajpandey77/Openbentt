/** Shared sidebar dimensions — keep AppLayout margin in sync. */
export const SIDEBAR_WIDTH_ICON = "3.25rem";
export const SIDEBAR_WIDTH_EXPANDED = "17rem";

/** Tailwind classes for main content offset (desktop). */
export function sidebarMainMarginClass(collapsed: boolean): string {
  return collapsed ? "md:ml-[3.25rem]" : "md:ml-[17rem]";
}
