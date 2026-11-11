import type { PrefetchPriority } from "../client/rscNavigation";
import { isAuthTokenKey } from "../common/authCookie";
import { CookieJar } from "../common/cookieJar";
import { StaleReads } from "../fetch/staleReads";
import { type AkanRouterStateV1, isAkanRscPartialCommitEnabled } from "./routeState";
import { fetchRscPrefetchResponse } from "./rscClientFetch";
import type { RscPatchedResult } from "./rscClientPatch";
import {
  type AkanSegmentCacheNode,
  createRscPatchNavigationCacheNode,
  forgetRscPatchesOfLostBases,
  type RscNavigationCacheNode,
  type RscPatchNavigationCacheNode,
  rememberRscCacheEntry,
  rememberRscCacheNode,
  resolveCachedRscPatchNavigation,
} from "./rscNavigationState";
import { RscPrefetchCache } from "./rscPrefetchCache";

export const normalizeHref = (href: string): string => new URL(href, window.location.origin).href;
export const withoutHash = (href: string | undefined) => href?.split("#", 1)[0];
export const pageKeyOf = (href: string) => withoutHash(href) ?? href;

// `/__rsc` is sent with cookies alone, so its auth cookies are the account a cached payload was rendered for.
const readAuthCookies = () =>
  CookieJar.parse(document.cookie)
    .entries()
    .filter(({ name }) => isAuthTokenKey(name))
    .map(({ name, value }) => `${name}=${value}`)
    .sort((a, b) => a.localeCompare(b))
    .join("; ");

const isConstrainedNetwork = () => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  return connection?.saveData === true || /2g$/.test(connection?.effectiveType ?? "");
};

interface RscClientScreen<T> {
  routerState: () => AkanRouterStateV1 | null;
  tree: () => AkanSegmentCacheNode<T> | null;
  base: () => RscNavigationCacheNode<T> | null;
  navId: () => number;
  pendingTarget: () => string | undefined;
}

export class RscClientCache<T extends object> {
  static readonly maxEntries = 32;
  readonly pages = new Map<string, RscNavigationCacheNode<T>>();
  readonly prefetches: RscPrefetchCache<RscNavigationCacheNode<T> | null>;
  #patches = new Map<string, RscPatchNavigationCacheNode<T>>();
  #failed = new WeakSet<T>();
  #account = readAuthCookies();
  #screen: RscClientScreen<T>;

  constructor(screen: RscClientScreen<T>) {
    this.#screen = screen;
    this.prefetches = new RscPrefetchCache({
      fetchResponse: (href, signal) => fetchRscPrefetchResponse(href, signal, screen.routerState()),
      baseOf: () => this.#prefetchBase(),
    });
    //? A page prefetched before this tab's own write would commit as current, showing what the write changed as it was.
    StaleReads.subscribe(() => this.prefetches.clear());
  }

  clear(): void {
    this.pages.clear();
    this.#patches.clear();
    this.prefetches.clear();
  }

  forgetAnotherAccount(): boolean {
    const account = readAuthCookies();
    if (account === this.#account) return false;
    this.#account = account;
    this.clear();
    return true;
  }

  //? A render that streamed an error would replay it, notice and all, with no request; the next visit asks instead.
  noteFailedRender(thenable: T): void {
    this.#failed.add(thenable);
  }

  //? The fragment never reaches the server, so a page cached under one fragment is the payload of every other.
  pageOf(target: string): RscNavigationCacheNode<T> | undefined {
    const key = pageKeyOf(target);
    const exact = this.pages.get(target);
    if (exact && !this.#failed.has(exact.thenable)) return exact;
    return [...this.pages.values()].findLast(
      (node) => pageKeyOf(node.href) === key && !this.#failed.has(node.thenable),
    );
  }

  replayedPageOf(target: string): RscNavigationCacheNode<T> | undefined {
    const node = this.pageOf(target);
    if (node) rememberRscCacheNode(this.pages, node, RscClientCache.maxEntries);
    return node;
  }

  replayPatch(target: string, navId: number, commit: (patch: RscPatchedResult<T>) => boolean): boolean {
    const key = pageKeyOf(target);
    const cachedPatch = this.#patchOf(key);
    if (!cachedPatch) return false;
    const patchResult = this.#patchReplayOf(cachedPatch, navId);
    if (patchResult.status === "patched") {
      const { tree, patchedNode, outletKey, headSnapshot } = patchResult;
      if (commit({ type: "patched", tree, patchedNode, patch: cachedPatch.patch, outletKey, headSnapshot })) {
        rememberRscCacheEntry(this.#patches, key, cachedPatch, RscClientCache.maxEntries);
        return true;
      }
    }
    this.#patches.delete(key);
    return false;
  }

  rememberPatch(href: string, { patch, patchedNode, outletKey, headSnapshot }: RscPatchedResult<T>): void {
    const base = this.#screen.base();
    const node = createRscPatchNavigationCacheNode({ href, patch, patchedNode, outletKey, headSnapshot, base });
    if (node) rememberRscCacheEntry(this.#patches, pageKeyOf(href), node, RscClientCache.maxEntries);
  }

  forgetPatch(target: string): void {
    this.#patches.delete(pageKeyOf(target));
  }

  forgetPatchesOfLostBases(base: RscNavigationCacheNode<T>): void {
    forgetRscPatchesOfLostBases(this.#patches, this.pages, base);
  }

  takePrefetch(target: string, signal: AbortSignal) {
    return this.prefetches.take(pageKeyOf(target), this.#account, signal, this.#prefetchBase());
  }

  prefetch(href: string, priority?: PrefetchPriority): () => void {
    const none = () => undefined;
    if (isConstrainedNetwork()) return none;
    const target = normalizeHref(href);
    const key = pageKeyOf(target);
    if (new URL(target).origin !== window.location.origin || this.#screen.pendingTarget() === key) return none;
    //? Not forgetAnotherAccount: only a navigation may record the change, or a page of the old account still in
    //? flight commits into the cache as the new account's.
    const account = readAuthCookies();
    const cachedPatch = this.#patchOf(key);
    const replayable = this.pageOf(target) || (!!cachedPatch && this.#patchReplayOf(cachedPatch).status === "patched");
    if (account === this.#account && replayable) return none;
    return this.prefetches.request(key, account, priority, this.#prefetchBase());
  }

  #patchOf(key: string): RscPatchNavigationCacheNode<T> | undefined {
    const node = this.#patches.get(key);
    return node && !this.#failed.has(node.thenable) ? node : undefined;
  }

  //? With partial commit off every prefetch is a whole page, good under any page on screen, so none is tied to one.
  #prefetchBase(): RscNavigationCacheNode<T> | null {
    return isAkanRscPartialCommitEnabled() ? this.#screen.base() : null;
  }

  #patchReplayOf(node: RscPatchNavigationCacheNode<T>, navId?: number) {
    return resolveCachedRscPatchNavigation({
      currentTree: this.#screen.tree(),
      currentBase: this.#screen.base(),
      node,
      partialCommitEnabled: isAkanRscPartialCommitEnabled(),
      navId,
      getCurrentNavId: this.#screen.navId,
    });
  }
}
