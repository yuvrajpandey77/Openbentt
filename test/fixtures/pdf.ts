/** Minimal PDF fixtures for pdf.js behavior tests (not visual regression). */

/** Valid empty single-page PDF (opens in pdf.js; may yield empty text). */
export const MINIMAL_VALID_PDF = new Uint8Array(
  Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 44>>stream
BT /F1 12 Tf 50 150 Td (Hello PDF) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000341 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
434
%%EOF`
  )
);

export const CORRUPTED_PDF_BYTES = new Uint8Array(Buffer.from("NOT-A-PDF-HEADER\x00\x01garbage"));

export function pdfFileFromBytes(bytes: Uint8Array, name = "fixture.pdf"): File {
  return new File([bytes], name, { type: "application/pdf" });
}
