import { describe, expect, it } from "vitest";
import { validateFile } from "./UploadDialog";
describe("upload validation", () => {
  it("allows PDF and DOCX", () => {
    expect(validateFile(new File(["content"], "REPORT.PDF"))).toBe("");
    expect(validateFile(new File(["content"], "report.docx"))).toBe("");
  });
  it("rejects unsupported, empty, and oversized files", () => {
    expect(validateFile(new File(["x"], "report.doc"))).toMatch("PDF or Word");
    expect(validateFile(new File([], "report.pdf"))).toMatch("not empty");
    expect(
      validateFile(new File([new Uint8Array(4_000_001)], "report.pdf")),
    ).toMatch("4 MB");
  });
});
