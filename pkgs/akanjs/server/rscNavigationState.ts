import {
  type AkanHeadSnapshotV1,
  type AkanRouterStateV1,
  type AkanRouteSegmentState,
  type AkanRscPatchMetadata,
  createAkanSegmentOutletKey,
} from "./routeState";

export interface RscNavigationCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): boolean;
  keys(): IterableIterator<string>;
  readonly size: number;
}

export interface RscNavigationCacheNode<T> {
  href: string;
  thenable: T;
  routerState: AkanRouterStateV1 | null;
}

export interface RscPatchNavigationCacheNode<T> {
  href: string;
  thenable: T;
  routerState: AkanRouterStateV1;
  patch: AkanRscPatchMetadata;
  outletKey: string;
  headSnapshot: AkanHeadSnapshotV1;
}

export interface AkanSegmentCacheNode<T> {
  segment: AkanRouteSegmentState;
  href: string;
  routerState: AkanRouterStateV1;
  thenable?: T;
  children: AkanSegmentCacheNode<T>[];
}

export type AkanSegmentPatchFailureReason =
  | "missing-current-tree"
  | "segment-path-mismatch"
  | "stale"
  | "unsupported-suffix"
  | "decode-error"
  | "guard-disabled"
  | "outlet-missing"
  | "redirect-in-patch"
  | "error-in-patch"
  | "head-unsafe"
  | "head-missing"
  | "head-invalid"
  | "head-too-large";

export type AkanSegmentPatchResult<T> =
  | {
      status: "patched";
      tree: AkanSegmentCacheNode<T>;
      patchedNode: AkanSegmentCacheNode<T>;
      outletKey: string;
      headSnapshot?: AkanHeadSnapshotV1;
    }
  | {
      status: "rejected";
      reason: AkanSegmentPatchFailureReason;
    };

export type RscPatchNavigationCacheResult<T> =
  | {
      status: "patched";
      tree: AkanSegmentCacheNode<T>;
      patchedNode: AkanSegmentCacheNode<T>;
      outletKey: string;
      headSnapshot: AkanHeadSnapshotV1;
    }
  | {
      status: "rejected";
      reason: AkanSegmentPatchFailureReason;
    };

export function createRscNavigationCacheNode<T>({
  href,
  thenable,
  routerState,
}: RscNavigationCacheNode<T>): RscNavigationCacheNode<T> {
  return { href, thenable, routerState };
}

export function createRscPatchNavigationCacheNode<T>({
  href,
  patch,
  patchedNode,
  outletKey,
  headSnapshot,
}: {
  href: string;
  patch: AkanRscPatchMetadata;
  patchedNode: AkanSegmentCacheNode<T>;
  outletKey: string;
  headSnapshot: AkanHeadSnapshotV1;
}): RscPatchNavigationCacheNode<T> | null {
  if (!patchedNode.thenable) return null;
  return {
    href,
    thenable: patchedNode.thenable,
    routerState: patchedNode.routerState,
    patch,
    outletKey,
    headSnapshot,
  };
}

export function createAkanSegmentCacheTree<T>(node: RscNavigationCacheNode<T>): AkanSegmentCacheNode<T> | null {
  const routerState = node.routerState;
  if (!routerState || routerState.segments.length === 0) return null;

  const root = createAkanSegmentCacheNode<T>({
    segment: routerState.segments[0],
    href: node.href,
    routerState,
  });
  let current = root;
  for (let index = 1; index < routerState.segments.length; index++) {
    const child = createAkanSegmentCacheNode<T>({
      segment: routerState.segments[index],
      href: node.href,
      routerState,
    });
    current.children.push(child);
    current = child;
  }
  current.thenable = node.thenable;
  return root;
}

export function applyAkanSegmentCachePatch<T>({
  currentTree,
  targetRouterState,
  patch,
  href,
  thenable,
  navId,
  getCurrentNavId,
  decodeFailed,
}: {
  currentTree: AkanSegmentCacheNode<T> | null;
  targetRouterState: AkanRouterStateV1 | null;
  patch: AkanRscPatchMetadata;
  href: string;
  thenable?: T;
  navId?: number;
  getCurrentNavId?: () => number;
  decodeFailed?: boolean;
}): AkanSegmentPatchResult<T> {
  if (decodeFailed) return { status: "rejected", reason: "decode-error" };
  if (navId !== undefined && getCurrentNavId && navId !== getCurrentNavId()) {
    return { status: "rejected", reason: "stale" };
  }
  if (!currentTree || !targetRouterState) {
    return { status: "rejected", reason: "missing-current-tree" };
  }
  if (!isSupportedSinglePagePatch(targetRouterState, patch)) {
    return { status: "rejected", reason: "unsupported-suffix" };
  }

  const targetPatchPath = targetRouterState.segments.slice(0, patch.patchStartIndex + 1).map((segment) => segment.key);
  const expectedPatchPath = patch.segmentPath.slice(0, patch.patchStartIndex + 1);
  if (
    targetPatchPath.length !== expectedPatchPath.length ||
    targetPatchPath.some((segmentKey, index) => segmentKey !== expectedPatchPath[index])
  ) {
    return { status: "rejected", reason: "segment-path-mismatch" };
  }

  const currentPrefix = flattenAkanSegmentCacheTree(currentTree, patch.patchStartIndex);
  const expectedPrefix = patch.segmentPath.slice(0, patch.patchStartIndex);
  if (
    currentPrefix.length !== expectedPrefix.length ||
    currentPrefix.some((node, index) => node.segment.key !== expectedPrefix[index])
  ) {
    return { status: "rejected", reason: "segment-path-mismatch" };
  }

  const patchedTree = cloneAkanSegmentCacheTree(currentTree);
  const parent = getAkanSegmentCacheNodeAt(patchedTree, patch.patchStartIndex - 1);
  if (!parent) return { status: "rejected", reason: "segment-path-mismatch" };

  const patchedSegment = targetRouterState.segments[patch.patchStartIndex];
  const outletKey = createAkanSegmentOutletKey(patch.segmentPath, patch.patchStartIndex);
  if (!outletKey) return { status: "rejected", reason: "unsupported-suffix" };
  const patchedNode = createAkanSegmentCacheNode({
    segment: patchedSegment,
    href,
    routerState: targetRouterState,
    thenable,
  });
  parent.children = [patchedNode];
  return { status: "patched", tree: patchedTree, patchedNode, outletKey };
}

export function rememberRscCacheEntry<T>(
  cache: RscNavigationCache<T>,
  href: string,
  thenable: T,
  maxEntries: number,
): void {
  cache.delete(href);
  cache.set(href, thenable);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function deleteRscCacheEntryIfCurrent<T>(cache: RscNavigationCache<T>, href: string, thenable: T): boolean {
  if (cache.get(href) !== thenable) return false;
  return cache.delete(href);
}

export function rememberRscCacheNode<T>(
  cache: RscNavigationCache<RscNavigationCacheNode<T>>,
  node: RscNavigationCacheNode<T>,
  maxEntries: number,
): void {
  rememberRscCacheEntry(cache, node.href, node, maxEntries);
}

export function rememberRscPatchCacheNode<T>(
  cache: RscNavigationCache<RscPatchNavigationCacheNode<T>>,
  node: RscPatchNavigationCacheNode<T>,
  maxEntries: number,
): void {
  rememberRscCacheEntry(cache, node.href, node, maxEntries);
}

export function resolveCachedRscPatchNavigation<T>({
  currentTree,
  node,
  partialCommitEnabled,
  navId,
  getCurrentNavId,
}: {
  currentTree: AkanSegmentCacheNode<T> | null;
  node: RscPatchNavigationCacheNode<T>;
  partialCommitEnabled: boolean;
  navId?: number;
  getCurrentNavId?: () => number;
}): RscPatchNavigationCacheResult<T> {
  if (!partialCommitEnabled) return { status: "rejected", reason: "guard-disabled" };
  const patchResult = applyAkanSegmentCachePatch({
    currentTree,
    targetRouterState: node.routerState,
    patch: node.patch,
    href: node.href,
    thenable: node.thenable,
    navId,
    getCurrentNavId,
  });
  if (patchResult.status === "rejected") return patchResult;
  if (patchResult.outletKey !== node.outletKey) return { status: "rejected", reason: "segment-path-mismatch" };
  return { ...patchResult, headSnapshot: node.headSnapshot };
}

function createAkanSegmentCacheNode<T>({
  segment,
  href,
  routerState,
  thenable,
}: {
  segment: AkanRouteSegmentState;
  href: string;
  routerState: AkanRouterStateV1;
  thenable?: T;
}): AkanSegmentCacheNode<T> {
  return {
    segment,
    href,
    routerState,
    thenable,
    children: [],
  };
}

function flattenAkanSegmentCacheTree<T>(
  tree: AkanSegmentCacheNode<T>,
  limit = Number.POSITIVE_INFINITY,
): AkanSegmentCacheNode<T>[] {
  const nodes: AkanSegmentCacheNode<T>[] = [];
  let current: AkanSegmentCacheNode<T> | undefined = tree;
  while (current && nodes.length < limit) {
    nodes.push(current);
    current = current.children[0];
  }
  return nodes;
}

function getAkanSegmentCacheNodeAt<T>(tree: AkanSegmentCacheNode<T>, index: number): AkanSegmentCacheNode<T> | null {
  if (index < 0) return null;
  return flattenAkanSegmentCacheTree(tree, index + 1)[index] ?? null;
}

function cloneAkanSegmentCacheTree<T>(tree: AkanSegmentCacheNode<T>): AkanSegmentCacheNode<T> {
  return {
    segment: tree.segment,
    href: tree.href,
    routerState: tree.routerState,
    thenable: tree.thenable,
    children: tree.children.map(cloneAkanSegmentCacheTree),
  };
}

function isSupportedSinglePagePatch(targetRouterState: AkanRouterStateV1, patch: AkanRscPatchMetadata): boolean {
  const targetSuffix = targetRouterState.segments.slice(patch.patchStartIndex);
  if (targetSuffix.length !== 1 || targetSuffix[0]?.kind !== "page") return false;
  if (patch.segmentPath.length !== targetRouterState.segments.length) return false;
  if (patch.segmentPath[patch.patchStartIndex] !== patch.patchStartSegmentKey) return false;
  const patchStartSegment = targetRouterState.segments[patch.patchStartIndex];
  return patchStartSegment?.key === patch.patchStartSegmentKey;
}

interface CommitRscNavigationInput<T> {
  cache: RscNavigationCache<T>;
  href: string;
  thenable: T;
  maxEntries: number;
  startTransition: (callback: () => void) => void;
  commitThenable: (thenable: T) => void;
  updateHistory?: () => void;
  scrollToTop?: boolean;
  bumpScrollToTop?: () => void;
}

export function commitRscNavigation<T>({
  cache,
  href,
  thenable,
  maxEntries,
  startTransition,
  commitThenable,
  updateHistory,
  scrollToTop,
  bumpScrollToTop,
}: CommitRscNavigationInput<T>): void {
  rememberRscCacheEntry(cache, href, thenable, maxEntries);
  startTransition(() => {
    commitThenable(thenable);
    updateHistory?.();
    if (scrollToTop) bumpScrollToTop?.();
  });
}

export function commitLatestRscNavigation<T>({
  navId,
  getCurrentNavId,
  ...input
}: CommitRscNavigationInput<T> & {
  navId: number;
  getCurrentNavId: () => number;
}): boolean {
  if (navId !== getCurrentNavId()) return false;
  commitRscNavigation(input);
  return true;
}

export function observeRscNavigation<T extends PromiseLike<unknown>>({
  cache,
  href,
  thenable,
  navId,
  getCurrentNavId,
  isExpectedNavigationError,
  onLatestError,
}: {
  cache: RscNavigationCache<T>;
  href: string;
  thenable: T;
  navId: number;
  getCurrentNavId: () => number;
  isExpectedNavigationError?: (error: unknown) => boolean;
  onLatestError: (error: unknown) => void;
}): void {
  void Promise.resolve(thenable).catch((error) => {
    deleteRscCacheEntryIfCurrent(cache, href, thenable);
    if (isExpectedNavigationError?.(error)) return;
    if (navId === getCurrentNavId()) onLatestError(error);
  });
}

export function observeRscNavigationNode<T extends PromiseLike<unknown>>({
  cache,
  node,
  navId,
  getCurrentNavId,
  isExpectedNavigationError,
  onLatestError,
}: {
  cache: RscNavigationCache<RscNavigationCacheNode<T>>;
  node: RscNavigationCacheNode<T>;
  navId: number;
  getCurrentNavId: () => number;
  isExpectedNavigationError?: (error: unknown) => boolean;
  onLatestError: (error: unknown) => void;
}): void {
  void Promise.resolve(node.thenable).catch((error) => {
    deleteRscCacheEntryIfCurrent(cache, node.href, node);
    if (isExpectedNavigationError?.(error)) return;
    if (navId === getCurrentNavId()) onLatestError(error);
  });
}
