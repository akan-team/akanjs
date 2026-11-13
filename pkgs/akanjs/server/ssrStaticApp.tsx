import { Readable } from "node:stream";
import type { Logger } from "akanjs/common";
import { AppScope, createRequestStore, RenderScope, requestStorage } from "akanjs/fetch";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { createFromNodeStream } from "react-server-dom-webpack/client.node";
import { ViewportMeta } from "../client/viewportMeta";
import type { RscStaticAppDrawing } from "./rscStaticApp";
import { sanitizeFlightForSsrStream } from "./ssrFromRscRenderer";
import type { SsrManifest } from "./ssrTypes";

export interface SsrStaticAppInput {
  app: string;
  url: string;
  headers: [string, string][];
  lang: string;
  drawing: RscStaticAppDrawing;
  ssrManifest: SsrManifest;
  origin: string;
  stylesheetHref: string | null;
}

export class SsrStaticApp {
  static readonly maxBytes = 1024 * 1024;
  static readonly deadlineMs = 10_000;
  static readonly #mediaTag = /<(img|svg|picture|video|audio|canvas|iframe|input|select|textarea|object|embed)\b/i;
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  async render(input: SsrStaticAppInput): Promise<string | null> {
    const store = createRequestStore(new Request(input.url, { headers: input.headers }));
    const inScope = <T,>(fn: () => T): T =>
      requestStorage ? requestStorage.run(store, () => RenderScope.run(() => AppScope.run(input.app, fn))) : fn();
    const failures: unknown[] = [];
    const flight = Readable.fromWeb(sanitizeFlightForSsrStream(new Blob([input.drawing.flight]).stream()) as never);
    const root = await inScope(() => createFromNodeStream<ReactNode>(flight, input.ssrManifest));
    //? Aborting settles every boundary still waiting as one React leaves to a client, which the refusal reads.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), SsrStaticApp.deadlineMs);
    let html: string | null;
    try {
      const stream = await inScope(async () => {
        const rendered = await renderToReadableStream(SsrStaticApp.#document(root, input), {
          //? Past this size React outlines a finished boundary into a hidden segment only a script reveals.
          progressiveChunkSize: Number.POSITIVE_INFINITY,
          signal: deadline.signal,
          onError: (error) => void failures.push(error),
        });
        await rendered.allReady;
        return rendered;
      });
      html = await SsrStaticApp.#read(stream);
    } finally {
      clearTimeout(timer);
    }
    const refusal =
      failures.length > 0
        ? `its render failed: ${SsrStaticApp.#messageOf(failures[0])}`
        : input.drawing.needsBrowser || store.needsBrowser
          ? "a component it draws needs a browser"
          : html === null
            ? `its HTML passed ${SsrStaticApp.maxBytes} bytes`
            : SsrStaticApp.#refusalOf(html);
    if (refusal || html === null) {
      this.#logger.warn(`static app "${input.app}" sent no HTML: ${refusal}`);
      return null;
    }
    return html;
  }

  static #document(root: ReactNode, { lang, drawing, origin, stylesheetHref }: SsrStaticAppInput): ReactNode {
    const theme = drawing.theme && drawing.theme !== "css" && drawing.theme !== "system" ? drawing.theme : undefined;
    return (
      <html lang={lang} data-theme={theme}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content={ViewportMeta.content(drawing.viewport)} />
          <base href={`${origin}/`} target="_blank" />
          {stylesheetHref ? <link rel="stylesheet" href={new URL(stylesheetHref, `${origin}/`).href} /> : null}
        </head>
        <body>{root}</body>
      </html>
    );
  }

  //? Security: a host shows this document as it is, so it carries no script, React's own inline ones included.
  static #scriptless(html: string): string {
    return html
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/gi, "")
      .replace(/<link\b[^>]*\bas="script"[^>]*>/gi, "");
  }

  //? React writes `<!--$?-->` for a boundary still pending and `<!--$!-->` for one left to the client: a fallback.
  static #refusalOf(html: string): string | null {
    if (/<script/i.test(html)) return "a script survived its stripping";
    if (html.includes("<!--$?-->") || html.includes("<!--$!-->")) return "a Suspense boundary did not resolve";
    const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
    const text = body
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text && !SsrStaticApp.#mediaTag.test(body)) return "its body is empty";
    return null;
  }

  static async #read(stream: ReadableStream<Uint8Array>): Promise<string | null> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > SsrStaticApp.maxBytes) {
        await reader.cancel();
        return null;
      }
      html += decoder.decode(value, { stream: true });
    }
    html = SsrStaticApp.#scriptless(html + decoder.decode());
    return html.toLowerCase().startsWith("<!doctype") ? html : `<!DOCTYPE html>${html}`;
  }

  static #messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
