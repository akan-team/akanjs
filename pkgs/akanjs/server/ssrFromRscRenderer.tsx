//? The package ships no types; an app or lib program reaches this file without the ambient declarations otherwise.
/// <reference path="./types/react-server-dom-webpack.d.ts" />

import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { AkanError, getApiPrefix, getWsPrefix } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type AkanRequestStore, createRequestStore, RenderScope, requestStorage } from "akanjs/fetch";
import type { ReactNode } from "react";
//? Not server.browser: it resumes a boundary from a MessageChannel task, which runs with an empty AsyncLocalStorage.
import { renderToReadableStream } from "react-dom/server.edge";
import { createFromNodeStream } from "react-server-dom-webpack/client.node";
import { parsePositiveInt } from "./cachePolicy";
import { FlightModulePreloads } from "./flightModulePreloads";
import { mapFlightLineRows } from "./flightRowReader";
import { createInlineRscScript, createSoftRedirectScript, SsrInlineScripts } from "./ssrInlineScripts";
import type { SsrChunkRegistryStats, SsrDocumentOptions, SsrFromRscInput, SsrLateControl } from "./ssrTypes";

const DEFAULT_SSR_CHUNK_REGISTRY_MAX_ENTRIES = 1024;
const DEFAULT_MAX_PENDING_INLINE_RSC_BYTES = 16 * 1024;

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

function sanitizeFlightRows(
  stream: ReadableStream<Uint8Array>,
  options: {
    rewriteStylesheetHints?: boolean;
    dropDebugInfoRows?: boolean;
    onRow?: (row: Uint8Array, tag: string) => void;
  } = {},
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const hlStylesheetRe = /(:HL\["[^"\\]*(?:\\.[^"\\]*)*",)"stylesheet"(\])/g;
  const redirectErrorRowRe = /^([0-9a-z]+):E(\{[^\n]*"digest":"AKAN_REDIRECT(?:;[^"]*)?"[^\n]*\})(\n?)$/;

  const rewriteRow = (row: Uint8Array, pattern: RegExp, replacement: string): Uint8Array => {
    let text: string;
    try {
      text = decoder.decode(row);
    } catch {
      return row;
    }
    const rewritten = text.replace(pattern, replacement);
    return rewritten === text ? row : encoder.encode(rewritten);
  };

  return mapFlightLineRows(stream, (row, tag) => {
    if (tag === "D") return options.dropDebugInfoRows ? null : row;
    options.onRow?.(row, tag);
    if (tag === "E") return rewriteRow(row, redirectErrorRowRe, "$1:null$3");
    if (tag === "H" && options.rewriteStylesheetHints) return rewriteRow(row, hlStylesheetRe, `$1"style"$2`);
    return row;
  });
}

// RSDW hints each stylesheet as `:HL[href,"stylesheet"]`, which the browser preloads with an invalid
// as="stylesheet" (Chromium warns); only the browser-bound tee is rewritten to "style", the SSR one stays React's.
export function sanitizeFlightForClientStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return sanitizeFlightRows(stream, { rewriteStylesheetHints: true });
}

export function sanitizeFlightForSsrStream(
  stream: ReadableStream<Uint8Array>,
  onRow?: (row: Uint8Array, tag: string) => void,
): ReadableStream<Uint8Array> {
  return sanitizeFlightRows(stream, { dropDebugInfoRows: true, onRow });
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

  private constructor(lateControl: Promise<SsrLateControl | null>) {
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

  static start(lateControl?: Promise<SsrLateControl | null>): ExpectedLateRedirectStderrSuppressor | null {
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
    token?: string;
    lateControl?: Promise<SsrLateControl | null>;
    maxPendingRscBytes?: number;
    onPendingRscBytes?: (bytes: number) => void;
    onComplete?: () => void;
    onCancel?: (reason?: unknown) => void;
    request?: Request;
    requestStore?: AkanRequestStore;
  } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const token = options.token ?? "";
  const pendingRscChunks: Uint8Array[] = [];
  const pendingControlScripts: Uint8Array[] = [];
  const explicitMax = options.maxPendingRscBytes;
  const maxPendingRscBytes =
    explicitMax !== undefined && Number.isFinite(explicitMax) && explicitMax > 0
      ? Math.floor(explicitMax)
      : (parsePositiveInt(process.env.AKAN_MAX_PENDING_INLINE_RSC_BYTES) ?? DEFAULT_MAX_PENDING_INLINE_RSC_BYTES);
  const pendingRscBytes = () => pendingRscChunks.reduce((total, chunk) => total + chunk.byteLength, 0);
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
        const flushes = pendingControlScripts.length > 0 || pendingRscChunks.length > 0;
        while (!errored && pendingControlScripts.length > 0) {
          const script = pendingControlScripts.shift();
          if (script) controller.enqueue(script);
        }
        while (!errored && pendingRscChunks.length > 0) {
          const chunk = pendingRscChunks.shift();
          if (chunk) controller.enqueue(encoder.encode(createInlineRscScript(chunk, token)));
        }
        if (flushes && !errored) controller.enqueue(encoder.encode(SsrInlineScripts.flushTag));
        while (queueDrainResolvers.length > 0) queueDrainResolvers.shift()?.();
      };

      const notifyScriptAvailable = () => {
        while (scriptAvailableResolvers.length > 0) scriptAvailableResolvers.shift()?.();
      };

      const waitForRscQueueDrain = async () => {
        while (!errored && pendingRscBytes() >= maxPendingRscBytes)
          await new Promise<void>((resolve) => queueDrainResolvers.push(resolve));
      };

      const waitForScriptAvailable = () => new Promise<void>((resolve) => scriptAvailableResolvers.push(resolve));

      const pumpRscScripts = async () => {
        rscReader = rscClientStream.getReader();
        try {
          for (;;) {
            await waitForRscQueueDrain();
            if (errored) break;
            const { value, done } = await rscReader.read();
            if (done || errored) break;
            //? Encoded only when flushed: encoding in the tick that passes the shell on would hold back its socket write.
            pendingRscChunks.push(value);
            options.onPendingRscBytes?.(pendingRscBytes());
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
            if (control?.type !== "redirect" || errored) return;
            pendingControlScripts.push(encoder.encode(createSoftRedirectScript(control, token)));
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
          }
        } finally {
          htmlReader.releaseLock();
          htmlReader = null;
        }

        if (errored) return;
        while (
          !errored &&
          (!rscDone || !lateControlDone || pendingControlScripts.length > 0 || pendingRscChunks.length > 0)
        ) {
          flushPendingRscScripts();
          if (!rscDone || !lateControlDone) await waitForScriptAvailable();
        }
        await Promise.all([rscPump, lateControlPump]);
        if (errored) return;
        flushPendingRscScripts();
        controller.enqueue(encoder.encode(SsrInlineScripts.endTags(token)));
        controller.close();
      };

      const requestContext = options.requestStore ?? options.request;
      const runPump = () =>
        RenderScope.run(pump)
          .catch(fail)
          .finally(() => options.onComplete?.());
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

export class SsrFromRscRenderer {
  static readonly #chunkRegistryStats: SsrChunkRegistryStats = {
    ssrChunkRegistrySize: 0,
    ssrChunkLoadCount: 0,
    ssrChunkCacheHitCount: 0,
    ssrChunkEvictionCount: 0,
  };

  // Not a bundle constant (only AKAN_PUBLIC_* is inlined, at build time) nor a React prop (FetchClient fixes its
  // origin at module init): the bootstrap script is the one thing that runs ahead of every module script.
  static #prefix() {
    const api = getApiPrefix();
    const ws = getWsPrefix();
    return api === "/api" && ws === "/ws" ? undefined : { api, ws };
  }

  static {
    SsrFromRscRenderer.#installWebpackShims();
  }

  static readonly #logger = new Logger("SsrFromRscRenderer");

  static getChunkRegistryStats(): SsrChunkRegistryStats {
    return { ...SsrFromRscRenderer.#chunkRegistryStats };
  }

  async render(input: SsrFromRscInput): Promise<ReadableStream<Uint8Array>> {
    const [rscForSsr, rscForClient] = input.rscStream.tee();
    const requestStore = input.requestStore ?? (input.request ? createRequestStore(input.request) : undefined);
    const inRequestScope = <T,>(fn: () => T): T =>
      requestStore && requestStorage
        ? requestStorage.run(requestStore, () => RenderScope.run(fn))
        : RenderScope.run(fn);

    const chunkPreloads = input.modulePreloadPlan ? new FlightModulePreloads(input.modulePreloadPlan) : null;
    const ssrNodeStream = Readable.fromWeb(
      sanitizeFlightForSsrStream(
        rscForSsr,
        chunkPreloads ? (row, tag) => chunkPreloads.observe(row, tag) : undefined,
      ) as never,
    );
    const stderrSuppressor = ExpectedLateRedirectStderrSuppressor.start(input.lateControl);
    //? The Flight client wakes what Fizz suspended on from its stream's data handler, so it reads in the request scope.
    const thenable = SsrFromRscRenderer.#suppressExpectedLateRedirectError(
      inRequestScope(() => createFromNodeStream(ssrNodeStream, input.ssrManifest)),
      input.lateControl,
    );

    const renderHtml = async () =>
      await SsrFromRscRenderer.renderDocument(await thenable, {
        nonce: input.nonce,
        waitForAllReady: input.waitForAllReady || process.env.AKAN_SSR_WAIT_FOR_ALL_READY === "1",
        inlineBoundaries: input.inlineBoundaries,
        onError: (error, phase) => SsrFromRscRenderer.#reportRenderError(error, input, phase),
      });
    let htmlStream: ReadableStream<Uint8Array>;
    try {
      htmlStream = await inRequestScope(renderHtml);
    } catch (error) {
      stderrSuppressor?.stop();
      void rscForClient.cancel(error).catch(() => {});
      throw error;
    }

    //? 64 bits no page content can guess while it renders; a cached page replays its own.
    const token = randomBytes(8).toString("base64url");
    const withHeadScripts = SsrInlineScripts.injectIntoHead(htmlStream, {
      bootstrap: {
        token,
        modules: input.bootstrapModules ?? [],
        ...input.bootstrapData,
        prefix: SsrFromRscRenderer.#prefix(),
      },
      devInline: input.devBootstrapInline,
      nonce: input.nonce,
      importmap: input.importmap,
      //? The shell has rendered by now, so its client references have arrived; a later boundary's chunks load unpreloaded.
      modulePreloads: [
        ...new Set([
          ...(input.bootstrapModules ?? []),
          ...(chunkPreloads?.urls ?? []),
          ...(input.modulePreloads ?? []),
        ]),
      ],
      theme: input.theme,
      injectThemeInitScript: input.injectThemeInitScript,
    });

    // Splice only at chunk boundaries (Fizz may split inside SVG paths or attributes). The bootstrap modules start at
    // the end block: one React emitted mid-stream could run cached before $RC() restores Suspense segments.
    return interleaveRscScriptsWithHtml(withHeadScripts, sanitizeFlightForClientStream(rscForClient), {
      token,
      lateControl: input.lateControl,
      onComplete: () => stderrSuppressor?.stop(),
      onCancel: input.onCancel,
      requestStore,
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
    const loadChunk = async (chunkId: string) => {
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
    g.__webpack_chunk_load__ = (chunkId: string) => {
      const load = loadChunk(chunkId);
      const loading = SsrFromRscRenderer.#chunkLoads();
      const settle = () => loading.delete(load);
      loading.add(load);
      load.then(settle, settle);
      return load;
    };
    g.__webpack_require__ = (id: string) => {
      const mod = registry.get(id);
      if (!mod) throw new AkanError("notInitialized", `[ssrFromRsc] module not loaded yet: ${id}`);
      return mod;
    };
  }

  // renderToReadableStream resolves at shell-ready and rejects on a shell error, so shell redirects stay catchable;
  // only `block` routes await allReady, trading the Loading fallback for a clean page on a late non-redirect error,
  // and so does a crawler, which runs no script to swap a streamed segment in.
  static async renderDocument(root: ReactNode, options: SsrDocumentOptions): Promise<ReadableStream<Uint8Array>> {
    const stream = await renderToReadableStream(root, {
      //? React puts it on the scripts it writes itself: the ones that reveal a streamed boundary name ids, so no
      //? hash known ahead of the render covers them.
      nonce: options.nonce,
      //? Past this size React outlines a finished boundary into a hidden segment `$RC` reveals, throttled to 300ms.
      progressiveChunkSize: Number.POSITIVE_INFINITY,
      onError: (error) => options.onError(error),
    });
    if (options.waitForAllReady || options.inlineBoundaries) await stream.allReady;
    else {
      SsrFromRscRenderer.holdPostShellErrors(stream, (error) => options.onError(error, "post-shell"));
      await SsrFromRscRenderer.#settleChunkLoads();
    }
    return stream;
  }

  //? React flushes on the first read: let a level waiting on its client module finish (the load, then React's ping).
  //? Every render in the process shares the set, so the rounds are capped: another request's loads cannot hold this one.
  static async #settleChunkLoads(): Promise<void> {
    const loading = SsrFromRscRenderer.#chunkLoads();
    for (let round = 0; round < 4 && loading.size > 0; round++) {
      await Promise.allSettled(loading);
      for (let turn = 0; turn < 2; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  //? On globalThis beside the shims they track: the server bundles carry their own copy of this module.
  static #chunkLoads(): Set<Promise<void>> {
    const g = globalThis as unknown as { __rsc_ssr_chunk_loads__?: Set<Promise<void>> };
    g.__rsc_ssr_chunk_loads__ ??= new Set();
    return g.__rsc_ssr_chunk_loads__;
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
    lateControl?: Promise<SsrLateControl | null>,
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
}
