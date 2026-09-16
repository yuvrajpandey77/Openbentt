import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractDocx, extractPptx, extractXlsx } from "@/lib/documents/officeExtract";

async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(files)) zip.file(k, v);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

const CORE = `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Doc Title</dc:title><dc:creator>Jane Doe</dc:creator></cp:coreProperties>`;

describe("office extraction (local, deterministic)", () => {
  it("docx preserves headings + tables + metadata origin", async () => {
    const bytes = await zipOf({
      "docProps/core.xml": CORE,
      "word/document.xml": `<w:document xmlns:w="http://x"><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Intro</w:t></w:r></w:p>
        <w:p><w:r><w:t>Body text</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body></w:document>`,
    });
    const r = await extractDocx(bytes, "paper.docx");
    expect(r.content.blocks.some((b) => b.kind === "heading" && b.text === "Intro")).toBe(true);
    const t = r.content.blocks.find((b) => b.kind === "table");
    expect(t?.table?.columns).toEqual(["A", "B"]);
    expect(t?.table?.rows).toEqual([["1", "2"]]);
    expect(r.metadata.title?.origin).toBe("embedded");
    expect(r.metadata.authors?.value).toBe("Jane Doe");
  });

  it("pptx keeps slide boundaries + notes", async () => {
    const slide = (t: string) =>
      `<p:sld xmlns:p="x" xmlns:a="y"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const bytes = await zipOf({
      "docProps/core.xml": CORE,
      "ppt/slides/slide1.xml": slide("Hello slide"),
      "ppt/notesSlides/notesSlide1.xml": slide("Speaker note"),
    });
    const r = await extractPptx(bytes, "deck.pptx");
    expect(r.content.blocks.some((b) => b.text === "Slide 1")).toBe(true);
    expect(r.content.blocks.some((b) => b.text === "Hello slide")).toBe(true);
    expect(r.content.blocks.some((b) => b.kind === "quote" && b.text.includes("Speaker note"))).toBe(true);
  });

  it("xlsx preserves sheets as structured tables (not flat text)", async () => {
    const bytes = await zipOf({
      "docProps/core.xml": CORE,
      "xl/workbook.xml": `<workbook><sheets><sheet name="Data" sheetId="1"/></sheets></workbook>`,
      "xl/sharedStrings.xml": `<sst><si><t>Name</t></si><si><t>Score</t></si><si><t>Ada</t></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>97</v></c></row>
        </sheetData></worksheet>`,
    });
    const r = await extractXlsx(bytes, "data.xlsx");
    const t = r.content.blocks.find((b) => b.kind === "table");
    expect(t?.table?.columns).toEqual(["Name", "Score"]);
    expect(t?.table?.rows).toEqual([["Ada", "97"]]);
    expect(t?.text).toContain("Sheet: Data");
  });
});
