import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Plugin } from "vite";
import { componentTagger } from "lovable-tagger";

/** Injects canonical, OG/Twitter, theme-color, robots, manifest, JSON-LD. Set VITE_PUBLIC_SITE_URL for absolute social URLs. */
function openbenttSeoPlugin(): Plugin {
  return {
    name: "openbentt-seo-head",
    transformIndexHtml(html) {
      const site = (process.env.VITE_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
      const canonical = site ? `${site}/` : "/";
      const ogImage = site ? `${site}/openbentt-og.svg` : "/openbentt-og.svg";
      const ogDesc =
        "Local-first OpenRouter chat: multi-model comparison, research workspaces, Notebook LaTeX/PDF. Your API key stays in the browser.";
      const lines = [
        `    <link rel="canonical" href="${canonical}" />`,
        `    <meta name="theme-color" content="#0d9488" />`,
        `    <meta name="robots" content="index, follow, max-image-preview:large" />`,
        `    <link rel="manifest" href="/site.webmanifest" />`,
        `    <meta name="application-name" content="Openbentt" />`,
        `    <meta property="og:type" content="website" />`,
        `    <meta property="og:title" content="Openbentt — OpenRouter chat &amp; multi-model workspaces" />`,
        `    <meta property="og:description" content="${ogDesc.replace(/"/g, "&quot;")}" />`,
        `    <meta property="og:image" content="${ogImage}" />`,
        `    <meta property="og:image:width" content="1200" />`,
        `    <meta property="og:image:height" content="630" />`,
        `    <meta property="og:image:alt" content="Openbentt — local-first OpenRouter client" />`,
        `    <meta property="og:site_name" content="Openbentt" />`,
        `    <meta property="og:locale" content="en_US" />`,
        `    <meta name="twitter:card" content="summary_large_image" />`,
        `    <meta name="twitter:title" content="Openbentt — OpenRouter chat &amp; multi-model workspaces" />`,
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
          "Local-first browser client for OpenRouter: multi-model comparison, research workspaces, Notebook LaTeX/PDF.",
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
  server: {
    host: "::",
    port: 8080,
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
      "@xenova/transformers",
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
}));
