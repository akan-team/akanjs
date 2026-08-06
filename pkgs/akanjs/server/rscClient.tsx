import { createElement, type ReactNode, startTransition, type Usable, use, useLayoutEffect, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { createFromReadableStream } from "react-server-dom-webpack/client.browser";
import {
  type AkanHeadSnapshotV1,
  type AkanRouterStateV1,
  type AkanRscPatchMetadata,
  decodeAkanRouterState,
  readAkanRouterStateResponseHeader,
} from "./routeState";
import { fetchRscNavigationResponse } from "./rscClientFetch";
import { validateRscPatchForGuardedCommit } from "./rscClientPatch";
import {
  commitPreparedAkanHeadSnapshotPatch,
  getAkanHeadSnapshotPatchFailureReason,
  prepareAkanHeadSnapshotPatch,
  rollbackPreparedAkanHeadSnapshotPatch,
} from "./rscHeadPatch";
import { getRscPayloadStream, guardRscRedirectRows, type RscRedirectRow } from "./rscHttp";
import {
  type AkanSegmentCacheNode,
  commitLatestRscNavigation,
  createAkanSegmentCacheTree,
  createRscNavigationCacheNode,
  createRscPatchNavigationCacheNode,
  deleteRscCacheEntryIfCurrent,
  observeRscNavigationNode,
  type RscNavigationCacheNode,
  type RscPatchNavigationCacheNode,
  rememberRscCacheNode,
  rememberRscPatchCacheNode,
  resolveCachedRscPatchNavigation,
} from "./rscNavigationState";
import { isAkanRscPartialCommitEnabled } from "./rscPartialCommit";
import { commitAkanSegmentOutletPatch, resetAkanSegmentOutletPatches } from "./rscSegmentOutlet";

type InlineRscChunk = [1, string] | [3, string];

declare global {
  var __RSC_CHUNKS__: InlineRscChunk[] | undefined;
  var __RSC_CLOSED__: boolean | undefined;
  var __RSC_PUSH__: ((type: InlineRscChunk[0], data: string) => void) | undefined;
  var __RSC_CLOSE__: (() => void) | undefined;
  var __AKAN_RSC_INITIAL_STATE__: string | undefined;
  var __AKAN_RSC_NAVIGATE__:
    | ((href: string, options?: { replace?: boolean; scrollToTop?: boolean }) => Promise<void>)
    | undefined;
  var __AKAN_RSC_REFRESH__: ((options?: { buildId?: number }) => Promise<void>) | undefined;
  var __AKAN_RSC_CLEAR_CACHE__: (() => void) | undefined;
  var __AKAN_RSC_IS_FROM_CACHE__: (() => boolean) | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION__: ((href: string, kind: "push" | "replace" | "back" | "pop") => void) | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION_APPLYING__: boolean | undefined;
  var __AKAN_GET_SYNC_ROUTE_HREF__: ((href: string) => string) | undefined;
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeInlineRscChunk([type, data]: InlineRscChunk): Uint8Array {
  if (type === 1) return new TextEncoder().encode(data);
  return decodeBase64(data);
}

type RscThenable = Promise<ReactNode> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: ReactNode;
  reason?: unknown;
};
type RscCacheNode = RscNavigationCacheNode<RscThenable>;
type RscSegmentCacheNode = AkanSegmentCacheNode<RscThenable>;
type RscFetchResult =
  | { type: "rsc"; node: RscCacheNode }
  | {
      type: "patched";
      tree: RscSegmentCacheNode;
      patchedNode: RscSegmentCacheNode;
      patch: AkanRscPatchMetadata;
      outletKey: string;
      headSnapshot: AkanHeadSnapshotV1;
    }
  | { type: "redirected"; status?: number };
const MAX_RSC_CACHE_ENTRIES = 32;
let documentNavigationFallbackInFlight = false;

class RscRedirectNavigationStarted extends Error {
  constructor(readonly location: string) {
    super("[rscClient] RSC redirect navigation started");
    this.name = "RscRedirectNavigationStarted";
  }
}

function createInitialRscStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const queued = globalThis.__RSC_CHUNKS__ ?? [];
      for (const chunk of queued) controller.enqueue(decodeInlineRscChunk(chunk));
      globalThis.__RSC_CHUNKS__ = [];

      if (globalThis.__RSC_CLOSED__) {
        controller.close();
        return;
      }

      globalThis.__RSC_PUSH__ = (type, data) => controller.enqueue(decodeInlineRscChunk([type, data]));
      globalThis.__RSC_CLOSE__ = () => controller.close();
    },
  });
}

function normalizeHref(href: string): string {
  return new URL(href, window.location.origin).href;
}

/**
 * Mirror React's thenable protocol (status/value/reason) onto the Flight thenable.
 *
 * Without this, `use(thenable)` cannot tell an already-resolved native Promise apart
 * from a pending one: it suspends the root transition once and relies on React's
 * ping -> retry -> re-commit path. That path intermittently lost the re-commit when
 * sync store updates raced the suspended transition, leaving the previous page DOM
 * visible even though the navigation pipeline completed. With the status tracked,
 * `use()` returns the fulfilled payload synchronously and the committed transition
 * renders the new tree in a single pass.
 */
function trackRscThenable(thenable: RscThenable): RscThenable {
  if (thenable.status !== undefined) return thenable;
  thenable.status = "pending";
  thenable.then(
    (value) => {
      thenable.status = "fulfilled";
      thenable.value = value;
    },
    (reason) => {
      thenable.status = "rejected";
      thenable.reason = reason;
    },
  );
  return thenable;
}

function createRscThenable(stream: ReadableStream<Uint8Array>): RscThenable {
  return trackRscThenable(createFromReadableStream<ReactNode>(stream) as RscThenable);
}

function hardNavigateAfterRscFailure(target: string, replace = false, error?: unknown): void {
  if (documentNavigationFallbackInFlight) return;
  documentNavigationFallbackInFlight = true;
  console.warn(`[rscClient] RSC navigation failed, falling back to document navigation: ${String(error)}`);
  if (replace) window.location.replace(target);
  else window.location.assign(target);
}

function navigateAfterRscRedirect(target: string, replace = true): void {
  const error = new RscRedirectNavigationStarted(target);
  const navigate = globalThis.__AKAN_RSC_NAVIGATE__;
  if (!navigate) {
    hardNavigateAfterRscFailure(target, replace, error);
    return;
  }
  void navigate(target, { replace, scrollToTop: true }).catch((navError) => {
    hardNavigateAfterRscFailure(target, replace, navError);
  });
}

function commitRscPatchNavigation({
  target,
  patch,
  replace,
  scrollToTop,
  bumpScrollToTop,
}: {
  target: string;
  patch: Extract<RscFetchResult, { type: "patched" }>;
  replace?: boolean;
  scrollToTop?: boolean;
  bumpScrollToTop?: () => void;
}): boolean {
  const patchThenable = patch.patchedNode.thenable;
  if (!patchThenable) throw new Error("[rscClient] validated RSC patch is missing a thenable");
  const preparedHeadPatch = prepareAkanHeadSnapshotPatch(patch.headSnapshot);
  if (!preparedHeadPatch) return false;

  let outletCommitted = false;
  let headApplied = false;
  startTransition(() => {
    try {
      headApplied = commitPreparedAkanHeadSnapshotPatch(preparedHeadPatch);
      if (!headApplied) {
        return;
      }
      outletCommitted = commitAkanSegmentOutletPatch(patch.outletKey, patchThenable);
      if (!outletCommitted) {
        rollbackPreparedAkanHeadSnapshotPatch(preparedHeadPatch);
        return;
      }
      if (replace) window.history.replaceState(null, "", target);
      else window.history.pushState(null, "", target);
      if (scrollToTop) bumpScrollToTop?.();
    } catch {
      if (headApplied) rollbackPreparedAkanHeadSnapshotPatch(preparedHeadPatch);
      if (outletCommitted) resetAkanSegmentOutletPatches();
      headApplied = false;
      outletCommitted = false;
    }
  });
  return outletCommitted && headApplied;
}

async function fetchRsc(
  href: string,
  options: {
    buildId?: number;
    replaceOnRedirect?: boolean;
    shouldApplyNavigation?: () => boolean;
    sendRouterState?: boolean;
    navId?: number;
  } = {},
): Promise<RscFetchResult> {
  const shouldApplyNavigation = options.shouldApplyNavigation ?? (() => true);
  const responseResult = await fetchRscNavigationResponse(href, {
    buildId: options.buildId,
    currentRouterState,
    navigate: globalThis.__AKAN_RSC_NAVIGATE__,
    sendRouterState: options.sendRouterState,
    shouldApplyNavigation,
  });
  if (responseResult.type === "redirected") return responseResult;
  if (responseResult.type === "patch") {
    const patchResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: isAkanRscPartialCommitEnabled(),
      currentTree: currentSegmentTree,
      response: responseResult.response,
      patch: responseResult.patch,
      href,
      createThenable: createRscThenable,
      navId: options.navId,
      getCurrentNavId: () => navigationSeq,
      getHeadSnapshotPatchFailureReason: getAkanHeadSnapshotPatchFailureReason,
    });
    if (patchResult.status === "patched") {
      if (!patchResult.headSnapshot) throw new Error("[rscClient] validated RSC patch is missing a head snapshot");
      return {
        type: "patched",
        tree: patchResult.tree,
        patchedNode: patchResult.patchedNode,
        patch: responseResult.patch,
        outletKey: patchResult.outletKey,
        headSnapshot: patchResult.headSnapshot,
      };
    }
    return fetchRsc(href, {
      ...options,
      sendRouterState: false,
    });
  }
  const res = responseResult.response;
  const stream = getRscPayloadStream(res);
  if (!stream) throw new Error(`[rscClient] RSC fetch failed ${res.status} ${res.statusText}`);
  const nodeRef: { current?: RscCacheNode } = {};
  const handleRedirect = (redirect: RscRedirectRow) => {
    if (!shouldApplyNavigation()) return;
    const location = redirect.location ? normalizeHref(redirect.location) : href;
    if (nodeRef.current) deleteRscCacheEntryIfCurrent(rscCache, href, nodeRef.current);
    navigateAfterRscRedirect(
      location,
      redirect.method ? redirect.method !== "push" : (options.replaceOnRedirect ?? true),
    );
  };
  const guardedStream = guardRscRedirectRows(stream, {
    onRedirect: handleRedirect,
  });
  const thenable = createRscThenable(guardedStream);
  const node = createRscNavigationCacheNode({
    href,
    thenable,
    routerState: readAkanRouterStateResponseHeader(res.headers),
  });
  nodeRef.current = node;
  return {
    type: "rsc",
    node,
  };
}

const rscCache = new Map<string, RscCacheNode>();
const rscPatchCache = new Map<string, RscPatchNavigationCacheNode<RscThenable>>();
const initialThenable = createRscThenable(createInitialRscStream());
const initialRouterState = decodeAkanRouterState(globalThis.__AKAN_RSC_INITIAL_STATE__);
const initialNode = createRscNavigationCacheNode({
  href: normalizeHref(window.location.href),
  thenable: initialThenable,
  routerState: initialRouterState,
});
rscCache.set(initialNode.href, initialNode);
let currentRouterState: AkanRouterStateV1 | null = initialRouterState;
let currentSegmentTree: RscSegmentCacheNode | null = createAkanSegmentCacheTree(initialNode);
let currentFullNode: RscCacheNode = initialNode;
let currentCommitKind: "full" | "patch" = "full";
let currentCommitFromCache = false;
let navigationSeq = 0;

// Lets hydrating client code (see `akanjs/client`'s `isRscNavigationFromCache`) tell a replayed payload
// apart from a freshly fetched one, so data that must be current can refetch instead of trusting it.
globalThis.__AKAN_RSC_IS_FROM_CACHE__ = () => currentCommitFromCache;

function rememberCommittedRouteState(node: RscCacheNode): void {
  rscPatchCache.clear();
  if (!node.routerState) return;
  currentRouterState = node.routerState;
  currentSegmentTree = createAkanSegmentCacheTree(node);
  currentFullNode = node;
  currentCommitKind = "full";
}

function rememberPatchedRouteState(tree: RscSegmentCacheNode, patchedNode: RscSegmentCacheNode): void {
  currentRouterState = patchedNode.routerState;
  currentSegmentTree = tree;
  currentCommitKind = "patch";
}

function Root(): ReactNode {
  const [thenable, setThenable] = useState<RscThenable>(initialThenable);
  const [scrollToTopTick, setScrollToTopTick] = useState(0);

  useLayoutEffect(() => {
    if (!scrollToTopTick) return;
    window.scrollTo(0, 0);
  }, [scrollToTopTick]);

  globalThis.__AKAN_RSC_CLEAR_CACHE__ = () => {
    rscCache.clear();
    rscPatchCache.clear();
    if (currentCommitKind === "patch") {
      void globalThis.__AKAN_RSC_REFRESH__?.();
      return;
    }
    const href = normalizeHref(window.location.href);
    const currentFullState = currentFullNode.routerState;
    const canRestoreFullNode =
      currentFullNode.href === href &&
      ((!currentFullState && !currentRouterState) ||
        (currentFullState !== null &&
          currentRouterState !== null &&
          currentFullState.routeId === currentRouterState.routeId));
    if (canRestoreFullNode) {
      resetAkanSegmentOutletPatches();
      rscCache.set(href, currentFullNode);
    }
  };

  globalThis.__AKAN_RSC_REFRESH__ = async (options = {}) => {
    const navId = ++navigationSeq;
    const target = normalizeHref(window.location.href);
    rscCache.delete(target);
    rscPatchCache.clear();
    try {
      const next = await fetchRsc(target, {
        ...options,
        replaceOnRedirect: true,
        sendRouterState: false,
        navId,
        shouldApplyNavigation: () => navId === navigationSeq,
      });
      if (next.type === "redirected") return;
      if (next.type === "patched") return;
      observeRscNavigationNode({
        cache: rscCache,
        node: next.node,
        navId,
        getCurrentNavId: () => navigationSeq,
        isExpectedNavigationError: (error) => error instanceof RscRedirectNavigationStarted,
        onLatestError: (error) => hardNavigateAfterRscFailure(target, true, error),
      });
      // Commit only once the payload root is fulfilled so `use()` never suspends the
      // root transition (see trackRscThenable). Staleness is re-checked by navId below.
      await next.node.thenable;
      const committed = commitLatestRscNavigation({
        cache: rscCache,
        href: target,
        thenable: next.node,
        maxEntries: MAX_RSC_CACHE_ENTRIES,
        startTransition,
        commitThenable: (node) => {
          currentCommitFromCache = false;
          resetAkanSegmentOutletPatches();
          setThenable(node.thenable);
        },
        navId,
        getCurrentNavId: () => navigationSeq,
      });
      if (committed) rememberCommittedRouteState(next.node);
    } catch (error) {
      if (error instanceof RscRedirectNavigationStarted) return;
      if (navId === navigationSeq) hardNavigateAfterRscFailure(target, true, error);
    }
  };

  globalThis.__AKAN_RSC_NAVIGATE__ = async (href, options = {}) => {
    const navId = ++navigationSeq;
    const target = normalizeHref(href);
    const scrollToTop = options.scrollToTop ?? true;
    try {
      let nextNode = rscCache.get(target);
      const servedFromCache = !!nextNode;
      if (!nextNode) {
        const cachedPatch = rscPatchCache.get(target);
        if (cachedPatch) {
          const patchResult = resolveCachedRscPatchNavigation({
            currentTree: currentSegmentTree,
            node: cachedPatch,
            partialCommitEnabled: isAkanRscPartialCommitEnabled(),
            navId,
            getCurrentNavId: () => navigationSeq,
          });
          if (patchResult.status === "patched") {
            const replayedPatch = {
              type: "patched" as const,
              tree: patchResult.tree,
              patchedNode: patchResult.patchedNode,
              patch: cachedPatch.patch,
              outletKey: patchResult.outletKey,
              headSnapshot: patchResult.headSnapshot,
            };
            if (
              commitRscPatchNavigation({
                target,
                patch: replayedPatch,
                replace: options.replace,
                scrollToTop,
                bumpScrollToTop: () => setScrollToTopTick((tick) => tick + 1),
              })
            ) {
              currentCommitFromCache = true;
              rememberPatchedRouteState(patchResult.tree, patchResult.patchedNode);
              rememberRscPatchCacheNode(rscPatchCache, cachedPatch, MAX_RSC_CACHE_ENTRIES);
              return;
            }
          }
          rscPatchCache.delete(target);
        }
        const fetched = await fetchRsc(target, {
          replaceOnRedirect: options.replace,
          navId,
          shouldApplyNavigation: () => navId === navigationSeq,
        });
        if (fetched.type === "redirected") return;
        if (fetched.type === "patched") {
          if (navId !== navigationSeq) return;
          if (
            commitRscPatchNavigation({
              target,
              patch: fetched,
              replace: options.replace,
              scrollToTop,
              bumpScrollToTop: () => setScrollToTopTick((tick) => tick + 1),
            })
          ) {
            currentCommitFromCache = false;
            rememberPatchedRouteState(fetched.tree, fetched.patchedNode);
            const patchCacheNode = createRscPatchNavigationCacheNode({
              href: target,
              patch: fetched.patch,
              patchedNode: fetched.patchedNode,
              outletKey: fetched.outletKey,
              headSnapshot: fetched.headSnapshot,
            });
            if (patchCacheNode) rememberRscPatchCacheNode(rscPatchCache, patchCacheNode, MAX_RSC_CACHE_ENTRIES);
            return;
          }
          rscPatchCache.delete(target);
          const fallback = await fetchRsc(target, {
            replaceOnRedirect: options.replace,
            sendRouterState: false,
            navId,
            shouldApplyNavigation: () => navId === navigationSeq,
          });
          if (fallback.type === "redirected") return;
          if (fallback.type === "patched") throw new Error("[rscClient] full fallback unexpectedly returned a patch");
          nextNode = fallback.node;
        } else {
          nextNode = fetched.node;
        }
      } else {
        rememberRscCacheNode(rscCache, nextNode, MAX_RSC_CACHE_ENTRIES);
      }
      observeRscNavigationNode({
        cache: rscCache,
        node: nextNode,
        navId,
        getCurrentNavId: () => navigationSeq,
        isExpectedNavigationError: (error) => error instanceof RscRedirectNavigationStarted,
        onLatestError: (error) => hardNavigateAfterRscFailure(target, options.replace, error),
      });
      // Commit only once the payload root is fulfilled so `use()` never suspends the
      // root transition (see trackRscThenable). Staleness is re-checked by navId below.
      await nextNode.thenable;
      const committed = commitLatestRscNavigation({
        cache: rscCache,
        href: target,
        thenable: nextNode,
        maxEntries: MAX_RSC_CACHE_ENTRIES,
        startTransition,
        commitThenable: (node) => {
          currentCommitFromCache = servedFromCache;
          resetAkanSegmentOutletPatches();
          setThenable(node.thenable);
        },
        updateHistory: () => {
          if (options.replace) window.history.replaceState(null, "", target);
          else window.history.pushState(null, "", target);
        },
        scrollToTop,
        bumpScrollToTop: () => setScrollToTopTick((tick) => tick + 1),
        navId,
        getCurrentNavId: () => navigationSeq,
      });
      if (committed) rememberCommittedRouteState(nextNode);
    } catch (error) {
      if (error instanceof RscRedirectNavigationStarted) return;
      if (navId === navigationSeq) hardNavigateAfterRscFailure(target, options.replace, error);
    }
  };

  return use(thenable as Usable<ReactNode>);
}

window.addEventListener("popstate", () => {
  void globalThis.__AKAN_RSC_NAVIGATE__?.(window.location.href, { replace: true, scrollToTop: false });
  window.setTimeout(() => {
    if (globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__) return;
    const href = globalThis.__AKAN_GET_SYNC_ROUTE_HREF__?.(window.location.href) ?? window.location.href;
    globalThis.__AKAN_DEV_SYNC_NAVIGATION__?.(href, "pop");
  }, 0);
});

const hydrate = () => hydrateRoot(document, createElement(Root));
void Promise.resolve(initialThenable).then(hydrate, hydrate);
