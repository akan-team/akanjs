import { Logger } from "akanjs/common";
import type { ReactNode } from "react";
import {
  type BuildChangesPayload,
  BuilderRpc,
  type BuildFrameworkPayload,
  type BuildGraphPayload,
} from "../../artifact";
import { createSystemPageHeaders } from "../../systemPages";
import { StudioDocument, type StudioEditor, type StudioPayload, type StudioQuery } from "./studioDocument";
import type { StudioView } from "./studioLayout";
import type { StudioRuntimePayload } from "./studioRuntimeGraph";

export interface StudioRouteContext {
  basePath: string;
  appName: string;
  web: boolean;
  buildGraph: (() => Promise<BuildGraphPayload | null>) | null;
  buildChanges: ((since: string | null) => Promise<BuildChangesPayload | null>) | null;
  buildFramework: (() => Promise<BuildFrameworkPayload | null>) | null;
  runtime: () => StudioRuntimePayload;
}

const editors = new Set<StudioEditor>(["vscode", "cursor"]);
const views = new Set<StudioView>(["erd", "signals", "changes", "runtime", "framework"]);

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
    const url = new URL(req.url);
    const asked = StudioRoute.queryOf(url);
    const loaded = await this.#load(asked);
    const landed = "error" in loaded && loaded.unanswered && !views.has(url.searchParams.get("view") as StudioView);
    const query: StudioQuery = landed ? { ...asked, view: "runtime" } : asked;
    const shown = landed ? await this.#load(query) : loaded;
    if ("error" in shown)
      return await StudioRoute.#html(
        StudioDocument.unavailable({ basePath, appName, query, reason: shown.error }),
        503,
      );
    return await StudioRoute.#html(StudioDocument.render({ basePath, appName, payload: shown.payload, query }), 200);
  }

  async graph(req: Request): Promise<Response> {
    const loaded = await this.#load(StudioRoute.queryOf(new URL(req.url)));
    if ("error" in loaded)
      return Response.json({ error: loaded.error }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return Response.json(loaded.payload, { headers: { "Cache-Control": "no-store" } });
  }

  async #payloadOf({ view, since }: StudioQuery): Promise<StudioPayload | null> {
    const { buildGraph, buildChanges, buildFramework } = this.#context;
    if (view === "changes") return buildChanges ? await buildChanges(since) : null;
    if (view === "framework") return buildFramework ? await buildFramework() : null;
    return buildGraph ? await buildGraph() : null;
  }

  async #load(query: StudioQuery): Promise<{ payload: StudioPayload } | { error: string; unanswered: boolean }> {
    if (query.view === "runtime") return { payload: this.#context.runtime() };
    try {
      const payload = await this.#payloadOf(query);
      return payload ? { payload } : { error: this.#builderless(), unanswered: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      StudioRoute.logger.warn(`Failed to build the Akan Graph: ${message}`);
      return { error: message, unanswered: BuilderRpc.isTimeout(error) };
    }
  }

  #builderless(): string {
    const reach = this.#context.web
      ? "Akan Studio reads this view from the dev builder; open it under `akan start`."
      : "Akan Studio reads this view from the dev builder, which a server reaches only with its web surface on, and this one serves the API only (`AKAN_SSR=false` or `setWeb(false)`).";
    return `${reach} Runtime (live) reads this running server and needs no builder.`;
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
