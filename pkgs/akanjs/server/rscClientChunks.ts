import { mapFlightLineRows } from "./flightRowReader";

export interface ChunkNavigation {
  navId: number;
  href: string;
  replace: () => boolean;
}

//? RSDW asks the global loader for a chunk without naming the response that wants it, so a navigation's `I` rows
//? record the chunks they name; a chunk no navigation named is the document's own.
const chunkNavigations = new Map<string, ChunkNavigation>();
const quotedString = /"([^"\\]*)"/g;
const maxScriptRowBytes = 1024;
const rowDecoder = new TextDecoder();

export function recordChunksOf(
  stream: ReadableStream<Uint8Array>,
  navigation: ChunkNavigation,
): ReadableStream<Uint8Array> {
  //? RSDW outlines a chunk path of 16+ characters into a string row the `I` row names as `$<row id>`, until 32,768
  //? characters per response; shorter paths and those past the budget stay inline.
  const scriptRows = new Map<string, string>();
  return mapFlightLineRows(stream, (row, tag) => {
    if (tag !== "I" && (tag !== "" || row.byteLength > maxScriptRowBytes)) return row;
    const text = rowDecoder.decode(row);
    const colon = text.indexOf(":");
    const value = text.slice(colon + 1 + tag.length).trimEnd();
    if (tag === "") {
      if (value.startsWith('"') && value.endsWith('.js"')) scriptRows.set(text.slice(0, colon), value.slice(1, -1));
      return row;
    }
    for (const [, named] of value.matchAll(quotedString)) {
      const chunkId = (named.startsWith("$") ? scriptRows.get(named.slice(1)) : undefined) ?? named;
      if (chunkId.endsWith(".js")) chunkNavigations.set(chunkId, navigation);
    }
    return row;
  });
}

export const navigationOfChunk = (chunkId: string): ChunkNavigation | undefined => chunkNavigations.get(chunkId);

//? How Chromium, Firefox and WebKit word a failed link or bare specifier; a fetch or evaluation error is not skew.
const linkFailure =
  /does not provide an export named|doesn't provide an export named|import not found|Importing binding name|Failed to resolve module specifier|was a bare specifier|does not resolve to a valid URL/;
export const isLinkFailure = (error: unknown): boolean =>
  (error instanceof SyntaxError || error instanceof TypeError) && linkFailure.test(error.message);

//? RSDW rethrows a chunk's rejection from the element that renders it, so React reports a failure the loader decided.
const chunkLoadFailures = new WeakSet<object>();
export const noteChunkLoadFailure = (error: unknown): void => {
  if (typeof error === "object" && error !== null) chunkLoadFailures.add(error);
};
//? The message alone, not the page: a failure the app causes itself would otherwise reload once per page showing it.
export const lazyLinkFailureKeyOf = (error: unknown): string | null =>
  error instanceof Error && isLinkFailure(error) && !chunkLoadFailures.has(error) ? `import() ${error.message}` : null;

//? Chromium names the `import()` target, and Firefox the module that failed to fetch (115 named the target). WebKit
//? names none, but words only a failed fetch this way: its syntax, link, MIME and evaluation errors read otherwise.
const namedFetchFailure =
  /^(?:Failed to fetch dynamically imported module|error loading dynamically imported module): \S+$/;
const unnamedFetchFailure = "Importing a module script failed.";
const ownClientUrlOf = (href: string): URL | null => {
  try {
    const url = new URL(href);
    return url.origin === window.location.origin && url.pathname.startsWith("/_akan/client/") ? url : null;
  } catch {
    return null;
  }
};
//? A module fetch that failed records an empty body. Chromium and Firefox give its status; WebKit gives none and
//? records a cache hit, memory or disk, with an empty body too, but only an answered fetch sets `responseStart`
//? there. A served empty chunk passes in WebKit and probes 200. Safari before 16.4 gives no body size and lists none.
//? An observer: `getEntriesByType` stops at 250 entries.
const maxFallbackProbes = 4;
//? WebKit does not fetch a module that failed again, so a chunk dropped here is never listed again: a 404 stays, as its
//? reload can still be skipped, and one whose probe fails or answers another error status stays for three probes.
const maxUnansweredProbes = 3;
const failedChunkFetches = new Map<string, number>();
const noteFailedChunkFetches = (entries: PerformanceEntryList): void => {
  for (const entry of entries as PerformanceResourceTiming[]) {
    const answeredAsFailed =
      entry.responseStatus === undefined
        ? entry.responseStart > 0
        : !(entry.responseStatus >= 200 && entry.responseStatus < 300);
    const failed = entry.decodedBodySize === 0 && entry.initiatorType !== "fetch" && answeredAsFailed;
    const url = failed ? ownClientUrlOf(entry.name) : null;
    //? Bun writes the stylesheets and fonts client code imports under `/_akan/client/` too.
    if (!url?.pathname.endsWith(".js")) continue;
    failedChunkFetches.delete(url.href);
    failedChunkFetches.set(url.href, 0);
  }
  for (const url of failedChunkFetches.keys())
    if (failedChunkFetches.size > maxFallbackProbes) failedChunkFetches.delete(url);
};
const chunkFetchObserver = (() => {
  try {
    const observer = new PerformanceObserver((list) => noteFailedChunkFetches(list.getEntries()));
    observer.observe({ type: "resource", buffered: true });
    return observer;
  } catch {
    return null;
  }
})();
const fallbackChunksFor = (named: string | null): string[] => {
  noteFailedChunkFetches(chunkFetchObserver?.takeRecords() ?? []);
  return [...failedChunkFetches.keys()].filter((url) => url !== named);
};
const settleFailedChunkFetch = (url: string, status: number | null): void => {
  const unanswered = failedChunkFetches.get(url);
  if (unanswered === undefined || status === 404) return;
  if ((status !== null && status < 400) || unanswered + 1 >= maxUnansweredProbes) failedChunkFetches.delete(url);
  else failedChunkFetches.set(url, unanswered + 1);
};
const probesOut = new Map<string, Promise<boolean>>();
const isGone = (url: string): Promise<boolean> => {
  const out = probesOut.get(url);
  if (out) return out;
  const gone = fetch(url, { method: "HEAD", cache: "no-store" })
    .then(
      ({ status }) => status,
      () => null,
    )
    .then((status) => {
      probesOut.delete(url);
      settleFailedChunkFetch(url, status);
      return status === 404;
    });
  probesOut.set(url, gone);
  return gone;
};
//? The first 404 whose reload is not claimed yet: a claimed one, a chunk a reload did not fix, would shadow any other.
const unclaimedGoneKey = (urls: string[], keyOf: (url: string) => string): Promise<string | undefined> =>
  new Promise((resolve) => {
    let unsettled = urls.length;
    if (!unsettled) resolve(undefined);
    for (const url of urls)
      void isGone(url).then((gone) => {
        unsettled -= 1;
        if (gone && !isChunkReloadClaimed(keyOf(url))) resolve(keyOf(url));
        else if (!unsettled) resolve(undefined);
      });
  });
//? The reload list alone cannot stop a 404 a reload does not fix: each load would claim the next chunk, and past 32
//? the first again. That loop stays on the path the reload loaded, which a refresh or a shallow update keeps, so after
//? any reload, the user's or `Reconnect`'s too, only a page navigation to another path probes again.
const reloadedPathname = window.location.pathname;
const onReloadedPath = () =>
  window.location.pathname === reloadedPathname &&
  (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload";
//? A document navigation the router never sees (a plain link, a form post, `location.assign`) fires one of these; they
//? are heard only while the probe is out, since a `beforeunload` listener used to keep a page out of the bfcache.
const unloadEvents = ["beforeunload", "pagehide"] as const;
//? Only a 404 says this origin no longer serves the chunk; a network failure, a blocked request or a 5xx can pass. A
//? named chunk that is served can import a gone one statically, which only the page's failed fetches name.
export const ifLazyChunkGone = (error: unknown, then: (key: string) => void): void => {
  if (!(error instanceof TypeError) || chunkLoadFailures.has(error) || !navigator.onLine) return;
  const { message } = error;
  const named = namedFetchFailure.test(message)
    ? (ownClientUrlOf(message.slice(message.lastIndexOf(" ") + 1))?.href ?? null)
    : null;
  if ((!named && message !== unnamedFetchFailure) || onReloadedPath()) return;
  let unloading = false;
  const unload = () => {
    unloading = true;
  };
  for (const type of unloadEvents) window.addEventListener(type, unload);
  void (async () => {
    const key =
      (await unclaimedGoneKey(named ? [named] : [], () => `import() ${message}`)) ??
      (await unclaimedGoneKey(fallbackChunksFor(named), (gone) => `import() ${message} ${gone}`));
    for (const type of unloadEvents) window.removeEventListener(type, unload);
    if (key && !unloading) then(key);
  })();
};

//? React's own fallback where `reportError` is missing (Chromium before 95): `window.onerror` trackers still see it.
const reportGlobalError = (error: unknown): void => {
  if (typeof reportError === "function") {
    reportError(error);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (window.dispatchEvent(new ErrorEvent("error", { bubbles: true, cancelable: true, message, error })))
    console.error(error);
};

//? Passing these drops React's production defaults, so they repeat them; `akan start` keeps its development ones.
export const reportingRootErrors = (onError: (error: unknown) => void) => ({
  onCaughtError: (error: unknown) => {
    console.error(error);
    onError(error);
  },
  onUncaughtError: (error: unknown) => {
    reportGlobalError(error);
    onError(error);
  },
});

//? Per tab and synchronous, which akanjs/client `storage` (localStorage, async) is not; unrecorded, it never reloads.
const chunkReloadsKey = "akan.rsc.chunkReloads";
const claimedChunkReloads = (): string[] => JSON.parse(sessionStorage.getItem(chunkReloadsKey) ?? "[]") as string[];
const isChunkReloadClaimed = (chunkId: string): boolean => {
  try {
    return claimedChunkReloads().includes(chunkId);
  } catch {
    return false;
  }
};
export function claimChunkReload(chunkId: string): boolean {
  try {
    const reloaded = claimedChunkReloads();
    if (reloaded.includes(chunkId)) return false;
    sessionStorage.setItem(chunkReloadsKey, JSON.stringify([...reloaded, chunkId].slice(-32)));
    return true;
  } catch {
    return false;
  }
}

//? Not `typeof process`: the define replaces only this member read, and a browser has no `process` to test.
export const isBuildBundle = (): boolean => {
  try {
    return process.env.AKAN_BUNDLE_COMMAND === "build";
  } catch {
    return false;
  }
};
