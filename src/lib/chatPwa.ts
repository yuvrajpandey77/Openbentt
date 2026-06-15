const MANIFEST_LINK_ID = "openbentt-chat-manifest";
const SW_URL = "/sw.js";

const CHAT_PWA_ALLOWED = ["/chat", "/setup", "/share"] as const;

function ensureMeta(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

/** True when launched from home screen / installed PWA. */
export function isChatPwaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isChatPwaAllowedPath(pathname: string): boolean {
  return CHAT_PWA_ALLOWED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Installed chat app: only /chat (and /setup, /share). Redirect marketing routes. */
export function enforceChatPwaEntry(pathname = window.location.pathname): boolean {
  if (!isChatPwaStandalone()) return false;
  if (isChatPwaAllowedPath(pathname)) return false;
  const target = `/chat${window.location.search}${window.location.hash}`;
  window.location.replace(target);
  return true;
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function removeSiteManifestLink(): void {
  document.querySelectorAll('link[rel="manifest"]').forEach((el) => {
    if (el.id !== MANIFEST_LINK_ID) el.remove();
  });
}

/** Point this tab at the chat-scoped web manifest (installable /chat app). */
export function linkChatWebManifest(): void {
  removeSiteManifestLink();
  let link = document.querySelector<HTMLLinkElement>(`link#${MANIFEST_LINK_ID}`);
  if (!link) {
    link = document.createElement("link");
    link.id = MANIFEST_LINK_ID;
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = "/chat.webmanifest";

  ensureMeta("apple-mobile-web-app-capable", "yes");
  ensureMeta("apple-mobile-web-app-title", "Obent Chat");
  ensureMeta("mobile-web-app-capable", "yes");
  ensureMeta("theme-color", "#0080cc");
}

export function unlinkChatWebManifest(): void {
  document.querySelector(`link#${MANIFEST_LINK_ID}`)?.remove();
}

export async function registerChatServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (err) {
    console.warn("[Openbentt] chat service worker registration failed", err);
    return null;
  }
}

export async function unregisterChatServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg?.active?.scriptURL?.includes("sw.js")) {
    await reg.unregister();
  }
}

/** Wire manifest + service worker for /chat installability. */
export async function enableChatPwa(): Promise<void> {
  linkChatWebManifest();
  await registerChatServiceWorker();
}

export async function disableChatPwa(): Promise<void> {
  unlinkChatWebManifest();
  await unregisterChatServiceWorker();
}
