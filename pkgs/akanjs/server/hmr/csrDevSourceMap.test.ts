import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CsrDevSourceMap, type RawSourceMap } from "./csrDevSourceMap";

const map = (sources: string[], mappings: string, names: string[] = []): RawSourceMap => ({
  version: 3,
  sources,
  sourcesContent: sources.map((source) => `// ${source}`),
  names,
  mappings,
});

describe("CsrDevSourceMap.merge", () => {
  test("places each section at its line and re-bases its source and name indices", () => {
    const merged = CsrDevSourceMap.merge(
      "app.js",
      [
        { line: 0, map: map(["/a.ts"], "AAAA") },
        { line: 2, map: map(["/b.ts"], "AAAAA", ["render"]) },
      ],
      3,
    );
    expect(merged.sources).toEqual(["/a.ts", "/b.ts"]);
    expect(merged.sourcesContent).toEqual(["// /a.ts", "// /b.ts"]);
    expect(merged.names).toEqual(["render"]);
    expect(merged.mappings).toBe("AAAA;;ACAAA");
  });

  test("a real Bun map placed at line 0 comes back unchanged", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-sourcemap-"));
    try {
      const entry = path.join(dir, "Card.tsx");
      await Bun.write(
        entry,
        'import { useState } from "react";\nexport const Card = ({ label }: { label: string }) => {\n  const [open, setOpen] = useState(false);\n  return <button onClick={() => setOpen(!open)}>{label}</button>;\n};\n',
      );
      const result = await Bun.build({
        entrypoints: [entry],
        target: "browser",
        format: "cjs",
        sourcemap: "external",
        external: ["react", "react/jsx-dev-runtime"],
      });
      const original = JSON.parse(
        (await result.outputs.find((output) => output.kind === "sourcemap")?.text()) ?? "{}",
      ) as RawSourceMap;
      const code = (await result.outputs.find((output) => output.kind === "entry-point")?.text()) ?? "";
      const merged = CsrDevSourceMap.merge("Card.js", [{ line: 0, map: original }], code.split("\n").length);
      expect(merged.mappings.replace(/;+$/, "")).toBe(original.mappings.replace(/;+$/, ""));
      expect(merged.names).toEqual(original.names);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
