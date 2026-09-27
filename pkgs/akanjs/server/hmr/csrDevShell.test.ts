import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CSR_DEV_DIRNAME, CSR_DEV_MANIFEST_FILE, type CsrDevManifest } from "./csrDevManifest";
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
});
