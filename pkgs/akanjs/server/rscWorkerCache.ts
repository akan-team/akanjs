import type { PageConfig } from "akanjs/client";
import {
  hasRouteCacheInvalidationScope,
  type LruTtlCache,
  type RouteCacheEntry,
  type RouteCacheInvalidation,
  type RouteCacheRenderState,
  shouldInvalidateRouteCacheEntry,
} from "./cachePolicy";
import {
  type AkanHeadSnapshotV1,
  type AkanRouterStateV1,
  type AkanRscPatchDecision,
  type AkanRscPatchMetadata,
  encodeAkanHeadSnapshot,
  isAkanHeadSnapshotV1,
} from "./routeState";
import type { RscTraceMetadata } from "./ssrTypes";

export interface CachedRscResult {
  chunks: Uint8Array[];
  bytes: number;
  chunksCount: number;
  pathname: string;
  routeId?: string;
  tags?: string[];
  theme?: string;
  /** Whether the matched route opted into blocking SSR (`pageConfig.ssr: "block"`). */
  ssrBlocking?: boolean;
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

export function createRscPatchCacheEntry({ baseEntry, targetRouterState, patch }: RscPatchCacheKeyInput) {
  const key = [
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
  return { key, ttl: baseEntry.ttl };
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

export type CachedRscReplayMessage =
  | { type: "meta"; requestId: string; theme?: string; status?: number; trace?: RscTraceMetadata }
  | { type: "cache-state"; requestId: string; state: RouteCacheRenderState }
  | { type: "chunk"; requestId: string; data: Uint8Array }
  | { type: "end"; requestId: string };

function yieldToHostEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function replayCachedRscResult(input: {
  requestId: string;
  chunks: readonly Uint8Array[];
  theme?: string;
  trace?: RscTraceMetadata;
  cacheState?: RouteCacheRenderState;
  send: (message: CachedRscReplayMessage) => void;
  isCancelled: () => boolean;
  yieldToHost?: () => Promise<void>;
}): Promise<boolean> {
  const yieldToHost = input.yieldToHost ?? yieldToHostEventLoop;
  if (input.isCancelled()) return false;
  const metaMessage: CachedRscReplayMessage = { type: "meta", requestId: input.requestId, theme: input.theme };
  if (input.trace) metaMessage.trace = input.trace;
  input.send(metaMessage);
  input.send({ type: "cache-state", requestId: input.requestId, state: input.cacheState ?? { cacheable: true } });
  for (let index = 0; index < input.chunks.length; index += 1) {
    if (input.isCancelled()) return false;
    input.send({ type: "chunk", requestId: input.requestId, data: input.chunks[index] });
    await yieldToHost();
  }
  if (input.isCancelled()) return false;
  input.send({ type: "end", requestId: input.requestId });
  return true;
}

export function resolveAkanRscHeadSafePatchDecision({
  partialCommitEnabled,
  patchDecision,
  pageConfig,
  routeHeadMounted = true,
  frameChange,
  headSnapshot,
}: {
  partialCommitEnabled: boolean;
  patchDecision: AkanRscPatchDecision;
  pageConfig?: PageConfig;
  /** Whether the page the patch leaves from shows its head through `AkanRouteHead`, the only head a patch can swap. */
  routeHeadMounted?: boolean;
  frameChange?: "params-changed" | "page-state-changed" | "frame-unknown";
  headSnapshot?: AkanHeadSnapshotV1;
}): AkanRscPatchDecision {
  if (!partialCommitEnabled || patchDecision.status !== "patch" || !patchDecision.patch) return patchDecision;
  if (pageConfig?.rscPatchHeadSafe !== true) return fullDecision("head-unsafe", patchDecision);
  if (!routeHeadMounted) return fullDecision("head-unmounted", patchDecision);
  if (frameChange) return fullDecision(frameChange, patchDecision);
  if (!headSnapshot) return fullDecision("head-missing", patchDecision);
  if (!isAkanHeadSnapshotV1(headSnapshot)) return fullDecision("head-invalid", patchDecision);
  if (!encodeAkanHeadSnapshot(headSnapshot)) return fullDecision("head-too-large", patchDecision);
  return { ...patchDecision, patch: { ...patchDecision.patch, headSafe: true, headSnapshot } };
}

const fullDecision = (reason: string, { commonPrefixLength }: AkanRscPatchDecision): AkanRscPatchDecision => ({
  status: "full",
  reason,
  commonPrefixLength,
});
