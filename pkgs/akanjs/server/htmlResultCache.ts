import type { Logger } from "akanjs/common";
import type { AkanRequestStore } from "akanjs/fetch";
import {
  createRouteCacheKey,
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
import { canonicalRouteCacheUrl, type RouteCacheQueryForm } from "./routeCacheQuery";
import { type RouteCacheLookupReason, RouteCacheTally } from "./routeCacheTally";
import { MAX_RESPONSE_SCRIPT_HASHES, ScriptPolicy, type ScriptPolicySources } from "./scriptPolicy";
import type { SsrLateControl } from "./ssrTypes";
import { WebRouteContext } from "./webRouteContext";

export const DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Well above any sensible TTL: this only has to reclaim a cache nobody is reading, not track expiry closely. */
const ROUTE_CACHE_SWEEP_INTERVAL_MS = 60_000;

//? A route rendered for each request holds one skip per URL: kept in the pages' cache they would push pages out.
const HTML_STORE_SKIP_MAX_ENTRIES = 1000;
//? Only what the page's own render decided is held. A cancelled or failed render says nothing of the next one, and
//? holding it would let one visitor's closed tab switch the cache off for everyone asking for that URL.
const HELD_SKIP_REASONS = [
  "dynamic-request-api",
  "render-not-found",
  "render-redirect",
  "late-redirect",
  "body-too-large",
];

interface HtmlCacheStreamOptions {
  shouldCache?: () => boolean | Promise<boolean>;
  maxBodyBytes?: number | null;
  onSkip?: (reason: "body-too-large" | "store-skip") => void;
}

export function cacheHtmlWhileStreaming(
  stream: ReadableStream<Uint8Array>,
  onComplete: (body: Uint8Array<ArrayBuffer>) => void,
  options: HtmlCacheStreamOptions = {},
): ReadableStream<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let exceededMaxBodyBytes = false;

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
        try {
          if (options.shouldCache && !(await options.shouldCache())) {
            options.onSkip?.("store-skip");
            return;
          }
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
          onComplete(body);
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

export interface CachedHtmlPage {
  body: EncodedBody;
  /** Every hash source the stored page's scripts need: a replay has no nonce of its own to name them by. */
  scriptHashes: string[];
}

interface HtmlCacheMetadata {
  pathname: string;
  routeId?: string;
  tags?: string[];
  queryForm: RouteCacheQueryForm;
}

interface CachedHtmlResult extends CachedHtmlPage, HtmlCacheMetadata {}

//* Held in place of a page no replay can answer: its requests skip the cache, saying why, until this expires.
interface HtmlStoreSkip extends HtmlCacheMetadata {
  reason: string;
}

//? The host learns a route's query form only from its render, so it looks a page up under both its query's keys.
export interface HtmlCacheEntry extends RouteCacheEntry {
  exactKey: string;
}

interface HtmlResultCacheOptions {
  prodMode: boolean;
  devRegistry: boolean;
}

interface HtmlStoreInput {
  entry: HtmlCacheEntry;
  pathname: string;
  lateControl: Promise<SsrLateControl | null>;
  cacheState: Promise<RouteCacheRenderState>;
  hostRequestStore: AkanRequestStore;
  logger: Logger;
  scripts?: ScriptPolicySources;
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
  readonly #skips = new LruTtlCache<HtmlStoreSkip>(HTML_STORE_SKIP_MAX_ENTRIES, {
    sweepIntervalMs: ROUTE_CACHE_SWEEP_INTERVAL_MS,
  });
  readonly #prodMode: boolean;
  readonly #devRegistry: boolean;
  #hits = 0;
  #misses = 0;
  #bypass = 0;

  constructor({ prodMode, devRegistry }: HtmlResultCacheOptions) {
    this.#prodMode = prodMode;
    this.#devRegistry = devRegistry;
  }

  entryFor(req: Request, url: URL, isCrawler: boolean): { entry: HtmlCacheEntry | null; reason?: string } {
    //? The dev registry's shim config is part of the HTML: a cached page would boot every reload beside the vendor file
    //? it was rendered with, and a tab that reloads onto the current pair would reload again until the entry expired.
    if (this.#devRegistry) {
      this.#bypass += 1;
      RouteCacheTally.bypass("html", "dev-registry");
      return { entry: null, reason: "dev-registry" };
    }
    const theme = WebRouteContext.cookieValue(req, "theme");
    const variant = isCrawler ? "crawler" : undefined;
    const decision = resolvePublicRouteCacheEntryDecision({
      request: req,
      url: canonicalRouteCacheUrl(url),
      theme,
      variant,
      defaultEnabled: this.#prodMode,
      defaultAllow: this.#prodMode,
      env: {
        enabled: process.env.AKAN_HTML_RESULT_CACHE,
        ttl: process.env.AKAN_HTML_RESULT_CACHE_TTL,
        allow: process.env.AKAN_HTML_RESULT_CACHE_PATHS,
        deny: process.env.AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS,
      },
    });
    if (!decision.entry) {
      this.#bypass += 1;
      RouteCacheTally.bypass("html", decision.reason);
      return decision;
    }
    const entry = { ...decision.entry, exactKey: createRouteCacheKey({ request: req, url, theme, variant }) };
    const skip = HtmlResultCache.#lookup(this.#skips, entry);
    if (skip) {
      this.#bypass += 1;
      RouteCacheTally.bypass("html", skip.reason);
      return { entry: null, reason: skip.reason };
    }
    return { entry };
  }

  get(entry: HtmlCacheEntry): CachedHtmlPage | null {
    const cached = HtmlResultCache.#lookup(this.#cache, entry);
    if (!cached) {
      this.#misses += 1;
      return null;
    }
    this.#hits += 1;
    RouteCacheTally.lookup("html", true, HtmlResultCache.#lookupReason(entry, cached.queryForm));
    return cached;
  }

  //? The scripts React wrote under the render's nonce are named by hash in a replay's policy.
  static #scriptHashesOf(body: Uint8Array, { nonce, hashes = [] }: ScriptPolicySources = {}): string[] {
    return [...new Set([...hashes, ...(nonce ? ScriptPolicy.hashesOfNonced(body, nonce) : [])])];
  }

  static #lookupReason({ key, exactKey }: HtmlCacheEntry, queryForm: RouteCacheQueryForm): RouteCacheLookupReason {
    return queryForm === "canonical" && key !== exactKey ? "rewritten-query" : "requested-query";
  }

  //? An exact route's render of the canonical URL sits under the canonical key too, and answers only that URL.
  static #lookup<T extends HtmlCacheMetadata>(cache: LruTtlCache<T>, { key, exactKey }: HtmlCacheEntry): T | null {
    const canonical = cache.get(key);
    if (canonical && (canonical.queryForm === "canonical" || key === exactKey)) return canonical;
    return key === exactKey ? null : cache.get(exactKey);
  }

  static #skipReason(
    control: SsrLateControl | null,
    workerState: RouteCacheRenderState,
    { policy, dynamicUsage }: AkanRequestStore,
  ): string {
    if (!workerState.cacheable && workerState.reason) return workerState.reason;
    const hostReason = shouldStoreRouteCache({ policy, dynamicUsage }).reason;
    if (hostReason) return hostReason;
    return control ? `render-${control.type}` : "store-skip";
  }

  storeWhileStreaming(htmlStream: ReadableStream<Uint8Array>, input: HtmlStoreInput): ReadableStream<Uint8Array> {
    const { entry, pathname, hostRequestStore, logger } = input;
    let htmlStoreTtl = entry.ttl;
    let htmlStoreKey = entry.exactKey;
    let htmlCacheMetadata: HtmlCacheMetadata = { pathname, queryForm: "exact" };
    let skipReason = "store-skip";
    const shouldCacheHtml = Promise.all([input.lateControl, input.cacheState]).then(([control, cacheState]) => {
      const queryForm = cacheState.queryForm ?? "exact";
      //? The host learns how a route is keyed only from its render, so a miss is counted here rather than at lookup.
      RouteCacheTally.lookup("html", false, HtmlResultCache.#lookupReason(entry, queryForm));
      htmlStoreKey = queryForm === "canonical" ? entry.key : entry.exactKey;
      htmlCacheMetadata = {
        pathname,
        routeId: cacheState.routeId,
        tags: cacheState.tags,
        queryForm,
      };
      const storeTtl = resolveHtmlRouteCacheStoreTtl({
        baseTtl: entry.ttl,
        workerCacheState: cacheState,
        hostRequestStore,
        lateControl: control,
      });
      if (storeTtl === null) {
        skipReason = HtmlResultCache.#skipReason(control, cacheState, hostRequestStore);
        return false;
      }
      htmlStoreTtl = storeTtl;
      return true;
    });
    return cacheHtmlWhileStreaming(
      htmlStream,
      (bytes) => {
        const scriptHashes = HtmlResultCache.#scriptHashesOf(bytes, input.scripts);
        if (scriptHashes.length > MAX_RESPONSE_SCRIPT_HASHES) {
          this.#skips.set(htmlStoreKey, { reason: "script-hashes", ...htmlCacheMetadata }, htmlStoreTtl);
          const route = htmlCacheMetadata.routeId ?? "unknown";
          if (ScriptPolicy.firstReport("replay", route))
            logger.warn(
              `html cache: a page of route ${route} is rendered for each request (X-Akan-Cache-Reason: script-hashes): ` +
                `its replay would name ${scriptHashes.length} script hashes, and a response names ${MAX_RESPONSE_SCRIPT_HASHES}`,
            );
          return;
        }
        void encodeBody(bytes).then((body) =>
          this.#cache.set(htmlStoreKey, { body, scriptHashes, ...htmlCacheMetadata }, htmlStoreTtl),
        );
      },
      {
        shouldCache: () => shouldCacheHtml,
        maxBodyBytes:
          parsePositiveInt(process.env.AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES) ??
          DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES,
        onSkip: (reason) => {
          const why = reason === "store-skip" ? skipReason : reason;
          if (HELD_SKIP_REASONS.includes(why))
            this.#skips.set(htmlStoreKey, { reason: why, ...htmlCacheMetadata }, entry.ttl);
          logger.verbose(`html cache store skipped pathname=${pathname} reason=${why}`);
        },
      },
    );
  }

  invalidate(invalidation?: string | RouteCacheInvalidation): void {
    const payload = typeof invalidation === "string" ? { reason: invalidation } : invalidation;
    if (!hasRouteCacheInvalidationScope(payload)) {
      this.#cache.clear();
      this.#skips.clear();
    } else if (payload) {
      const matches = (_key: string, { pathname, routeId, tags }: HtmlCacheMetadata) =>
        shouldInvalidateRouteCacheEntry({ pathname, routeId, tags }, payload);
      this.#cache.invalidate(matches);
      this.#skips.invalidate(matches);
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
    this.#skips.dispose();
  }
}
