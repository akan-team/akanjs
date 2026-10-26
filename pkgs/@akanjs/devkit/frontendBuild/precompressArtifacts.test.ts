import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import type { App } from "../commandDecorators";
import { tempDirs } from "../testHelpers";
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
});
