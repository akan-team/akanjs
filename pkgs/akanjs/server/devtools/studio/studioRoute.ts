import { Logger } from "akanjs/common";
import type { ReactNode } from "react";
import type { BuildChangesPayload, BuildGraphPayload } from "../../artifact";
import { createSystemPageHeaders } from "../../systemPages";
import { StudioDocument, type StudioEditor, type StudioQuery } from "./studioDocument";
import type { StudioView } from "./studioLayout";

export interface StudioRouteContext {
  basePath: string;
  appName: string;
  buildGraph: (() => Promise<BuildGraphPayload | null>) | null;
  buildChanges: ((since: string | null) => Promise<BuildChangesPayload | null>) | null;
}

const editors = new Set<StudioEditor>(["vscode", "cursor"]);
const views = new Set<StudioView>(["erd", "signals", "changes"]);

export class StudioRoute {
  static readonly logger = new Logger("StudioRoute");
  readonly #context: StudioRouteContext;

  constructor(context: StudioRouteContext) {
    this.#context = context;
  }

  static queryOf(url: URL): StudioQuery {
    const view = url.searchParams.get("view");
    const editor = url.searchParams.get("editor");
    return {
      view: view && views.has(view as StudioView) ? (view as StudioView) : "erd",
      module: url.searchParams.get("module") || null,
      editor: editor && editors.has(editor as StudioEditor) ? (editor as StudioEditor) : "vscode",
      since: url.searchParams.get("since")?.trim() || null,
    };
  }

  async page(req: Request): Promise<Response> {
    const { basePath, appName } = this.#context;
    const query = StudioRoute.queryOf(new URL(req.url));
    const loaded = await this.#load(query);
    if ("error" in loaded) return await StudioRoute.#html(StudioDocument.unavailable(appName, loaded.error), 503);
    return await StudioRoute.#html(StudioDocument.render({ basePath, appName, payload: loaded.payload, query }), 200);
  }

  async graph(req: Request): Promise<Response> {
    const loaded = await this.#load(StudioRoute.queryOf(new URL(req.url)));
    if ("error" in loaded)
      return Response.json({ error: loaded.error }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return Response.json(loaded.payload, { headers: { "Cache-Control": "no-store" } });
  }

  async #load({
    view,
    since,
  }: StudioQuery): Promise<{ payload: BuildGraphPayload | BuildChangesPayload } | { error: string }> {
    const { buildGraph, buildChanges } = this.#context;
    try {
      const payload =
        view === "changes" ? (buildChanges ? await buildChanges(since) : null) : buildGraph ? await buildGraph() : null;
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
