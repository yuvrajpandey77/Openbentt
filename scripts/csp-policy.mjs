/**
 * Canonical Content-Security-Policy for Openbentt (Phase 1 security foundation).
 *
 * Single source of truth consumed by:
 * - vite.config.ts (`openbenttCspPlugin`, build-time `<meta http-equiv>` injection → web + Electron dist)
 * - docker/nginx-docker.conf (`Content-Security-Policy` response header)
 * - scripts/check-csp-artifacts.mjs (artifact verification; fails the build if CSP drifts)
 *
 * The policy is derived from the actual runtime — see the per-directive evidence notes.
 * Do NOT weaken a directive to make a test pass; update the evidence note instead.
 */

/**
 * Ordered CSP directives. `frame-ancestors` is ignored inside `<meta>` tags but is
 * enforced when the same string is served as an HTTP header (nginx). Keeping it in
 * the shared string is intentional and harmless for `<meta>`.
 */
export const CSP_DIRECTIVES = [
  // App shell, bundled JS/CSS, fonts, manifest, WASM assets — all same-origin.
  "default-src 'self'",
  // Vite emits zero inline scripts (verified dist/index.html: one module script + preloads).
  // 'wasm-unsafe-eval' (NOT 'unsafe-eval') allows WebAssembly.compile for the two WASM
  // runtimes — onnxruntime-web (Transformers.js local inference/embeddings) and
  // texlyre-busytex (in-browser LaTeX) — without permitting JS eval().
  // https://va.vercel-scripts.com is the @vercel/analytics runtime loader, injected only
  // when the user explicitly opts into analytics (PrivacyAnalytics returns null otherwise).
  "script-src 'self' 'wasm-unsafe-eval' https://va.vercel-scripts.com",
  // 'unsafe-inline' is required: shadcn chart theme blocks inject <style> at runtime
  // (src/components/ui/chart.tsx:78 ChartStyle), KaTeX emits styled spans, and Radix
  // primitives inject positioning styles. fonts.googleapis.com serves the @import in
  // src/index.css:1 (Plus Jakarta Sans + JetBrains Mono).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // KaTeX + bundled fonts are same-origin/data:; Google font binaries come from gstatic.
  "font-src 'self' data: https://fonts.gstatic.com",
  // Attachments render as data:/blob: URLs; markdown/OG art may be remote https:.
  "img-src 'self' data: blob: https:",
  // Audio/video attachments render as data:/blob: URLs.
  "media-src 'self' blob: data:",
  // 'self' + loopback cover llama-server/Ollama/research-proxy/latex dev servers
  // (http://127.0.0.1:*, http://localhost:* — wildcard ports are valid CSP).
  // Bare `https:` is deliberate: this is a BYOK client and Settings explicitly invites
  // arbitrary user-configured OpenAI-compatible HTTPS bases (SettingsPanel placeholder
  // "https://api.x.ai/v1 …"). Provider keys are only ever sent to user-configured URLs;
  // script-src stays strict so exfiltration still requires user action. Enumerated
  // first-party hosts (openrouter.ai, api.openai.com, api.anthropic.com,
  // generativelanguage.googleapis.com, huggingface.co, wikipedia, semanticscholar,
  // r.jina.ai, brave, zotero, crossref, github) are all covered by `https:`.
  "connect-src 'self' https: http://127.0.0.1:* http://localhost:*",
  // pdf.js worker (bundled file), research embedding worker (bundled), and
  // onnxruntime blob workers.
  "worker-src 'self' blob:",
  // No iframes, plugins, or frames are used anywhere in src/ (verified).
  "child-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // SetupPage/Settings forms use JS onSubmit handlers only (no cross-origin posts).
  "form-action 'self'",
  // The app is never designed to be embedded (X-Frame-Options: SAMEORIGIN already set
  // in nginx). Header-only enforcement; ignored inside <meta> by spec.
  "frame-ancestors 'none'",
];

/** Single-line policy string shared by meta tag and HTTP header. */
export const CSP_POLICY = CSP_DIRECTIVES.join("; ");

/**
 * Directives that are meaningless inside `<meta http-equiv>` (spec: only
 * frame-ancestors and sandbox/report-uri are meta-ignored). Stripped from the
 * meta tag to avoid console noise; still enforced via the nginx header.
 */
const META_IGNORED_PREFIXES = ["frame-ancestors"];

/** Full `<meta http-equiv>` tag injected into built index.html. */
export function buildCspMetaTag() {
  const metaDirectives = CSP_DIRECTIVES.filter(
    (d) => !META_IGNORED_PREFIXES.some((p) => d === p || d.startsWith(`${p} `))
  );
  return `<meta http-equiv="Content-Security-Policy" content="${metaDirectives.join("; ")}" />`;
}
