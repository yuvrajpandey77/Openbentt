/** Caps for notebook chat context cable connections. */
export const CONNECTION_CAPS = {
  maxTexFileKeys: 50,
  maxPdfPaperIds: 10,
} as const;

export function canAddTexConnection(currentCount: number): boolean {
  return currentCount < CONNECTION_CAPS.maxTexFileKeys;
}

export function canAddPdfConnection(currentCount: number): boolean {
  return currentCount < CONNECTION_CAPS.maxPdfPaperIds;
}
