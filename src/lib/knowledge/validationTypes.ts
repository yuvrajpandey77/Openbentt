/** Structural input for SourceRef validation (avoids importing document types into node stores). */
export interface SourceRefInput {
  documentId: string;
  documentVersionId?: string;
  page?: number;
  section?: string;
  block?: string;
  chunkId?: string;
  sourceType?: string;
  sourceUri?: string;
  title?: string;
}
