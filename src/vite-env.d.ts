/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RESEARCH_PROXY_URL?: string;
  /** HTTPS URL of POST endpoint that accepts raw .tex (text/plain) and returns application/pdf */
  readonly VITE_LATEX_COMPILE_URL?: string;
  /** Set to "1" to skip client WASM and use HTTP compile only */
  readonly VITE_LATEX_REMOTE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
