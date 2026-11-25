/**
 * Notebook startup instrumentation (Phase C).
 *
 * This module records `performance.mark()` entries for the real Notebook code
 * paths and mirrors them into a small collector on `window`, so a CDP client
 * can read a structured breakdown with one evaluate call:
 *
 *   window.__openbenttNotebookMarks.getBreakdown()
 *   window.__openbenttNotebookMarks.navigationInitiated()  // sidebar click hook
 *
 * Native mark names are `openbentt.notebook.<key>`; the collector keys use the
 * stable human-readable names below. Instrumentation is idempotent and cheap:
 * it never changes application control flow or waits for work to finish.
 *
 * Two marks are *outbound hooks* for code outside this batch:
 *   - navigationInitiated: wire into the sidebar click handler (AppLayout).
 *   - projectLoadingStarted / databaseResponseReceived: wire into the project
 *     context around loadResearchProject() (ResearchProjectContext).
 * Route mount is emitted unconditionally by NotebookPdfWorkspace as the
 * authoritative fallback when no sidebar hook exists.
 */

export const NOTEBOOK_MARK_NAMES = {
  navigationInitiated: "navigation initiated",
  routeMounted: "route mounted",
  projectLoadingStarted: "project loading started",
  databaseResponseReceived: "database response received",
  projectDataHydrated: "project data hydrated",
  editorInitialized: "editor initialized",
  pdfJsLoaded: "PDF.js loaded",
  pdfDocumentOpened: "PDF document opened",
  firstPageRendered: "first page rendered",
  firstMeaningfulNotebookContentDisplayed: "first meaningful notebook content displayed",
  notebookInteractive: "notebook interactive",
} as const;

export type NotebookMarkKey = keyof typeof NOTEBOOK_MARK_NAMES;
export type NotebookMarkName = (typeof NOTEBOOK_MARK_NAMES)[NotebookMarkKey];

/** Canonical timeline order. Missing/optional marks are reported as null. */
export const NOTEBOOK_MARK_ORDER: NotebookMarkKey[] = [
  "navigationInitiated",
  "routeMounted",
  "projectLoadingStarted",
  "databaseResponseReceived",
  "projectDataHydrated",
  "editorInitialized",
  "pdfJsLoaded",
  "pdfDocumentOpened",
  "firstPageRendered",
  "firstMeaningfulNotebookContentDisplayed",
  "notebookInteractive",
];

export type NotebookMarkDetail = Record<string, string | number | boolean | null | undefined>;

export type NotebookMarkEntry = {
  key: NotebookMarkKey;
  name: NotebookMarkName;
  /** performance.now()-based, relative to the renderer's time origin. */
  startTimeMs: number;
  detail?: NotebookMarkDetail;
};

export type NotebookPhase = {
  name: NotebookMarkName;
  present: boolean;
  startTimeMs: number | null;
  /** Delta from the previous *emitted* mark in time order (never negative). */
  sincePreviousMs: number | null;
  /** Delta from the first emitted mark in this session. */
  sinceFirstMs: number | null;
  detail?: NotebookMarkDetail;
};

export type NotebookSegment = {
  key: string;
  from: NotebookMarkName;
  to: NotebookMarkName;
  durationMs: number | null;
  /** PDF segments are expected to be absent when no PDF is opened. */
  optional: boolean;
};

export type NotebookPerfBreakdown = {
  schema: "openbentt.notebook.performance.v1";
  capturedAt: string;
  /** Epoch milliseconds of performance.timeOrigin, for cross-process alignment. */
  timeOriginEpochMs: number;
  markCount: number;
  /** Time-ordered marks actually emitted in this session. */
  marks: NotebookMarkEntry[];
  phases: NotebookPhase[];
  segments: NotebookSegment[];
  missingMarks: NotebookMarkName[];
  /**
   * Marks omitted along valid paths (e.g. no PDF opened, navigation hook not
   * wired yet). Keep these distinct from a slow/failed phase.
   */
  notes: string[];
};

type SegmentSpec = {
  key: string;
  from: NotebookMarkKey;
  to: NotebookMarkKey;
  optional?: boolean;
};

const SEGMENTS: SegmentSpec[] = [
  { key: "navigationToRouteMount", from: "navigationInitiated", to: "routeMounted" },
  { key: "databaseRoundTrip", from: "projectLoadingStarted", to: "databaseResponseReceived" },
  { key: "databaseResponseToHydrated", from: "databaseResponseReceived", to: "projectDataHydrated" },
  { key: "routeMountToHydrated", from: "routeMounted", to: "projectDataHydrated" },
  { key: "hydratedToEditor", from: "projectDataHydrated", to: "editorInitialized" },
  { key: "pdfJsLoad", from: "editorInitialized", to: "pdfJsLoaded", optional: true },
  { key: "pdfDocumentOpen", from: "pdfJsLoaded", to: "pdfDocumentOpened", optional: true },
  { key: "firstPageRender", from: "pdfDocumentOpened", to: "firstPageRendered", optional: true },
  { key: "pageToContent", from: "firstPageRendered", to: "firstMeaningfulNotebookContentDisplayed", optional: true },
  { key: "contentToInteractive", from: "firstMeaningfulNotebookContentDisplayed", to: "notebookInteractive" },
  { key: "navigationToInteractive", from: "navigationInitiated", to: "notebookInteractive" },
  { key: "routeMountToInteractive", from: "routeMounted", to: "notebookInteractive" },
];

const NATIVE_PREFIX = "openbentt.notebook.";
const GLOBAL_KEY = "__openbenttNotebookMarks";
const KEY_BY_NAME = new Map<string, NotebookMarkKey>(
  NOTEBOOK_MARK_ORDER.map((key) => [NOTEBOOK_MARK_NAMES[key], key])
);

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveKey(input: NotebookMarkKey | NotebookMarkName): NotebookMarkKey | null {
  if (input in NOTEBOOK_MARK_NAMES) return input as NotebookMarkKey;
  return KEY_BY_NAME.get(input as string) ?? null;
}

function safeMark(name: string, detail?: NotebookMarkDetail): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    // Chromium supports the detail option; older runtimes may not.
    performance.mark(name, detail ? { detail } : undefined);
  } catch {
    try {
      performance.mark(name);
    } catch {
      /* instrumentation must never break the app */
    }
  }
}

function safeMeasure(key: string, startName: string, endName: string): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    performance.measure(`${NATIVE_PREFIX}segment.${key}`, { start: startName, end: endName });
  } catch {
    /* missing marks / unsupported options: the JSON breakdown still works */
  }
}

/** Pure builder: also useful for replaying captured marks in a test. */
export function buildNotebookBreakdown(
  entries: NotebookMarkEntry[],
  timeOriginEpochMs = 0
): NotebookPerfBreakdown {
  const ordered = [...entries].sort((a, b) => a.startTimeMs - b.startTimeMs);
  const byKey = new Map(ordered.map((entry) => [entry.key, entry]));
  const first = ordered[0]?.startTimeMs ?? null;

  let previous: number | null = null;
  const phases: NotebookPhase[] = NOTEBOOK_MARK_ORDER.map((key) => {
    const entry = byKey.get(key);
    const start = entry?.startTimeMs ?? null;
    const phase: NotebookPhase = {
      name: NOTEBOOK_MARK_NAMES[key],
      present: !!entry,
      startTimeMs: start,
      sincePreviousMs: start != null && previous != null ? round(Math.max(0, start - previous)) : null,
      sinceFirstMs: start != null && first != null ? round(Math.max(0, start - first)) : null,
      detail: entry?.detail,
    };
    if (start != null && (previous == null || start >= previous)) previous = start;
    return phase;
  });

  const segments: NotebookSegment[] = SEGMENTS.map((spec) => {
    const from = byKey.get(spec.from)?.startTimeMs;
    const to = byKey.get(spec.to)?.startTimeMs;
    return {
      key: spec.key,
      from: NOTEBOOK_MARK_NAMES[spec.from],
      to: NOTEBOOK_MARK_NAMES[spec.to],
      durationMs: from != null && to != null && to >= from ? round(to - from) : null,
      optional: spec.optional === true,
    };
  });

  const missingMarks = NOTEBOOK_MARK_ORDER.filter((key) => !byKey.has(key)).map(
    (key) => NOTEBOOK_MARK_NAMES[key]
  );
  const notes: string[] = [];
  if (!byKey.has("navigationInitiated")) {
    notes.push("navigation initiated needs the AppLayout sidebar hook; route mounted is the fallback start.");
  }
  if (!byKey.has("projectLoadingStarted") || !byKey.has("databaseResponseReceived")) {
    notes.push("project loading started / database response received need hooks in ResearchProjectContext (outside Phase C file scope).");
  }
  if (!byKey.has("pdfJsLoaded") && !byKey.has("pdfDocumentOpened")) {
    notes.push("no PDF was opened in this session; PDF segments are not applicable.");
  }

  return {
    schema: "openbentt.notebook.performance.v1",
    capturedAt: new Date().toISOString(),
    timeOriginEpochMs,
    markCount: ordered.length,
    marks: ordered,
    phases,
    segments,
    missingMarks,
    notes,
  };
}

export type NotebookMarksApi = {
  /** Stable names, exposed for CDP consumers that prefer a lookup table. */
  readonly names: typeof NOTEBOOK_MARK_NAMES;
  readonly order: readonly NotebookMarkName[];
  mark: (key: NotebookMarkKey | NotebookMarkName, detail?: NotebookMarkDetail) => void;
  markOnce: (key: NotebookMarkKey | NotebookMarkName, detail?: NotebookMarkDetail) => void;
  navigationInitiated: (detail?: NotebookMarkDetail) => void;
  routeMounted: (detail?: NotebookMarkDetail) => void;
  projectLoadingStarted: (detail?: NotebookMarkDetail) => void;
  databaseResponseReceived: (detail?: NotebookMarkDetail) => void;
  projectDataHydrated: (detail?: NotebookMarkDetail) => void;
  editorInitialized: (detail?: NotebookMarkDetail) => void;
  pdfJsLoaded: (detail?: NotebookMarkDetail) => void;
  pdfDocumentOpened: (detail?: NotebookMarkDetail) => void;
  firstPageRendered: (detail?: NotebookMarkDetail) => void;
  firstMeaningfulNotebookContentDisplayed: (detail?: NotebookMarkDetail) => void;
  notebookInteractive: (detail?: NotebookMarkDetail) => void;
  /** Time-ordered copy of the collected marks. */
  getEntries: () => NotebookMarkEntry[];
  /** Structured phase/duration breakdown; the primary CDP payload. */
  getBreakdown: () => NotebookPerfBreakdown;
  /** Clear the collector between cold/warm scenarios (also clears native marks). */
  reset: () => void;
};

function createApi(): NotebookMarksApi {
  let entries: NotebookMarkEntry[] = [];
  const seen = new Set<NotebookMarkKey>();
  const measured = new Set<string>();

  const timeOriginEpochMs =
    typeof performance !== "undefined" && typeof performance.timeOrigin === "number"
      ? performance.timeOrigin
      : Date.now() - nowMs();

  function emit(key: NotebookMarkKey, detail?: NotebookMarkDetail): NotebookMarkEntry {
    const entry: NotebookMarkEntry = {
      key,
      name: NOTEBOOK_MARK_NAMES[key],
      startTimeMs: round(nowMs()),
      ...(detail ? { detail } : {}),
    };
    entries.push(entry);
    seen.add(key);
    safeMark(`${NATIVE_PREFIX}${key}`, detail);

    // Mirror adjacent measured phases into the browser performance timeline.
    const byKey = new Map(entries.map((e) => [e.key, e.startTimeMs]));
    for (const spec of SEGMENTS) {
      if (measured.has(spec.key)) continue;
      const from = byKey.get(spec.from);
      const to = byKey.get(spec.to);
      if (from == null || to == null || to < from) continue;
      measured.add(spec.key);
      safeMeasure(spec.key, `${NATIVE_PREFIX}${spec.from}`, `${NATIVE_PREFIX}${spec.to}`);
    }
    return entry;
  }

  function markOnce(
    input: NotebookMarkKey | NotebookMarkName,
    detail?: NotebookMarkDetail
  ): void {
    const key = resolveKey(input);
    if (!key || seen.has(key)) return;
    emit(key, detail);
  }

  const simple = (key: NotebookMarkKey) => (detail?: NotebookMarkDetail) => markOnce(key, detail);

  return {
    names: NOTEBOOK_MARK_NAMES,
    order: NOTEBOOK_MARK_ORDER.map((key) => NOTEBOOK_MARK_NAMES[key]),
    mark(input, detail) {
      const key = resolveKey(input);
      if (key) emit(key, detail);
    },
    markOnce,
    navigationInitiated: simple("navigationInitiated"),
    routeMounted: simple("routeMounted"),
    projectLoadingStarted: simple("projectLoadingStarted"),
    databaseResponseReceived: simple("databaseResponseReceived"),
    projectDataHydrated: simple("projectDataHydrated"),
    editorInitialized: simple("editorInitialized"),
    pdfJsLoaded: simple("pdfJsLoaded"),
    pdfDocumentOpened: simple("pdfDocumentOpened"),
    firstPageRendered: simple("firstPageRendered"),
    firstMeaningfulNotebookContentDisplayed: simple("firstMeaningfulNotebookContentDisplayed"),
    notebookInteractive: simple("notebookInteractive"),
    getEntries: () => [...entries].sort((a, b) => a.startTimeMs - b.startTimeMs),
    getBreakdown: () => buildNotebookBreakdown(entries, timeOriginEpochMs),
    reset() {
      entries = [];
      seen.clear();
      measured.clear();
      if (typeof performance !== "undefined") {
        for (const key of NOTEBOOK_MARK_ORDER) {
          const name = `${NATIVE_PREFIX}${key}`;
          try {
            performance.clearMarks(name);
            performance.clearMeasures(name);
          } catch {
            /* ignore */
          }
        }
      }
    },
  };
}

declare global {
  interface Window {
    __openbenttNotebookMarks?: NotebookMarksApi;
  }
}

/** Returns the process-wide collector, installing it on first use. */
export function getNotebookMarks(): NotebookMarksApi {
  const target = globalThis as typeof globalThis & { [GLOBAL_KEY]?: NotebookMarksApi };
  if (!target[GLOBAL_KEY]) target[GLOBAL_KEY] = createApi();
  if (typeof window !== "undefined" && window.__openbenttNotebookMarks !== target[GLOBAL_KEY]) {
    window.__openbenttNotebookMarks = target[GLOBAL_KEY];
  }
  return target[GLOBAL_KEY]!;
}

/** Convenience named exports for callers that do not need the whole API. */
export function mark(
  key: NotebookMarkKey | NotebookMarkName,
  detail?: NotebookMarkDetail
): void {
  getNotebookMarks().mark(key, detail);
}

export function markOnce(
  key: NotebookMarkKey | NotebookMarkName,
  detail?: NotebookMarkDetail
): void {
  getNotebookMarks().markOnce(key, detail);
}

/** Call from the sidebar click handler before navigating to /notebook. */
export function navigationInitiated(detail?: NotebookMarkDetail): void {
  getNotebookMarks().navigationInitiated(detail);
}

export const notebookMarks: NotebookMarksApi = getNotebookMarks();
