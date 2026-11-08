import { Logger } from "akanjs/common";
import type { ReactNode } from "react";
import type { BuildGraphPayload } from "../../artifact";
import { createSystemPageHeaders } from "../../systemPages";
import { StudioDocument, type StudioEditor, type StudioQuery } from "./studioDocument";

export interface StudioRouteContext {
  basePath: string;
  appName: string;
  buildGraph: (() => Promise<BuildGraphPayload | null>) | null;
}

const editors = new Set<StudioEditor>(["vscode", "cursor"]);

export class StudioRoute {
  static readonly logger = new Logger("StudioRoute");
  readonly #context: StudioRouteContext;

  constructor(context: StudioRouteContext) {
    this.#context = context;
  }

  static queryOf(url: URL): StudioQuery {
    const view = url.searchParams.get("view") === "signals" ? "signals" : "erd";
    const editor = url.searchParams.get("editor");
    return {
      view,
      module: url.searchParams.get("module") || null,
      editor: editor && editors.has(editor as StudioEditor) ? (editor as StudioEditor) : "vscode",
    };
  }

  async page(req: Request): Promise<Response> {
    const { basePath, appName } = this.#context;
    const loaded = await this.#load();
    if ("error" in loaded) return await StudioRoute.#html(StudioDocument.unavailable(appName, loaded.error), 503);
    const query = StudioRoute.queryOf(new URL(req.url));
    return await StudioRoute.#html(StudioDocument.render({ basePath, appName, payload: loaded.payload, query }), 200);
  }

  async graph(): Promise<Response> {
    const loaded = await this.#load();
    if ("error" in loaded)
      return Response.json({ error: loaded.error }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return Response.json(loaded.payload, { headers: { "Cache-Control": "no-store" } });
  }

  async #load(): Promise<{ payload: BuildGraphPayload } | { error: string }> {
    const { buildGraph } = this.#context;
    try {
      const payload = buildGraph ? await buildGraph() : null;
      return payload
        ? { payload }
        : { error: "Akan Studio reads the graph from the dev builder; open it under `akan start`." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      StudioRoute.logger.warn(`Failed to build the Akan Graph: ${message}`);
      return { error: message };
    }
  }

  //? The editor extension's panel frames Studio from a `vscode-webview:` document under a `vscode-file:` window; no
  //? web page has either scheme, so the page stays unframeable from the web.
  static #headers(): Headers {
    const headers = createSystemPageHeaders();
    headers.delete("X-Frame-Options");
    headers.set("Content-Security-Policy", "frame-ancestors 'self' vscode-webview: vscode-file:; base-uri 'self'");
    return headers;
  }

  static async #html(document: ReactNode, status: number): Promise<Response> {
    const { renderToReadableStream } = await import("react-dom/server.browser");
    return new Response(await renderToReadableStream(document), { status, headers: StudioRoute.#headers() });
  }
}
