/**
 * Client-side SEO helpers for SPA marketing routes.
 * Complements build-time tags injected by `openbenttSeoPlugin` in vite.config.ts.
 */

export type PageSeoInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noindex?: boolean;
};

const SITE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PUBLIC_SITE_URL?.trim().replace(/\/$/, "")) ||
  "https://openbentt.cogerphere.com";

function ensureMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function ensureLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Apply title + description + Open Graph/Twitter for the current route. */
export function applyPageSeo({ title, description, path = "/", image, noindex = false }: PageSeoInput) {
  const url = `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
  const ogImage = image || `${SITE}/openbentt-og.svg`;

  document.title = title;
  ensureMeta("name", "description", description);
  ensureMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
  ensureLink("canonical", url);

  ensureMeta("property", "og:type", "website");
  ensureMeta("property", "og:site_name", "Openbentt");
  ensureMeta("property", "og:locale", "en_US");
  ensureMeta("property", "og:title", title);
  ensureMeta("property", "og:description", description);
  ensureMeta("property", "og:url", url);
  ensureMeta("property", "og:image", ogImage);
  ensureMeta("property", "og:image:alt", "Openbentt — write papers, run agents & local models");

  ensureMeta("name", "twitter:card", "summary_large_image");
  ensureMeta("name", "twitter:title", title);
  ensureMeta("name", "twitter:description", description);
  ensureMeta("name", "twitter:image", ogImage);
}

export const marketingSeo = {
  home: {
    title: "Openbentt | write papers, run agents & local models",
    description:
      "Desktop-first, local-first AI research workspace. Notebook with live PDF, Paper Orchestra, agents, and offline GGUF — Windows, macOS, and Linux.",
    path: "/",
  },
  download: {
    title: "Download Openbentt — Windows, macOS, Linux AppImage & deb",
    description:
      "Download Openbentt for Windows, macOS, and Linux (AppImage and Debian). Local-first desktop lab for LaTeX, agents, and offline models.",
    path: "/download",
  },
  news: {
    title: "News & releases — Openbentt",
    description:
      "Openbentt release notes and product updates — Notebook, Paper Orchestra, agents, and desktop installers.",
    path: "/news",
  },
} as const;
