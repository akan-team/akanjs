import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CSR_DEV_MANIFEST_FILE, type CsrDevManifest } from "akanjs/server/hmr/csrDevManifest";
import { CsrDevArtifactWriter } from "./csrDevArtifactWriter";
import type { CsrDevGraph } from "./csrDevTypes";

const dirs: string[] = [];
const makeWriter = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-writer-"));
  dirs.push(dir);
  const writer = new CsrDevArtifactWriter(dir);
  await writer.reset();
  const graph: CsrDevGraph = {
    version: 1,
    configKey: "key",
    refresh: "refresh.js",
    entries: {},
    modules: { "a.ts": { vendor: false, mtimeMs: 0, hash: "", deps: [] } },
    resolution: {},
    pending: [],
  };
  await writer.writeModules([
    {
      id: "a.ts",
      file: "/a.ts",
      vendor: false,
      factory: "function () {}",
      helpers: null,
      deps: [],
      mtimeMs: 0,
      hash: "",
    },
  ]);
  const read = () => ({
    manifest: JSON.parse(readFileSync(path.join(dir, CSR_DEV_MANIFEST_FILE), "utf8")) as CsrDevManifest,
    app: readFileSync(path.join(dir, "app.js"), "utf8"),
  });
  return { writer, graph, read };
};

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CsrDevArtifactWriter", () => {
  test("announces a patch while app.js still holds the previous generation, then brings app.js up to it", async () => {
    const { writer, graph, read } = await makeWriter();
    await writer.writeApp(graph, 4);
    let atAnnounce: ReturnType<typeof read> | null = null;
    await writer.commitPatch(
      graph,
      { version: 1, generation: 5, appGeneration: 4, vendorFile: "v.js", entries: {} },
      () => {
        atAnnounce = read();
      },
    );
    expect(atAnnounce).toMatchObject({ manifest: { generation: 5, appGeneration: 4 } });
    expect((atAnnounce as ReturnType<typeof read> | null)?.app).toContain('"generation":4');
    const after = read();
    expect(after.manifest).toMatchObject({ generation: 5, appGeneration: 5 });
    expect(after.app).toContain('"generation":5');
  });

  test("rewrites an app.js a crash left behind the manifest's generation", async () => {
    const { writer, graph, read } = await makeWriter();
    await writer.writeApp(graph, 5);
    const behind: CsrDevManifest = { version: 1, generation: 6, appGeneration: 5, vendorFile: "v.js", entries: {} };
    await writer.writeJson(CSR_DEV_MANIFEST_FILE, behind);
    const healed = await writer.healApp(graph, behind);
    expect(healed.appGeneration).toBe(6);
    expect(read().manifest.appGeneration).toBe(6);
    expect(read().app).toContain('"generation":6');
  });

  test("leaves an app.js that already holds the manifest's generation alone", async () => {
    const { writer, graph } = await makeWriter();
    const current: CsrDevManifest = { version: 1, generation: 3, vendorFile: "v.js", entries: {} };
    expect(await writer.healApp(graph, current)).toBe(current);
  });
});
