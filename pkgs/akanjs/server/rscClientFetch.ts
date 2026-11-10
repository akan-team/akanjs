import { hasRscRouteHead } from "../client/rscRoutePatch";
import {
  AKAN_RSC_IMPORT_MAP_HEADER,
  AKAN_RSC_NOT_FOUND_HEADER,
  AKAN_RSC_PREFETCH_HEADER,
  AKAN_RSC_ROUTE_HEAD_HEADER,
  type AkanRouterStateV1,
  type AkanRscPatchMetadata,
  appendAkanRouterStateRequestHeaders,
  isAkanRscPartialCommitEnabled,
  readAkanRscPatchMetadataResponseHeaders,
} from "./routeState";

export type RscClientFetchResponseResult =
  | { type: "response"; response: Response; notFound?: boolean }
  | { type: "patch"; response: Response; patch: AkanRscPatchMetadata }
  | { type: "not-found" }
  | { type: "redirected"; status?: number };

const rscEndpointOf = (href: string, buildId?: number) => {
  const endpoint = new URL("/__rsc", window.location.origin);
  endpoint.searchParams.set("url", href);
  if (buildId !== undefined) endpoint.searchParams.set("buildId", String(buildId));
  return endpoint;
};

const rscRequestHeaders = () => {
  const headers = new Headers({ Accept: "text/x-component", "Cache-Control": "no-cache" });
  const importMapKey = (globalThis as { __AKAN_IMPORT_MAP_KEY__?: string }).__AKAN_IMPORT_MAP_KEY__;
  if (importMapKey) headers.set(AKAN_RSC_IMPORT_MAP_HEADER, importMapKey);
  return headers;
};

//? Cut only after the headers: a rotated single-use refresh token in their Set-Cookie must still reach the browser.
const fetchKeepingHeaders = async (endpoint: URL, init: RequestInit, signal: AbortSignal | undefined) => {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const response = await fetch(endpoint, { ...init, signal: controller.signal });
  const cut = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    cut();
    signal.throwIfAborted();
  }
  signal?.addEventListener("abort", cut, { once: true });
  return response;
};

//? Without the router state: the page the prefetch leaves from may not be the one the click leaves from, so only a
//? whole payload is valid for both.
export const fetchRscPrefetchResponse = (href: string, signal: AbortSignal) => {
  const headers = rscRequestHeaders();
  headers.set(AKAN_RSC_PREFETCH_HEADER, "1");
  return fetchKeepingHeaders(rscEndpointOf(href), { headers, credentials: "same-origin", cache: "no-store" }, signal);
};

export async function fetchRscNavigationResponse(
  href: string,
  options: {
    buildId?: number;
    currentRouterState: AkanRouterStateV1 | null;
    navigate?: (href: string, options?: { replace?: boolean; scrollToTop?: boolean }) => Promise<void> | void;
    replaceOnRedirect?: () => boolean;
    sendRouterState?: boolean;
    shouldApplyNavigation?: () => boolean;
    signal?: AbortSignal;
    prefetched?: Response;
  },
): Promise<RscClientFetchResponseResult> {
  const shouldApplyNavigation = options.shouldApplyNavigation ?? (() => true);
  const headers = rscRequestHeaders();
  if (options.sendRouterState !== false) {
    appendAkanRouterStateRequestHeaders(headers, options.currentRouterState);
    //? Only a client built with partial commit applies a patch; one built without would refetch the page whole.
    if (isAkanRscPartialCommitEnabled() && hasRscRouteHead()) headers.set(AKAN_RSC_ROUTE_HEAD_HEADER, "1");
  }
  const response =
    options.prefetched ??
    (await fetchKeepingHeaders(
      rscEndpointOf(href, options.buildId),
      { headers, credentials: "same-origin", cache: "no-store" },
      options.signal,
    ));
  const redirect = response.headers.get("X-Akan-Redirect");
  if (redirect) {
    const method = response.headers.get("X-Akan-Redirect-Method");
    const statusHeader = response.headers.get("X-Akan-Redirect-Status");
    const status = statusHeader ? Number(statusHeader) : undefined;
    const replace = method !== "push" && (options.replaceOnRedirect?.() ?? true);
    if (shouldApplyNavigation()) await options.navigate?.(redirect, { replace, scrollToTop: true });
    return { type: "redirected", status };
  }
  if (response.status === 404) {
    // A view is a whole document whatever patch its trace names; a bare 404 carries `0:null`, a Flight root of null
    // that would commit an empty tree over the document if decoded.
    if (response.headers.get(AKAN_RSC_NOT_FOUND_HEADER) === "view")
      return { type: "response", response, notFound: true };
    await response.body?.cancel();
    return { type: "not-found" };
  }
  if (response.headers.get("X-Akan-Rsc-Partial") === "patch") {
    const patch = readAkanRscPatchMetadataResponseHeaders(response.headers);
    if (options.sendRouterState === false) throw new Error("[rscClient] RSC full fallback returned a patch response");
    if (!patch) {
      await response.body?.cancel();
      return fetchRscNavigationResponse(href, {
        ...options,
        prefetched: undefined,
        sendRouterState: false,
      });
    }
    return { type: "patch", response, patch };
  }
  return { type: "response", response };
}
