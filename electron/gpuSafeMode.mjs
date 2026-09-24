/** GPU is always available via software rendering — no safe mode needed. */
export function getGpuSafeMode() {
  return { enabled: false, reason: null };
}
export function resolveGpuSafeMode() {
  return { enabled: false, reason: null };
}
