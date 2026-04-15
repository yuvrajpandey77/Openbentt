import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
    mode === 'development' &&
    componentTagger(),
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
