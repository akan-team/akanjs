import { createElement, type ReactNode, startTransition, type Usable, use, useLayoutEffect, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { createFromReadableStream } from "react-server-dom-webpack/client.browser";
import { AkanError } from "../base/akanError";
import { csrLocation } from "../client/csrLocation";
import { DictionaryAsset } from "../client/dictionaryAsset";
import type {} from "../client/rscNavigation";
import {
  AKAN_RSC_DICTIONARY_HEADER,
  type AkanRouterStateV1,
  decodeAkanRouterState,
  isAkanRscPartialCommitEnabled,
  readAkanRouterStateResponseHeader,
} from "./routeState";
import { normalizeHref, pageKeyOf, RscClientCache, withoutHash } from "./rscClientCache";
import {
  type ChunkNavigation,
  claimChunkReload,
  ifLazyChunkGone,
  isBuildBundle,
  isLinkFailure,
  lazyLinkFailureKeyOf,
  navigationOfChunk,
  noteChunkLoadFailure,
  recordChunksOf,
  reportingRootErrors,
} from "./rscClientChunks";
import { fetchRscNavigationResponse } from "./rscClientFetch";
import { commitRscPatch, type RscPatchedResult, validateRscPatchForGuardedCommit } from "./rscClientPatch";
import { getAkanHeadSnapshotPatchFailureReason } from "./rscHeadPatch";
import { getRscPayloadStream, guardRscRedirectRows, type RscRedirectRow } from "./rscHttp";
import { createInitialRscStream } from "./rscInlineStream";
import {
  type AkanSegmentCacheNode,
  commitLatestRscNavigation,
  createAkanSegmentCacheTree,
  createRscNavigationCacheNode,
  deleteRscCacheEntryIfCurrent,
  observeRscNavigationNode,
  type RscNavigationCacheNode,
} from "./rscNavigationState";
import { RscParkedRedirect } from "./rscParkedRedirect";
import { RscScrollRestoration } from "./rscScrollRestoration";
import { resetAkanSegmentOutletPatches } from "./rscSegmentOutlet";

declare global {
  var __AKAN_RSC_INITIAL_STATE__: string | undefined;
  var __AKAN_DICT_URL__: string | undefined;
  var __webpack_chunk_load__: ((chunkId: string) => Promise<unknown>) | undefined;
}

type RscThenable = Promise<ReactNode> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: ReactNode;
  reason?: unknown;
};
type RscCacheNode = RscNavigationCacheNode<RscThenable>;
type RscSegmentCacheNode = AkanSegmentCacheNode<RscThenable>;
type RscPatched = RscPatchedResult<RscThenable>;
type RscFetchResult =
  | { type: "rsc"; node: RscCacheNode; notFound?: boolean }
  | RscPatched
  | { type: "not-found" }
  | { type: "redirected"; status?: number };
interface ScrollRequest {
  scrollY: number;
  hash?: string;
}
let documentNavigationFallbackInFlight = false;

class RscRedirectNavigationStarted extends AkanError<"rscRedirectStarted"> {
  constructor(readonly location: string) {
    super("rscRedirectStarted", "[rscClient] RSC redirect navigation started", { statusCode: 303 });
    this.name = "RscRedirectNavigationStarted";
  }
}

// Thrown, never turned into a document navigation, which would trade a working page (and an in-page agent's session)
// for a 404. Matched by `name`, not instanceof: the RSC client is inlined into more than one browser bundle.
class RscRouteNotFound extends AkanError<"routeNotFound"> {
  constructor(readonly href: string) {
    super("routeNotFound", `[rscClient] no route at ${href}`, { statusCode: 404 });
    this.name = "RscRouteNotFound";
  }
}

// React's thenable status lets use() read a fulfilled payload synchronously; its suspend-and-ping path intermittently
// lost the re-commit when store updates raced the transition, leaving the previous page's DOM on screen.
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

//? A page restored from the back-forward cache outlived the document load its fallback started.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) documentNavigationFallbackInFlight = false;
});

function hardNavigateAfterRscFailure(target: string, replace = false, error?: unknown): void {
  if (documentNavigationFallbackInFlight) return;
  documentNavigationFallbackInFlight = true;
  console.warn(`[rscClient] RSC navigation failed, falling back to document navigation: ${String(error)}`);
  //? `replace` or `assign` to the address the tab already shows with a `#fragment` only scrolls; it loads nothing.
  if (normalizeHref(target) === normalizeHref(window.location.href)) window.location.reload();
  else if (replace) window.location.replace(target);
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
  fromCache,
  replace,
  requestScroll,
}: {
  target: string;
  patch: RscPatched;
  fromCache: boolean;
  replace?: boolean;
  requestScroll?: () => void;
}): boolean {
  const committed = commitRscPatch(target, patch, () => {
    commitHistory(target, replace);
    shownNode = null;
    parkedRedirect.clear();
    requestScroll?.();
  });
  if (!committed) return false;
  currentCommitFromCache = fromCache;
  rememberPatchedRouteState(patch.tree, patch.patchedNode);
  return true;
}

function akanHistoryState(replace: boolean, shallow = false) {
  const shallowState = shallow ? { shallow: true, rendered: renderedHref } : {};
  const entryState = replace ? scrollRestoration.replaceEntry() : scrollRestoration.pushEntry();
  return { __akanRouter: { ...entryState, ...shallowState } };
}

// The href the page on screen was rendered for; a shallow entry changes the query without rendering anything.
let renderedHref = normalizeHref(window.location.href);
const scrollRestoration = new RscScrollRestoration();
const pathnameOf = (href: string) => new URL(href).pathname;

function commitHistory(target: string, replace: boolean | undefined) {
  if (replace) csrLocation.replace(akanHistoryState(true), target);
  else csrLocation.push(akanHistoryState(false), target);
  renderedHref = target;
}

/** Writes the entry without asking the server for the page; only a change that keeps the rendered path qualifies. */
function navigateShallow(target: string, replace: boolean | undefined): boolean {
  if (pathnameOf(target) !== pathnameOf(renderedHref)) return false;
  if (replace) csrLocation.replace(akanHistoryState(true, true), target);
  else csrLocation.push(akanHistoryState(false, true), target);
  return true;
}

async function fetchRsc(
  href: string,
  options: {
    buildId?: number;
    replaceOnRedirect?: () => boolean;
    shouldApplyNavigation?: () => boolean;
    sendRouterState?: boolean;
    navId?: number;
    signal?: AbortSignal;
    prefetched?: Response;
  } = {},
): Promise<RscFetchResult> {
  const shouldApplyNavigation = options.shouldApplyNavigation ?? (() => true);
  const navigation =
    options.navId === undefined
      ? undefined
      : { navId: options.navId, href, replace: options.replaceOnRedirect ?? (() => true) };
  const thenableOf = (stream: ReadableStream<Uint8Array>) =>
    createRscThenable(navigation ? recordChunksOf(stream, navigation) : stream);
  const responseResult = await fetchRscNavigationResponse(href, {
    buildId: options.buildId,
    currentRouterState,
    navigate: globalThis.__AKAN_RSC_NAVIGATE__,
    replaceOnRedirect: options.replaceOnRedirect,
    sendRouterState: options.sendRouterState,
    shouldApplyNavigation,
    signal: options.signal,
    prefetched: options.prefetched,
  });
  if (responseResult.type === "not-found" && shouldApplyNavigation())
    parkedRedirect.resume(stillOnItsEntry, navigateAfterRscRedirect);
  if (responseResult.type === "redirected" || responseResult.type === "not-found") return responseResult;
  //? Awaited before the result is returned, so no caller commits a page whose locale the Translator lacks.
  const dictionaryReady = DictionaryAsset.load(responseResult.response.headers.get(AKAN_RSC_DICTIONARY_HEADER));
  if (responseResult.type === "patch") {
    const [patchResult] = await Promise.all([
      validateRscPatchForGuardedCommit({
        partialCommitEnabled: isAkanRscPartialCommitEnabled(),
        currentTree: currentSegmentTree,
        response: responseResult.response,
        patch: responseResult.patch,
        href,
        createThenable: thenableOf,
        navId: options.navId,
        getCurrentNavId: () => navigationSeq,
        getHeadSnapshotPatchFailureReason: getAkanHeadSnapshotPatchFailureReason,
      }),
      dictionaryReady,
    ]);
    if (patchResult.status === "patched") {
      if (!patchResult.headSnapshot)
        throw new AkanError("invalidRscResponse", "[rscClient] validated RSC patch is missing a head snapshot");
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
      prefetched: undefined,
      sendRouterState: false,
    });
  }
  const res = responseResult.response;
  const stream = getRscPayloadStream(res);
  if (!stream)
    throw new AkanError("rscFetchFailed", `[rscClient] RSC fetch failed ${res.status} ${res.statusText}`, {
      statusCode: 502,
    });
  const nodeRef: { current?: RscCacheNode } = {};
  const handleRedirect = (redirect: RscRedirectRow) => {
    const node = nodeRef.current;
    if (node) deleteRscCacheEntryIfCurrent(caches.pages, href, node);
    const applies = shouldApplyNavigation();
    //? A later navigation may have replayed this page, under another fragment or back from elsewhere, and still show it.
    if (!applies && node !== shownNode) return;
    const location = redirect.location ? normalizeHref(redirect.location) : href;
    const replace = redirect.method !== "push" && (options.replaceOnRedirect?.() ?? true);
    if (!applies && node && pendingRequest) parkedRedirect.park({ node, location, replace });
    else navigateAfterRscRedirect(location, replace);
  };
  const guardedStream = guardRscRedirectRows(stream, {
    onRedirect: handleRedirect,
  });
  const thenable = thenableOf(guardedStream);
  const node = createRscNavigationCacheNode({
    href,
    thenable,
    routerState: responseResult.notFound ? null : readAkanRouterStateResponseHeader(res.headers),
  });
  nodeRef.current = node;
  await dictionaryReady;
  return {
    type: "rsc",
    node,
    notFound: responseResult.notFound,
  };
}

const caches = new RscClientCache<RscThenable>({
  routerState: () => currentRouterState,
  tree: () => currentSegmentTree,
  base: () => currentFullNode,
  navId: () => navigationSeq,
  pendingTarget: () => pendingRequest?.target,
});
const initialThenable = createRscThenable(createInitialRscStream());
const initialRouterState = decodeAkanRouterState(globalThis.__AKAN_RSC_INITIAL_STATE__);
const initialNode = createRscNavigationCacheNode({
  href: normalizeHref(window.location.href),
  thenable: initialThenable,
  routerState: initialRouterState,
});
caches.pages.set(initialNode.href, initialNode);
let currentRouterState: AkanRouterStateV1 | null = initialRouterState;
let currentSegmentTree: RscSegmentCacheNode | null = createAkanSegmentCacheTree(initialNode);
let currentFullNode: RscCacheNode | null = initialNode;
let shownNode: RscCacheNode | null = initialNode;
const parkedRedirect = new RscParkedRedirect<RscCacheNode>();
let currentCommitKind: "full" | "patch" = "full";
let currentCommitFromCache = false;
let navigationSeq = 0;
let pendingRequest: { navId: number; controller: AbortController; target: string } | null = null;
let latestPageNavId = 0;

//? Back or Forward moves the URL before its page loads, and a redirect then would replace the entry it moved to; a
//? shallow entry, its query or fragment changed in place, still shows the page it was written over.
const stillOnItsEntry = (node: RscCacheNode) => {
  const entry = (window.history.state as { __akanRouter?: { shallow?: boolean; rendered?: string } } | null)
    ?.__akanRouter;
  const here = normalizeHref(window.location.href);
  return node === shownNode && pageKeyOf(node.href) === withoutHash(entry?.shallow ? entry.rendered : here);
};

//? Only a request whose page has not committed is cut: a committed one may still stream the Suspense content on screen.
function supersedeNavigation(): number {
  pendingRequest?.controller.abort();
  pendingRequest = null;
  return ++navigationSeq;
}

//? A page navigation started after a fallback supersedes its document load, or follows a `beforeunload` that kept the
//? page; a refresh does not, since a timer can start one while that document is still loading.
function supersedeForPageNavigation(): number {
  documentNavigationFallbackInFlight = false;
  return supersedeNavigation();
}

let refreshNavId: number | undefined;
function supersedeForRefresh(): number {
  refreshNavId = supersedeNavigation();
  return refreshNavId;
}

function supersedeKeepingPage(): void {
  supersedeNavigation();
  parkedRedirect.resume(stillOnItsEntry, navigateAfterRscRedirect);
}

function requestSignalOf(navId: number, target: string): AbortSignal {
  latestPageNavId = navId;
  const controller = new AbortController();
  pendingRequest = { navId, controller, target: pageKeyOf(target) };
  return controller.signal;
}

function settleRequestOf(navId: number): void {
  if (pendingRequest?.navId === navId) pendingRequest = null;
}

//? A replica a rolling deploy has not reached can send a page whose chunks import a name this document's narrowed
//? vendors lack, and RSDW keeps the failed load; one reload per chunk keeps a chunk that always fails from looping.
const loadChunk = globalThis.__webpack_chunk_load__;
if (loadChunk)
  globalThis.__webpack_chunk_load__ = (chunkId) => {
    const loading = loadChunk(chunkId);
    const navigation = navigationOfChunk(chunkId);
    loading.catch(noteChunkLoadFailure);
    if (navigation) loading.catch((error: unknown) => loadDocumentForChunkFailure(chunkId, navigation, error));
    return loading;
  };

function loadDocumentForChunkFailure(chunkId: string, navigation: ChunkNavigation, error: unknown): void {
  if (documentNavigationFallbackInFlight || !isBuildBundle()) return;
  const showsItsPage = navigation.navId === refreshNavId || pageKeyOf(renderedHref) === pageKeyOf(navigation.href);
  const pending = pendingRequest?.navId === navigation.navId && !showsItsPage;
  const onScreen = navigation.navId === latestPageNavId && showsItsPage;
  if (!pending && !(onScreen && navigator.onLine && isLinkFailure(error))) return;
  if (!claimChunkReload(chunkId)) return;
  if (pending) hardNavigateAfterRscFailure(navigation.href, navigation.replace(), error);
  else hardNavigateAfterRscFailure(normalizeHref(window.location.href), true, error);
}

//? A rejected `import()` names neither the module that asked nor the one that failed to link, so a lazy chunk counts
//? as the page on screen's; only a page a navigation's response rendered can hold another build's modules, while a
//? chunk a deploy removed fails to fetch under the document's own page too.
function loadDocumentForLazyChunkFailure(error: unknown, goneKey?: string): void {
  const leaving =
    !!pendingRequest && pendingRequest.navId !== refreshNavId && pendingRequest.target !== pageKeyOf(renderedHref);
  if (leaving || documentNavigationFallbackInFlight || !isBuildBundle()) return;
  const navId = navigationSeq;
  if (!goneKey) ifLazyChunkGone(error, (key) => navId === navigationSeq && loadDocumentForLazyChunkFailure(error, key));
  const key = goneKey ?? (shownNode === initialNode ? null : lazyLinkFailureKeyOf(error));
  if (key && navigator.onLine && claimChunkReload(key))
    hardNavigateAfterRscFailure(normalizeHref(window.location.href), true, error);
}

// Read by akanjs/client's isRscNavigationFromCache: data that must be current refetches instead of trusting a replay.
globalThis.__AKAN_RSC_IS_FROM_CACHE__ = () => currentCommitFromCache;

function rememberCommittedRouteState(node: RscCacheNode): void {
  currentFullNode = node;
  shownNode = node;
  parkedRedirect.clear();
  caches.forgetPatchesOfLostBases(node);
  currentRouterState = node.routerState;
  currentSegmentTree = createAkanSegmentCacheTree(node);
  currentCommitKind = "full";
}

//? A not-found view is never replayed or patched onto, so the page after it is rendered whole.
function forgetCommittedRouteState(): void {
  shownNode = null;
  parkedRedirect.clear();
  currentRouterState = null;
  currentSegmentTree = null;
  currentFullNode = null;
  currentCommitKind = "full";
}

function rememberPatchedRouteState(tree: RscSegmentCacheNode, patchedNode: RscSegmentCacheNode): void {
  currentRouterState = patchedNode.routerState;
  currentSegmentTree = tree;
  currentCommitKind = "patch";
}

function forgetPagesOfAnotherAccount(): void {
  if (!caches.forgetAnotherAccount()) return;
  //? The layouts on screen were rendered for the other account too, so the next page is not patched onto them.
  currentRouterState = null;
  currentSegmentTree = null;
}

globalThis.__AKAN_RSC_PREFETCH__ = (href, priority) => caches.prefetch(href, priority);

function Root(): ReactNode {
  const [thenable, setThenable] = useState<RscThenable>(initialThenable);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);

  useLayoutEffect(() => {
    if (scrollRequest?.hash) scrollRestoration.scrollToHash(scrollRequest.hash, scrollRequest.scrollY);
    else if (scrollRequest) scrollRestoration.scrollTo(scrollRequest.scrollY);
  }, [scrollRequest]);

  installCacheClear();
  installRefresh(setThenable);
  installNavigate(setThenable, setScrollRequest);
  return use(thenable as Usable<ReactNode>);
}

function installCacheClear(): void {
  globalThis.__AKAN_RSC_CLEAR_CACHE__ = () => {
    caches.clear();
    if (currentCommitKind === "patch") {
      void globalThis.__AKAN_RSC_REFRESH__?.();
      return;
    }
    const href = normalizeHref(window.location.href);
    if (!currentFullNode) return;
    const currentFullState = currentFullNode.routerState;
    const canRestoreFullNode =
      pageKeyOf(currentFullNode.href) === pageKeyOf(href) &&
      ((!currentFullState && !currentRouterState) ||
        (currentFullState !== null &&
          currentRouterState !== null &&
          currentFullState.routeId === currentRouterState.routeId));
    if (canRestoreFullNode) {
      resetAkanSegmentOutletPatches();
      caches.pages.set(currentFullNode.href, currentFullNode);
    }
  };
}

function installRefresh(setThenable: (thenable: RscThenable) => void): void {
  globalThis.__AKAN_RSC_REFRESH__ = async (options = {}) => {
    const navId = supersedeForRefresh();
    const target = normalizeHref(window.location.href);
    caches.clear();
    try {
      const next = await fetchRsc(target, {
        ...options,
        replaceOnRedirect: () => true,
        sendRouterState: false,
        navId,
        shouldApplyNavigation: () => navId === navigationSeq,
        signal: requestSignalOf(navId, target),
      });
      if (next.type === "redirected") return;
      if (next.type === "not-found") {
        console.warn(`[rscClient] refresh target ${target} no longer resolves; keeping the current page`);
        return;
      }
      if (next.type === "patched") return;
      observeRscNavigationNode({
        cache: caches.pages,
        node: next.node,
        navId,
        getCurrentNavId: () => navigationSeq,
        isExpectedNavigationError: (error) => error instanceof RscRedirectNavigationStarted,
        onLatestError: (error) => hardNavigateAfterRscFailure(target, true, error),
      });
      // Awaited before committing so use() never suspends the root transition (see trackRscThenable).
      await next.node.thenable;
      const committed = commitLatestRscNavigation({
        cache: next.notFound ? undefined : caches.pages,
        href: target,
        thenable: next.node,
        maxEntries: RscClientCache.maxEntries,
        startTransition,
        commitThenable: (node) => {
          currentCommitFromCache = false;
          resetAkanSegmentOutletPatches();
          setThenable(node.thenable);
          renderedHref = target;
        },
        navId,
        getCurrentNavId: () => navigationSeq,
      });
      if (!committed) return;
      if (next.notFound) forgetCommittedRouteState();
      else rememberCommittedRouteState(next.node);
    } catch (error) {
      if (error instanceof RscRedirectNavigationStarted) return;
      if (navId === navigationSeq) hardNavigateAfterRscFailure(target, true, error);
    } finally {
      settleRequestOf(navId);
    }
  };
}

function installNavigate(
  setThenable: (thenable: RscThenable) => void,
  setScrollRequest: (request: ScrollRequest) => void,
): void {
  globalThis.__AKAN_RSC_NAVIGATE__ = async (href, options = {}) => {
    if (options.shallow && navigateShallow(normalizeHref(href), options.replace)) {
      supersedeKeepingPage();
      return;
    }
    forgetPagesOfAnotherAccount();
    caches.prefetches.prune();
    const navId = supersedeForPageNavigation();
    const target = normalizeHref(href);
    const signal = requestSignalOf(navId, target);
    //? A redirect replaces the entry this navigation is on, which a push does not write until its page commits.
    let ownsEntry = !!options.replace;
    const replaceOnRedirect = () => ownsEntry;
    const scrollY = options.scrollY ?? ((options.scrollToTop ?? true) ? 0 : undefined);
    const hash = options.scrollY === undefined ? new URL(target).hash : "";
    const requestScroll = scrollY === undefined ? undefined : () => setScrollRequest({ scrollY, hash });
    try {
      const replayed = caches.replayedPageOf(target);
      let nextNode = replayed;
      let notFound = false;
      let servedFromCache = !!nextNode;
      if (!nextNode) {
        const commitPatch = (patch: RscPatched, fromCache: boolean) =>
          commitRscPatchNavigation({ target, patch, fromCache, replace: options.replace, requestScroll });
        if (caches.replayPatch(target, navId, (patch) => commitPatch(patch, true))) return;
        const taken = caches.takePrefetch(target, signal);
        const prefetched = (await taken?.response) ?? undefined;
        if (signal.aborted) return;
        servedFromCache = !!prefetched && !taken?.fresh;
        const fetched = await fetchRsc(target, {
          replaceOnRedirect,
          navId,
          shouldApplyNavigation: () => navId === navigationSeq,
          signal,
          prefetched,
        });
        if (fetched.type === "redirected") return;
        if (fetched.type === "not-found") throw new RscRouteNotFound(target);
        if (fetched.type === "patched") {
          if (navId !== navigationSeq) return;
          if (commitPatch(fetched, servedFromCache)) {
            caches.rememberPatch(target, fetched);
            return;
          }
          caches.forgetPatch(target);
          const fallback = await fetchRsc(target, {
            replaceOnRedirect,
            sendRouterState: false,
            navId,
            shouldApplyNavigation: () => navId === navigationSeq,
            signal,
          });
          if (fallback.type === "redirected") return;
          if (fallback.type === "not-found") throw new RscRouteNotFound(target);
          if (fallback.type === "patched") throw new AkanError("invalidRscResponse", "[rscClient] fallback is a patch");
          nextNode = fallback.node;
          notFound = !!fallback.notFound;
        } else {
          nextNode = fetched.node;
          notFound = !!fetched.notFound;
        }
      }
      observeRscNavigationNode({
        cache: caches.pages,
        node: nextNode,
        navId,
        getCurrentNavId: () => navigationSeq,
        isExpectedNavigationError: (error) => error instanceof RscRedirectNavigationStarted,
        onLatestError: (error) => hardNavigateAfterRscFailure(target, options.replace, error),
      });
      // Awaited before committing so use() never suspends the root transition (see trackRscThenable).
      await nextNode.thenable;
      //? A replay stays keyed by its own href alone, where a redirect or a failure deletes it, never by the fragment it serves.
      const committed = commitLatestRscNavigation({
        cache: notFound || replayed ? undefined : caches.pages,
        href: target,
        thenable: nextNode,
        maxEntries: RscClientCache.maxEntries,
        startTransition,
        commitThenable: (node) => {
          currentCommitFromCache = servedFromCache;
          resetAkanSegmentOutletPatches();
          setThenable(node.thenable);
        },
        updateHistory: () => {
          commitHistory(target, options.replace);
          ownsEntry = true;
        },
        requestScroll,
        navId,
        getCurrentNavId: () => navigationSeq,
      });
      if (!committed) return;
      if (notFound) forgetCommittedRouteState();
      else rememberCommittedRouteState(nextNode);
    } catch (error) {
      if (error instanceof RscRedirectNavigationStarted) return;
      // Rethrown before the fallback: a document navigation would land on the very 404 this refusal exists to avoid.
      if (error instanceof RscRouteNotFound) throw error;
      if (navId === navigationSeq) hardNavigateAfterRscFailure(target, options.replace, error);
    } finally {
      settleRequestOf(navId);
    }
  };
}

window.addEventListener("popstate", (event) => {
  const here = normalizeHref(window.location.href);
  const entry = (event.state as { __akanRouter?: { shallow?: boolean; rendered?: string } } | null)?.__akanRouter;
  const scrollY = scrollRestoration.traverseTo(event.state);
  //? A shallow entry shows the render that was on screen when it was written, which a later same-path push replaces.
  const keepsPage = withoutHash(entry?.shallow ? entry.rendered : here) === withoutHash(renderedHref);
  // The URL already moved, so a refused route falls back to the document route's real not-found page.
  if (!keepsPage)
    void globalThis
      .__AKAN_RSC_NAVIGATE__?.(window.location.href, { replace: true, scrollToTop: false, scrollY })
      ?.catch((error: unknown) => hardNavigateAfterRscFailure(window.location.href, true, error));
  else {
    //? Still a navigation: one in flight would otherwise commit its page onto the entry this move landed on.
    supersedeKeepingPage();
    if (scrollY !== undefined) scrollRestoration.scrollTo(scrollY);
  }
  window.setTimeout(() => {
    if (globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__) return;
    const href = globalThis.__AKAN_GET_SYNC_ROUTE_HREF__?.(window.location.href) ?? window.location.href;
    globalThis.__AKAN_DEV_SYNC_NAVIGATION__?.(href, "pop");
  }, 0);
});

window.addEventListener("unhandledrejection", (event) => loadDocumentForLazyChunkFailure(event.reason));
const rootOptions = isBuildBundle() ? reportingRootErrors(loadDocumentForLazyChunkFailure) : undefined;
const hydrate = () => {
  hydrateRoot(document, createElement(Root), rootOptions);
  scrollRestoration.restoreDocumentLoad();
};
//? Hydrating without the dictionary still beats a dead page: client components show their keys until a navigation
//? loads it.
const initialDictionary = DictionaryAsset.load(globalThis.__AKAN_DICT_URL__).catch((error: unknown) =>
  console.error(`[rscClient] the page's dictionary failed to load: ${String(error)}`),
);
void Promise.allSettled([initialThenable, initialDictionary]).then(hydrate);
