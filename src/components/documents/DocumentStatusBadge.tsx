import type { DocumentStatus } from "@/lib/documents/types";
import { userMessageForCode, type DocumentErrorCode } from "@/lib/documents/limits";

const LABELS: Record<DocumentStatus, string> = {
  queued: "Queued",
  validating: "Validating",
  extracting: "Extracting",
  normalizing: "Normalizing",
  structuring: "Structuring",
  chunking: "Chunking",
  indexing: "Indexing",
  ready: "Ready",
  "needs-ocr": "Needs OCR",
  unsupported: "Unsupported",
  failed: "Failed",
};

export function DocumentStatusBadge({
  status,
  errorCode,
}: {
  status: DocumentStatus;
  errorCode?: string;
}) {
  const code = errorCode as DocumentErrorCode | undefined;
  return (
    <span role="status" aria-label={`Document status: ${LABELS[status]}`} tabIndex={0}
      className="inline-flex items-center rounded border px-2 py-0.5 text-xs">
      {LABELS[status]}
      {status === "failed" && code ? (
        <span className="ml-1 opacity-80" title={userMessageForCode(code)}>— {userMessageForCode(code)}</span>
      ) : null}
    </span>
  );
}
