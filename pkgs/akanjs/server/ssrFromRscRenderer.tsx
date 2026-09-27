//? The package ships no types; an app or lib program reaches this file without the ambient declarations otherwise.
/// <reference path="./types/react-server-dom-webpack.d.ts" />
import { Readable } from "node:stream";
import { getApiPrefix, getWsPrefix } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type AkanRequestStore, type AkanTheme, pushRequestFallback, requestStorage } from "akanjs/fetch";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { createFromNodeStream } from "react-server-dom-webpack/client.node";
import { parsePositiveInt } from "./cachePolicy";
import { concatBytes } from "./rscHttp";
import type { SsrChunkRegistryStats, SsrFromRscInput, SsrLateRedirect } from "./ssrTypes";

const DEFAULT_SSR_CHUNK_REGISTRY_MAX_ENTRIES = 1024;
const DEFAULT_MAX_PENDING_INLINE_RSC_SCRIPTS = 32;

interface SsrChunkRegistryEntry<T> {
  keys: Set<string>;
  lruKey: string;
  value: T;
}

export class SsrChunkRegistry<T> {
  readonly #entriesByKey = new Map<string, SsrChunkRegistryEntry<T>>();
  readonly #lru = new Map<string, SsrChunkRegistryEntry<T>>();
  #evictionCount = 0;

  constructor(readonly maxEntries = DEFAULT_SSR_CHUNK_REGISTRY_MAX_ENTRIES) {}

  get size(): number {
    return this.#entriesByKey.size;
  }

  get evictionCount(): number {
    return this.#evictionCount;
  }

  get(key: string): T | undefined {
    const entry = this.#entriesByKey.get(key);
    if (!entry) return undefined;
    this.#touch(entry);
    return entry.value;
  }

  set(keys: string[], value: T): void {
    const uniqueKeys = [...new Set(keys)].filter(Boolean);
    if (uniqueKeys.length === 0) return;

    let entry = uniqueKeys
      .map((key) => this.#entriesByKey.get(key))
      .find((item): item is SsrChunkRegistryEntry<T> => Boolean(item));
    entry ??= { keys: new Set(), lruKey: uniqueKeys[0] as string, value };
    entry.value = value;

    for (const key of uniqueKeys) {
      const existing = this.#entriesByKey.get(key);
      if (existing && existing !== entry) {
        existing.keys.delete(key);
        if (existing.keys.size === 0) this.#lru.delete(existing.lruKey);
      }
      entry.keys.add(key);
      this.#entriesByKey.set(key, entry);
    }

    this.#touch(entry);
    this.#evict(entry);
  }

  #touch(entry: SsrChunkRegistryEntry<T>): void {
    this.#lru.delete(entry.lruKey);
    this.#lru.set(entry.lruKey, entry);
  }

  #evict(protectedEntry: SsrChunkRegistryEntry<T>): void {
    const maxEntries = this.maxEntries > 0 ? this.maxEntries : DEFAULT_SSR_CHUNK_REGISTRY_MAX_ENTRIES;
    while (this.#entriesByKey.size > maxEntries) {
      const oldest = this.#lru.entries().next().value as [string, SsrChunkRegistryEntry<T>] | undefined;
      if (!oldest) return;
      const [lruKey, entry] = oldest;
      if (entry === protectedEntry && this.#lru.size === 1) return;
      if (entry === protectedEntry) {
        this.#touch(entry);
        continue;
      }
      this.#lru.delete(lruKey);
      for (const key of entry.keys) this.#entriesByKey.delete(key);
      this.#evictionCount += 1;
    }
  }
}

export type InlineRscChunk = readonly [1, string] | readonly [3, string];

export function encodeInlineRscChunk(chunk: Uint8Array): InlineRscChunk {
  try {
    return [1, new TextDecoder("utf-8", { fatal: true }).decode(chunk)];
  } catch {
    return [3, Buffer.from(chunk).toString("base64")];
  }
}

function htmlEscapeJsonString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function createInlineRscScript(chunk: Uint8Array): string {
  const [type, data] = encodeInlineRscChunk(chunk);
  return `<script>self.__RSC_PUSH__(${type},${htmlEscapeJsonString(data)})</script>`;
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createSoftRedirectScript(redirect: SsrLateRedirect): string {
  const method = redirect.method === "push" ? "assign" : "replace";
  const fallback = `<noscript><meta http-equiv="refresh" content="0;url=${escapeHtmlAttr(redirect.location)}"></noscript>`;
  return `${fallback}<script>window.location.${method}(${htmlEscapeJsonString(redirect.location)})</script>`;
}

function sanitizeFlightRows(
  stream: ReadableStream<Uint8Array>,
  options: { rewriteStylesheetHints?: boolean; dropDebugInfoRows?: boolean } = {},
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const hlStylesheetRe = /(:HL\["[^"\\]*(?:\\.[^"\\]*)*",)"stylesheet"(\])/g;
  const redirectErrorRowRe = /^([0-9a-z]+):E(\{[^\n]*"digest":"AKAN_REDIRECT(?:;[^"]*)?"[^\n]*\})(\n?)$/;
  const debugInfoRowRe = /^[0-9a-z]+:D/;
  let buffered: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  const sanitizeRow = (row: Uint8Array): Uint8Array => {
    let text: string;
    try {
      text = decoder.decode(row);
    } catch {
      return row;
    }
    if (options.dropDebugInfoRows && debugInfoRowRe.test(text)) return new Uint8Array(0);
    const sanitized = (options.rewriteStylesheetHints ? text.replace(hlStylesheetRe, `$1"style"$2`) : text).replace(
      redirectErrorRowRe,
      "$1:null$3",
    );
    return sanitized === text ? row : encoder.encode(sanitized);
  };

  const enqueueCompleteRows = (chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) => {
    buffered = concatBytes(buffered, chunk);
    let rowStart = 0;
    for (let index = 0; index < buffered.byteLength; index += 1) {
      if (buffered[index] !== 10) continue;
      controller.enqueue(sanitizeRow(buffered.slice(rowStart, index + 1)));
      rowStart = index + 1;
    }
    buffered = rowStart === 0 ? buffered : buffered.slice(rowStart);
  };

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        enqueueCompleteRows(chunk, controller);
      },
      flush(controller) {
        if (buffered.byteLength > 0) {
          controller.enqueue(sanitizeRow(buffered));
          buffered = new Uint8Array(0);
        }
      },
    }),
  );
}

// RSDW hints each stylesheet as `:HL[href,"stylesheet"]`, which the browser preloads with an invalid
// as="stylesheet" (Chromium warns); only the browser-bound tee is rewritten to "style", the SSR one stays React's.
export function sanitizeFlightForClientStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return sanitizeFlightRows(stream, { rewriteStylesheetHints: true });
}

export function sanitizeFlightForSsrStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return sanitizeFlightRows(stream, { dropDebugInfoRows: true });
}

type StderrWrite = typeof process.stderr.write;

export class ExpectedLateRedirectStderrSuppressor {
  static #active = new Set<ExpectedLateRedirectStderrSuppressor>();
  static #originalWrite: StderrWrite | null = null;
  static #buffer = "";
  static #flushTimer: ReturnType<typeof setTimeout> | null = null;
  static #suppressingBenignBlock = false;
  static readonly #maxBufferLength = 64 * 1024;
  #stopped = false;
  #lateRedirect = false;
  #lateControlSettled = false;

  private constructor(lateControl: Promise<SsrLateRedirect | null>) {
    lateControl
      .then((control) => {
        this.#lateRedirect = control?.type === "redirect";
      })
      .catch(() => {
        this.#lateRedirect = false;
      })
      .finally(() => {
        this.#lateControlSettled = true;
        ExpectedLateRedirectStderrSuppressor.#tryResolveBufferedOutput();
      });
  }

  static start(lateControl?: Promise<SsrLateRedirect | null>): ExpectedLateRedirectStderrSuppressor | null {
    if (!lateControl) return null;
    // A process-wide stderr hook, so production only gets it when asked for diagnosis.
    if (process.env.NODE_ENV === "production" && process.env.AKAN_SUPPRESS_LATE_REDIRECT_STDERR !== "1") return null;
    const suppressor = new ExpectedLateRedirectStderrSuppressor(lateControl);
    ExpectedLateRedirectStderrSuppressor.#active.add(suppressor);
    ExpectedLateRedirectStderrSuppressor.#install();
    return suppressor;
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    ExpectedLateRedirectStderrSuppressor.#active.delete(this);
    ExpectedLateRedirectStderrSuppressor.#tryResolveBufferedOutput();
    if (ExpectedLateRedirectStderrSuppressor.#active.size === 0) ExpectedLateRedirectStderrSuppressor.#uninstall();
  }

  static #install(): void {
    if (ExpectedLateRedirectStderrSuppressor.#originalWrite) return;
    ExpectedLateRedirectStderrSuppressor.#originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
      ExpectedLateRedirectStderrSuppressor.#write(chunk, args);
      return true;
    }) as StderrWrite;
  }

  static #uninstall(): void {
    ExpectedLateRedirectStderrSuppressor.#flushBufferedOutput();
    if (!ExpectedLateRedirectStderrSuppressor.#originalWrite) return;
    process.stderr.write = ExpectedLateRedirectStderrSuppressor.#originalWrite;
    ExpectedLateRedirectStderrSuppressor.#originalWrite = null;
  }

  static #write(chunk: unknown, args: unknown[]): void {
    const text =
      typeof chunk === "string" ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString() : String(chunk);
    ExpectedLateRedirectStderrSuppressor.#buffer += text;
    const callback = args.find((arg): arg is () => void => typeof arg === "function");
    callback?.();

    if (ExpectedLateRedirectStderrSuppressor.#buffer.length > ExpectedLateRedirectStderrSuppressor.#maxBufferLength) {
      ExpectedLateRedirectStderrSuppressor.#flushBufferedOutput();
      return;
    }
    ExpectedLateRedirectStderrSuppressor.#tryResolveBufferedOutput();
  }

  static #tryResolveBufferedOutput(): void {
    if (!ExpectedLateRedirectStderrSuppressor.#buffer) return;
    const hasBenignClose = ExpectedLateRedirectStderrSuppressor.#isBenignRsdwConnectionClose(
      ExpectedLateRedirectStderrSuppressor.#buffer,
    );
    if (hasBenignClose && ExpectedLateRedirectStderrSuppressor.#hasLateRedirectOrPending()) {
      if (!ExpectedLateRedirectStderrSuppressor.#hasLateRedirect()) {
        ExpectedLateRedirectStderrSuppressor.#scheduleFlush();
        return;
      }
      ExpectedLateRedirectStderrSuppressor.#suppressingBenignBlock = true;
    }

    if (ExpectedLateRedirectStderrSuppressor.#suppressingBenignBlock) {
      if (ExpectedLateRedirectStderrSuppressor.#buffer.includes("\n\n")) {
        ExpectedLateRedirectStderrSuppressor.#clearBufferedOutput();
        ExpectedLateRedirectStderrSuppressor.#suppressingBenignBlock = false;
      }
      return;
    }

    ExpectedLateRedirectStderrSuppressor.#scheduleFlush();
  }

  static #scheduleFlush(): void {
    if (ExpectedLateRedirectStderrSuppressor.#flushTimer) return;
    ExpectedLateRedirectStderrSuppressor.#flushTimer = setTimeout(() => {
      ExpectedLateRedirectStderrSuppressor.#flushTimer = null;
      if (
        ExpectedLateRedirectStderrSuppressor.#isBenignRsdwConnectionClose(
          ExpectedLateRedirectStderrSuppressor.#buffer,
        ) &&
        ExpectedLateRedirectStderrSuppressor.#hasLateRedirect()
      ) {
        ExpectedLateRedirectStderrSuppressor.#clearBufferedOutput();
        return;
      }
      ExpectedLateRedirectStderrSuppressor.#flushBufferedOutput();
    }, 25);
  }

  static #flushBufferedOutput(): void {
    if (!ExpectedLateRedirectStderrSuppressor.#buffer) return;
    const text = ExpectedLateRedirectStderrSuppressor.#buffer;
    ExpectedLateRedirectStderrSuppressor.#clearBufferedOutput();
    ExpectedLateRedirectStderrSuppressor.#originalWrite?.call(process.stderr, text);
  }

  static #clearBufferedOutput(): void {
    ExpectedLateRedirectStderrSuppressor.#buffer = "";
    if (ExpectedLateRedirectStderrSuppressor.#flushTimer) {
      clearTimeout(ExpectedLateRedirectStderrSuppressor.#flushTimer);
      ExpectedLateRedirectStderrSuppressor.#flushTimer = null;
    }
  }

  static #isBenignRsdwConnectionClose(text: string): boolean {
    return (
      text.includes("Connection closed.") &&
      (text.includes("react-server-dom-webpack-client.node") || text.includes("reportGlobalError"))
    );
  }

  static #hasLateRedirect(): boolean {
    return [...ExpectedLateRedirectStderrSuppressor.#active].some((suppressor) => suppressor.#lateRedirect);
  }

  static #hasLateRedirectOrPending(): boolean {
    return [...ExpectedLateRedirectStderrSuppressor.#active].some(
      (suppressor) => suppressor.#lateRedirect || !suppressor.#lateControlSettled,
    );
  }
}

export function interleaveRscScriptsWithHtml(
  htmlStream: ReadableStream<Uint8Array>,
  rscClientStream: ReadableStream<Uint8Array>,
  options: {
    bootstrapModuleScripts?: string;
    lateControl?: Promise<SsrLateRedirect | null>;
    maxPendingRscScripts?: number;
    onPendingRscScriptsSize?: (size: number) => void;
    onComplete?: () => void;
    onCancel?: (reason?: unknown) => void;
    request?: Request;
    requestStore?: AkanRequestStore;
  } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const bootstrapDetector = new InlineBootstrapDetector();
  const pendingRscScripts: Uint8Array[] = [];
  const pendingControlScripts: Uint8Array[] = [];
  const explicitMax = options.maxPendingRscScripts;
  const maxPendingRscScripts =
    explicitMax !== undefined && Number.isFinite(explicitMax) && explicitMax > 0
      ? Math.floor(explicitMax)
      : (parsePositiveInt(process.env.AKAN_MAX_PENDING_INLINE_RSC_SCRIPTS) ?? DEFAULT_MAX_PENDING_INLINE_RSC_SCRIPTS);
  const queueDrainResolvers: Array<() => void> = [];
  const scriptAvailableResolvers: Array<() => void> = [];
  let errored = false;
  let rscDone = false;
  let lateControlDone = !options.lateControl;
  let htmlReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let rscReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let cancelled = false;

  const cancelUpstream = (reason?: unknown) => {
    if (cancelled) return;
    cancelled = true;
    while (queueDrainResolvers.length > 0) queueDrainResolvers.shift()?.();
    while (scriptAvailableResolvers.length > 0) scriptAvailableResolvers.shift()?.();
    if (htmlReader) void htmlReader.cancel(reason).catch(() => {});
    if (rscReader) void rscReader.cancel(reason).catch(() => {});
    options.onCancel?.(reason);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const fail = (err: unknown) => {
        if (errored) return;
        errored = true;
        cancelUpstream(err);
        controller.error(err);
      };

      const flushPendingRscScripts = () => {
        if (!bootstrapDetector.canFlushInlineScripts) return;
        while (!errored && pendingControlScripts.length > 0) {
          const script = pendingControlScripts.shift();
          if (script) controller.enqueue(script);
        }
        while (!errored && pendingRscScripts.length > 0) {
          const script = pendingRscScripts.shift();
          if (script) controller.enqueue(script);
        }
        options.onPendingRscScriptsSize?.(pendingRscScripts.length);
        while (queueDrainResolvers.length > 0) queueDrainResolvers.shift()?.();
      };

      const notifyScriptAvailable = () => {
        while (scriptAvailableResolvers.length > 0) scriptAvailableResolvers.shift()?.();
      };

      const waitForRscQueueDrain = async () => {
        while (!errored && pendingRscScripts.length >= maxPendingRscScripts) {
          await new Promise<void>((resolve) => queueDrainResolvers.push(resolve));
        }
      };

      const waitForScriptAvailable = () => new Promise<void>((resolve) => scriptAvailableResolvers.push(resolve));

      const pumpRscScripts = async () => {
        rscReader = rscClientStream.getReader();
        try {
          for (;;) {
            const { value, done } = await rscReader.read();
            if (done || errored) break;
            await waitForRscQueueDrain();
            if (errored) break;
            pendingRscScripts.push(encoder.encode(createInlineRscScript(value)));
            options.onPendingRscScriptsSize?.(pendingRscScripts.length);
            notifyScriptAvailable();
          }
        } finally {
          rscDone = true;
          notifyScriptAvailable();
          rscReader.releaseLock();
          rscReader = null;
        }
      };

      const pump = async () => {
        const rscPump = pumpRscScripts();
        const lateControlPump = options.lateControl?.then((control) => {
          try {
            if (!control || errored) return;
            pendingControlScripts.push(encoder.encode(createSoftRedirectScript(control)));
            notifyScriptAvailable();
          } finally {
            lateControlDone = true;
            notifyScriptAvailable();
          }
        });
        if (!lateControlPump) lateControlDone = true;
        void rscPump.catch(fail);
        void lateControlPump?.catch(fail);

        htmlReader = htmlStream.getReader();
        try {
          for (;;) {
            const { value, done } = await htmlReader.read();
            if (done || errored) break;
            controller.enqueue(value);
            bootstrapDetector.observe(value);
          }
        } finally {
          htmlReader.releaseLock();
          htmlReader = null;
        }

        if (errored) return;
        if (options.bootstrapModuleScripts) controller.enqueue(encoder.encode(options.bootstrapModuleScripts));
        bootstrapDetector.forceAllow();
        while (
          !errored &&
          (!rscDone || !lateControlDone || pendingControlScripts.length > 0 || pendingRscScripts.length > 0)
        ) {
          flushPendingRscScripts();
          if (!rscDone || !lateControlDone) await waitForScriptAvailable();
        }
        await Promise.all([rscPump, lateControlPump]);
        if (errored) return;
        flushPendingRscScripts();
        controller.enqueue(encoder.encode(`<script>self.__RSC_CLOSE__()</script>`));
        controller.close();
      };

      const requestContext = options.requestStore ?? options.request;
      const runPump = () => {
        const cleanup = requestContext ? pushRequestFallback(requestContext) : undefined;
        return pump()
          .catch(fail)
          .finally(() => {
            cleanup?.();
            options.onComplete?.();
          });
      };
      if (requestContext && requestStorage) void requestStorage.run(requestContext, runPump);
      else void runPump();
    },
    cancel(reason) {
      errored = true;
      cancelUpstream(reason);
      options.onComplete?.();
    },
  });
}

class InlineBootstrapDetector {
  readonly #decoder = new TextDecoder();
  #buffer = "";
  #bootstrapSeen = false;
  #canFlushInlineScripts = false;

  get canFlushInlineScripts(): boolean {
    return this.#canFlushInlineScripts;
  }

  observe(chunk: Uint8Array): void {
    if (this.#canFlushInlineScripts) return;
    this.#buffer = `${this.#buffer}${this.#decoder.decode(chunk, { stream: true })}`.slice(-8192);
    if (!this.#bootstrapSeen) {
      const bootstrapIndex = this.#buffer.indexOf("__RSC_PUSH__");
      if (bootstrapIndex === -1) return;
      this.#bootstrapSeen = true;
      this.#buffer = this.#buffer.slice(bootstrapIndex);
    }
    if (this.#buffer.toLowerCase().includes("</script>")) this.#canFlushInlineScripts = true;
  }

  forceAllow(): void {
    this.#canFlushInlineScripts = true;
  }
}

export class SsrFromRscRenderer {
  static readonly #chunkRegistryStats: SsrChunkRegistryStats = {
    ssrChunkRegistrySize: 0,
    ssrChunkLoadCount: 0,
    ssrChunkCacheHitCount: 0,
    ssrChunkEvictionCount: 0,
  };

  // A classic script, so it runs before every module script: RSDW client.browser needs these shims at module init.
  static readonly #clientBootstrap = `(function(){
  var registry = new Map();
  function load(id) {
    var cached = registry.get(id);
    if (cached) return cached;
    var p = import(id);
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
})();`;

  // Not a bundle constant (only AKAN_PUBLIC_* is inlined, at build time) nor a React prop (FetchClient fixes its
  // origin at module init): the classic bootstrap is the one thing that runs ahead of every module script.
  static #prefixBootstrap() {
    const api = getApiPrefix();
    const ws = getWsPrefix();
    if (api === "/api" && ws === "/ws") return "";
    return `\nself.__AKAN_PREFIX__ = ${JSON.stringify({ api, ws })};`;
  }

  static readonly #themeInitScript = `<script>(function(){
  try {
    var m = document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);
    if (m) return;
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}
})();</script>`;

  static {
    SsrFromRscRenderer.#installWebpackShims();
  }

  static readonly #logger = new Logger("SsrFromRscRenderer");

  static getChunkRegistryStats(): SsrChunkRegistryStats {
    return { ...SsrFromRscRenderer.#chunkRegistryStats };
  }

  async render(input: SsrFromRscInput): Promise<ReadableStream<Uint8Array>> {
    const [rscForSsr, rscForClient] = input.rscStream.tee();

    const ssrNodeStream = Readable.fromWeb(sanitizeFlightForSsrStream(rscForSsr) as never);
    const stderrSuppressor = ExpectedLateRedirectStderrSuppressor.start(input.lateControl);
    const thenable = SsrFromRscRenderer.#suppressExpectedLateRedirectError(
      createFromNodeStream(ssrNodeStream, input.ssrManifest),
      input.lateControl,
    );

    const base = `${SsrFromRscRenderer.#clientBootstrap}${SsrFromRscRenderer.#prefixBootstrap()}`;
    const bootstrap = input.extraBootstrapInline ? `${base}\n${input.extraBootstrapInline}` : base;

    // renderToReadableStream resolves at shell-ready and rejects on a shell error, so shell redirects stay catchable;
    // only `block` routes await allReady, trading the Loading fallback for a clean page on a late non-redirect error.
    const waitForAllReady = input.waitForAllReady || process.env.AKAN_SSR_WAIT_FOR_ALL_READY === "1";
    const renderHtml = async () => {
      const root = await thenable;
      const stream = await renderToReadableStream(root, {
        bootstrapScriptContent: bootstrap,
        onError: (error) => SsrFromRscRenderer.#reportRenderError(error, input),
      });
      if (waitForAllReady) await stream.allReady;
      else {
        SsrFromRscRenderer.holdPostShellErrors(stream, (error) =>
          SsrFromRscRenderer.#reportRenderError(error, input, "post-shell"),
        );
      }
      return stream;
    };
    const requestContext = input.requestStore ?? input.request;
    const htmlStream =
      requestContext && requestStorage ? await requestStorage.run(requestContext, renderHtml) : await renderHtml();

    const withHeadScripts = SsrFromRscRenderer.#injectHeadScriptsIntoHead(htmlStream, {
      importmap: input.importmap,
      bootstrapModules: input.bootstrapModules,
      theme: input.theme,
      injectThemeInitScript: input.injectThemeInitScript,
    });

    // Splice only at chunk boundaries (Fizz may split inside SVG paths or attributes), and append the bootstrap module
    // scripts here: one React emitted mid-stream could run cached before $RC() restores Suspense segments.
    return interleaveRscScriptsWithHtml(withHeadScripts, sanitizeFlightForClientStream(rscForClient), {
      bootstrapModuleScripts: SsrFromRscRenderer.#createBootstrapModuleScriptTags(input.bootstrapModules),
      lateControl: input.lateControl,
      onComplete: () => stderrSuppressor?.stop(),
      onCancel: input.onCancel,
      request: input.request,
      requestStore: input.requestStore,
    });
  }

  static #installWebpackShims(): void {
    const g = globalThis as unknown as {
      __rsc_ssr_shims_installed__?: boolean;
      __webpack_chunk_load__?: (id: string) => Promise<void>;
      __webpack_require__?: (id: string) => Record<string, unknown>;
    };
    if (g.__rsc_ssr_shims_installed__) return;
    g.__rsc_ssr_shims_installed__ = true;

    // import(), not require(): client chunks may use top-level await, which Bun's require() refuses.
    // XXX Bounds key tracking, not memory: Bun's ESM registry keeps an evicted module for the process lifetime, so
    // `ssrChunkRegistrySize` is not bytes held and only recycling the process reclaims SSR chunk memory.
    const registry = new SsrChunkRegistry<Record<string, unknown>>(
      parsePositiveInt(process.env.AKAN_SSR_CHUNK_REGISTRY_MAX_ENTRIES) ?? DEFAULT_SSR_CHUNK_REGISTRY_MAX_ENTRIES,
    );
    g.__webpack_chunk_load__ = async (chunkId: string) => {
      if (registry.get(chunkId)) {
        SsrFromRscRenderer.#chunkRegistryStats.ssrChunkCacheHitCount += 1;
        return;
      }
      const mod = (await import(chunkId)) as Record<string, unknown>;
      // HMR busts by content-hashed filename; this strip only keeps a legacy `?v=` caller's keys stable.
      const canonical = chunkId.replace(/\?v=\d+$/, "");
      registry.set([chunkId, canonical], mod);
      SsrFromRscRenderer.#chunkRegistryStats.ssrChunkLoadCount += 1;
      SsrFromRscRenderer.#chunkRegistryStats.ssrChunkRegistrySize = registry.size;
      SsrFromRscRenderer.#chunkRegistryStats.ssrChunkEvictionCount = registry.evictionCount;
    };
    g.__webpack_require__ = (id: string) => {
      const mod = registry.get(id);
      if (!mod) throw new Error(`[ssrFromRsc] module not loaded yet: ${id}`);
      return mod;
    };
  }

  // React rejects allReady on a post-shell fatal error but handles it itself only on the shell-error path; unheld,
  // it reaches "unhandledRejection" and takes the whole federation replica down over one render.
  static holdPostShellErrors(stream: { allReady: Promise<void> }, report: (error: unknown) => void): void {
    void stream.allReady.catch(report);
  }

  static #reportRenderError(error: unknown, input: SsrFromRscInput, phase = "render"): void {
    const description = error instanceof Error ? (error.stack ?? error.message) : String(error);
    if (SsrFromRscRenderer.#isExpectedRequestAbort(error)) {
      SsrFromRscRenderer.#logger.debug(`[SSR] ${phase} aborted: ${description}`);
      return;
    }
    const path = input.request ? new URL(input.request.url).pathname : "unknown";
    SsrFromRscRenderer.#logger.error(`[SSR] ${phase} failed path=${path}: ${description}`);
  }

  static #isExpectedRequestAbort(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
      error.name === "AbortError" ||
      error.name === "AkanRedirectError" ||
      error.message === "Connection closed." ||
      error.message.includes("The connection was closed")
    );
  }

  static #suppressExpectedLateRedirectError(
    thenable: PromiseLike<ReactNode>,
    lateControl?: Promise<SsrLateRedirect | null>,
  ): Promise<ReactNode> {
    const promise = Promise.resolve(thenable);
    if (!lateControl) return promise;
    return promise.catch(async (error) => {
      const control = await lateControl;
      if (control?.type === "redirect" && SsrFromRscRenderer.#isExpectedLateRedirectError(error)) return null;
      throw error;
    });
  }

  static #isExpectedLateRedirectError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message === "Connection closed." || error.name === "AkanRedirectError";
  }

  // A stream splice, not a React <head> child: once any module fetch starts, the spec flips the document's
  // "allow-import-maps" bit and no later importmap is acquired.
  static #injectHeadScriptsIntoHead(
    stream: ReadableStream<Uint8Array>,
    options: {
      importmap?: Record<string, string>;
      bootstrapModules?: string[];
      theme?: AkanTheme;
      injectThemeInitScript?: boolean;
    },
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const { importmap, bootstrapModules, theme, injectThemeInitScript } = options;
    const htmlTheme = theme && theme !== "css" && theme !== "system" ? theme : undefined;
    const importmapTag =
      importmap && Object.keys(importmap).length > 0
        ? `<script type="importmap">${JSON.stringify({ imports: importmap })}</script>`
        : "";
    const modulePreloadTags = SsrFromRscRenderer.#createBootstrapModulePreloadTags(bootstrapModules);
    const shouldInjectThemeScript = theme === "system" || (theme === undefined && injectThemeInitScript);
    const themeInitTag = shouldInjectThemeScript ? SsrFromRscRenderer.#themeInitScript : "";
    const tags = `${themeInitTag}${importmapTag}${modulePreloadTags}`;
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
          // No <head> (e.g. an error shell): emit the buffer rather than swallow the document.
          const tail = decoder.decode();
          const rest = withHtmlTheme(buffered + tail);
          if (rest) controller.enqueue(encoder.encode(rest));
        },
      }),
    );
  }

  static #createBootstrapModulePreloadTags(bootstrapModules: string[] = []): string {
    return bootstrapModules.map((src) => `<link rel="modulepreload" href="${escapeHtmlAttr(src)}">`).join("");
  }

  static #createBootstrapModuleScriptTags(bootstrapModules: string[] = []): string {
    return bootstrapModules.map((src) => `<script type="module" src="${escapeHtmlAttr(src)}"></script>`).join("");
  }
}
