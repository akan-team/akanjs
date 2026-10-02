import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AkanMetricsReport } from "akanjs/service";
import { LruTtlCache } from "./cachePolicy";
import { shouldRenderLocaleAlternates } from "./head";
import {
  type AkanRouterStateV1,
  type AkanRscPatchMetadata,
  appendAkanRouterStateRequestHeaders,
  createAkanRouterState,
} from "./routeState";
import { RouteTreeBuilder } from "./routeTreeBuilder";
import {
  type CachedRscReplayMessage,
  type CachedRscResult,
  createCachedRscPatchMetadata,
  createRscPatchCacheEntry,
  createRscWorkerCachedPatchReplayDecision,
  invalidateCachedRscResults,
  isCachedRscPatchMetadataCompatible,
  isRscPatchResultCacheEligible,
  replayCachedRscResult,
  resolveRscWorkerPatchCacheEntry,
  shouldCollectRscWorkerRenderChunks,
  shouldStoreRscWorkerPatchResult,
  shouldUseRscWorkerFullResultCache,
} from "./rscWorkerCache";
import { pages as headFixturePages } from "./rscWorkerHead.fixture";
import {
  createIdempotentRscRenderCancel,
  createRscHostRenderStream,
  createRscWorkerInvalidateCacheMessage,
  getRscHostMaxPendingChunks,
  isRscHostPendingChunkOverflow,
  nextRscHostPendingChunkCount,
  projectRscWorkerProcessMetrics,
  type RscPending,
  RscWorker,
} from "./rscWorkerHost";
import type { RscTraceMetadata } from "./ssrTypes";
import type { BaseBuildArtifact } from "./types";

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

const streamResultOf = async (harness: ReturnType<typeof createHostRenderHarness>) => {
  const result = await harness.result;
  expect(result.type).toBe("stream");
  if (result.type !== "stream") throw new Error("expected stream result");
  return result;
};

describe("RscWorker process metric projection", () => {
  const processLevelKeys = [
    "role",
    "pid",
    "reportedAt",
    "rssBytes",
    "heapTotalBytes",
    "heapUsedBytes",
    "externalBytes",
    "arrayBuffersBytes",
    "cpuUserMicros",
    "cpuSystemMicros",
    "maxRssKb",
    "jscHeapSizeBytes",
    "jscHeapCapacityBytes",
    "jscExtraMemorySizeBytes",
    "jscObjectCount",
    "jscProtectedObjectCount",
    "eventLoopLagMeanMs",
    "eventLoopLagP99Ms",
    "eventLoopLagMaxMs",
    "gcDurationMs",
    "trace",
  ] as const;

  test("strips every process-level field the worker samples about itself", () => {
    const workerReport = Object.fromEntries(processLevelKeys.map((key) => [key, 1])) as AkanMetricsReport;
    const projected = projectRscWorkerProcessMetrics(workerReport) as Record<string, unknown>;
    for (const key of processLevelKeys) expect(projected[key]).toBeUndefined();
  });

  test("renames the worker's own sample onto rscWorker* and passes render counters through", () => {
    const projected = projectRscWorkerProcessMetrics({
      role: "rsc-worker",
      pid: 4242,
      rssBytes: 999,
      heapUsedBytes: 111,
      jscExtraMemorySizeBytes: 7,
      rscRenderCount: 12,
      rscResultCacheBytes: 34,
    });
    expect(projected.rscWorkerRssBytes).toBe(999);
    expect(projected.rscWorkerHeapUsedBytes).toBe(111);
    expect(projected.rscWorkerJscExtraMemorySizeBytes).toBe(7);
    expect(projected.rscRenderCount).toBe(12);
    expect(projected.rscResultCacheBytes).toBe(34);
  });

  test("leaves the replica's own process sample intact through the merge AkanServer performs", () => {
    const projected = projectRscWorkerProcessMetrics({ role: "rsc-worker", pid: 4242, rssBytes: 999 });
    const replicaReport: AkanMetricsReport = { pid: 1, rssBytes: 100, role: "federation", ...projected };
    expect(replicaReport.pid).toBe(1);
    expect(replicaReport.rssBytes).toBe(100);
    expect(replicaReport.role).toBe("federation");
    expect(replicaReport.rscWorkerRssBytes).toBe(999);
  });
});

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
  test("skips automatic alternates for special routes", () => {
    expect(shouldRenderLocaleAlternates({})).toBe(true);
    expect(shouldRenderLocaleAlternates({ isSpecialRoute: true })).toBe(false);
    expect(shouldRenderLocaleAlternates({ isSpecialRoute: false })).toBe(true);
  });
});

describe("RscWorker host render stream", () => {
  test("resolves on meta and streams chunks until end", async () => {
    const harness = createHostRenderHarness();

    expect(harness.sendCount()).toBe(1);
    harness.pending().onMeta?.({ theme: "dark", status: 404 });
    const result = await streamResultOf(harness);

    harness.pending().onChunk(new TextEncoder().encode("flight"));
    harness.pending().onEnd();

    expect(result.theme).toBe("dark");
    expect(result.status).toBe(404);
    expect(await new Response(result.stream).text()).toBe("flight");
    await expect(result.lateControl).resolves.toBeNull();
  });

  test("reports a theme the worker names after the stream has started", async () => {
    const harness = createHostRenderHarness();

    harness.pending().onMeta?.({});
    const result = await streamResultOf(harness);
    expect(result.theme).toBeUndefined();

    harness.pending().onTheme?.("light");
    harness.pending().onEnd();

    expect(result.theme).toBe("light");
  });

  test("resolves on the first chunk even when meta has not arrived", async () => {
    const harness = createHostRenderHarness();

    harness.pending().onChunk(new TextEncoder().encode("early"));
    const result = await streamResultOf(harness);

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
    const result = await streamResultOf(harness);

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
    const result = await streamResultOf(harness);
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
    const result = await streamResultOf(harness);

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
    const result = await streamResultOf(harness);

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
    const routerState = makePatchRouterState();
    const patch = makeHeadSafePatch();
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

describe("RscWorker route head", () => {
  interface HeadWorker {
    render: (url: string, headers?: Headers) => Promise<{ body: string; trace?: RscTraceMetadata }>;
    headRuns: (name: string) => number;
  }
  const withHeadWorker = async (env: Record<string, string>, run: (worker: HeadWorker) => Promise<void>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-head-"));
    const headLog = path.join(dir, "head.log");
    const vars: Record<string, string> = {
      AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
      AKAN_TEST_HEAD_LOG: headLog,
      ...env,
    };
    const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
    Object.assign(process.env, vars);
    const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
    const rsc = new RscWorker({
      pagesBundlePath: path.join(import.meta.dir, "rscWorkerHead.fixture.tsx"),
      pagesBundleBuildId: 1,
      rscRuntimeClientManifest: {
        [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
      },
    } as unknown as BaseBuildArtifact);
    try {
      await rsc.ready;
      await run({
        render: async (url, headers) => {
          const result = await rsc.renderWithMeta(new Request(url, { headers }));
          if (result.type !== "stream") throw new Error(`expected a stream, got ${result.type}`);
          return { body: decoder.decode(await new Response(result.stream).arrayBuffer()), trace: result.trace };
        },
        headRuns: (name) =>
          (fs.existsSync(headLog) ? fs.readFileSync(headLog, "utf8").split("\n") : []).filter((line) => line === name)
            .length,
      });
    } finally {
      rsc.kill();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  test("runs a route's head once for a full render and not at all for a cached replay", async () => {
    await withHeadWorker(
      { AKAN_RSC_RESULT_CACHE: "1", AKAN_RSC_RESULT_CACHE_PATHS: "/en/cached" },
      async ({ render, headRuns }) => {
        const first = await render("http://localhost/en/cached");
        expect(first.trace).toMatchObject({ cache: "miss" });
        expect(first.body).toContain("cached body");
        expect(headRuns("cached")).toBe(1);

        const replay = await render("http://localhost/en/cached");
        expect(replay.trace).toMatchObject({ cache: "hit", partialReason: "cache-hit-full-replay" });
        expect(replay.body).toBe(first.body);
        expect(headRuns("cached")).toBe(1);
      },
    );
  }, 20_000);

  test("resolves the head for a patch decision only when the page declares its head patch-safe", async () => {
    const routes = new RouteTreeBuilder(headFixturePages).build();
    const stateOf = (name: string, href: string) => {
      const pathRoute = routes.find((route) => route.path.endsWith(`/${name}`));
      if (!pathRoute) throw new Error(`no route for ${name}`);
      const headers = new Headers();
      appendAkanRouterStateRequestHeaders(headers, createAkanRouterState({ pathRoute, href, buildId: 1 }));
      return headers;
    };
    await withHeadWorker(
      { AKAN_PUBLIC_RSC_PARTIAL_COMMIT: "1", AKAN_RSC_RESULT_CACHE: "0" },
      async ({ render, headRuns }) => {
        const safe = await render("http://localhost/en/safe?tab=2", stateOf("safe", "http://localhost/en/safe?tab=1"));
        expect(safe.trace).toMatchObject({ partial: "patch", patchHeadSafe: true });
        expect(headRuns("safe")).toBe(1);

        const unsafe = await render(
          "http://localhost/en/cached?tab=2",
          stateOf("cached", "http://localhost/en/cached?tab=1"),
        );
        expect(unsafe.trace).toMatchObject({ partial: "full", partialReason: "head-unsafe" });
        expect(unsafe.body).toContain("cached body");
        expect(headRuns("cached")).toBe(1);
      },
    );
  }, 20_000);
});

describe("RscWorker reloads", () => {
  const bundleSource = (body: string, prelude = "") => `import { page } from ${JSON.stringify(
    path.join(import.meta.dir, "../client/route/routeBuilders"),
  )};
${prelude}
export const pages = {
  "./__root_layout.tsx": async () => ({ default: ({ children }) => children }),
  "./x.tsx": async () => ({ default: page().render(() => ${JSON.stringify(body)}) }),
};
`;
  const until = async (condition: () => boolean) => {
    const deadline = Date.now() + 10_000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the worker");
      await Bun.sleep(20);
    }
  };
  const withBundles = async (
    run: (
      rsc: RscWorker,
      bundles: { a: string; b: string; c: string; broken: string; brokenSlow: string; exiting: string },
      body: () => Promise<string>,
    ) => Promise<void>,
    { maxReloads, minRecycleIntervalMs }: { maxReloads?: number; minRecycleIntervalMs?: number } = {},
  ) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-reload-"));
    const bundles = {
      a: path.join(dir, "pages-a.ts"),
      b: path.join(dir, "pages-b.ts"),
      c: path.join(dir, "pages-c.ts"),
      broken: path.join(dir, "broken.ts"),
      brokenSlow: path.join(dir, "broken-slow.ts"),
      exiting: path.join(dir, "exiting.ts"),
    };
    fs.writeFileSync(bundles.a, bundleSource("body A"));
    fs.writeFileSync(bundles.b, bundleSource("body B", "await Bun.sleep(300);"));
    fs.writeFileSync(bundles.c, bundleSource("body C"));
    fs.writeFileSync(bundles.broken, bundleSource("never", 'throw new Error("broken at import");'));
    fs.writeFileSync(
      bundles.brokenSlow,
      bundleSource("never", 'await Bun.sleep(300);\nthrow new Error("broken at import");'),
    );
    fs.writeFileSync(bundles.exiting, bundleSource("never", "process.exit(3);"));
    const saved = {
      workerPath: process.env.AKAN_RSC_WORKER_PATH,
      cache: process.env.AKAN_RSC_RESULT_CACHE,
      maxReloads: process.env.AKAN_RSC_WORKER_MAX_RELOADS,
      minRecycleInterval: process.env.AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS,
    };
    process.env.AKAN_RSC_WORKER_PATH = path.join(import.meta.dir, "rscWorker.tsx");
    process.env.AKAN_RSC_RESULT_CACHE = "0";
    if (maxReloads !== undefined) process.env.AKAN_RSC_WORKER_MAX_RELOADS = String(maxReloads);
    if (minRecycleIntervalMs !== undefined)
      process.env.AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS = String(minRecycleIntervalMs);
    const rsc = new RscWorker({ pagesBundlePath: bundles.a, pagesBundleBuildId: 1 } as unknown as BaseBuildArtifact);
    const body = async () => {
      const result = await rsc.renderWithMeta(new Request("http://localhost/en/x"));
      if (result.type !== "stream") return result.type;
      const text = decoder.decode(await new Response(result.stream).arrayBuffer());
      return (["A", "B", "C"] as const).find((name) => text.includes(`body ${name}`)) ?? "?";
    };
    try {
      await rsc.ready;
      await run(rsc, bundles, body);
    } finally {
      rsc.kill();
      if (saved.workerPath === undefined) delete process.env.AKAN_RSC_WORKER_PATH;
      else process.env.AKAN_RSC_WORKER_PATH = saved.workerPath;
      if (saved.cache === undefined) delete process.env.AKAN_RSC_RESULT_CACHE;
      else process.env.AKAN_RSC_RESULT_CACHE = saved.cache;
      if (saved.maxReloads === undefined) delete process.env.AKAN_RSC_WORKER_MAX_RELOADS;
      else process.env.AKAN_RSC_WORKER_MAX_RELOADS = saved.maxReloads;
      if (saved.minRecycleInterval === undefined) delete process.env.AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS;
      else process.env.AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS = saved.minRecycleInterval;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  test("a reload without a bundle, sent while a new bundle imports, neither returns the worker to the old one nor settles the first early", async () => {
    await withBundles(async (rsc, { b }, body) => {
      const settled: string[] = [];
      const pages = rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: b }).then((running) => {
        settled.push("pages");
        return running;
      });
      await Bun.sleep(40);
      const merge = rsc.reload({ clientManifest: {}, buildId: 2 });
      await Bun.sleep(20);
      expect(settled).toEqual([]);
      expect(await pages).toEqual({ pagesBundlePath: b, buildId: 2 });
      expect(await body()).toBe("B");
      expect(await merge).toEqual({ pagesBundlePath: b, buildId: 2 });
    });
  }, 20_000);

  test("a bundle that throws on import rejects its reload and leaves the worker, and the next reload, on the one it ran", async () => {
    await withBundles(async (rsc, { a, broken }, body) => {
      //? Caught, not `expect(...).rejects`: on Windows bun:test's matcher waits without reading the worker's ipc channel.
      const failed = await rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: broken }).catch((e) => e);
      expect(failed).toMatchObject({
        message: "broken at import",
        adopted: { pagesBundlePath: a, buildId: 1 },
        failed: { pagesBundlePath: broken, buildId: 2 },
      });
      expect(await body()).toBe("A");
      expect(await rsc.reload({ clientManifest: {}, buildId: 3 })).toEqual({ pagesBundlePath: a, buildId: 3 });
      expect(await body()).toBe("A");
    });
  }, 20_000);

  test("a reload that recycles the worker settles when the new worker runs it, and rejects onto the old bundle if it throws", async () => {
    await withBundles(
      async (rsc, { a, c, broken }, body) => {
        expect(await rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: a })).toMatchObject({ buildId: 2 });
        const failed = await rsc.reload({ clientManifest: {}, buildId: 3, pagesBundlePath: broken }).catch((e) => e);
        expect(failed).toMatchObject({
          adopted: { pagesBundlePath: a, buildId: 2 },
          failed: { pagesBundlePath: broken, buildId: 3 },
        });
        expect(await body()).toBe("A");
        //? The worker it fell back to is still past the threshold, so the fix recycles rather than reloading in place.
        const recycles = Number(rsc.getMetrics().rscWorkerRecycleCount);
        expect(await rsc.reload({ clientManifest: {}, buildId: 4, pagesBundlePath: c })).toMatchObject({ buildId: 4 });
        expect(rsc.getMetrics().rscWorkerRecycleCount).toBe(recycles + 1);
        expect(await body()).toBe("C");
      },
      { maxReloads: 1, minRecycleIntervalMs: 1 },
    );
  }, 30_000);

  test("a fix saved while a recycled worker fails on the broken bundle is what the next worker boots", async () => {
    await withBundles(
      async (rsc, { a, c, brokenSlow }, body) => {
        expect(await rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: a })).toMatchObject({ buildId: 2 });
        const broken = rsc.reload({ clientManifest: {}, buildId: 3, pagesBundlePath: brokenSlow });
        await Bun.sleep(100);
        const fixed = rsc.reload({ clientManifest: {}, buildId: 4, pagesBundlePath: c });
        expect(await broken).toEqual({ pagesBundlePath: c, buildId: 4 });
        expect(await fixed).toEqual({ pagesBundlePath: c, buildId: 4 });
        expect(await body()).toBe("C");
      },
      { maxReloads: 1 },
    );
  }, 30_000);

  test("a route merge riding on a pages reload that fails leaves the pages reload its failure to report", async () => {
    await withBundles(async (rsc, { a, brokenSlow }) => {
      const pages = rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: brokenSlow }).catch((e) => e);
      await Bun.sleep(50);
      const merge = rsc.reload({ clientManifest: {}, buildId: 2 }).catch((e) => e);
      const failure = {
        adopted: { pagesBundlePath: a, buildId: 1 },
        failed: { pagesBundlePath: brokenSlow, buildId: 2 },
      };
      expect(await pages).toMatchObject(failure);
      expect(await merge).toMatchObject(failure);
    });
  }, 20_000);

  test("a reload the worker took, answered after the next one was sent, is what that next one's failure goes back to", async () => {
    await withBundles(async (rsc, { c, broken }, body) => {
      const taken = rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: c }).catch((e) => e);
      //? The host is busy while the worker takes C and answers, so that answer is read after the next reload is sent.
      Bun.sleepSync(600);
      const failed = await rsc.reload({ clientManifest: {}, buildId: 3, pagesBundlePath: broken }).catch((e) => e);
      expect(failed).toMatchObject({ adopted: { pagesBundlePath: c, buildId: 2 } });
      expect(await taken).toMatchObject({ adopted: { pagesBundlePath: c, buildId: 2 } });
      expect(await body()).toBe("C");
      process.kill(Number(rsc.getMetrics().rscWorkerPid), "SIGKILL");
      await until(() => rsc.getMetrics().rscWorkerStatus !== "ready");
      await until(() => rsc.getMetrics().rscWorkerStatus === "ready");
      expect(await body()).toBe("C");
    });
  }, 20_000);

  test("a replacement worker that fails while a fix is on its way hands its queued renders back to the worker it replaces", async () => {
    await withBundles(
      async (rsc, { a, c, brokenSlow }, body) => {
        expect(await rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: a })).toMatchObject({ buildId: 2 });
        const broken = rsc.reload({ clientManifest: {}, buildId: 3, pagesBundlePath: brokenSlow }).catch((e) => e);
        await Bun.sleep(80);
        const queued = body();
        await Bun.sleep(40);
        const fixed = rsc.reload({ clientManifest: {}, buildId: 4, pagesBundlePath: c });
        expect(await queued).toBe("A");
        expect(await fixed).toEqual({ pagesBundlePath: c, buildId: 4 });
        expect(await broken).toEqual({ pagesBundlePath: c, buildId: 4 });
        expect(await body()).toBe("C");
        expect(rsc.getMetrics().rscWorkerRestartCount).toBe(0);
      },
      { maxReloads: 1 },
    );
  }, 30_000);

  test("a worker that dies while its replacement boots leaves nothing to fall back to, so a failed boot restarts", async () => {
    await withBundles(
      async (rsc, { a, c, brokenSlow }, body) => {
        expect(await rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: a })).toMatchObject({ buildId: 2 });
        const oldPid = Number(rsc.getMetrics().rscWorkerPid);
        const broken = rsc.reload({ clientManifest: {}, buildId: 3, pagesBundlePath: brokenSlow }).catch((e) => e);
        await Bun.sleep(100);
        process.kill(oldPid, "SIGKILL");
        expect(await broken).toMatchObject({ adopted: { pagesBundlePath: a, buildId: 2 } });
        await until(() => rsc.getMetrics().rscWorkerStatus === "ready" && rsc.getMetrics().rscWorkerPid !== oldPid);
        expect(await body()).toBe("A");
        expect(await rsc.reload({ clientManifest: {}, buildId: 4, pagesBundlePath: c })).toMatchObject({ buildId: 4 });
        expect(await body()).toBe("C");
      },
      { maxReloads: 1 },
    );
  }, 30_000);

  test("a bundle that exits while it imports rejects its reload onto the bundle that ran, instead of crash-looping", async () => {
    await withBundles(async (rsc, { a, exiting }, body) => {
      const failed = await rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: exiting }).catch((e) => e);
      expect(failed).toMatchObject({ adopted: { pagesBundlePath: a, buildId: 1 }, failed: { buildId: 2 } });
      await until(() => rsc.getMetrics().rscWorkerStatus === "ready");
      expect(await body()).toBe("A");
    });
  }, 20_000);

  test("a render queued while a respawn fails to boot is served by the next respawn, never having reached either", async () => {
    await withBundles(async (rsc, { a, brokenSlow }, body) => {
      process.kill(Number(rsc.getMetrics().rscWorkerPid), "SIGKILL");
      await until(() => rsc.getMetrics().rscWorkerStatus !== "ready");
      const failed = rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: brokenSlow }).catch((e) => e);
      const queued = body();
      expect(await failed).toMatchObject({ adopted: { pagesBundlePath: a, buildId: 1 } });
      expect(await queued).toBe("A");
    });
  }, 20_000);

  test("a first boot whose bundle exits while it imports fails ready instead of restarting into it forever", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-first-exit-"));
    const exiting = path.join(dir, "exiting.ts");
    fs.writeFileSync(exiting, bundleSource("never", "process.exit(3);"));
    const saved = process.env.AKAN_RSC_WORKER_PATH;
    process.env.AKAN_RSC_WORKER_PATH = path.join(import.meta.dir, "rscWorker.tsx");
    const rsc = new RscWorker({ pagesBundlePath: exiting, pagesBundleBuildId: 1 } as unknown as BaseBuildArtifact);
    try {
      const failed = await rsc.ready.catch((e) => e);
      expect(String(failed)).toContain("while loading the pages bundle");
      expect(rsc.getMetrics()).toMatchObject({ rscWorkerStatus: "stopped", rscWorkerRestartCount: 0 });
    } finally {
      rsc.kill();
      if (saved === undefined) delete process.env.AKAN_RSC_WORKER_PATH;
      else process.env.AKAN_RSC_WORKER_PATH = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  test("a render queued through a crash loop fails instead of waiting forever", async () => {
    await withBundles(async (rsc, { a }, body) => {
      const dir = path.dirname(a);
      const marker = path.join(dir, "CRASH");
      const crashy = path.join(dir, "crashy-worker.ts");
      fs.writeFileSync(
        crashy,
        `import fs from "node:fs";\nif (fs.existsSync(${JSON.stringify(marker)})) process.exit(1);\nconst { RscRenderer } = await import(${JSON.stringify(path.join(import.meta.dir, "rscWorker.tsx"))});\nnew RscRenderer().start();\n`,
      );
      process.env.AKAN_RSC_WORKER_PATH = crashy;
      fs.writeFileSync(marker, "1");
      process.kill(Number(rsc.getMetrics().rscWorkerPid), "SIGKILL");
      await until(() => rsc.getMetrics().rscWorkerStatus !== "ready");
      const queued = body().then(
        () => "served",
        (e: Error) => `failed: ${e.message}`,
      );
      expect(await Promise.race([queued, Bun.sleep(8_000).then(() => "still waiting")])).toContain("failed");
    });
  }, 20_000);

  test("a reload sent while another is still importing goes in place, so no replacement leaves that one unheard", async () => {
    await withBundles(
      async (rsc, { a, b, broken }, body) => {
        expect(await rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: a })).toMatchObject({ buildId: 2 });
        const importing = rsc.reload({ clientManifest: {}, buildId: 3, pagesBundlePath: b }).catch((e) => e);
        await Bun.sleep(50);
        const failed = await rsc.reload({ clientManifest: {}, buildId: 4, pagesBundlePath: broken }).catch((e) => e);
        expect(await importing).toMatchObject({ adopted: failed.adopted });
        expect(rsc.getMetrics().rscWorkerRecycleCount).toBe(0);
        const served = await body();
        process.kill(Number(rsc.getMetrics().rscWorkerPid), "SIGKILL");
        await until(() => rsc.getMetrics().rscWorkerStatus !== "ready");
        await until(() => rsc.getMetrics().rscWorkerStatus === "ready");
        expect(await body()).toBe(served);
      },
      { maxReloads: 2, minRecycleIntervalMs: 1 },
    );
  }, 30_000);

  test("a reload the worker took, answered late, is what a respawn goes back to when the next bundle exits", async () => {
    await withBundles(async (rsc, { c, exiting }, body) => {
      const taken = rsc.reload({ clientManifest: {}, buildId: 2, pagesBundlePath: c }).catch((e) => e);
      Bun.sleepSync(600);
      const failed = await rsc.reload({ clientManifest: {}, buildId: 3, pagesBundlePath: exiting }).catch((e) => e);
      expect(failed).toMatchObject({ adopted: { pagesBundlePath: c, buildId: 2 } });
      expect(await taken).toMatchObject({ adopted: { pagesBundlePath: c, buildId: 2 } });
      await until(() => rsc.getMetrics().rscWorkerStatus === "ready");
      expect(await body()).toBe("C");
    });
  }, 20_000);

  test("a reload after kill() rejects at once", async () => {
    await withBundles(async (rsc) => {
      rsc.kill();
      expect(String(await rsc.reload({ clientManifest: {}, buildId: 2 }).catch((e) => e))).toContain("stopped");
    });
  }, 20_000);

  test("a recycle waits for a page prompt call in flight, whose answer the worker being replaced would carry", async () => {
    await withBundles(async (rsc) => {
      const call = rsc.listPagePrompts();
      expect(rsc.restartWhenIdle("test")).toBe(false);
      expect(Array.isArray(await call)).toBe(true);
    });
  }, 20_000);
});

describe("RscWorker respawn lifecycle", () => {
  const workerSource = `import fs from "node:fs";
const spawnsFile = process.env.AKAN_TEST_RSC_SPAWNS ?? "";
const spawn = (fs.existsSync(spawnsFile) ? Number(fs.readFileSync(spawnsFile, "utf8")) : 0) + 1;
fs.writeFileSync(spawnsFile, String(spawn));
process.on("disconnect", () => process.exit(0));
process.on("message", (message) => {
  if (message.type === "init") {
    if (spawn === 2) {
      process.send?.({ type: "error", requestId: "__init__", message: "pages bundle failed to import" });
      fs.writeFileSync(spawnsFile + ".init-failed", "1");
      return;
    }
    process.send?.({ type: "ready" });
    if (spawn === 1) setTimeout(() => process.exit(1), 20);
    return;
  }
  if (message.type === "render") process.send?.({ type: "not-found", requestId: message.requestId });
});
process.send?.({ type: "hello" });
`;

  test("replaces a respawned worker whose init fails instead of queueing renders behind it forever", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-respawn-"));
    const spawnsFile = path.join(dir, "spawns");
    fs.writeFileSync(path.join(dir, "worker.ts"), workerSource);
    const saved = { workerPath: process.env.AKAN_RSC_WORKER_PATH, spawns: process.env.AKAN_TEST_RSC_SPAWNS };
    process.env.AKAN_RSC_WORKER_PATH = path.join(dir, "worker.ts");
    process.env.AKAN_TEST_RSC_SPAWNS = spawnsFile;
    const rsc = new RscWorker({
      pagesBundlePath: path.join(dir, "pages.js"),
      pagesBundleBuildId: 1,
    } as unknown as BaseBuildArtifact);
    const eventually = async (done: () => boolean) => {
      for (let waited = 0; waited < 8_000 && !done(); waited += 20) await Bun.sleep(20);
      return done();
    };
    try {
      await rsc.ready;
      expect(await eventually(() => fs.existsSync(`${spawnsFile}.init-failed`))).toBe(true);
      expect(await eventually(() => rsc.getMetrics().rscWorkerStatus === "ready")).toBe(true);
      expect((await rsc.renderWithMeta(new Request("http://localhost/en"))).type).toBe("not-found");
    } finally {
      rsc.kill();
      if (saved.workerPath === undefined) delete process.env.AKAN_RSC_WORKER_PATH;
      else process.env.AKAN_RSC_WORKER_PATH = saved.workerPath;
      if (saved.spawns === undefined) delete process.env.AKAN_TEST_RSC_SPAWNS;
      else process.env.AKAN_TEST_RSC_SPAWNS = saved.spawns;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("RscWorker late theme", () => {
  test("names a theme the root layout sets mid-stream before the chunk that carries it", async () => {
    const saved = process.env.AKAN_RSC_WORKER_PATH;
    process.env.AKAN_RSC_WORKER_PATH = path.join(import.meta.dir, "rscWorker.tsx");
    const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
    const rsc = new RscWorker({
      pagesBundlePath: path.join(import.meta.dir, "rscWorkerTheme.fixture.tsx"),
      pagesBundleBuildId: 1,
      rscRuntimeClientManifest: {
        [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
      },
    } as unknown as BaseBuildArtifact);
    try {
      await rsc.ready;
      const result = await rsc.renderWithMeta(new Request("http://localhost/en/themed"));
      if (result.type !== "stream") throw new Error(`expected a stream, got ${result.type}`);
      expect(result.theme).toBeUndefined();
      const reader = result.stream.getReader();
      let body = "";
      let themeWithBody: string | undefined;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
        if (themeWithBody === undefined && body.includes("themed body")) themeWithBody = result.theme ?? "(none)";
      }
      expect(themeWithBody).toBe("light");
    } finally {
      rsc.kill();
      if (saved === undefined) delete process.env.AKAN_RSC_WORKER_PATH;
      else process.env.AKAN_RSC_WORKER_PATH = saved;
    }
  }, 20_000);
});
