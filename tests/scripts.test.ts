import { describe, expect, it } from "vitest";
import { formatFileSize, MAX_SCRIPT_BYTES, scriptContentType, scriptProblem, titleFromFileName } from "@/lib/scripts";

describe("scriptProblem", () => {
  it("accepts .doc, .docx, .pdf and .fdx in any case", () => {
    for (const name of ["a.doc", "a.docx", "My Script.PDF", "draft.v2.fdx"]) expect(scriptProblem(name, 1000)).toBeNull();
  });
  it("rejects other types, empty files and files over the limit", () => {
    expect(scriptProblem("notes.txt", 10)).toMatch(/\.doc, \.docx, \.pdf or \.fdx/);
    expect(scriptProblem("pdf", 10)).toMatch(/\.doc, \.docx/);
    expect(scriptProblem("script.pdf.exe", 10)).toMatch(/\.doc, \.docx/);
    expect(scriptProblem("a.pdf", 0)).toBe("That file is empty.");
    expect(scriptProblem("a.pdf", MAX_SCRIPT_BYTES)).toBeNull();
    expect(scriptProblem("a.pdf", MAX_SCRIPT_BYTES + 1)).toBe("Scripts can be at most 20 MB.");
  });
});

describe("scriptContentType", () => {
  it("maps known types and downloads the rest", () => {
    expect(scriptContentType("a.PDF")).toBe("application/pdf");
    expect(scriptContentType("a.doc")).toBe("application/msword");
    expect(scriptContentType("a.docx")).toContain("wordprocessingml");
    expect(scriptContentType("a.fdx")).toBe("application/octet-stream");
  });
});

describe("formatFileSize", () => {
  it("uses B, KB and MB", () => {
    expect(formatFileSize(532)).toBe("532 B");
    expect(formatFileSize(48_300)).toBe("47 KB");
    expect(formatFileSize(2_400_000)).toBe("2.3 MB");
    expect(formatFileSize(MAX_SCRIPT_BYTES)).toBe("20 MB");
  });
});

describe("titleFromFileName", () => {
  it("drops the extension and tidies spaces", () => {
    expect(titleFromFileName("Super Quincy.fdx")).toBe("Super Quincy");
    expect(titleFromFileName("draft.v2.final.PDF")).toBe("draft.v2.final");
    expect(titleFromFileName("  My   Script .docx")).toBe("My Script");
    expect(titleFromFileName(".fdx")).toBe(".fdx");
    expect(titleFromFileName(`${"a".repeat(250)}.pdf`)).toHaveLength(200);
  });
});
