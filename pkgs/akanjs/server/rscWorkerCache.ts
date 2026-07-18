import {
  hasRouteCacheInvalidationScope,
  type LruTtlCache,
  type RouteCacheEntry,
  type RouteCacheInvalidation,
  type RouteCacheRenderState,
  shouldInvalidateRouteCacheEntry,
} from "./cachePolicy";
import type { AkanRouterStateV1, AkanRscPatchDecision, AkanRscPatchMetadata } from "./routeState";

export interface CachedRscResult {
  chunks: Uint8Array[];
  bytes: number;
  chunksCount: number;
  pathname: string;
  routeId?: string;
  tags?: string[];
  theme?: string;
  cacheState: RouteCacheRenderState;
  patch?: CachedRscPatchMetadata;
}

export interface CachedRscPatchMetadata {
  targetRouterState: AkanRouterStateV1;
  patch: AkanRscPatchMetadata;
}

export interface RscPatchCacheKeyInput {
  baseEntry: RouteCacheEntry;
  targetRouterState: AkanRouterStateV1;
  patch: AkanRscPatchMetadata;
}

export function createRscPatchCacheKey({ baseEntry, targetRouterState, patch }: RscPatchCacheKeyInput): string {
  return [
    "patch-v1",
    baseEntry.key,
    targetRouterState.buildId ?? "",
    targetRouterState.href,
    targetRouterState.routeId,
    JSON.stringify(targetRouterState.segments),
    patch.patchStartIndex,
    patch.patchStartSegmentKey,
    JSON.stringify(patch.segmentPath),
    patch.headSafe === true ? "head-safe" : "head-unsafe",
  ].join("\n");
}

export function createRscPatchCacheEntry(input: RscPatchCacheKeyInput): RouteCacheEntry {
  return { key: createRscPatchCacheKey(input), ttl: input.baseEntry.ttl };
}

export function isRscPatchResultCacheEligible(input: {
  partialCommitEnabled: boolean;
  patch?: AkanRscPatchMetadata;
}): boolean {
  return (
    input.partialCommitEnabled &&
    input.patch?.headSafe === true &&
    input.patch.headSnapshot !== undefined &&
    !input.patch.headSnapshotFailure
  );
}

export function createCachedRscPatchMetadata(input: {
  targetRouterState: AkanRouterStateV1;
  patch: AkanRscPatchMetadata;
}): CachedRscPatchMetadata {
  return {
    targetRouterState: input.targetRouterState,
    patch: input.patch,
  };
}

export function isCachedRscPatchMetadataCompatible(input: {
  cached?: CachedRscPatchMetadata;
  targetRouterState: AkanRouterStateV1 | null;
  safePatchDecision: AkanRscPatchDecision;
}): boolean {
  if (!input.cached || !input.targetRouterState || input.safePatchDecision.status !== "patch") return false;
  const currentPatch = input.safePatchDecision.patch;
  if (!currentPatch) return false;
  const cachedPatch = input.cached.patch;
  return (
    input.cached.targetRouterState.buildId === input.targetRouterState.buildId &&
    input.cached.targetRouterState.href === input.targetRouterState.href &&
    input.cached.targetRouterState.routeId === input.targetRouterState.routeId &&
    JSON.stringify(input.cached.targetRouterState.segments) === JSON.stringify(input.targetRouterState.segments) &&
    cachedPatch.patchStartIndex === currentPatch.patchStartIndex &&
    cachedPatch.patchStartSegmentKey === currentPatch.patchStartSegmentKey &&
    JSON.stringify(cachedPatch.segmentPath) === JSON.stringify(currentPatch.segmentPath) &&
    cachedPatch.headSafe === true &&
    cachedPatch.headSnapshot !== undefined &&
    !cachedPatch.headSnapshotFailure
  );
}

export function createRscWorkerCachedPatchReplayDecision(input: {
  cached: CachedRscPatchMetadata;
  safePatchDecision: AkanRscPatchDecision;
}): AkanRscPatchDecision {
  return {
    ...input.safePatchDecision,
    patch: input.cached.patch,
  };
}

export function resolveRscWorkerPatchCacheEntry(input: {
  cacheEntry: RouteCacheEntry | null;
  targetRouterState: AkanRouterStateV1 | null;
  safePatchDecision: AkanRscPatchDecision;
  partialCommitEnabled: boolean;
}): RouteCacheEntry | null {
  const patch = input.safePatchDecision.status === "patch" ? input.safePatchDecision.patch : undefined;
  if (
    !input.cacheEntry ||
    !input.targetRouterState ||
    input.safePatchDecision.status !== "patch" ||
    !patch ||
    !isRscPatchResultCacheEligible({ partialCommitEnabled: input.partialCommitEnabled, patch })
  ) {
    return null;
  }
  return createRscPatchCacheEntry({
    baseEntry: input.cacheEntry,
    targetRouterState: input.targetRouterState,
    patch,
  });
}

export function shouldCollectRscWorkerRenderChunks(input: {
  cacheEntry: RouteCacheEntry | null;
  effectivePatchDecision: AkanRscPatchDecision;
  patchCacheEntry: RouteCacheEntry | null;
}): boolean {
  return (
    input.cacheEntry !== null && (input.effectivePatchDecision.status !== "patch" || input.patchCacheEntry !== null)
  );
}

export function shouldStoreRscWorkerPatchResult(input: {
  cacheEntry: RouteCacheEntry | null;
  patchCacheEntry: RouteCacheEntry | null;
  effectivePatchDecision: AkanRscPatchDecision;
  storeTtl: number | null;
}): boolean {
  return (
    input.cacheEntry !== null &&
    input.patchCacheEntry !== null &&
    input.storeTtl !== null &&
    input.effectivePatchDecision.status === "patch"
  );
}

export function shouldUseRscWorkerFullResultCache(input: {
  cacheEntry: RouteCacheEntry | null;
  patchCacheEntry: RouteCacheEntry | null;
}): boolean {
  return input.cacheEntry !== null && input.patchCacheEntry === null;
}

export function invalidateCachedRscResults(
  cache: LruTtlCache<CachedRscResult>,
  invalidation: RouteCacheInvalidation,
): void {
  if (!hasRouteCacheInvalidationScope(invalidation)) {
    cache.clear();
    return;
  }
  cache.invalidate((_key, result) =>
    shouldInvalidateRouteCacheEntry(
      {
        pathname: result.pathname,
        routeId: result.routeId,
        tags: result.tags,
      },
      invalidation,
    ),
  );
}
