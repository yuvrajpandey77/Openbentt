import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Plugin } from "vite";
import { componentTagger } from "lovable-tagger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf-8")) as { version: string };

/** Injects canonical, OG/Twitter, theme-color, robots, manifest, JSON-LD. Set VITE_PUBLIC_SITE_URL for absolute social URLs. */
function openbenttSeoPlugin(): Plugin {
  return {
    name: "openbentt-seo-head",
    transformIndexHtml(html) {
      const site = (process.env.VITE_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
      const canonical = site ? `${site}/` : "/";
      const ogImage = site ? `${site}/openbentt-og.svg` : "/openbentt-og.svg";
      const ogDesc =
        "Openbentt is a local-first workspace for multi-model chat, research threads, and Notebook LaTeX or PDF workflows. Your API keys stay in the browser.";
      const lines = [
        `    <link rel="canonical" href="${canonical}" />`,
        `    <meta name="theme-color" content="#6C5CE7" />`,
        `    <meta name="robots" content="index, follow, max-image-preview:large" />`,
        `    <meta name="application-name" content="Openbentt" />`,
        `    <meta property="og:type" content="website" />`,
        `    <meta property="og:title" content="Openbentt · AI workspace for chat, research, and documents" />`,
        `    <meta property="og:description" content="${ogDesc.replace(/"/g, "&quot;")}" />`,
        `    <meta property="og:image" content="${ogImage}" />`,
        `    <meta property="og:image:width" content="1200" />`,
        `    <meta property="og:image:height" content="630" />`,
        `    <meta property="og:image:alt" content="Openbentt workspace" />`,
        `    <meta property="og:site_name" content="Openbentt" />`,
        `    <meta property="og:locale" content="en_US" />`,
        `    <meta name="twitter:card" content="summary_large_image" />`,
        `    <meta name="twitter:title" content="Openbentt · AI workspace for chat, research, and documents" />`,
        `    <meta name="twitter:description" content="${ogDesc.replace(/"/g, "&quot;")}" />`,
        `    <meta name="twitter:image" content="${ogImage}" />`,
      ];
      if (site) {
        lines.push(`    <meta property="og:url" content="${canonical}" />`);
      }
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Openbentt",
        description:
          "Local-first workspace for multi-model chat, research, and Notebook LaTeX or PDF workflows.",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript. Modern evergreen browser recommended.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        isAccessibleForFree: true,
      } as Record<string, unknown>;
      if (site) {
        jsonLd.url = `${site}/`;
      }
      lines.push(
        `    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`
      );
      return html.replace("</head>", `${lines.join("\n")}\n  </head>`);
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
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@huggingface/transformers") || id.includes("@xenova/transformers") || id.includes("onnxruntime"))
            return "transformers";
          if (id.includes("texlyre-busytex") || id.includes("busytex")) return "busytex";
          if (id.includes("pdfjs-dist")) return "pdfjs";
          if (id.includes("katex")) return "katex";
          if (id.includes("recharts")) return "recharts";
          if (id.includes("mathjs")) return "mathjs";
          if (id.includes("react-markdown") || id.includes("remark-") || id.includes("micromark")) return "markdown";
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("cmdk")) return "ui-vendor";
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
