import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RscServerRendererGuard } from "./rscServerRendererGuard";

let root = "";

const files = {
  "renderer.ts": `import { renderToReadableStream } from "react-dom/server.edge";\nexport const render = () => renderToReadableStream;\n`,
  "server.ts": `import { render } from "./renderer";\nexport const boot = () => render;\nexport const migrations = ["m1"];\n`,
  "service.ts": `export const report = async () => (await import("./server")).migrations;\n`,
  "dynamicPage.ts": `import { report } from "./service";\nexport const page = () => report;\n`,
  "lazyRenderer.ts": `export const render = async () => (await import("react-dom/server.browser")).renderToReadableStream;\n`,
  "lazyPage.ts": `import { render } from "./lazyRenderer";\nexport const page = () => render;\n`,
  "plainPage.ts": `export const page = () => "plain";\n`,
};

const metafileOf = async (entry: string) => {
  const result = await Bun.build({
    entrypoints: [path.join(root, entry)],
    outdir: path.join(root, "out", entry),
    target: "bun",
    format: "esm",
    metafile: true,
    external: ["react-dom/*"],
  });
  expect(result.success).toBe(true);
  return result.metafile;
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "rsc-guard-"));
  for (const [file, source] of Object.entries(files)) await writeFile(path.join(root, file), source);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("RscServerRendererGuard", () => {
  test("names the chain from the page through the dynamic import of the server entry to the renderer", async () => {
    const assertion = (async () => RscServerRendererGuard.assert(await metafileOf("dynamicPage.ts"), root))();

    await expect(assertion).rejects.toThrow(
      [
        "where that import throws. It is reached through:",
        "  dynamicPage.ts",
        "  → service.ts",
        "  → import() server.ts",
        "  → renderer.ts",
      ].join("\n"),
    );
  });

  test("passes a page whose renderer import waits inside a function, and one that reaches no renderer", async () => {
    for (const entry of ["lazyPage.ts", "plainPage.ts"])
      expect(RscServerRendererGuard.offenders((await metafileOf(entry)) as Bun.BuildMetafile)).toEqual([]);
  });
});
