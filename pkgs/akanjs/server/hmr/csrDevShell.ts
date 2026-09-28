import path from "node:path";
import { resolveStaticPath } from "../staticPath";
import {
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

export class CsrDevShell {
  static readonly #runtimeHash = Bun.hash(CSR_DEV_RUNTIME_SCRIPT).toString(36);
  static readonly #servedFile = /^(app\.js|vendor-[\w-]+\.js|patch-\d+\.js|assets\/[\w.-]+)$/;
  static readonly #sourceMapFile = /^(app\.js|patch-\d+\.js)\.map$/;
  readonly #dir: string;

  constructor(artifactDir: string) {
    this.#dir = path.join(artifactDir, CSR_DEV_DIRNAME);
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
    <script src="${CSR_DEV_ROUTE_PREFIX}runtime.js?v=${CsrDevShell.#runtimeHash}"></script>
    <script src="${CSR_DEV_ROUTE_PREFIX}${CsrDevShell.#attr(manifest.vendorFile)}"></script>
    <script src="${CSR_DEV_ROUTE_PREFIX}${CSR_DEV_APP_FILE}?g=${manifest.generation}" data-akan-csr-entry="${CsrDevShell.#attr(entry)}"></script>
  </body>
</html>
`;
  }

  // Only the vendor file is content-hashed; generations restart at 1 when `.akan` is wiped, so a cached patch could lie.
  async serve(req: Request): Promise<Response> {
    const name = new URL(req.url).pathname.slice(CSR_DEV_ROUTE_PREFIX.length);
    if (name === "runtime.js") return CsrDevShell.#js(CSR_DEV_RUNTIME_SCRIPT, "public, max-age=31536000, immutable");
    if (CsrDevShell.#sourceMapFile.test(name)) return await this.#serveSourceMap(name);
    if (!CsrDevShell.#servedFile.test(name)) return new Response("Not Found", { status: 404 });
    const filePath = resolveStaticPath(this.#dir, name);
    const file = filePath ? Bun.file(filePath) : null;
    if (!file || !(await file.exists())) return new Response("Not Found", { status: 404 });
    const cacheControl = name.startsWith("vendor-") ? "public, max-age=31536000, immutable" : "no-store";
    if (name.startsWith("assets/"))
      return new Response(file, { headers: CsrDevShell.#headers(file.type, cacheControl) });
    return CsrDevShell.#js(file, cacheControl);
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
