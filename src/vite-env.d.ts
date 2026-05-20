/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_RESEARCH_PROXY_URL?: string;
  /** HTTPS URL of POST endpoint that accepts raw .tex (text/plain) and returns application/pdf */
  readonly VITE_LATEX_COMPILE_URL?: string;
  /** Set to "1" to skip client WASM and use HTTP compile only */
  readonly VITE_LATEX_REMOTE?: string;
  /** Optional `owner/repo` for GitHub Releases (defaults to the public upstream if unset) */
  readonly VITE_GITHUB_REPO?: string;
  /** Version string inside published asset names (e.g. 2.0.2 in Openbentt-2.0.2.AppImage) */
  readonly VITE_DESKTOP_ASSET_VERSION?: string;
  /** Injected from package.json in vite.config (semver for release asset filenames). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Exposed from `electron/preload.cjs` in the desktop shell only. */
interface OpenbenttDesktopApi {
  readonly isElectron: boolean;
  readonly platform: string;
}

interface Window {
  readonly openbenttDesktop?: OpenbenttDesktopApi;
  readonly openbenttLocalGguf?: import("@/lib/localGguf/desktopApi").OpenbenttLocalGgufApi;
}

/** WebGPU (Chrome / Edge / Electron); optional until DOM lib catches up. */
interface Navigator {
  readonly gpu?: GPU;
}
