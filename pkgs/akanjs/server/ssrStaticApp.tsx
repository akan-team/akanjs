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
  static readonly #scriptElements =
    'script, link[rel="modulepreload"], link[as="script"], object, embed, meta[http-equiv], noscript';
  static readonly #animations = new Set(["animate", "set", "animatetransform", "animatemotion"]);
  static readonly #urlAttributes = new Set(["href", "src", "action", "formaction", "xlink:href"]);
  static readonly #mediaTag = /<(img|svg|picture|video|audio|canvas|iframe|input|select|textarea|object|embed)\b/i;
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  async render(input: SsrStaticAppInput, deadlineMs = SsrStaticApp.deadlineMs): Promise<string | null> {
    const store = createRequestStore(new Request(input.url, { headers: input.headers }));
    const inScope = <T,>(fn: () => T): T =>
      requestStorage ? requestStorage.run(store, () => RenderScope.run(() => AppScope.run(input.app, fn))) : fn();
    const failures: unknown[] = [];
    const flight = Readable.fromWeb(sanitizeFlightForSsrStream(new Blob([input.drawing.flight]).stream()) as never);
    const root = await inScope(() => createFromNodeStream<ReactNode>(flight, input.ssrManifest));
    //? Aborting settles every boundary still waiting as one React leaves to a client, which the refusal reads.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), Math.max(0, deadlineMs));
    let html: string | null = null;
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
    } catch (error) {
      if (!failures.length) failures.push(error);
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

  //? Security: a host shows this document as it is, in a sandbox it chooses, so it carries no script, React's own inline
  //? ones included, and no handler, embedded document, refresh or `javascript:` link that would run one.
  static #scriptless(html: string): string {
    return SsrStaticApp.#scriptParts(html, (element, attribute) =>
      attribute === null ? element.remove() : element.removeAttribute(attribute),
    );
  }

  static #scriptParts(
    html: string,
    found: (element: HTMLRewriterTypes.Element, attribute: string | null) => void,
  ): string {
    return new HTMLRewriter()
      .on(SsrStaticApp.#scriptElements, { element: (element) => found(element, null) })
      .on("*", {
        element: (element) => {
          if (SsrStaticApp.#animatesLink(element)) found(element, null);
          for (const name of SsrStaticApp.#scriptAttributes(element)) found(element, name);
        },
      })
      .transform(html);
  }

  static #animatesLink(element: HTMLRewriterTypes.Element): boolean {
    if (!SsrStaticApp.#animations.has(element.tagName.toLowerCase())) return false;
    const target = element.getAttribute("attributename")?.trim().toLowerCase();
    return target === "href" || target === "xlink:href";
  }

  static #scriptAttributes(element: HTMLRewriterTypes.Element): string[] {
    const names: string[] = [];
    for (const [name, value] of element.attributes)
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        (SsrStaticApp.#urlAttributes.has(name) && SsrStaticApp.#runsScript(value))
      )
        names.push(name);
    return names;
  }

  //? The rewriter hands an attribute over still entity-encoded, and a browser drops control characters from a URL. A
  //? scheme never holds `&`, so one a named reference other than these could still spell is refused, not decoded.
  static #runsScript(value: string): boolean {
    const url = value
      .replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, code: string) => {
        const point = code[0] === "x" || code[0] === "X" ? Number.parseInt(code.slice(1), 16) : Number(code);
        return point <= 0x10ffff ? String.fromCodePoint(point) : "";
      })
      .replace(/&(colon|tab|newline);/gi, (_, name: string) => (name.toLowerCase() === "colon" ? ":" : ""))
      .replace(/\p{Cc}/gu, "")
      .trim()
      .toLowerCase();
    const colon = url.indexOf(":");
    if (colon < 0) return false;
    const scheme = url.slice(0, colon);
    if (/[/?#]/.test(scheme)) return false;
    return scheme === "javascript" || scheme.includes("&");
  }

  //? The rewriter stops visiting MathML once a token element such as `<mi>` has closed, so it can neither strip nor
  //? see what follows: a formula naming a handler or a link anywhere in its tags is refused whole.
  static #formulaRunsScript(html: string): boolean {
    const lower = html.toLowerCase();
    let depth = 0;
    for (let at = lower.indexOf("<math"); at >= 0; ) {
      const scanned = SsrStaticApp.#tagAt(lower, at + 1);
      if (scanned.tag === "math") depth++;
      else if (scanned.tag === "/math") depth = Math.max(0, depth - 1);
      if (depth > 0 && scanned.names.some((name) => name.startsWith("on") || name === "href" || name === "xlink:href"))
        return true;
      at = lower.indexOf(depth > 0 ? "<" : "<math", scanned.end);
    }
    return false;
  }

  //? Read as the HTML tokenizer reads a start tag, quotes included, so a `>` inside a value does not end the tag.
  static #tagAt(html: string, from: number): { tag: string; names: string[]; end: number } {
    const names: string[] = [];
    const space = (char: string | undefined) =>
      char === " " || char === "\t" || char === "\n" || char === "\f" || char === "\r";
    let at = html[from] === "/" ? from + 1 : from;
    while (at < html.length && !space(html[at]) && html[at] !== "/" && html[at] !== ">") at++;
    const tag = html.slice(from, at);
    while (at < html.length && html[at] !== ">") {
      if (space(html[at]) || html[at] === "/") {
        at++;
        continue;
      }
      const start = at;
      at++;
      while (at < html.length && !space(html[at]) && html[at] !== "/" && html[at] !== ">" && html[at] !== "=") at++;
      names.push(html.slice(start, at));
      while (space(html[at])) at++;
      if (html[at] !== "=") continue;
      at++;
      while (space(html[at])) at++;
      const quote = html[at];
      if (quote === '"' || quote === "'") {
        const closing = html.indexOf(quote, at + 1);
        at = closing < 0 ? html.length : closing + 1;
      } else while (at < html.length && !space(html[at]) && html[at] !== ">") at++;
    }
    return { tag, names, end: at };
  }

  //? React writes `<!--$?-->` for a boundary still pending and `<!--$!-->` for one left to the client: a fallback.
  static #refusalOf(html: string): string | null {
    let survived = /<script/i.test(html);
    SsrStaticApp.#scriptParts(html, () => {
      survived = true;
    });
    if (survived) return "a script survived its stripping";
    if (SsrStaticApp.#formulaRunsScript(html)) return "a formula carries a handler or a link";
    if (html.includes("<!--$?-->") || html.includes("<!--$!-->")) return "a Suspense boundary did not resolve";
    const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
    if (!SsrStaticApp.#hasText(body) && !SsrStaticApp.#mediaTag.test(body)) return "its body is empty";
    return null;
  }

  static #hasText(body: string): boolean {
    let at = 0;
    while (at < body.length) {
      const open = body.indexOf("<", at);
      if (body.slice(at, open < 0 ? body.length : open).trim()) return true;
      if (open < 0) return false;
      const end = body.startsWith("<!--", open) ? "-->" : ">";
      const close = body.indexOf(end, open);
      if (close < 0) return false;
      at = close + end.length;
    }
    return false;
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
