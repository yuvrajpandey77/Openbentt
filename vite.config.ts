import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Plugin } from "vite";
import { componentTagger } from "lovable-tagger";
import { buildCspMetaTag } from "./scripts/csp-policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf-8")) as { version: string };

/** Injects canonical, OG/Twitter, theme-color, robots, manifest, JSON-LD. Set VITE_PUBLIC_SITE_URL for absolute social URLs. */
function openbenttSeoPlugin(): Plugin {
  return {
    name: "openbentt-seo-head",
    transformIndexHtml(html) {
      const site = (
        process.env.VITE_PUBLIC_SITE_URL ||
        "https://openbentt.cogerphere.com"
      )
        .trim()
        .replace(/\/$/, "");
      const canonical = `${site}/`;
      const ogImage = `${site}/openbentt-og.svg`;
      const ogTitle = "Openbentt | write papers, run agents & local models";
      const ogDesc =
        "Desktop-first, local-first AI research workspace. Notebook with live PDF, Paper Orchestra, agents, and offline GGUF — Windows, macOS, and Linux.";
      const esc = (s: string) => s.replace(/"/g, "&quot;");
      const lines = [
        `    <link rel="canonical" href="${canonical}" />`,
        `    <link rel="manifest" href="/site.webmanifest" />`,
        `    <link rel="apple-touch-icon" href="/openbentt-logo.svg" />`,
        `    <meta name="theme-color" content="#facc15" />`,
        `    <meta name="color-scheme" content="dark light" />`,
        `    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />`,
        `    <meta name="application-name" content="Openbentt" />`,
        `    <meta name="keywords" content="Openbentt, LaTeX, Notebook, Paper Orchestra, local LLM, GGUF, research workspace, desktop AI, BusyTeX" />`,
        `    <meta property="og:type" content="website" />`,
        `    <meta property="og:url" content="${canonical}" />`,
        `    <meta property="og:title" content="${esc(ogTitle)}" />`,
        `    <meta property="og:description" content="${esc(ogDesc)}" />`,
        `    <meta property="og:image" content="${ogImage}" />`,
        `    <meta property="og:image:width" content="1200" />`,
        `    <meta property="og:image:height" content="630" />`,
        `    <meta property="og:image:alt" content="Openbentt — write papers, run agents and local models" />`,
        `    <meta property="og:site_name" content="Openbentt" />`,
        `    <meta property="og:locale" content="en_US" />`,
        `    <meta name="twitter:card" content="summary_large_image" />`,
        `    <meta name="twitter:title" content="${esc(ogTitle)}" />`,
        `    <meta name="twitter:description" content="${esc(ogDesc)}" />`,
        `    <meta name="twitter:image" content="${ogImage}" />`,
      ];
      const software = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Openbentt",
        applicationCategory: "ProductivityApplication",
        applicationSubCategory: "ResearchSoftware",
        operatingSystem: "Windows, macOS, Linux",
        description: ogDesc,
        url: `${site}/`,
        downloadUrl: `${site}/download`,
        image: ogImage,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        isAccessibleForFree: true,
        author: {
          "@type": "Organization",
          name: "Cogerphere",
          url: "https://cogerphere.com",
        },
      };
      const website = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Openbentt",
        url: `${site}/`,
        description: ogDesc,
        publisher: { "@type": "Organization", name: "Cogerphere", url: "https://cogerphere.com" },
        potentialAction: {
          "@type": "ReadAction",
          target: `${site}/download`,
        },
      };
      lines.push(
        `    <script type="application/ld+json">${JSON.stringify(software).replace(/</g, "\\u003c")}</script>`,
        `    <script type="application/ld+json">${JSON.stringify(website).replace(/</g, "\\u003c")}</script>`
      );
      return html.replace("</head>", `${lines.join("\n")}\n  </head>`);
    },
  };
}

/**
 * Injects the canonical Content-Security-Policy (`scripts/csp-policy.mjs`) as a
 * `<meta http-equiv>` tag into **built** index.html only (web dist + Electron dist).
 * Skipped on the dev server: Vite HMR requires ws:/inline-eval that the production
 * policy intentionally forbids. Dev remains localhost-only by default.
 */
function openbenttCspPlugin(): Plugin {
  return {
    name: "openbentt-csp",
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      if (html.includes("http-equiv=\"Content-Security-Policy\"")) return html;
      return html.replace("</head>", `    ${buildCspMetaTag()}\n  </head>`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    /** Synced from package.json so /download asset names match electron-builder output without duplicating the version. */
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    proxy: {
      // Notebook: `npm run latex-compile` (pdflatex) — POST /compile
      "/api/latex-compile": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
        rewrite: () => "/compile",
      },
    },
  },
  preview: {
    proxy: {
      "/api/latex-compile": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
        rewrite: () => "/compile",
      },
    },
  },
  plugins: [
    react(),
    openbenttSeoPlugin(),
    openbenttCspPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "citation-js/plugin-bibtex": path.resolve(
        __dirname,
        "node_modules/@citation-js/plugin-bibtex/lib/index.js"
      ),
      "citation-js/plugin-csl": path.resolve(
        __dirname,
        "node_modules/@citation-js/plugin-csl/lib/index.js"
      ),
    },
  },
  optimizeDeps: {
    include: [
      "texlyre-busytex",
      "mathjs",
      "pdfjs-dist",
      "katex",
      "lz-string",
      "html-to-image",
      "jspdf",
      "html2canvas",
      "@google/generative-ai",
      "@huggingface/transformers",
      "@xenova/transformers",
    ],
  },
  worker: {
    format: "es",
  },
  build: {
    chunkSizeWarningLimit: 1800,
    /**
     * Vite otherwise injects <link rel=modulepreload> for every direct dynamic
     * import of the entry chunk. In the Electron app (local app:// files) that
     * fetches mathjs/pdf.js/chart code before the user needs them. Dynamic
     * imports still load on demand; the preload helper is simply disabled.
     */
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // Keep React/scheduler in one chunk. Otherwise Rollup duplicates its
          // helpers into feature chunks, making the entry statically import
          // (and modulepreload) heavy chunks like recharts and mathjs.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("node_modules/react-is/")
          ) {
            return "react-vendor";
          }
          if (id.includes("@huggingface/transformers") || id.includes("@xenova/transformers") || id.includes("onnxruntime"))
            return "transformers";
          if (id.includes("texlyre-busytex") || id.includes("busytex")) return "busytex";
          if (id.includes("pdfjs-dist")) return "pdfjs";
          if (id.includes("katex")) return "katex";
          if (id.includes("recharts")) return "recharts";
          if (id.includes("mathjs")) return "mathjs";
          if (id.includes("react-markdown") || id.includes("remark-") || id.includes("micromark")) return "markdown";
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("cmdk")) return "ui-vendor";
          if (id.includes("@a2ui/")) return "a2ui";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.integration.test.ts",
      "src/**/*.stress.test.ts",
      "test/**/*.test.ts",
    ],
    globals: false,
    testTimeout: 30_000,
  },
}));
