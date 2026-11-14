import fs from "node:fs";
import path from "node:path";
import { getBasePathFromPathname } from "akanjs/common";
import type { BuilderRpc } from "./artifact";
import { HMR_CLIENT_SCRIPT } from "./hmr/clientScript";
import { CSR_DEV_ROUTE_PREFIX } from "./hmr/csrDevManifest";
import type { CsrDevShell } from "./hmr/csrDevShell";
import { DevRoutes } from "./routing/devRoutes";
import { ScriptPolicy } from "./scriptPolicy";
import { resolveStaticPath } from "./staticPath";
import type { BaseBuildArtifact, HttpRoutes } from "./types";
import { WebRouteContext } from "./webRouteContext";

interface WebCsrSurfaceOptions {
  devShell: CsrDevShell | null;
  builderRpc: () => BuilderRpc | null;
}

export class WebCsrSurface {
  readonly #context: WebRouteContext;
  readonly devShell: CsrDevShell | null;
  readonly #builderRpc: () => BuilderRpc | null;
  #armed = false;
  readonly #builds = new Map<string, Promise<unknown>>();
  //? Keyed on mtime: a CSR document inlines its whole bundle, and hashing a megabyte on every request costs a millisecond.
  readonly #fileHashes = new Map<string, { stamp: number; hashes: string[] }>();

  constructor(context: WebRouteContext, { devShell, builderRpc }: WebCsrSurfaceOptions) {
    this.#context = context;
    this.devShell = devShell;
    this.#builderRpc = builderRpc;
  }

  routes(csrOutputDir: string): HttpRoutes {
    const { stats } = this.#context;
    return {
      "/__csr": async (req) => {
        stats.csr += 1;
        if (this.devShell) return await this.#serveDevShell(req, "/", this.devShell);
        const csrHtml = await this.#resolveCsrHtml(req, csrOutputDir, "/");
        const csrFile = csrHtml ? Bun.file(csrHtml) : null;
        if (csrHtml && csrFile && (await csrFile.exists()))
          return this.#htmlResponse(req, await csrFile.text(), { filePath: csrHtml });
        const nonce = ScriptPolicy.createNonce();
        const htmlText = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Minimal</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="/csr.js"></script>
  </body>
</html>`;
        return this.#htmlResponse(req, htmlText, { nonce });
      },
      ...(this.devShell
        ? DevRoutes.mount({
            [`${CSR_DEV_ROUTE_PREFIX}*`]: async (req: Request) => {
              stats.staticAsset += 1;
              return (await this.devShell?.serve(req)) ?? new Response("Not Found", { status: 404 });
            },
          })
        : {}),
    };
  }

  async answer(req: Request, url: URL, csrOutputDir: string): Promise<Response | null> {
    const { stats, prodMode } = this.#context;
    const isCsr = url.searchParams.get("csr") === "true";
    if (isCsr) {
      stats.csr += 1;
      if (this.devShell) return await this.#serveDevShell(req, url.pathname, this.devShell);
      const csrHtml = await this.#resolveCsrHtml(req, csrOutputDir, url.pathname);
      if (!csrHtml) return this.#unavailableResponse(url.pathname);
      return this.#htmlResponse(req, await Bun.file(csrHtml).text(), { filePath: csrHtml });
    }

    const csrAssetPath = path.extname(url.pathname) ? resolveStaticPath(csrOutputDir, url.pathname) : null;
    if (csrAssetPath && (await Bun.file(csrAssetPath).exists())) {
      stats.staticAsset += 1;
      return WebRouteContext.fileResponse(req, csrAssetPath, {
        contentType: Bun.file(csrAssetPath).type || "application/octet-stream",
        cacheControl: prodMode ? "public, max-age=31536000, immutable" : undefined,
      });
    }
    return null;
  }

  //? A built document's scripts are named by hash, as it is the same file for every request. What dev adds (the HMR
  //? client, which imports modules itself) and what a dev shell loads by URL run under a nonce of the response.
  #htmlResponse(req: Request, html: string, { filePath, nonce }: { filePath?: string; nonce?: string } = {}): Response {
    const hashes = filePath ? this.#hashesOf(filePath, html) : [];
    const devNonce = this.#context.prodMode ? nonce : (nonce ?? ScriptPolicy.createNonce());
    const body = this.#context.prodMode ? html : this.#withCsrHmr(html, devNonce);
    return new Response(body, {
      headers: this.#context.htmlResponseHeaders(200, req, { nonce: devNonce, hashes }),
    });
  }

  #hashesOf(filePath: string, html: string): string[] {
    const stamp = Bun.file(filePath).lastModified;
    const held = this.#fileHashes.get(filePath);
    if (held?.stamp === stamp) return held.hashes;
    const hashes = ScriptPolicy.hashesOf(html);
    this.#fileHashes.set(filePath, { stamp, hashes });
    return hashes;
  }

  #withCsrHmr(html: string, nonce: string | undefined): string {
    const csrGeneration = this.#context.renderState.csrGeneration ?? null;
    const flags = `self.__AKAN_HMR_CLIENT__="csr";self.__AKAN_CSR_GENERATION__=${csrGeneration};`;
    const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
    return WebCsrSurface.#injectBeforeBodyEnd(html, `<script${nonceAttr}>${flags}${HMR_CLIENT_SCRIPT}</script>`);
  }
  // Armed before the first render: the builder keeps the registry bundle current only after something asked for it.
  async #serveDevShell(req: Request, pathname: string, shell: CsrDevShell): Promise<Response> {
    await this.#armFor(req, pathname);
    const { artifact } = this.#context;
    const basePath = getBasePathFromPathname(pathname, { basePaths: artifact.basePaths, i18n: artifact.i18n }) ?? "";
    const nonce = ScriptPolicy.createNonce();
    const html = await shell.render({
      basePath,
      lang: "en",
      title: process.env.AKAN_PUBLIC_APP_NAME ?? "akan",
      cssHref: this.#context.stylesheetHref(req, pathname),
      nonce,
    });
    if (!html) return this.#unavailableResponse(pathname);
    return this.#htmlResponse(req, html, { nonce });
  }
  async #resolveCsrHtml(req: Request, csrOutputDir: string, pathname: string): Promise<string | null> {
    const resolved = WebCsrSurface.#resolveCsrHtmlPath(csrOutputDir, pathname, this.#context.artifact);
    if (resolved) return resolved;
    await this.#armFor(req, pathname);
    return WebCsrSurface.#resolveCsrHtmlPath(csrOutputDir, pathname, this.#context.artifact);
  }
  //? Security: only a Host a dev route answers may start a dev build, as a page on a rebound name could otherwise.
  #armFor(req: Request, reason: string): Promise<unknown> {
    return DevRoutes.admitsHost(req) ? this.armArtifact(reason) : Promise.resolve();
  }
  armArtifact(reason: string): Promise<unknown> {
    const rpc = this.#builderRpc();
    // Arm once: after a build the builder keeps CSR current, so a still-missing file means an unknown basePath.
    if (this.#armed || !rpc) return Promise.resolve();
    return this.#singleFlight("csr", () =>
      rpc
        .buildCsr(reason)
        .then(() => {
          this.#armed = true;
          this.#context.logger.info(`[csr] dev CSR artifact built on demand (${reason})`);
        })
        .catch((err: unknown) => {
          this.#context.logger.error(
            `[csr] on-demand build failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
    );
  }
  //? Awaited on every read: the builder answers at once unless a save moved its generation since its last view build.
  //? Never the dev registry shell, which loads its modules from this server: a sandboxed view cannot reach it.
  async buildMcpAppViews(): Promise<void> {
    const rpc = this.#builderRpc();
    if (!rpc) return;
    await this.#singleFlight("mcpShell", () =>
      rpc.buildCsr("mcp app view", { shell: true }).catch((err: unknown) => {
        this.#context.logger.error(`[mcp] view build failed: ${err instanceof Error ? err.message : String(err)}`);
      }),
    );
  }
  #singleFlight(kind: string, run: () => Promise<unknown>): Promise<unknown> {
    const pending = this.#builds.get(kind) ?? run().finally(() => this.#builds.delete(kind));
    this.#builds.set(kind, pending);
    return pending;
  }
  #unavailableResponse(pathname: string): Response {
    if (this.#context.prodMode) return new Response("Not Found", { status: 404 });
    const message = `No CSR artifact for ${pathname}. Dev CSR is built on demand; check the dev server log for a csr-build failure and verify the basePath in the URL.`;
    this.#context.logger.warn(`[csr] ${message}`);
    return new Response(message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  static #injectBeforeBodyEnd(html: string, snippet: string): string {
    const matches = [...html.matchAll(/<\/body\s*>/gi)];
    const last = matches.at(-1);
    if (!last || last.index === undefined) return `${html}\n${snippet}`;
    return `${html.slice(0, last.index)}${snippet}\n${html.slice(last.index)}`;
  }

  static #resolveCsrHtmlPath(csrOutputDir: string, pathname: string, artifact: BaseBuildArtifact): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: artifact.basePaths,
      i18n: artifact.i18n,
    });
    const filename = basePath ? `${basePath}.html` : "index.html";
    const filePath = resolveStaticPath(csrOutputDir, filename);
    return filePath && fs.existsSync(filePath) ? filePath : null;
  }
}
