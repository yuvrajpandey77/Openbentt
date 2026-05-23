/** Whether opening a PDF should replace the editable Source buffer (legacy tabs mode only). */
export function shouldReplaceEditorSourceOnPdfLoad(
  layoutMode: "tabs" | "studio",
  replaceSource?: boolean
): boolean {
  if (layoutMode === "studio") return false;
  return replaceSource !== false;
}
