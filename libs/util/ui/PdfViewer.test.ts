import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";

describe("PdfViewer worker", () => {
  test("ships the worker of the pdfjs-dist version react-pdf loads, which pdf.js requires to match exactly", async () => {
    const reactPdfDir = dirname(Bun.resolveSync("react-pdf", import.meta.dir));
    const installed = Bun.file(Bun.resolveSync("pdfjs-dist/build/pdf.worker.min.mjs", reactPdfDir));
    const shipped = Bun.file(join(import.meta.dir, "../public/pdf.worker.min.mjs"));
    expect(Bun.hash(await shipped.arrayBuffer())).toBe(Bun.hash(await installed.arrayBuffer()));
  });
});
