import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CSR_DEV_MANIFEST_FILE, type CsrDevManifest } from "akanjs/server/hmr/csrDevManifest";
import { isAkanRuntimeMetadataFile } from "akanjs/server/hmr/runtimeMetadataFile";
import { CsrDevArtifactWriter } from "./csrDevArtifactWriter";
import { CsrDevPatcher } from "./csrDevPatcher";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevContext, CsrDevGraph } from "./csrDevTypes";
import type { DevRegistryBundler } from "./devRegistryBundler";

const dirs: string[] = [];
const context: CsrDevContext = {
  pageEntries: [],
  basePaths: [],
  htmlBasePaths: [],
  define: {},
  optimizeImports: [],
  configKey: "key",
  refreshFile: null,
};

//? Only what an update touches before it compiles anything: a registry with no modules has nothing to patch.
const makeRegistry = async (metadata: string | undefined) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-patcher-"));
  dirs.push(dir);
  const writer = new CsrDevArtifactWriter(dir, { routePrefix: "/_akan/ssr-dev/" });
  const graph: CsrDevGraph = {
    version: 1,
    configKey: "key",
    refresh: "refresh.js",
    entries: {},
    modules: {},
    resolution: {},
    pending: [],
    ...(metadata ? { metadata } : {}),
  };
  const manifest: CsrDevManifest = { version: 1, generation: 4, appGeneration: 4, vendorFile: "v.js", entries: {} };
  await writer.writeState(graph, manifest);
  const stamp = { current: metadata ?? "" };
  const bundler = {
    context: async () => context,
    writer,
    paths: new CsrDevPaths(dir),
    reloadsOnEntryChange: false,
    isMetadataFile: isAkanRuntimeMetadataFile,
    metadataFingerprint: async () => stamp.current,
    writeEntries: async () => ({ files: {}, changed: [] }),
    entryIds: () => ({}),
  } as unknown as DevRegistryBundler;
  return { bundler, stamp, dir };
};

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CsrDevPatcher", () => {
  test("hands a registry read from disk back to a whole build once a signal save moved its metadata", async () => {
    const { bundler, stamp } = await makeRegistry("before");
    stamp.current = "after";
    const result = await new CsrDevPatcher(bundler).update([]);
    expect(result).toMatchObject({ kind: "delegate", generation: 5 });
    expect(result.kind === "delegate" ? result.reason : "").toContain("metadata");
  });

  test("patches a registry whose metadata still matches, and one built before the stamp existed is rebuilt", async () => {
    const matching = await makeRegistry("same");
    expect(await new CsrDevPatcher(matching.bundler).update([])).toEqual({ kind: "unchanged" });
    const unstamped = await makeRegistry(undefined);
    unstamped.stamp.current = "now";
    expect((await new CsrDevPatcher(unstamped.bundler).update([])).kind).toBe("delegate");
  });

  test("a resident patcher checks the stamp once, when it reads the registry", async () => {
    const { bundler, stamp } = await makeRegistry("same");
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    stamp.current = "moved";
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    patcher.forget();
    expect((await patcher.update([])).kind).toBe("delegate");
  });

  test("a saved metadata file goes to a whole build even when the stamp matches", async () => {
    const { bundler } = await makeRegistry("same");
    const result = await new CsrDevPatcher(bundler).update(["/repo/apps/demo/lib/user/user.signal.ts"]);
    expect(result).toMatchObject({ kind: "delegate", reason: "user.signal.ts changed" });
  });

  test("a registry with no manifest is a first build, which no tab holds a module of", async () => {
    const { bundler, dir } = await makeRegistry("same");
    await rm(path.join(dir, CSR_DEV_MANIFEST_FILE), { force: true });
    expect(await new CsrDevPatcher(bundler).update([])).toMatchObject({
      kind: "delegate",
      reason: "first build",
      generation: 1,
      first: true,
    });
  });
});
