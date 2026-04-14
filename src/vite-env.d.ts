/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RESEARCH_PROXY_URL?: string;
  /** HTTPS URL of POST endpoint that accepts raw .tex (text/plain) and returns application/pdf */
  readonly VITE_LATEX_COMPILE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
