/**
 * Bombadil property-based browser QA for Openbentt.
 * Docs: https://antithesishq.github.io/bombadil/browser/2.1-installation.html
 *
 * The npm package exports TypeScript types only; Bombadil injects the runtime
 * when it loads this module. Prefer re-exporting defaults plus thin properties.
 */
import { always, extract } from "@antithesishq/bombadil/browser";

export * from "@antithesishq/bombadil/browser/defaults";

const rootMounted = extract((state: { document: Document }) => {
  const root = state.document.getElementById("root");
  return Boolean(root && root.childElementCount > 0);
});

const documentTitle = extract((state: { document: Document }) => state.document.title ?? "");

/** SPA root stays hydrated while exploring. */
export const app_root_is_mounted = always(() => rootMounted.current === true);

/** Once a title is set, it should stay product-branded or route-named. */
export const title_stays_sensible = always(() => {
  const t = String(documentTitle.current || "").toLowerCase();
  if (!t.trim()) return true;
  return (
    t.includes("openbentt") ||
    t.includes("settings") ||
    t.includes("notebook") ||
    t.includes("projects") ||
    t.includes("download") ||
    t.includes("setup") ||
    t.includes("agent")
  );
});
