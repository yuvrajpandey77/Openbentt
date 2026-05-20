/**
 * Canonical Zotero Web API → library snapshot mapping (renderer + Electron main).
 */

export function formatCreators(creators) {
  if (!creators?.length) return "";
  return creators
    .map((c) => c.name ?? [c.lastName, c.firstName].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" and ");
}

export function extractYear(date) {
  if (!date) return undefined;
  const m = String(date).match(/\d{4}/);
  return m?.[0];
}

export function parseCitationKeyFromExtra(extra) {
  if (!extra) return undefined;
  const m = String(extra).match(/(?:^|\n)\s*(?:Citation Key|citation key|bibtex:\s*)\s*:\s*(\S+)/i);
  return m?.[1];
}

export function defaultCitekey(item) {
  const fromExtra = parseCitationKeyFromExtra(item.extra);
  if (fromExtra) return fromExtra;
  if (item.citationKey) return item.citationKey;
  const author = item.creators?.[0]?.lastName ?? item.creators?.[0]?.name ?? "item";
  const year = extractYear(item.date) ?? "nd";
  const slug = String(author).replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 12);
  return `${slug}${year}_${item.key.slice(0, 6)}`;
}

export function zoteroItemToBibtex(item, citekey) {
  const type = item.itemType === "journalArticle" ? "article" : "misc";
  const fields = [];
  const add = (k, v) => {
    if (v?.trim()) fields.push(`  ${k} = {${String(v).replace(/[{}]/g, "")}}`);
  };
  add("title", item.title);
  add("author", formatCreators(item.creators));
  add("year", extractYear(item.date));
  add("doi", item.DOI);
  add("url", item.url);
  add("abstract", item.abstractNote);
  if (item.extra) add("note", item.extra);
  return `@${type}{${citekey},\n${fields.join(",\n")}\n}`;
}

/**
 * @param {object[]} apiItems
 * @param {object[]} apiCollections
 * @param {object[]} apiTags
 * @param {string} userId
 * @param {{ mode?: string, libraryVersion?: number }} [options]
 */
export function mapZoteroApiToSnapshot(
  apiItems,
  apiCollections,
  apiTags,
  userId,
  options = {}
) {
  const mode = options.mode ?? "web";
  const annotationSource = mode === "better-bibtex" ? "better-bibtex" : "zotero-web";

  const collections = apiCollections.map((c) => ({
    key: c.data.key,
    name: c.data.name,
    parentCollection:
      typeof c.data.parentCollection === "string" ? c.data.parentCollection : undefined,
    itemCount: c.meta?.numItems ?? 0,
  }));

  const tags = apiTags.map((t) => ({ tag: t.tag, type: t.type }));

  const notes = [];
  const attachments = [];
  const annotations = [];
  const topLevel = [];
  const childrenByParent = new Map();

  for (const item of apiItems) {
    if (item.parentItem) {
      const list = childrenByParent.get(item.parentItem) ?? [];
      list.push(item);
      childrenByParent.set(item.parentItem, list);
    } else {
      topLevel.push(item);
    }
  }

  for (const item of apiItems) {
    if (item.itemType === "note" && item.parentItem && item.note) {
      notes.push({
        key: item.key,
        parentItemKey: item.parentItem,
        note: item.note,
        dateModified: item.date ?? "",
      });
    }
    if (item.itemType === "attachment" && item.parentItem) {
      const isPdf =
        item.contentType === "application/pdf" ||
        item.path?.toLowerCase().endsWith(".pdf") ||
        item.linkMode === "imported_file";
      attachments.push({
        key: item.key,
        parentItemKey: item.parentItem,
        title: item.title ?? "Attachment",
        contentType: item.contentType,
        path: item.path,
        linkMode: item.linkMode,
        hasPdf: Boolean(isPdf),
      });
    }
    if (item.itemType === "annotation" && item.parentItem) {
      const annType = item.annotationType ?? "unknown";
      annotations.push({
        key: item.key,
        parentItemKey: item.parentItem,
        annotationType: annType === "highlight" || annType === "note" ? annType : "unknown",
        text: item.annotationText,
        comment: item.annotationComment,
        pageLabel: item.annotationPageLabel,
        color: item.annotationColor,
        dateModified: item.date ?? "",
        source: annotationSource,
      });
    }
  }

  const items = topLevel
    .filter((i) => !["note", "attachment", "annotation"].includes(i.itemType))
    .map((item) => {
      const citekey = defaultCitekey(item);
      const kids = childrenByParent.get(item.key) ?? [];
      const attachmentKeys = kids.filter((k) => k.itemType === "attachment").map((k) => k.key);
      const noteKeys = kids.filter((k) => k.itemType === "note").map((k) => k.key);
      const annotationKeys = kids.filter((k) => k.itemType === "annotation").map((k) => k.key);
      const hasPdf = attachments.some((a) => a.parentItemKey === item.key && a.hasPdf);
      return {
        key: item.key,
        itemType: item.itemType,
        title: item.title ?? "Untitled",
        creators: formatCreators(item.creators),
        year: extractYear(item.date),
        doi: item.DOI,
        url: item.url,
        abstract: item.abstractNote,
        tags: (item.tags ?? []).map((t) => t.tag),
        collectionKeys: item.collections ?? [],
        citekey,
        bibtexRaw: zoteroItemToBibtex(item, citekey),
        dateModified: item.date ?? "",
        hasPdf,
        attachmentKeys,
        noteKeys,
        annotationKeys,
      };
    });

  const bibliography = items.map((i) => i.bibtexRaw).filter(Boolean).join("\n\n");

  return {
    items,
    notes,
    attachments,
    annotations,
    collections,
    tags,
    bibliography,
    libraryVersion: options.libraryVersion,
  };
}
