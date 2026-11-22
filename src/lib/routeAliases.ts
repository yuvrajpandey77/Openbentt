/**
 * Legacy / mistaken paths → real destinations.
 * Used by NotFound and optional <Navigate> aliases.
 */
export const ROUTE_ALIASES: Record<string, string> = {
  "/voice": "/agent",
  "/scheduled": "/tasks",
  "/research": "/labs",
  "/library": "/labs",
  "/editor": "/notebook",
  "/compile": "/notebook",
  "/terminal": "/diagnostics",
  "/search": "/labs",
  "/help": "/settings",
  "/account": "/settings",
  "/integrations": "/setup",
  "/models": "/settings",
  "/computer": "/diagnostics",
};

export function resolveRouteAlias(pathname: string): string | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_ALIASES[clean] ?? null;
}
