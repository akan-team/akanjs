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
    if (name === "boot.json") return await this.#serveBoot();
    if (CsrDevShell.#sourceMapFile.test(name)) return await this.#serveSourceMap(name);
    if (!CsrDevShell.#servedFile.test(name)) return new Response("Not Found", { status: 404 });
    if (name === CSR_DEV_APP_FILE) await this.#waitForApp(Number(url.searchParams.get("g")));
    const filePath = resolveStaticPath(this.#dir, name);
    const file = filePath ? Bun.file(filePath) : null;
    if (!file || !(await file.exists())) return new Response("Not Found", { status: 404 });
    const cacheControl = name.startsWith("vendor-") ? "public, max-age=31536000, immutable" : "no-store";
    if (name.startsWith("assets/"))
      return new Response(file, { headers: CsrDevShell.#headers(file.type, cacheControl) });
    return CsrDevShell.#js(file, cacheControl);
  }

  //? A patch is announced before app.js is rewritten, so a tab booting in that gap asks for a generation app.js does not
  //? hold yet. Held until it does, or until the wait runs out: then it boots behind, and hello's generation reloads it.
  async #waitForApp(generation: number): Promise<void> {
    if (!Number.isInteger(generation) || generation <= 0) return;
    const deadline = Date.now() + this.#appWaitMs;
    for (;;) {
      const manifest = await this.readManifest();
      if (!manifest || appGenerationOf(manifest) >= generation || Date.now() >= deadline) return;
      await Bun.sleep(this.#appPollMs);
    }
  }

  //? An SSR page rendered before the boot build of its registry finished asks here what to load; held until it exists.
  async #serveBoot(): Promise<Response> {
    const deadline = Date.now() + this.#bootWaitMs;
    for (;;) {
      const manifest = await this.readManifest();
      if (manifest) {
        const body = JSON.stringify({ generation: manifest.generation, vendorFile: manifest.vendorFile });
        return new Response(body, { headers: CsrDevShell.#headers("application/json", "no-store") });
      }
      if (Date.now() >= deadline) return new Response("Service Unavailable", { status: 503 });
      await Bun.sleep(this.#appPollMs * 5);
    }
  }

  // Composed when DevTools asks, not on every save: most saves are never debugged.
  async #serveSourceMap(name: string): Promise<Response> {
    const generatedFile = name.slice(0, -".map".length);
    const layoutFile = Bun.file(path.join(this.#dir, `${generatedFile}.layout.json`));
    if (!(await layoutFile.exists())) return new Response("Not Found", { status: 404 });
    const layout = (await layoutFile.json()) as CsrDevLayout;
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
    return new Response(JSON.stringify(map), { headers: CsrDevShell.#headers("application/json", "no-store") });
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
