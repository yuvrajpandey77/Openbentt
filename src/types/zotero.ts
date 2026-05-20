/** Zotero integration types — shared between renderer and tests. */

export type ZoteroConnectionMode = "disconnected" | "local" | "web" | "better-bibtex";

export type ZoteroSyncPhase =
  | "idle"
  | "detecting"
  | "fetching"
  | "merging"
  | "watching"
  | "complete"
  | "error";

export interface ZoteroLocalInstall {
  found: boolean;
  dataDir?: string;
  profileDir?: string;
  sqlitePath?: string;
  storageDir?: string;
  platform: string;
}

export interface ZoteroBetterBibTeXInfo {
  detected: boolean;
  autoExportPath?: string;
  watching: boolean;
  citekeyField: "citationKey" | "key";
}

export interface ZoteroCollection {
  key: string;
  name: string;
  parentCollection?: string;
  itemCount: number;
}

export interface ZoteroTag {
  tag: string;
  type?: number;
}

export interface ZoteroNote {
  key: string;
  parentItemKey: string;
  note: string;
  dateModified: string;
}

export interface ZoteroAttachment {
  key: string;
  parentItemKey: string;
  title: string;
  contentType?: string;
  path?: string;
  linkMode?: string;
  hasPdf: boolean;
}

export interface ZoteroAnnotation {
  key: string;
  parentItemKey: string;
  parentAttachmentKey?: string;
  annotationType: "highlight" | "note" | "image" | "ink" | "unknown";
  text?: string;
  comment?: string;
  pageLabel?: string;
  color?: string;
  dateModified: string;
  /** Provenance label shown in UI */
  source: "zotero-web" | "zotero-local" | "better-bibtex";
}

export interface ZoteroItem {
  key: string;
  itemType: string;
  title: string;
  creators: string;
  year?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  tags: string[];
  collectionKeys: string[];
  citekey: string;
  bibtexRaw?: string;
  dateModified: string;
  hasPdf: boolean;
  attachmentKeys: string[];
  noteKeys: string[];
  annotationKeys: string[];
}

export interface ZoteroLibrarySnapshot {
  syncedAt: string;
  mode: ZoteroConnectionMode;
  userId?: string;
  libraryVersion?: number;
  itemCount: number;
  collections: ZoteroCollection[];
  tags: ZoteroTag[];
  items: ZoteroItem[];
  notes: ZoteroNote[];
  attachments: ZoteroAttachment[];
  annotations: ZoteroAnnotation[];
  bibliography: string;
  warnings: string[];
}

export interface ZoteroSyncConflict {
  citekey: string;
  field: "bibtex" | "metadata" | "citekey";
  localValue: string;
  remoteValue: string;
  resolution: "keep-local" | "keep-remote" | "unresolved";
}

export interface ZoteroSyncProgress {
  phase: ZoteroSyncPhase;
  message: string;
  current?: number;
  total?: number;
  percent?: number;
}

export interface ZoteroSyncResult {
  ok: boolean;
  partial: boolean;
  snapshot?: ZoteroLibrarySnapshot;
  conflicts: ZoteroSyncConflict[];
  bibliography?: string;
  warnings: string[];
  error?: string;
}

export interface ZoteroConnectionStatus {
  mode: ZoteroConnectionMode;
  connected: boolean;
  userId?: string;
  userName?: string;
  local: ZoteroLocalInstall;
  betterBibTeX: ZoteroBetterBibTeXInfo;
  lastSyncAt?: string;
  lastError?: string;
  syncing: boolean;
  progress?: ZoteroSyncProgress;
}

export interface ZoteroCredentials {
  userId: string;
  apiKey: string;
}

export interface ZoteroCitationRecommendation {
  citekey: string;
  title: string;
  score: number;
  reason: string;
  collections: string[];
  tags: string[];
  provenance: string;
}

export interface ZoteroAnnotationHit {
  annotation: ZoteroAnnotation;
  itemTitle: string;
  citekey: string;
  score: number;
  snippet: string;
}
