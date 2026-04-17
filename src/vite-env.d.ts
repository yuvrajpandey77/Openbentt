/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_RESEARCH_PROXY_URL?: string;
  /** HTTPS URL of POST endpoint that accepts raw .tex (text/plain) and returns application/pdf */
  readonly VITE_LATEX_COMPILE_URL?: string;
  /** Set to "1" to skip client WASM and use HTTP compile only */
  readonly VITE_LATEX_REMOTE?: string;
  /** `owner/repo` for GitHub Releases + docs links on /download */
  readonly VITE_GITHUB_REPO?: string;
  /** Version string inside published asset names (e.g. 2.0.2 in Openbentt-2.0.2.AppImage) */
  readonly VITE_DESKTOP_ASSET_VERSION?: string;
  /** Injected from package.json in vite.config (semver for release asset filenames). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
