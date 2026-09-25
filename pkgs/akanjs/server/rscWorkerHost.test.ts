import { describe, expect, test } from "bun:test";
import { LruTtlCache } from "./cachePolicy";
import { shouldRenderLocaleAlternates } from "./metadata";
import type { AkanRouterStateV1, AkanRscPatchMetadata } from "./routeState";
import {
  type CachedRscResult,
  createCachedRscPatchMetadata,
  createRscPatchCacheEntry,
  createRscWorkerCachedPatchReplayDecision,
  invalidateCachedRscResults,
  isCachedRscPatchMetadataCompatible,
  isRscPatchResultCacheEligible,
  resolveRscWorkerPatchCacheEntry,
  shouldCollectRscWorkerRenderChunks,
  shouldStoreRscWorkerPatchResult,
  shouldUseRscWorkerFullResultCache,
} from "./rscWorkerCache";
import {
  createIdempotentRscRenderCancel,
  createRscHostRenderStream,
  createRscWorkerInvalidateCacheMessage,
  getRscHostMaxPendingChunks,
  isRscHostPendingChunkOverflow,
  nextRscHostPendingChunkCount,
  type RscPending,
} from "./rscWorkerHost";
import { type CachedRscReplayMessage, replayCachedRscResult } from "./rscWorkerReplay";

const decoder = new TextDecoder();

function makePatchRouterState(input: { buildId?: number; href?: string; routeId?: string } = {}): AkanRouterStateV1 {
  return {
    version: 1,
    buildId: input.buildId ?? 7,
    href: input.href ?? "https://example.test/docs?page=1",
    routeId: input.routeId ?? "/docs",
    segments: [
      { kind: "root-layout", path: "/", key: "root:/:0" },
      { kind: "layout", path: "/docs", key: "layout:/docs:1" },
      { kind: "page", path: "/docs", key: "page:/docs:2" },
    ],
  };
}

function makeHeadSafePatch(input: Partial<AkanRscPatchMetadata> = {}): AkanRscPatchMetadata {
  return {
    patchStartIndex: 2,
    patchStartSegmentKey: "page:/docs:2",
    segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs:2"],
    headSafe: true,
    headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Docs" }] },
    ...input,
  };
}

function createHostRenderHarness(options: { maxPendingChunks?: number; signal?: AbortSignal } = {}) {
  let pending: RscPending | undefined;
  let deletePendingCount = 0;
  let sendCount = 0;
  let pendingChunkOverflowCount = 0;
  const cancelReasons: unknown[] = [];
  const result = createRscHostRenderStream({
    setPending: (nextPending) => {
      pending = nextPending;
    },
    deletePending: () => {
      deletePendingCount += 1;
      pending = undefined;
    },
    sendRenderOrQueue: () => {
      sendCount += 1;
    },
    cancelRender: (reason) => {
      cancelReasons.push(reason);
    },
    maxPendingChunks: options.maxPendingChunks,
    signal: options.signal,
    onPendingChunkOverflow: () => {
      pendingChunkOverflowCount += 1;
    },
  });

  return {
    result,
    pending: () => {
      if (!pending) throw new Error("pending render was not registered");
      return pending;
    },
    deletePendingCount: () => deletePendingCount,
    sendCount: () => sendCount,
    pendingChunkOverflowCount: () => pendingChunkOverflowCount,
    cancelReasons,
  };
}

describe("RscWorker host pending chunk cap", () => {
  test("uses a conservative default when the env value is invalid", () => {
    expect(getRscHostMaxPendingChunks(undefined)).toBe(256);
    expect(getRscHostMaxPendingChunks("0")).toBe(256);
    expect(getRscHostMaxPendingChunks("not-a-number")).toBe(256);
  });

  test("tracks queued chunks only while the host stream is backpressured", () => {
    expect(nextRscHostPendingChunkCount(0, 1)).toBe(0);
    expect(nextRscHostPendingChunkCount(0, 0)).toBe(1);
    expect(nextRscHostPendingChunkCount(1, -1)).toBe(2);
    expect(nextRscHostPendingChunkCount(2, 1)).toBe(0);
  });

  test("fails only after pending chunks exceed the configured cap", () => {
    expect(isRscHostPendingChunkOverflow(2, 2)).toBe(false);
    expect(isRscHostPendingChunkOverflow(3, 2)).toBe(true);
  });
});

describe("RscWorker locale alternates policy", () => {
  test("skips automatic alternates for special routes or explicit metadata languages", () => {
    expect(shouldRenderLocaleAlternates({})).toBe(true);
    expect(shouldRenderLocaleAlternates({ isSpecialRoute: true })).toBe(false);
    expect(shouldRenderLocaleAlternates({ hasExplicitLanguageAlternates: true })).toBe(false);
    expect(shouldRenderLocaleAlternates({ isSpecialRoute: false, hasExplicitLanguageAlternates: false })).toBe(true);
  });
});

describe("RscWorker host render stream", () => {
  test("resolves on meta and streams chunks until end", async () => {
    const harness = createHostRenderHarness();

    expect(harness.sendCount()).toBe(1);
    harness.pending().onMeta?.({ theme: "dark", status: 404 });
    const result = await harness.result;
    expect(result.type).toBe("stream");
    if (result.type !== "stream") throw new Error("expected stream result");

    harness.pending().onChunk(new TextEncoder().encode("flight"));
    harness.pending().onEnd();

    expect(result.theme).toBe("dark");
    expect(result.status).toBe(404);
    expect(await new Response(result.stream).text()).toBe("flight");
    await expect(result.lateControl).resolves.toBeNull();
  });

  test("resolves on the first chunk even when meta has not arrived", async () => {
    const harness = createHostRenderHarness();

    harness.pending().onChunk(new TextEncoder().encode("early"));
    const result = await harness.result;
    expect(result.type).toBe("stream");
    if (result.type !== "stream") throw new Error("expected stream result");

    harness.pending().onEnd();

    expect(result.theme).toBeUndefined();
    expect(result.status).toBeUndefined();
    expect(await new Response(result.stream).text()).toBe("early");
    await expect(result.lateControl).resolves.toBeNull();
  });

  test("cancels the worker once when the consumer cancels the stream", async () => {
    const harness = createHostRenderHarness();
    const reason = new Error("client disconnected");

    harness.pending().onMeta?.({});
    const result = await harness.result;
    expect(result.type).toBe("stream");
    if (result.type !== "stream") throw new Error("expected stream result");

    await result.stream.cancel(reason);
    result.cancel(new Error("duplicate cancel"));

    expect(harness.deletePendingCount()).toBe(1);
    expect(harness.cancelReasons).toEqual([reason]);
    await expect(result.lateControl).resolves.toBeNull();
  });

  test("rejects and cancels when the request aborts before the stream starts", async () => {
    const controller = new AbortController();
    const harness = createHostRenderHarness({ signal: controller.signal });
    const reason = new Error("client disconnected before first Flight chunk");

    controller.abort(reason);

    await expect(harness.result).rejects.toBe(reason);
    expect(harness.deletePendingCount()).toBe(1);
    expect(harness.cancelReasons).toEqual([reason]);
  });

  test("fails fast and cancels when pending chunks exceed the bounded queue cap", async () => {
    const harness = createHostRenderHarness({ maxPendingChunks: 1 });

    harness.pending().onChunk(new Uint8Array([1]));
    const result = await harness.result;
    expect(result.type).toBe("stream");
    if (result.type !== "stream") throw new Error("expected stream result");
    const reader = result.stream.getReader();
    const closed = reader.closed.catch((streamError: unknown) => streamError);

    harness.pending().onChunk(new Uint8Array([2]));
    harness.pending().onChunk(new Uint8Array([3]));

    const closedError = await closed;
    expect(closedError).toBeInstanceOf(Error);
    expect((closedError as Error).message).toBe("rsc worker host queue exceeded 1 pending chunks");
    expect(harness.deletePendingCount()).toBe(1);
    expect(harness.cancelReasons).toHaveLength(1);
    expect(harness.cancelReasons[0]).toBeInstanceOf(Error);
    expect(harness.pendingChunkOverflowCount()).toBe(1);
    await expect(result.lateControl).resolves.toBeNull();
  });

  test("resolves initial redirect and not-found before the stream starts", async () => {
    const redirectHarness = createHostRenderHarness();
    redirectHarness.pending().onRedirect?.("/login", "replace", 307);

    await expect(redirectHarness.result).resolves.toEqual({
      type: "redirect",
      location: "/login",
      method: "replace",
      status: 307,
    });

    const notFoundHarness = createHostRenderHarness();
    notFoundHarness.pending().onNotFound?.();

    await expect(notFoundHarness.result).resolves.toEqual({ type: "not-found" });
  });

  test("resolves late redirect control after the stream has started", async () => {
    const harness = createHostRenderHarness();

    harness.pending().onChunk(new TextEncoder().encode("shell"));
    const result = await harness.result;
    expect(result.type).toBe("stream");
    if (result.type !== "stream") throw new Error("expected stream result");

    harness.pending().onLateRedirect?.("/target", "push", 308);
    harness.pending().onEnd();

    expect(decoder.decode(await new Response(result.stream).arrayBuffer())).toBe("shell");
    await expect(result.lateControl).resolves.toEqual({
      type: "redirect",
      location: "/target",
      method: "push",
      status: 308,
    });
  });

  test("preserves worker cache state that arrives before stream end", async () => {
    const harness = createHostRenderHarness();

    harness.pending().onMeta?.({});
    const result = await harness.result;
    expect(result.type).toBe("stream");
    if (result.type !== "stream") throw new Error("expected stream result");

    harness.pending().onCacheState?.({
      cacheable: true,
      revalidate: 15,
      dynamicUsage: { headers: false, cookies: false },
    });
    harness.pending().onChunk(new TextEncoder().encode("flight"));
    harness.pending().onEnd();

    expect(await new Response(result.stream).text()).toBe("flight");
    await expect(result.cacheState).resolves.toEqual({
      cacheable: true,
      revalidate: 15,
      dynamicUsage: { headers: false, cookies: false },
    });
  });
});

describe("RscWorker render cancellation", () => {
  test("uses an idempotent cancel path that does not depend on stream.cancel", () => {
    const reasons: unknown[] = [];
    const firstReason = new Error("client disconnected");
    const secondReason = new Error("stream locked");
    const cancel = createIdempotentRscRenderCancel((reason) => {
      reasons.push(reason);
    });

    cancel(firstReason);
    cancel(secondReason);
    cancel();

    expect(reasons).toEqual([firstReason]);
  });
});

describe("RscWorker cache invalidation", () => {
  test("creates an invalidate-cache worker message with optional reason", () => {
    expect(createRscWorkerInvalidateCacheMessage()).toEqual({ type: "invalidate-cache" });
    expect(createRscWorkerInvalidateCacheMessage("manual")).toEqual({ type: "invalidate-cache", reason: "manual" });
    expect(createRscWorkerInvalidateCacheMessage({ tags: ["docs"], paths: ["/docs"], reason: "tagged" })).toEqual({
      type: "invalidate-cache",
      reason: "tagged",
      tags: ["docs"],
      paths: ["/docs"],
    });
  });

  test("creates patch cache keys that distinguish route and patch variants", () => {
    const routerState: AkanRouterStateV1 = {
      version: 1,
      buildId: 7,
      href: "https://example.test/docs?page=1",
      routeId: "/docs",
      segments: [
        { kind: "root-layout", path: "/", key: "root:/:0" },
        { kind: "layout", path: "/docs", key: "layout:/docs:1" },
        { kind: "page", path: "/docs", key: "page:/docs:2" },
      ],
    };
    const patch: AkanRscPatchMetadata = {
      patchStartIndex: 2,
      patchStartSegmentKey: "page:/docs:2",
      segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs:2"],
      headSafe: true,
      headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Docs" }] },
    };
    const baseEntry = { key: "https://example.test\n\n\n\n/docs\n?page=1\n\ndark", ttl: 30 };

    const entry = createRscPatchCacheEntry({ baseEntry, targetRouterState: routerState, patch });
    expect(entry.ttl).toBe(30);
    expect(entry.key).toBe(createRscPatchCacheEntry({ baseEntry, targetRouterState: routerState, patch }).key);
    expect(
      createRscPatchCacheEntry({
        baseEntry,
        targetRouterState: { ...routerState, buildId: 8 },
        patch,
      }).key,
    ).not.toBe(entry.key);
    expect(
      createRscPatchCacheEntry({
        baseEntry: { ...baseEntry, key: baseEntry.key.replace("?page=1", "?page=2") },
        targetRouterState: { ...routerState, href: "https://example.test/docs?page=2" },
        patch,
      }).key,
    ).not.toBe(entry.key);
    expect(
      createRscPatchCacheEntry({
        baseEntry,
        targetRouterState: routerState,
        patch: { ...patch, segmentPath: ["root:/:0", "page:/docs:1"], patchStartSegmentKey: "page:/docs:1" },
      }).key,
    ).not.toBe(entry.key);
    expect(
      createRscPatchCacheEntry({
        baseEntry,
        targetRouterState: routerState,
        patch: { ...patch, headSafe: false },
      }).key,
    ).not.toBe(entry.key);
  });

  test("requires the partial commit guard and head-safe metadata for patch result caching", () => {
    const patch = makeHeadSafePatch();

    expect(isRscPatchResultCacheEligible({ partialCommitEnabled: true, patch })).toBe(true);
    expect(isRscPatchResultCacheEligible({ partialCommitEnabled: false, patch })).toBe(false);
    expect(isRscPatchResultCacheEligible({ partialCommitEnabled: true, patch: { ...patch, headSafe: false } })).toBe(
      false,
    );
    const { headSnapshot: _headSnapshot, ...missingHeadPatch } = patch;
    expect(isRscPatchResultCacheEligible({ partialCommitEnabled: true, patch: missingHeadPatch })).toBe(false);
    expect(
      isRscPatchResultCacheEligible({
        partialCommitEnabled: true,
        patch: { ...patch, headSnapshotFailure: "head-invalid" },
      }),
    ).toBe(false);
  });

  test("uses the worker patch cache path before full result cache for eligible patch decisions", () => {
    const cacheEntry = { key: "full-key", ttl: 30 };
    const targetRouterState = makePatchRouterState();
    const patch = makeHeadSafePatch();
    const patchDecision = {
      status: "patch" as const,
      reason: "same-route-search-params",
      commonPrefixLength: 3,
      patch,
    };

    const patchCacheEntry = resolveRscWorkerPatchCacheEntry({
      cacheEntry,
      targetRouterState,
      safePatchDecision: patchDecision,
      partialCommitEnabled: true,
    });

    expect(patchCacheEntry).toEqual(createRscPatchCacheEntry({ baseEntry: cacheEntry, targetRouterState, patch }));
    expect(shouldUseRscWorkerFullResultCache({ cacheEntry, patchCacheEntry })).toBe(false);
    expect(
      shouldCollectRscWorkerRenderChunks({
        cacheEntry,
        effectivePatchDecision: patchDecision,
        patchCacheEntry,
      }),
    ).toBe(true);
    expect(
      shouldStoreRscWorkerPatchResult({
        cacheEntry,
        patchCacheEntry,
        effectivePatchDecision: patchDecision,
        storeTtl: 30,
      }),
    ).toBe(true);
  });

  test("falls back to the worker full result cache path when patch caching is not eligible", () => {
    const cacheEntry = { key: "full-key", ttl: 30 };
    const targetRouterState = makePatchRouterState();
    const patchDecision = {
      status: "patch" as const,
      reason: "same-route-search-params",
      commonPrefixLength: 3,
      patch: makeHeadSafePatch(),
    };

    const guardOffPatchEntry = resolveRscWorkerPatchCacheEntry({
      cacheEntry,
      targetRouterState,
      safePatchDecision: patchDecision,
      partialCommitEnabled: false,
    });
    expect(guardOffPatchEntry).toBeNull();
    expect(shouldUseRscWorkerFullResultCache({ cacheEntry, patchCacheEntry: guardOffPatchEntry })).toBe(true);
    expect(
      shouldCollectRscWorkerRenderChunks({
        cacheEntry,
        effectivePatchDecision: patchDecision,
        patchCacheEntry: guardOffPatchEntry,
      }),
    ).toBe(false);
    expect(
      shouldStoreRscWorkerPatchResult({
        cacheEntry,
        patchCacheEntry: guardOffPatchEntry,
        effectivePatchDecision: patchDecision,
        storeTtl: 30,
      }),
    ).toBe(false);

    const fullDecision = { status: "full" as const, reason: "guard-disabled", commonPrefixLength: 3 };
    expect(
      resolveRscWorkerPatchCacheEntry({
        cacheEntry,
        targetRouterState,
        safePatchDecision: fullDecision,
        partialCommitEnabled: true,
      }),
    ).toBeNull();
    expect(
      shouldCollectRscWorkerRenderChunks({
        cacheEntry,
        effectivePatchDecision: fullDecision,
        patchCacheEntry: null,
      }),
    ).toBe(true);
  });

  test("stores target route state and patch metadata in cached patch values", () => {
    const targetRouterState = makePatchRouterState();
    const patch = makeHeadSafePatch();
    const cacheValue: CachedRscResult = {
      chunks: [new Uint8Array([1])],
      bytes: 1,
      chunksCount: 1,
      pathname: "/docs",
      routeId: "/docs",
      tags: ["docs"],
      cacheState: { cacheable: true, routeId: "/docs", tags: ["docs"] },
      patch: createCachedRscPatchMetadata({ targetRouterState, patch }),
    };

    expect(cacheValue.patch).toEqual({ targetRouterState, patch });
    expect(cacheValue.patch?.patch.headSnapshot).toEqual(patch.headSnapshot);
  });

  test("uses cached patch metadata as the replay decision source", () => {
    const targetRouterState = makePatchRouterState();
    const cachedPatch = makeHeadSafePatch({
      headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Cached" }] },
    });
    const freshPatch = makeHeadSafePatch({
      headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Fresh" }] },
    });
    const safePatchDecision = {
      status: "patch" as const,
      reason: "same-route-search-params",
      commonPrefixLength: 3,
      patch: freshPatch,
    };
    const cached = createCachedRscPatchMetadata({ targetRouterState, patch: cachedPatch });

    expect(isCachedRscPatchMetadataCompatible({ cached, targetRouterState, safePatchDecision })).toBe(true);
    expect(createRscWorkerCachedPatchReplayDecision({ cached, safePatchDecision }).patch?.headSnapshot).toEqual(
      cachedPatch.headSnapshot,
    );
    expect(
      isCachedRscPatchMetadataCompatible({
        cached,
        targetRouterState: { ...targetRouterState, href: "https://example.test/docs?page=2" },
        safePatchDecision,
      }),
    ).toBe(false);
  });

  test("invalidates cached RSC results by tag and path scope", () => {
    const makeResult = (pathname: string, tags: string[]): CachedRscResult => ({
      chunks: [],
      bytes: 0,
      chunksCount: 0,
      pathname,
      routeId: pathname,
      tags,
      cacheState: { cacheable: true, routeId: pathname, tags },
    });
    const cache = new LruTtlCache<CachedRscResult>(10);
    cache.set("docs", makeResult("/docs/intro", ["docs"]), 30);
    cache.set("blog", makeResult("/blog/intro", ["blog"]), 30);
    cache.set("api", makeResult("/api/reference", ["api"]), 30);

    invalidateCachedRscResults(cache, { tags: ["docs"] });
    expect(cache.get("docs")).toBeNull();
    expect(cache.get("blog")?.pathname).toBe("/blog/intro");
    expect(cache.get("api")?.pathname).toBe("/api/reference");

    invalidateCachedRscResults(cache, { paths: ["/api"] });
    expect(cache.get("api")).toBeNull();
    expect(cache.get("blog")?.pathname).toBe("/blog/intro");

    invalidateCachedRscResults(cache, { reason: "manual" });
    expect(cache.get("blog")).toBeNull();
  });

  test("invalidates cached patch RSC results with the same route metadata policy", () => {
    const cache = new LruTtlCache<CachedRscResult>(10);
    cache.set(
      "patch-docs",
      {
        chunks: [new Uint8Array([1])],
        bytes: 1,
        chunksCount: 1,
        pathname: "/docs",
        routeId: "/docs",
        tags: ["docs"],
        cacheState: { cacheable: true, routeId: "/docs", tags: ["docs"] },
      },
      30,
    );
    cache.set(
      "patch-blog",
      {
        chunks: [new Uint8Array([2])],
        bytes: 1,
        chunksCount: 1,
        pathname: "/blog",
        routeId: "/blog",
        tags: ["blog"],
        cacheState: { cacheable: true, routeId: "/blog", tags: ["blog"] },
      },
      30,
    );

    invalidateCachedRscResults(cache, { tags: ["docs"] });

    expect(cache.get("patch-docs")).toBeNull();
    expect(cache.get("patch-blog")?.pathname).toBe("/blog");
  });
});

describe("RscWorker cached result replay", () => {
  test("stops replaying cached chunks when cancellation is observed", async () => {
    const messages: CachedRscReplayMessage[] = [];
    let cancelled = false;

    const completed = await replayCachedRscResult({
      requestId: "request-1",
      chunks: [new Uint8Array([1]), new Uint8Array([2])],
      theme: "dark",
      cacheState: { cacheable: true, revalidate: 30 },
      send: (message) => {
        messages.push(message);
      },
      isCancelled: () => cancelled,
      yieldToHost: async () => {
        cancelled = true;
      },
    });

    expect(completed).toBe(false);
    expect(messages.map((message) => message.type)).toEqual(["meta", "cache-state", "chunk"]);
    expect(messages[0]).toEqual({ type: "meta", requestId: "request-1", theme: "dark", status: undefined });
    expect(messages[1]).toEqual({
      type: "cache-state",
      requestId: "request-1",
      state: { cacheable: true, revalidate: 30 },
    });
    expect(messages[2]).toEqual({ type: "chunk", requestId: "request-1", data: new Uint8Array([1]) });
  });

  test("forwards cached replay trace metadata in the meta message", async () => {
    const messages: CachedRscReplayMessage[] = [];
    const completed = await replayCachedRscResult({
      requestId: "request-2",
      chunks: [],
      trace: {
        navId: "9",
        pathname: "/en/docs",
        routeId: "/:lang/docs",
        cache: "hit",
        cacheKeyHash: "cache-key",
      },
      send: (message) => {
        messages.push(message);
      },
      isCancelled: () => false,
    });

    expect(completed).toBe(true);
    expect(messages[0]).toEqual({
      type: "meta",
      requestId: "request-2",
      theme: undefined,
      status: undefined,
      trace: {
        navId: "9",
        pathname: "/en/docs",
        routeId: "/:lang/docs",
        cache: "hit",
        cacheKeyHash: "cache-key",
      },
    });
  });

  test("keeps replay cache state separate from patch cache hit trace metadata", async () => {
    const messages: CachedRscReplayMessage[] = [];
    const cacheState = { cacheable: true, routeId: "/docs", tags: ["docs"], revalidate: 10 };
    const completed = await replayCachedRscResult({
      requestId: "request-3",
      chunks: [],
      cacheState,
      trace: {
        navId: "10",
        pathname: "/docs",
        routeId: "/docs",
        cache: "hit",
        cacheKeyHash: "patch-key",
        partial: "patch",
        partialReason: "cache-hit-patch-replay",
        patchStartIndex: 2,
        patchStartSegment: "page:/docs:2",
      },
      send: (message) => {
        messages.push(message);
      },
      isCancelled: () => false,
    });

    expect(completed).toBe(true);
    expect(messages[0]).toMatchObject({
      type: "meta",
      requestId: "request-3",
      trace: {
        cache: "hit",
        cacheKeyHash: "patch-key",
        partial: "patch",
        partialReason: "cache-hit-patch-replay",
      },
    });
    expect(messages[1]).toEqual({ type: "cache-state", requestId: "request-3", state: cacheState });
  });
});
