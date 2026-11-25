/**
 * Shared sidebar dimensions — Sidebar width MUST match AppLayout main margin.
 * Mismatch (e.g. 260px rail vs 240px/15rem margin) buries notebook explorer UI.
 */
export const SIDEBAR_WIDTH_EXPANDED_PX = 272;
export const SIDEBAR_WIDTH_COLLAPSED_PX = 64;
export const RIGHT_SIDEBAR_WIDTH_PX = 320;

/** Tailwind width classes for the fixed left nav. */
export function sidebarWidthClass(collapsed: boolean): string {
  return collapsed ? "w-[64px]" : "w-[272px]";
}

/** Tailwind classes for main content offset (desktop). */
export function sidebarMainMarginClass(collapsed: boolean): string {
  return collapsed ? "md:ml-[64px]" : "md:ml-[272px]";
}

/** Right inspector inset when open. */
export function rightSidebarMainMarginClass(open: boolean): string {
  return open ? "md:mr-[320px]" : "md:mr-0";
}
