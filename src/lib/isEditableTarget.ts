/** True when the event target is typing in an editor field (incl. CodeMirror). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return true;
  if (target.isContentEditable) return true;
  if (target.closest(".cm-editor, [contenteditable='true'], [role='textbox']")) return true;
  return false;
}
