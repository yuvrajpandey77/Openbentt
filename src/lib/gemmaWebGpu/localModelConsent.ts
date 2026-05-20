const CONSENT_KEY = "openbentt-local-weights-consent-v1";

/** User has confirmed they want Hugging Face weights cached on this device. */
export function getLocalWeightsConsent(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLocalWeightsConsent(allowed: boolean): void {
  try {
    if (allowed) localStorage.setItem(CONSENT_KEY, "1");
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* quota / private mode */
  }
}
