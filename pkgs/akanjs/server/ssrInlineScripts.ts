import type { AkanTheme } from "akanjs/fetch";
import { ScriptPolicy } from "./scriptPolicy";
import type { SsrLateRedirect } from "./ssrTypes";

export type InlineRscChunk = readonly [1, string] | readonly [3, string];

export interface SsrBootstrapData {
  /** Marks the data blocks this response wrote after its HTML, so text a page echoed is never read as one. */
  token: string;
  modules: string[];
  routeState?: string;
  dictionaryUrl?: string;
  importMapKey?: string;
  prefix?: { api: string; ws: string };
}

export interface SsrHeadScriptOptions {
  bootstrap?: SsrBootstrapData;
  /** Dev only: the registry shim and the HMR client, which load modules themselves and so run under the nonce. */
  devInline?: string;
  nonce?: string;
  importmap?: Record<string, string>;
  modulePreloads: string[];
  theme?: AkanTheme;
  injectThemeInitScript?: boolean;
}

export function encodeInlineRscChunk(chunk: Uint8Array): InlineRscChunk {
  try {
    return [1, new TextDecoder("utf-8", { fatal: true }).decode(chunk)];
  } catch {
    return [3, Buffer.from(chunk).toString("base64")];
  }
}

//? A data block is script text to the tokenizer whatever its type: `</script` ends it and `<!--` followed by `<script`
//? keeps a later `</script>` from ending it. JSON has `<`, `>` and `&` only inside strings, where an escape reads the same.
function htmlEscapeJson(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const dataTag = (token: string, json: string) =>
  `<script type="application/json" data-akan="${escapeHtmlAttr(token)}">${json}</script>`;

export function createInlineRscScript(chunk: Uint8Array, token = ""): string {
  const [type, data] = encodeInlineRscChunk(chunk);
  return dataTag(token, `[${type},${htmlEscapeJson(JSON.stringify(data))}]`);
}

export function createSoftRedirectScript(redirect: SsrLateRedirect, token = ""): string {
  const method = redirect.method === "push" ? "assign" : "replace";
  const fallback = `<noscript><meta http-equiv="refresh" content="0;url=${escapeHtmlAttr(redirect.location)}"></noscript>`;
  return `${fallback}${dataTag(token, htmlEscapeJson(JSON.stringify(["redirect", method, redirect.location])))}`;
}

export class SsrInlineScripts {
  //* The one executable script of a document: static, so the policy names it by hash. It runs first in <head>, ahead
  //* of every module script (RSDW client.browser needs the shims at module init), and reads the response's values from
  //* the data block written before it. `__AKAN_FLUSH__` reads the data blocks a later `flushTag` follows: Flight
  //* chunks, a late redirect, and the end, where it adds the bootstrap modules as scripts.
  //? Blocks are found by the response's token, never by position: a browser extension adds elements of its own
  //? between the ones the parser is still writing.
  //? `import()` in a script the parser inserted is refused under 'strict-dynamic' unless that script carries the
  //? response's nonce, so the chunk loader imports through `__AKAN_IMPORT__`, which the bootstrap module sets.
  static readonly #bootstrapSource = `(function(){
  var block = document.currentScript;
  do { block = block.previousElementSibling; } while (block && block.type !== "application/json");
  var d = JSON.parse(block.textContent);
  var registry = new Map();
  function load(id) {
    var cached = registry.get(id);
    if (cached) return cached;
    var p = self.__AKAN_IMPORT__ ? self.__AKAN_IMPORT__(id) : import(id);
    registry.set(id, p);
    return p;
  }
  self.__webpack_chunk_load__ = load;
  self.__webpack_require__ = function(id) {
    var p = registry.get(id);
    if (!p) throw new Error("[rscClient] module not loaded: " + id);
    return p;
  };
  self.__webpack_require__.u = function(chunkId) { return chunkId; };
  self.__webpack_get_script_filename__ = function(chunkId) { return chunkId; };
  self.__RSC_CHUNKS__ = [];
  self.__RSC_CLOSED__ = false;
  self.__RSC_PUSH__ = function(type,data){ self.__RSC_CHUNKS__.push([type,data]); };
  self.__RSC_CLOSE__ = function(){ self.__RSC_CLOSED__ = true; };
  if (d.routeState) self.__AKAN_RSC_INITIAL_STATE__ = d.routeState;
  if (d.dictionaryUrl) self.__AKAN_DICT_URL__ = d.dictionaryUrl;
  if (d.importMapKey) self.__AKAN_IMPORT_MAP_KEY__ = d.importMapKey;
  if (d.prefix) self.__AKAN_PREFIX__ = d.prefix;
  if (d.themeInit) try {
    if (!document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/)) {
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
  } catch (e) {}
  self.__AKAN_FLUSH__ = function(){
    var blocks = document.querySelectorAll('script[data-akan="' + d.token + '"]');
    for (var i = 0; i < blocks.length; i++) {
      blocks[i].removeAttribute("data-akan");
      var v = JSON.parse(blocks[i].textContent);
      if (v[0] === "redirect") window.location[v[1]](v[2]);
      else if (v[0] === "end") {
        self.__RSC_CLOSE__();
        for (var j = 0; j < d.modules.length; j++) {
          var s = document.createElement("script");
          s.type = "module";
          s.src = d.modules[j];
          document.head.appendChild(s);
        }
      } else self.__RSC_PUSH__(v[0], v[1]);
    }
  };
})();`;
  static readonly bootstrap = SsrInlineScripts.#bootstrapSource.replace(/\n\s*/g, "");

  static readonly flushTag = "<script>self.__AKAN_FLUSH__()</script>";
  static readonly #staticHashes = [
    ScriptPolicy.hashOf(SsrInlineScripts.bootstrap),
    ScriptPolicy.hashOf("self.__AKAN_FLUSH__()"),
  ];
  static readonly #importmapHashes = new Map<string, string>();

  static endTags(token: string): string {
    return `${dataTag(token, '["end"]')}${SsrInlineScripts.flushTag}`;
  }

  static importmapJson(importmap: Record<string, string> | undefined): string | null {
    if (!importmap || Object.keys(importmap).length === 0) return null;
    return htmlEscapeJson(JSON.stringify({ imports: importmap }));
  }

  static policyHashes(importmap?: Record<string, string>): string[] {
    const json = SsrInlineScripts.importmapJson(importmap);
    if (!json) return SsrInlineScripts.#staticHashes;
    let hash = SsrInlineScripts.#importmapHashes.get(json);
    if (!hash) {
      //? One per build, and per rebuild in dev: bounded so a long dev session keeps a handful.
      if (SsrInlineScripts.#importmapHashes.size >= 16) SsrInlineScripts.#importmapHashes.clear();
      hash = ScriptPolicy.hashOf(json);
      SsrInlineScripts.#importmapHashes.set(json, hash);
    }
    return [...SsrInlineScripts.#staticHashes, hash];
  }

  static #headTags(options: SsrHeadScriptOptions): string {
    const { bootstrap, devInline, nonce, importmap, modulePreloads, theme, injectThemeInitScript } = options;
    const themeInit = theme === "system" || (theme === undefined && injectThemeInitScript);
    const bootstrapTags = bootstrap
      ? `<script type="application/json">${htmlEscapeJson(
          JSON.stringify({ ...bootstrap, ...(themeInit ? { themeInit: 1 } : {}) }),
        )}</script><script>${SsrInlineScripts.bootstrap}</script>`
      : "";
    const importmapJson = SsrInlineScripts.importmapJson(importmap);
    const importmapTag = importmapJson ? `<script type="importmap">${importmapJson}</script>` : "";
    const nonceAttr = nonce ? ` nonce="${escapeHtmlAttr(nonce)}"` : "";
    //? After the import map: a script that starts a module load before the map is parsed makes the browser ignore it.
    const devTag = devInline ? `<script${nonceAttr}>${devInline.replace(/<\/script/gi, "<\\/script")}</script>` : "";
    const preloadTags = modulePreloads
      .map((src) => `<link rel="modulepreload" href="${escapeHtmlAttr(src)}">`)
      .join("");
    return `${bootstrapTags}${importmapTag}${devTag}${preloadTags}`;
  }

  // A stream splice, not a React <head> child: once any module fetch starts, the spec flips the document's
  // "allow-import-maps" bit and no later importmap is acquired.
  static injectIntoHead(stream: ReadableStream<Uint8Array>, options: SsrHeadScriptOptions): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const { theme } = options;
    const htmlTheme = theme && theme !== "css" && theme !== "system" ? theme : undefined;
    const tags = SsrInlineScripts.#headTags(options);
    if (!tags && !htmlTheme) return stream;
    const htmlOpenRe = /<html(\s[^>]*)?>/i;
    const headOpenRe = /<head(\s[^>]*)?>/i;
    let buffered = "";
    let injected = false;

    const withHtmlTheme = (html: string): string => {
      if (!htmlTheme) return html;
      return html.replace(htmlOpenRe, (tag) => {
        if (/\sdata-theme\s*=/.test(tag)) return tag;
        return tag.replace(/>$/, ` data-theme="${escapeHtmlAttr(htmlTheme)}">`);
      });
    };

    return stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (injected) {
            controller.enqueue(chunk);
            return;
          }
          buffered += decoder.decode(chunk, { stream: true });
          const m = headOpenRe.exec(buffered);
          if (!m) return;
          const end = m.index + m[0].length;
          const before = withHtmlTheme(buffered.slice(0, end));
          const after = buffered.slice(end);
          controller.enqueue(encoder.encode(before + tags + after));
          buffered = "";
          injected = true;
        },
        flush(controller) {
          if (injected) {
            const tail = decoder.decode();
            if (tail) controller.enqueue(encoder.encode(tail));
            return;
          }
          // No <head> (e.g. an error shell): emit the buffer rather than swallow the document, after the scripts
          // its flush calls need.
          const tail = decoder.decode();
          const rest = withHtmlTheme(buffered + tail);
          if (rest) controller.enqueue(encoder.encode(tags + rest));
        },
      }),
    );
  }
}
