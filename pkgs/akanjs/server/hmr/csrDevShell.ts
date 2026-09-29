import fs from "node:fs/promises";
import path from "node:path";
import { resolveStaticPath } from "../staticPath";
import {
  appGenerationOf,
  CSR_DEV_APP_FILE,
  CSR_DEV_DIRNAME,
  CSR_DEV_MANIFEST_FILE,
  CSR_DEV_ROUTE_PREFIX,
  type CsrDevLayout,
  type CsrDevManifest,
  csrDevModuleFile,
} from "./csrDevManifest";
import { CSR_DEV_RUNTIME_SCRIPT } from "./csrDevRuntime";
import { CsrDevSourceMap, type RawSourceMap } from "./csrDevSourceMap";

export interface CsrDevShellRenderOptions {
  basePath: string;
  lang: string;
  title: string;
  cssHref: string | null;
}

export interface CsrDevShellOptions {
  /** The registry this serves: the CSR one by default, `ssr-dev` for the client code of SSR pages. */
  dirName?: string;
  routePrefix?: string;
  appWaitMs?: number;
  appPollMs?: number;
  bootWaitMs?: number;
}

export class CsrDevShell {
  static readonly #runtimeHash = Bun.hash(CSR_DEV_RUNTIME_SCRIPT).toString(36);
  static readonly #servedFile = /^(app\.js|vendor-[\w-]+\.js|patch-\d+\.js|assets\/[\w.-]+)$/;
  static readonly #sourceMapFile = /^(app\.js|patch-\d+\.js)\.map$/;
  readonly #dir: string;
  readonly #routePrefix: string;
  readonly #appWaitMs: number;
  readonly #appPollMs: number;
  readonly #bootWaitMs: number;
  //? Merging app.js's map reads one map per module (about 1,300 on minimal) into 2.5MB: kept while its layout stands.
  readonly #sourceMaps = new Map<string, { stamp: string; body: string }>();

  constructor(
    artifactDir: string,
    {
      dirName = CSR_DEV_DIRNAME,
      routePrefix = CSR_DEV_ROUTE_PREFIX,
      appWaitMs = 2_000,
      appPollMs = 20,
      bootWaitMs = 60_000,
    }: CsrDevShellOptions = {},
  ) {
    this.#dir = path.join(artifactDir, dirName);
    this.#routePrefix = routePrefix;
    this.#appWaitMs = appWaitMs;
    this.#appPollMs = appPollMs;
    this.#bootWaitMs = bootWaitMs;
  }

  async readManifest(): Promise<CsrDevManifest | null> {
    const file = Bun.file(path.join(this.#dir, CSR_DEV_MANIFEST_FILE));
    if (!(await file.exists())) return null;
    return (await file.json().catch(() => null)) as CsrDevManifest | null;
  }

  async render({ basePath, lang, title, cssHref }: CsrDevShellRenderOptions): Promise<string | null> {
    const manifest = await this.readManifest();
    const entry = manifest?.entries[basePath];
    if (!manifest || !entry) return null;
    const stylesheet = cssHref
      ? `    <link rel="stylesheet" href="${CsrDevShell.#attr(cssHref)}" data-akan-css="active" />\n`
      : "";
    return `<!doctype html>
<html lang="${CsrDevShell.#attr(lang)}">
  <head>
    <meta charset="utf-8" />
    <title>${CsrDevShell.#attr(title)}</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
${stylesheet}  </head>
  <body>
    <div id="root"></div>
    <script src="${this.#routePrefix}runtime.js?v=${CsrDevShell.#runtimeHash}"></script>
    <script src="${this.#routePrefix}${CsrDevShell.#attr(manifest.vendorFile)}"></script>
    <script src="${this.#routePrefix}${CSR_DEV_APP_FILE}?g=${manifest.generation}" data-akan-csr-entry="${CsrDevShell.#attr(entry)}"></script>
  </body>
</html>
`;
  }

  // Only the vendor file is content-hashed; generations restart at 1 when `.akan` is wiped, so a cached patch could lie.
  async serve(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const name = url.pathname.slice(this.#routePrefix.length);
    if (name === "runtime.js") return CsrDevShell.#js(CSR_DEV_RUNTIME_SCRIPT, "public, max-age=31536000, immutable");
    if (name === "boot.json") return await this.#serveBoot(url.searchParams.get("wait"), req.signal);
    if (CsrDevShell.#sourceMapFile.test(name)) return await this.#serveSourceMap(name);
    if (!CsrDevShell.#servedFile.test(name)) return new Response("Not Found", { status: 404 });
    if (name === CSR_DEV_APP_FILE) await this.#waitForApp(Number(url.searchParams.get("g")), req.signal);
    const filePath = resolveStaticPath(this.#dir, name);
    const file = filePath ? Bun.file(filePath) : null;
    if (!file || !(await file.exists())) return new Response("Not Found", { status: 404 });
    const cacheControl = name.startsWith("vendor-") ? "public, max-age=31536000, immutable" : "no-store";
    if (name.startsWith("assets/"))
      return new Response(file, { headers: CsrDevShell.#headers(file.type, cacheControl) });
    return CsrDevShell.#js(file, cacheControl);
  }

  //? A patch is announced before app.js is rewritten, so a tab booting in that gap asks for a generation app.js does not
  //? hold yet. Held until it does, or until the wait runs out: then it boots behind, and hello's generation catches it
  //? up (an SSR tab) or reloads it (a CSR tab). A generation the manifest has not announced is never waited for: the
  //? manifest is written before the announcement, so only a tab from an earlier session (or anyone) can ask for one.
  async #waitForApp(generation: number, signal?: AbortSignal): Promise<void> {
    if (!Number.isInteger(generation) || generation <= 0) return;
    const deadline = Date.now() + this.#appWaitMs;
    for (;;) {
      const manifest = await this.readManifest();
      if (!manifest || manifest.generation < generation || appGenerationOf(manifest) >= generation) return;
      if (Date.now() >= deadline || signal?.aborted) return;
      await Bun.sleep(this.#appPollMs);
    }
  }

  //? An SSR page rendered before the boot build of its registry finished asks here what to load; held until it exists,
  //? or for the `wait` it asked (at most the boot wait), since a held request takes one of the browser's six sockets.
  async #serveBoot(wait: string | null, signal?: AbortSignal): Promise<Response> {
    const asked = wait === null ? Number.NaN : Number(wait);
    const waitMs = Number.isInteger(asked) ? Math.min(Math.max(asked, 0), this.#bootWaitMs) : this.#bootWaitMs;
    const deadline = Date.now() + waitMs;
    for (;;) {
      const manifest = await this.readManifest();
      if (manifest) {
        const body = JSON.stringify({
          generation: manifest.generation,
          vendorFile: manifest.vendorFile,
          epoch: manifest.epoch ?? null,
        });
        return new Response(body, { headers: CsrDevShell.#headers("application/json", "no-store") });
      }
      if (Date.now() >= deadline || signal?.aborted) return new Response("Service Unavailable", { status: 503 });
      await Bun.sleep(this.#appPollMs * 5);
    }
  }

  // Composed when DevTools asks, not on every save: most saves are never debugged.
  async #serveSourceMap(name: string): Promise<Response> {
    const generatedFile = name.slice(0, -".map".length);
    const layoutPath = path.join(this.#dir, `${generatedFile}.layout.json`);
    const stat = await fs.stat(layoutPath).catch(() => null);
    if (!stat) return new Response("Not Found", { status: 404 });
    const stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    const cached = this.#sourceMaps.get(generatedFile);
    const body = cached?.stamp === stamp ? cached.body : await this.#mergeSourceMap(generatedFile, layoutPath);
    if (!body) return new Response("Not Found", { status: 404 });
    this.#sourceMaps.delete(generatedFile);
    this.#sourceMaps.set(generatedFile, { stamp, body });
    for (const oldest of this.#sourceMaps.keys()) {
      if (this.#sourceMaps.size <= 4) break;
      this.#sourceMaps.delete(oldest);
    }
    return new Response(body, { headers: CsrDevShell.#headers("application/json", "no-store") });
  }

  async #mergeSourceMap(generatedFile: string, layoutPath: string): Promise<string | null> {
    const layoutText = await fs.readFile(layoutPath, "utf8").catch(() => null);
    if (!layoutText) return null;
    const layout = JSON.parse(layoutText) as CsrDevLayout;
    const sections = await Promise.all(
      layout.modules.map(async ([id, line]) => {
        const file = Bun.file(path.join(this.#dir, csrDevModuleFile(id, ".js.map")));
        return (await file.exists()) ? { line, map: (await file.json()) as RawSourceMap } : null;
      }),
    );
    const map = CsrDevSourceMap.merge(
      generatedFile,
      sections.filter((section) => section !== null),
      layout.lineCount,
    );
    return JSON.stringify(map);
  }

  static #js(body: string | Blob, cacheControl: string): Response {
    return new Response(body, { headers: CsrDevShell.#headers("application/javascript; charset=utf-8", cacheControl) });
  }

  static #headers(contentType: string, cacheControl: string): Headers {
    return new Headers({
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    });
  }

  static #attr(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  }
}
