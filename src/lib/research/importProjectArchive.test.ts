import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { importProjectFromFolderFiles, importProjectFromZip } from "./importProjectArchive";

describe("importProjectArchive", () => {
  it("imports an Overleaf-style zip with shared root", async () => {
    const zip = new JSZip();
    zip.file(
      "my-paper/main.tex",
      "\\documentclass{article}\\begin{document}Hello\\end{document}"
    );
    zip.file("my-paper/references.bib", "@article{x, title={T}}");
    zip.file("my-paper/sections/intro.tex", "% intro");
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "my-paper.zip", { type: "application/zip" });
    const arch = await importProjectFromZip(file);
    expect(arch.draftTex).toContain("Hello");
    expect(arch.bibliography).toContain("@article");
    expect(arch.projectFiles.some((f) => f.path.includes("intro"))).toBe(true);
    expect(arch.source).toBe("zip");
  });

  it("imports a folder file list", async () => {
    const tex = new File(
      ["\\documentclass{article}\\begin{document}Folder\\end{document}"],
      "main.tex",
      { type: "text/plain" }
    );
    Object.defineProperty(tex, "webkitRelativePath", { value: "proj/main.tex" });
    const bib = new File(["@misc{a,title={A}}"], "refs.bib", { type: "text/plain" });
    Object.defineProperty(bib, "webkitRelativePath", { value: "proj/refs.bib" });
    const arch = await importProjectFromFolderFiles([tex, bib]);
    expect(arch.draftTex).toContain("Folder");
    expect(arch.bibliography).toContain("@misc");
    expect(arch.source).toBe("folder");
  });
});
