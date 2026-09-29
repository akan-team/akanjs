import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CSR_DEV_MANIFEST_FILE,
  CSR_DEV_ROUTE_PREFIX,
  type CsrDevManifest,
  csrDevModuleFile,
} from "akanjs/server/hmr/csrDevManifest";
import { CsrDevArtifactWriter, type CsrDevArtifactWriterOptions } from "./csrDevArtifactWriter";
import type { CsrDevCompiledModule, CsrDevGraph } from "./csrDevTypes";

const dirs: string[] = [];
const module: CsrDevCompiledModule = {
  id: "a.ts",
  file: "/a.ts",
  vendor: false,
  factory: "function () {}",
  helpers: null,
  deps: [],
  mtimeMs: 0,
  hash: "",
};
const readModule = (dir: string) => readFileSync(path.join(dir, csrDevModuleFile("a.ts", ".js")), "utf8");
const makeWriter = async (
  options: CsrDevArtifactWriterOptions = { routePrefix: CSR_DEV_ROUTE_PREFIX },
  entries: Record<string, string> = {},
) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-writer-"));
  dirs.push(dir);
  const writer = new CsrDevArtifactWriter(dir, options);
  const graph: CsrDevGraph = {
    version: 1,
    configKey: "key",
    refresh: "refresh.js",
    entries,
    modules: { "a.ts": { vendor: false, mtimeMs: 0, hash: "", deps: [] } },
    resolution: {},
    pending: [],
  };
  await writer.writeModules([module]);
  const read = () => ({
    manifest: JSON.parse(readFileSync(path.join(dir, CSR_DEV_MANIFEST_FILE), "utf8")) as CsrDevManifest,
    app: readFileSync(path.join(dir, "app.js"), "utf8"),
  });
  return { writer, graph, read, dir };
};

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CsrDevArtifactWriter", () => {
  test("announces a patch before the module files, graph.json and app.js catch up", async () => {
    const { writer, graph, read, dir } = await makeWriter();
    await writer.writeApp(graph, { generation: 4, vendorFile: "v.js" });
    const edited = { ...module, factory: "function () { edited(); }" };
    let atAnnounce: (ReturnType<typeof read> & { graph: boolean; module: string }) | null = null;
    await writer.commitPatch(
      graph,
      { version: 1, generation: 5, appGeneration: 4, vendorFile: "v.js", entries: {} },
      () => {
        atAnnounce = { ...read(), graph: existsSync(path.join(dir, "graph.json")), module: readModule(dir) };
      },
      { modules: [edited] },
    );
    expect(atAnnounce).toMatchObject({ manifest: { generation: 5, appGeneration: 4 }, graph: false });
    expect((atAnnounce as { app: string } | null)?.app).toContain('"generation":4');
    expect((atAnnounce as { module: string } | null)?.module).not.toContain("edited");
    const after = read();
    expect(after.manifest).toMatchObject({ generation: 5, appGeneration: 5 });
    expect(after.app).toContain('"generation":5');
    expect(after.app).toContain("edited()");
    expect(existsSync(path.join(dir, "graph.json"))).toBe(true);
  });

  test("a module a package's browser field turns off is written empty, and a Node built-in still throws", async () => {
    const { writer, graph, dir } = await makeWriter();
    graph.modules["a.ts"] = { vendor: false, mtimeMs: 0, hash: "", deps: ["stub:empty:fs", "stub:path"] };
    const vendor = readFileSync(path.join(dir, await writer.writeVendor(graph)), "utf8");
    expect(vendor).toContain('__akan.define("stub:empty:fs", function () {});');
    expect(vendor).toContain("[akan-csr] path is a Node built-in the browser does not have");
  });

  test("rewrites an app.js a crash left behind the manifest's generation", async () => {
    const { writer, graph, read } = await makeWriter();
    await writer.writeApp(graph, { generation: 5, vendorFile: "v.js" });
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

  test("a library app.js starts its bootstrap module, and a patch is announced under the writer's route", async () => {
    const { writer, graph, dir } = await makeWriter(
      { routePrefix: "/_akan/ssr-dev/", library: true },
      { "": "boot.ts" },
    );
    await writer.writeApp(graph, { generation: 2, vendorFile: "v.js", epoch: 7 });
    expect(readFileSync(path.join(dir, "app.js"), "utf8")).toContain(
      '__akan.startLibrary({"generation":2,"refresh":"refresh.js","bootstrap":"boot.ts","vendorFile":"v.js","epoch":7});',
    );
    expect(await writer.writePatch(3, [module])).toBe("/_akan/ssr-dev/patch-3.js");
  });

  test("after a whole build, clears what the registry before it left and keeps what the build wrote", async () => {
    const { writer, graph, dir } = await makeWriter();
    const gone = { ...module, id: "gone.ts" };
    await writer.writeModules([gone]);
    await writer.writePatch(7, [module]);
    await Bun.write(path.join(dir, "assets/old-abc.png"), "old");
    await Bun.write(path.join(dir, ".patching"), "123");
    await Bun.write(path.join(dir, "manifest.json.4242.tmp"), "{");
    await Bun.write(path.join(dir, "assets/new-def.png"), "new");
    await writer.pruneAfterFullBuild(graph, "vendor-a.js", {
      generation: 8,
      assets: [path.join(dir, "assets/new-def.png")],
    });
    expect(existsSync(path.join(dir, csrDevModuleFile("a.ts", ".js")))).toBe(true);
    expect(existsSync(path.join(dir, csrDevModuleFile("gone.ts", ".js")))).toBe(false);
    expect(existsSync(path.join(dir, "patch-7.js"))).toBe(false);
    expect(existsSync(path.join(dir, "patch-7.js.layout.json"))).toBe(false);
    expect(existsSync(path.join(dir, "assets/old-abc.png"))).toBe(false);
    expect(existsSync(path.join(dir, "assets/new-def.png"))).toBe(true);
    expect(existsSync(path.join(dir, ".patching"))).toBe(false);
    expect(existsSync(path.join(dir, "manifest.json.4242.tmp"))).toBe(false);
  });

  test("a reload drops a patch file left under its generation, and a whole build is marked while it writes", async () => {
    const { writer, dir } = await makeWriter();
    await writer.writePatch(6, [module]);
    await writer.forgetPatch(6);
    expect(existsSync(path.join(dir, "patch-6.js"))).toBe(false);
    expect(existsSync(path.join(dir, "patch-6.js.layout.json"))).toBe(false);
    expect(await writer.isBuilding()).toBe(false);
    await writer.markBuilding();
    expect(await writer.isBuilding()).toBe(true);
    await writer.clearBuilding();
    expect(await writer.isBuilding()).toBe(false);
  });
});
