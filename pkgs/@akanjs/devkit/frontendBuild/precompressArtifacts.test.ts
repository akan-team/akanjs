import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import type { App } from "../commandDecorators";
import { tempDirs } from "../test/testHelpers";
import { precompressArtifacts } from "./precompressArtifacts";

const tempRoot = tempDirs("akan-devkit-precompress-");

const brotliAt = (bytes: Buffer, quality: number) =>
  zlib.brotliCompressSync(bytes, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
    },
  });

describe("precompressArtifacts", () => {
  test("writes sidecars for client chunks, stylesheets and dictionaries, a dictionary's brotli at quality 11", async () => {
    const distPath = await tempRoot();
    const artifactDir = path.join(distPath, ".akan/artifact");
    const files = {
      "client/chunk.js": `export const x = ${JSON.stringify("chunk ".repeat(400))};`,
      "styles/root.css": `.a{color:red}${".b{margin:0}".repeat(200)}`,
      "dict/en-abc.js": `export default JSON.parse(${JSON.stringify(JSON.stringify({ a: { t: "word ".repeat(400) } }))});`,
    };
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(artifactDir, rel)), { recursive: true });
      await writeFile(path.join(artifactDir, rel), content);
    }
    const app = { dist: { cwdPath: distPath }, verbose: () => undefined } as unknown as App;

    expect((await precompressArtifacts(app)).files).toBe(3);
    const dictPath = path.join(artifactDir, "dict/en-abc.js");
    const dictBytes = await readFile(dictPath);
    expect(await readFile(`${dictPath}.br`)).toEqual(brotliAt(dictBytes, 11));
    const chunkPath = path.join(artifactDir, "client/chunk.js");
    expect(await readFile(`${chunkPath}.br`)).toEqual(brotliAt(await readFile(chunkPath), 9));
    expect(await Bun.file(`${dictPath}.gz`).exists()).toBe(true);
  });

  test("compresses a chunk under 1 KB too, and writes no sidecar that would be larger than its file", async () => {
    const distPath = await tempRoot();
    const artifactDir = path.join(distPath, ".akan/artifact");
    const stubPath = path.join(artifactDir, "client/stub.js");
    const tinyPath = path.join(artifactDir, "client/tiny.js");
    await mkdir(path.dirname(stubPath), { recursive: true });
    await writeFile(
      stubPath,
      'import{a as memoStore,b as memoList}from"./chunks/abc.js";export{memoStore,memoList};\n'.repeat(4),
    );
    await writeFile(tinyPath, "x");
    const app = { dist: { cwdPath: distPath }, verbose: () => undefined } as unknown as App;

    expect((await precompressArtifacts(app)).files).toBe(1);
    const stubBytes = await readFile(stubPath);
    expect(stubBytes.byteLength).toBeLessThan(1024);
    expect(await readFile(`${stubPath}.br`)).toEqual(brotliAt(stubBytes, 9));
    expect((await readFile(`${stubPath}.gz`)).byteLength).toBeLessThan(stubBytes.byteLength);
    expect(await Bun.file(`${tinyPath}.br`).exists()).toBe(false);
    expect(await Bun.file(`${tinyPath}.gz`).exists()).toBe(false);
  });
});
