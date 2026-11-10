import type { Logger } from "akanjs/common";
import type { AkanRequestStore } from "akanjs/fetch";
import {
  hasRouteCacheInvalidationScope,
  LruTtlCache,
  parsePositiveInt,
  type RouteCacheEntry,
  type RouteCacheInvalidation,
  type RouteCacheRenderState,
  resolvePublicRouteCacheEntryDecision,
  resolveRouteCacheStoreTtl,
  shouldInvalidateRouteCacheEntry,
  shouldStoreRouteCache,
} from "./cachePolicy";
import { type EncodedBody, encodeBody } from "./contentEncoding";
import type { SsrLateControl } from "./ssrTypes";
import { WebRouteContext } from "./webRouteContext";

export const DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Well above any sensible TTL: this only has to reclaim a cache nobody is reading, not track expiry closely. */
const ROUTE_CACHE_SWEEP_INTERVAL_MS = 60_000;

export function cacheHtmlWhileStreaming(
  stream: ReadableStream<Uint8Array>,
  onComplete: (html: string) => void,
  options: {
    shouldCache?: () => boolean | Promise<boolean>;
    maxBodyBytes?: number | null;
    onSkip?: (reason: "body-too-large" | "store-skip") => void;
  } = {},
): ReadableStream<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let exceededMaxBodyBytes = false;
  const decoder = new TextDecoder();

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!exceededMaxBodyBytes) {
          byteLength += chunk.byteLength;
          if (options.maxBodyBytes && byteLength > options.maxBodyBytes) {
            exceededMaxBodyBytes = true;
            chunks.length = 0;
          } else {
            chunks.push(chunk.slice());
          }
        }
        controller.enqueue(chunk);
      },
      async flush() {
        if (exceededMaxBodyBytes) {
          options.onSkip?.("body-too-large");
          return;
        }
        const body = new Uint8Array(byteLength);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        try {
          if (options.shouldCache && !(await options.shouldCache())) {
            options.onSkip?.("store-skip");
            return;
          }
          onComplete(decoder.decode(body));
        } catch {
          // Cache writes must not fail the already completed response stream.
        }
      },
    }),
  );
}

export function resolveHtmlRouteCacheStoreTtl(input: {
  baseTtl: number;
  workerCacheState: RouteCacheRenderState;
  hostRequestStore: AkanRequestStore;
  lateControl?: { type: "redirect" | "not-found" } | null;
}): number | null {
  if (input.lateControl) return null;
  const workerTtl = resolveRouteCacheStoreTtl(input.baseTtl, input.workerCacheState);
  if (workerTtl === null) return null;
  const hostCacheState = shouldStoreRouteCache({
    policy: input.hostRequestStore.policy,
    dynamicUsage: input.hostRequestStore.dynamicUsage,
  });
  return resolveRouteCacheStoreTtl(workerTtl, hostCacheState);
}

interface CachedHtmlResult {
  body: EncodedBody;
  pathname: string;
  routeId?: string;
  tags?: string[];
}

interface HtmlResultCacheOptions {
  prodMode: boolean;
  devRegistry: boolean;
}

interface HtmlStoreInput {
  entry: RouteCacheEntry;
  pathname: string;
  lateControl: Promise<SsrLateControl | null>;
  cacheState: Promise<RouteCacheRenderState>;
  hostRequestStore: AkanRequestStore;
  logger: Logger;
}

export class HtmlResultCache {
  readonly #cache = new LruTtlCache<CachedHtmlResult>(
    parsePositiveInt(process.env.AKAN_HTML_RESULT_CACHE_MAX_ENTRIES) ?? 100,
    {
      sizeOf: (result) => result.body.byteLength,
      maxBytes: LruTtlCache.parseByteCeiling(process.env.AKAN_HTML_RESULT_CACHE_MAX_BYTES),
      sweepIntervalMs: ROUTE_CACHE_SWEEP_INTERVAL_MS,
    },
  );
  readonly #prodMode: boolean;
  readonly #devRegistry: boolean;
  #hits = 0;
  #misses = 0;
  #bypass = 0;

  constructor({ prodMode, devRegistry }: HtmlResultCacheOptions) {
    this.#prodMode = prodMode;
    this.#devRegistry = devRegistry;
  }

  entryFor(req: Request, url: URL, isCrawler: boolean): { entry: RouteCacheEntry | null; reason?: string } {
    //? The dev registry's shim config is part of the HTML: a cached page would boot every reload beside the vendor file
    //? it was rendered with, and a tab that reloads onto the current pair would reload again until the entry expired.
    if (this.#devRegistry) {
      this.#bypass += 1;
      return { entry: null, reason: "dev-registry" };
    }
    const decision = resolvePublicRouteCacheEntryDecision({
      request: req,
      url,
      theme: WebRouteContext.cookieValue(req, "theme"),
      variant: isCrawler ? "crawler" : undefined,
      defaultEnabled: this.#prodMode,
      defaultAllow: this.#prodMode,
      env: {
        enabled: process.env.AKAN_HTML_RESULT_CACHE,
        ttl: process.env.AKAN_HTML_RESULT_CACHE_TTL,
        allow: process.env.AKAN_HTML_RESULT_CACHE_PATHS,
        deny: process.env.AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS,
      },
    });
    if (!decision.entry) this.#bypass += 1;
    return decision;
  }

  get(cacheKey: string): EncodedBody | null {
    const cached = this.#cache.get(cacheKey);
    if (!cached) {
      this.#misses += 1;
      return null;
    }
    this.#hits += 1;
    return cached.body;
  }

  storeWhileStreaming(htmlStream: ReadableStream<Uint8Array>, input: HtmlStoreInput): ReadableStream<Uint8Array> {
    const { entry, pathname, hostRequestStore, logger } = input;
    let htmlStoreTtl = entry.ttl;
    let htmlCacheMetadata: Omit<CachedHtmlResult, "body"> = { pathname };
    const shouldCacheHtml = Promise.all([input.lateControl, input.cacheState]).then(([control, cacheState]) => {
      const storeTtl = resolveHtmlRouteCacheStoreTtl({
        baseTtl: entry.ttl,
        workerCacheState: cacheState,
        hostRequestStore,
        lateControl: control,
      });
      if (storeTtl === null) return false;
      htmlStoreTtl = storeTtl;
      htmlCacheMetadata = {
        pathname,
        routeId: cacheState.routeId,
        tags: cacheState.tags,
      };
      return true;
    });
    return cacheHtmlWhileStreaming(
      htmlStream,
      (html) => {
        void encodeBody(html).then((body) => this.#cache.set(entry.key, { body, ...htmlCacheMetadata }, htmlStoreTtl));
      },
      {
        shouldCache: () => shouldCacheHtml,
        maxBodyBytes:
          parsePositiveInt(process.env.AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES) ??
          DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES,
        onSkip: (reason) => {
          logger.verbose(`html cache store skipped pathname=${pathname} reason=${reason}`);
        },
      },
    );
  }

  invalidate(invalidation?: string | RouteCacheInvalidation): void {
    const payload = typeof invalidation === "string" ? { reason: invalidation } : invalidation;
    if (!hasRouteCacheInvalidationScope(payload)) {
      this.#cache.clear();
    } else if (payload) {
      this.#cache.invalidate((_key, value) =>
        shouldInvalidateRouteCacheEntry(
          {
            pathname: value.pathname,
            routeId: value.routeId,
            tags: value.tags,
          },
          payload,
        ),
      );
    }
  }

  metrics() {
    return {
      httpHtmlCacheEntries: this.#cache.size,
      httpHtmlCacheBytes: this.#cache.byteSize,
      httpHtmlCacheHits: this.#hits,
      httpHtmlCacheMisses: this.#misses,
      httpHtmlCacheBypass: this.#bypass,
    };
  }

  dispose() {
    this.#cache.dispose();
  }
}
