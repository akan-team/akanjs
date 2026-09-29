import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CSR_DEV_DIRNAME,
  CSR_DEV_MANIFEST_FILE,
  type CsrDevLayout,
  type CsrDevManifest,
  csrDevModuleFile,
} from "./csrDevManifest";
import { CSR_DEV_RUNTIME_SCRIPT } from "./csrDevRuntime";
import { CsrDevShell } from "./csrDevShell";

describe("CsrDevShell", () => {
  let artifactDir: string;
  let shell: CsrDevShell;

  beforeAll(async () => {
    artifactDir = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-shell-"));
    shell = new CsrDevShell(artifactDir);
  });

  afterAll(async () => {
    await rm(artifactDir, { recursive: true, force: true });
  });

  const writeManifest = async (manifest: CsrDevManifest) =>
    await Bun.write(path.join(artifactDir, CSR_DEV_DIRNAME, CSR_DEV_MANIFEST_FILE), JSON.stringify(manifest));

  test("renders nothing until a registry bundle exists for the basePath", async () => {
    expect(await shell.render({ basePath: "", lang: "en", title: "app", cssHref: null })).toBeNull();
    await writeManifest({ version: 1, generation: 7, vendorFile: "vendor-abc.js", entries: { admin: "x.tsx" } });
    expect(await shell.render({ basePath: "", lang: "en", title: "app", cssHref: null })).toBeNull();
  });

  test("loads the runtime, the vendor file and the app bundle in order, naming the basePath's entry", async () => {
    await writeManifest({
      version: 1,
      generation: 7,
      vendorFile: "vendor-abc.js",
      entries: { "": "apps/a/.akan/generated/csr-dev/index.csr.tsx" },
    });
    const html =
      (await shell.render({ basePath: "", lang: "ko", title: "a<b", cssHref: "/_akan/styles/root-1.css" })) ?? "";
    const runtimeAt = html.indexOf("/_akan/csr-dev/runtime.js?v=");
    const vendorAt = html.indexOf('src="/_akan/csr-dev/vendor-abc.js"');
    const appAt = html.indexOf('src="/_akan/csr-dev/app.js?g=7"');
    expect(runtimeAt).toBeGreaterThan(0);
    expect(vendorAt).toBeGreaterThan(runtimeAt);
    expect(appAt).toBeGreaterThan(vendorAt);
    expect(html).toContain('data-akan-csr-entry="apps/a/.akan/generated/csr-dev/index.csr.tsx"');
    expect(html).toContain('<link rel="stylesheet" href="/_akan/styles/root-1.css" data-akan-css="active" />');
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain("<title>a&lt;b</title>");
  });

  test("serves the runtime as immutable, the app bundle uncached, and nothing outside its own files", async () => {
    await Bun.write(path.join(artifactDir, CSR_DEV_DIRNAME, "app.js"), "__akan.start({});");
    const runtime = await shell.serve(new Request("http://localhost/_akan/csr-dev/runtime.js?v=1"));
    expect(runtime.headers.get("Cache-Control")).toContain("immutable");
    expect(await runtime.text()).toBe(CSR_DEV_RUNTIME_SCRIPT);
    const app = await shell.serve(new Request("http://localhost/_akan/csr-dev/app.js?g=7"));
    expect(app.headers.get("Cache-Control")).toBe("no-store");
    expect(await app.text()).toBe("__akan.start({});");
    expect((await shell.serve(new Request("http://localhost/_akan/csr-dev/manifest.json"))).status).toBe(404);
    expect((await shell.serve(new Request("http://localhost/_akan/csr-dev/..%2Fbase-artifact.json"))).status).toBe(404);
  });

  test("holds a booting tab's app.js until the file holds the generation it asked for", async () => {
    const waiting = new CsrDevShell(artifactDir, { appWaitMs: 2_000, appPollMs: 10 });
    const appFile = path.join(artifactDir, CSR_DEV_DIRNAME, "app.js");
    await writeManifest({ version: 1, generation: 8, appGeneration: 7, vendorFile: "vendor-abc.js", entries: {} });
    await Bun.write(appFile, "generation 7");
    const served = waiting.serve(new Request("http://localhost/_akan/csr-dev/app.js?g=8"));
    await Bun.sleep(100);
    await Bun.write(appFile, "generation 8");
    await writeManifest({ version: 1, generation: 8, appGeneration: 8, vendorFile: "vendor-abc.js", entries: {} });
    expect(await (await served).text()).toBe("generation 8");
  });

  test("serves the app.js it has once the wait runs out", async () => {
    const impatient = new CsrDevShell(artifactDir, { appWaitMs: 60, appPollMs: 10 });
    await writeManifest({ version: 1, generation: 9, appGeneration: 8, vendorFile: "vendor-abc.js", entries: {} });
    await Bun.write(path.join(artifactDir, CSR_DEV_DIRNAME, "app.js"), "generation 8");
    const started = Date.now();
    const served = await impatient.serve(new Request("http://localhost/_akan/csr-dev/app.js?g=9"));
    expect(await served.text()).toBe("generation 8");
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });

  test("never holds an ask for a generation the manifest has not announced", async () => {
    const waiting = new CsrDevShell(artifactDir, { appWaitMs: 2_000, appPollMs: 10 });
    await writeManifest({ version: 1, generation: 9, appGeneration: 8, vendorFile: "vendor-abc.js", entries: {} });
    await Bun.write(path.join(artifactDir, CSR_DEV_DIRNAME, "app.js"), "generation 8");
    const started = Date.now();
    const served = await waiting.serve(new Request("http://localhost/_akan/csr-dev/app.js?g=99"));
    expect(await served.text()).toBe("generation 8");
    expect(Date.now() - started).toBeLessThan(500);
  });

  test("merges app.js's source map once per layout, and again once app.js is rewritten", async () => {
    const dir = path.join(artifactDir, CSR_DEV_DIRNAME);
    const moduleMap = path.join(dir, csrDevModuleFile("app/Card.tsx", ".js.map"));
    const writeMap = async (source: string) =>
      await Bun.write(moduleMap, JSON.stringify({ version: 3, sources: [source], names: [], mappings: "AAAA" }));
    const writeLayout = async (lineCount: number) =>
      await Bun.write(
        path.join(dir, "app.js.layout.json"),
        JSON.stringify({ lineCount, modules: [["app/Card.tsx", 1]] } satisfies CsrDevLayout),
      );
    const sources = async () =>
      (
        (await (await shell.serve(new Request("http://localhost/_akan/csr-dev/app.js.map"))).json()) as {
          sources: string[];
        }
      ).sources;
    await writeMap("/repo/app/Card.tsx");
    await writeLayout(3);
    expect(await sources()).toEqual(["/repo/app/Card.tsx"]);
    await writeMap("/repo/app/Card-renamed.tsx");
    expect(await sources()).toEqual(["/repo/app/Card.tsx"]);
    await writeLayout(4);
    expect(await sources()).toEqual(["/repo/app/Card-renamed.tsx"]);
  });

  test("holds a boot.json ask no longer than it asked to wait, and never past the boot wait", async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-boot-"));
    try {
      const shell = new CsrDevShell(empty, { bootWaitMs: 150, appPollMs: 10 });
      const timed = async (url: string) => {
        const started = Date.now();
        const response = await shell.serve(new Request(url));
        return { status: response.status, ms: Date.now() - started };
      };
      const short = await timed("http://localhost/_akan/csr-dev/boot.json?wait=40");
      expect(short.status).toBe(503);
      expect(short.ms).toBeLessThan(140);
      const capped = await timed("http://localhost/_akan/csr-dev/boot.json?wait=60000");
      expect(capped.status).toBe(503);
      expect(capped.ms).toBeGreaterThanOrEqual(140);
      expect(capped.ms).toBeLessThan(1_000);
      const negative = await timed("http://localhost/_akan/csr-dev/boot.json?wait=-5");
      expect(negative.status).toBe(503);
      expect(negative.ms).toBeLessThan(100);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  test("stops holding a boot.json or app.js ask once the tab that made it goes away", async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-abort-"));
    try {
      const options = { bootWaitMs: 5_000, appWaitMs: 5_000, appPollMs: 10 };
      await writeManifest({ version: 1, generation: 9, appGeneration: 8, vendorFile: "vendor-abc.js", entries: {} });
      await Bun.write(path.join(artifactDir, CSR_DEV_DIRNAME, "app.js"), "generation 8");
      const closed = new AbortController();
      const started = Date.now();
      const boot = new CsrDevShell(empty, options).serve(
        new Request("http://localhost/_akan/csr-dev/boot.json", { signal: closed.signal }),
      );
      const app = new CsrDevShell(artifactDir, options).serve(
        new Request("http://localhost/_akan/csr-dev/app.js?g=9", { signal: closed.signal }),
      );
      await Bun.sleep(50);
      closed.abort();
      expect((await boot).status).toBe(503);
      expect(await (await app).text()).toBe("generation 8");
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
