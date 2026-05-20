export type ConnectivityListener = (online: boolean) => void;

/** Subscribe to browser online/offline events. Returns unsubscribe. */
export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onOnline = () => listener(true);
  const onOffline = () => listener(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  listener(navigator.onLine);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

export function isNavigatorOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
