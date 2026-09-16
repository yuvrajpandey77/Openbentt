/**
 * Phase 2 — Office extraction (DOCX/PPTX/XLSX) on the existing jszip dependency.
 * Deterministic, local, no new packages. Archive-safe: traversal rejection,
 * file-count cap, expanded-size cap — same philosophy as the Phase 1 LaTeX
 * resolveInside fix. Never executes macros/scripts; only XML text is read.
 */
import JSZip from "jszip";
import { DOCUMENT_LIMITS } from "@/lib/documents/limits";
import type { DocumentBlock, DocumentContent, DocumentMetadata } from "@/lib/documents/types";

export const OFFICE_MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function assertSafeZipPath(name: string): void {
  if (!name || name.includes("..") || name.startsWith("/") || name.startsWith("\\") || /^[a-zA-Z]:/.test(name)) {
    throw new Error("archive-traversal");
  }
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textsOf(xml: string, tag: string): string[] {
  const re = new RegExp(`<${escRe(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escRe(tag)}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function stripXml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

async function loadZipSafe(bytes: Uint8Array): Promise<JSZip> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  if (names.length > DOCUMENT_LIMITS.maxArchiveFiles) throw new Error("archive-too-large");
  let expanded = 0;
  for (const n of names) {
    assertSafeZipPath(n);
    const f = zip.files[n];
    if (f.dir) continue;
    // Use uncompressed size estimate when known; cap expansion.
    const size = typeof (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize === "number"
      ? (f as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize
      : 0;
    expanded += size;
    if (expanded > DOCUMENT_LIMITS.maxArchiveExpandedBytes) throw new Error("archive-too-large");
  }
  return zip;
}

async function readXml(zip: JSZip, name: string): Promise<string | null> {
  const f = zip.files[name];
  if (!f || f.dir) return null;
  const text = await f.async("string");
  if (text.length > DOCUMENT_LIMITS.maxArchiveExpandedBytes) throw new Error("archive-too-large");
  return text;
}

function coreProps(xml: string | null, fileName: string, mime: string, size: number): DocumentMetadata {
  const meta: DocumentMetadata = {
    mimeType: { value: mime, origin: "embedded" },
    fileSize: { value: size, origin: "embedded" },
  };
  if (!xml) {
    meta.title = { value: fileName.replace(/\.[^.]+$/, ""), origin: "filename" };
    return meta;
  }
  const pick = (tag: string): string | null => {
    const v = textsOf(xml, tag).map(stripXml).find((s) => s.length > 0);
    return v ?? null;
  };
  const title = pick("dc:title") ?? pick("dcterms:title") ?? pick("cp:title");
  const creator = pick("dc:creator") ?? pick("cp:creator") ?? pick("dcterms:creator");
  const created = pick("dcterms:created") ?? pick("cp:created");
  const modified = pick("dcterms:modified") ?? pick("cp:modified");
  meta.title = title
    ? { value: title.slice(0, 300), origin: "embedded" }
    : { value: fileName.replace(/\.[^.]+$/, ""), origin: "filename" };
  if (creator) meta.authors = { value: creator.slice(0, 500), origin: "embedded" };
  if (created) meta.createdDate = { value: created, origin: "embedded" };
  if (modified) meta.modifiedDate = { value: modified, origin: "embedded" };
  return meta;
}

export function isOfficeKind(name: string): "docx" | "pptx" | "xlsx" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return null;
}

export async function extractDocx(bytes: Uint8Array, fileName: string): Promise<{ content: DocumentContent; metadata: DocumentMetadata }> {
  const zip = await loadZipSafe(bytes);
  const docXml = await readXml(zip, "word/document.xml");
  if (!docXml) throw new Error("malformed");
  const meta = coreProps(await readXml(zip, "docProps/core.xml"), fileName, OFFICE_MIME.docx, bytes.length);
  const blocks: DocumentBlock[] = [];
  const paras = textsOf(docXml, "w:p");
  let bi = 0;
  for (const p of paras) {
    const style = /w:pStyle[^>]*w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const runs = textsOf(p, "w:t").map(stripXml).join("");
    const text = runs.trim();
    if (!text) continue;
    const isHeading = /Heading/i.test(style);
    const level = /Heading([1-6])/i.exec(style)?.[1];
    blocks.push({
      id: `b${bi++}`, kind: isHeading ? "heading" : "paragraph",
      text: text.slice(0, 8000), ...(isHeading && level ? { level: Number(level) } : {}),
    });
    if (blocks.length > DOCUMENT_LIMITS.maxBlocks) break;
  }
  // Tables: word/tbl -> grid of w:t cells; keep structure + text fallback.
  for (const tbl of textsOf(docXml, "w:tbl")) {
    const rows = textsOf(tbl, "w:tr").map((tr) =>
      textsOf(tr, "w:tc").map((tc) => textsOf(tc, "w:t").map(stripXml).join("").trim())
        .slice(0, DOCUMENT_LIMITS.maxTableCols));
    if (!rows.length) continue;
    const capped = rows.slice(0, DOCUMENT_LIMITS.maxTableRows);
    blocks.push({
      id: `b${bi++}`, kind: "table",
      text: capped.map((r) => r.join(" | ")).join("\n").slice(0, 8000),
      table: { columns: capped[0] ?? [], rows: capped.slice(1) },
    });
  }
  return { content: finalize(blocks), metadata: meta };
}

export async function extractPptx(bytes: Uint8Array, fileName: string): Promise<{ content: DocumentContent; metadata: DocumentMetadata }> {
  const zip = await loadZipSafe(bytes);
  const meta = coreProps(await readXml(zip, "docProps/core.xml"), fileName, OFFICE_MIME.pptx, bytes.length);
  const blocks: DocumentBlock[] = [];
  let bi = 0;
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/slide(\d+)/.exec(a)?.[1] ?? 0) - Number(/slide(\d+)/.exec(b)?.[1] ?? 0));
  if (!slideNames.length) throw new Error("malformed");
  let slideNo = 0;
  for (const name of slideNames) {
    slideNo++;
    const xml = await readXml(zip, name);
    if (!xml) continue;
    blocks.push({ id: `b${bi++}`, kind: "heading", text: `Slide ${slideNo}`, level: 1 });
    for (const t of textsOf(xml, "a:t").map(stripXml).map((s) => s.trim()).filter(Boolean)) {
      blocks.push({ id: `b${bi++}`, kind: "paragraph", text: t.slice(0, 8000) });
      if (blocks.length > DOCUMENT_LIMITS.maxBlocks) break;
    }
    for (const tbl of textsOf(xml, "a:tbl")) {
      const rows = textsOf(tbl, "a:tr").map((tr) =>
        textsOf(tr, "a:t").map(stripXml).map((s) => s.trim()).slice(0, DOCUMENT_LIMITS.maxTableCols));
      if (!rows.length) continue;
      const capped = rows.slice(0, DOCUMENT_LIMITS.maxTableRows);
      blocks.push({
        id: `b${bi++}`, kind: "table",
        text: capped.map((r) => r.join(" | ")).join("\n").slice(0, 8000),
        table: { columns: capped[0] ?? [], rows: capped.slice(1) },
      });
    }
    // Notes
    const notesName = `ppt/notesSlides/notesSlide${slideNo}.xml`;
    const notes = await readXml(zip, notesName);
    if (notes) {
      for (const t of textsOf(notes, "a:t").map(stripXml).map((s) => s.trim()).filter(Boolean).slice(0, 20)) {
        blocks.push({ id: `b${bi++}`, kind: "quote", text: `Notes: ${t}`.slice(0, 8000) });
      }
    }
  }
  return { content: finalize(blocks), metadata: meta };
}

export async function extractXlsx(bytes: Uint8Array, fileName: string): Promise<{ content: DocumentContent; metadata: DocumentMetadata }> {
  const zip = await loadZipSafe(bytes);
  const meta = coreProps(await readXml(zip, "docProps/core.xml"), fileName, OFFICE_MIME.xlsx, bytes.length);
  const sharedXml = await readXml(zip, "xl/sharedStrings.xml");
  const shared: string[] = sharedXml ? textsOf(sharedXml, "t").map(stripXml) : [];
  const blocks: DocumentBlock[] = [];
  let bi = 0;
  const sheetNames = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  if (!sheetNames.length) throw new Error("malformed");
  // Sheet names from workbook.xml rel order (best-effort, fallback Sheet N).
  const wb = (await readXml(zip, "xl/workbook.xml")) ?? "";
  const wbNames = [...wb.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*\/?>/g)].map((m) => m[1]).filter(Boolean);
  let si = 0;
  for (const name of sheetNames) {
    si++;
    const sheetName = wbNames[si - 1] ?? `Sheet${si}`;
    const xml = await readXml(zip, name);
    if (!xml) continue;
    blocks.push({ id: `b${bi++}`, kind: "heading", text: `Sheet: ${sheetName}`, level: 1 });
    const rows: string[][] = [];
    for (const row of textsOf(xml, "row").slice(0, DOCUMENT_LIMITS.maxTableRows)) {
      const cells: string[] = [];
      // Full <c> elements (textsOf returns inner content only, so re-match for attrs).
      const cellEls = [...row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)]
        .slice(0, DOCUMENT_LIMITS.maxTableCols);
      for (const m of cellEls) {
        const attrs = m[1] ?? "";
        const inner = m[2] ?? "";
        const t = /t="([^"]+)"/.exec(attrs)?.[1];
        const v = stripXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        if (t === "s" && v !== "") {
          const idx = Number(v);
          cells.push(Number.isFinite(idx) && shared[idx] !== undefined ? shared[idx] : v);
        } else if (t === "inlineStr") {
          cells.push(stripXml(textsOf(inner, "t").join(" ")));
        } else {
          cells.push(v);
        }
      }
      // Keep row if any non-empty cell (preserve range shape, trim trailing empties).
      let end = cells.length;
      while (end > 0 && !cells[end - 1]) end--;
      if (end > 0) rows.push(cells.slice(0, end));
    }
    if (!rows.length) continue;
    // Header heuristic: first row with >=2 non-numeric cells.
    const headerIdx = rows.findIndex((r) => r.filter((c) => c && Number.isNaN(Number(c))).length >= 2);
    const columns = headerIdx >= 0 ? rows[headerIdx] : rows[0].map((_, i) => `col${i + 1}`);
    const data = headerIdx >= 0 ? [...rows.slice(0, headerIdx), ...rows.slice(headerIdx + 1)] : rows.slice(1);
    blocks.push({
      id: `b${bi++}`, kind: "table",
      text: [`Sheet: ${sheetName}`, columns.join(" | "), ...data.map((r) => r.join(" | "))].join("\n").slice(0, 12000),
      table: { columns, rows: data },
    });
    if (blocks.length > DOCUMENT_LIMITS.maxBlocks) break;
  }
  return { content: finalize(blocks), metadata: meta };
}

function finalize(blocks: DocumentBlock[]): DocumentContent {
  const pages = blocks.length
    ? [{ pageNumber: 1, text: blocks.map((b) => b.text).join("\n\n"), charCount: blocks.reduce((n, b) => n + b.text.length, 0), empty: false }]
    : [];
  return { pages, sections: [], blocks, references: [] };
}
