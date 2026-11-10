import {
  AKAN_RSC_NOT_FOUND_HEADER,
  AKAN_RSC_PATCH_HEAD_SAFE_HEADER,
  AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER,
  AKAN_RSC_PATCH_SEGMENT_PATH_HEADER,
  AKAN_RSC_PATCH_START_INDEX_HEADER,
  AKAN_RSC_PATCH_START_SEGMENT_HEADER,
  AKAN_RSC_RESPONSE_STATE_HEADER,
} from "./routeState";
import type { RscRedirectMethod, RscRedirectStatus, RscRenderResult } from "./rscWorkerHost";
import type { RscTraceMetadata } from "./ssrTypes";

export function createRscRedirectResponse(
  location: string,
  method: RscRedirectMethod,
  status: RscRedirectStatus = 307,
): Response {
  return new Response(JSON.stringify({ type: "redirect", location, method, status }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Akan-Redirect": location,
      "X-Akan-Redirect-Method": method,
      "X-Akan-Redirect-Status": String(status),
    },
  });
}

export function createRscStreamResponse(stream: BodyInit, status = 200): Response {
  return new Response(stream, {
    status,
    headers: {
      "Content-Type": "text/x-component; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function createRscNotFoundFallbackResponse(): Response {
  return createRscStreamResponse("0:null\n", 404);
}

//? Security: the route, pathname and cache headers only explain a render to its developer. In production a missing
//? path would carry them where one a guard refused does not, telling a visitor which paths exist behind the guard.
function appendRscTraceHeaders(headers: Headers, trace: RscTraceMetadata | undefined, explain: boolean): void {
  if (!trace) return;
  if (explain) {
    if (trace.navId) headers.set("X-Akan-Rsc-Nav-Id", trace.navId);
    headers.set("X-Akan-Rsc-Pathname", trace.pathname);
    headers.set("X-Akan-Rsc-Route", trace.routeId);
    headers.set("X-Akan-Rsc-Cache", trace.cache);
    if (trace.cacheReason) headers.set("X-Akan-Rsc-Cache-Reason", trace.cacheReason);
    if (trace.cacheKeyHash) headers.set("X-Akan-Rsc-Cache-Key", trace.cacheKeyHash);
    if (trace.partialReason) headers.set("X-Akan-Rsc-Partial-Reason", trace.partialReason);
    if (trace.partialCommonPrefixLength !== undefined)
      headers.set("X-Akan-Rsc-Partial-Common-Prefix", String(trace.partialCommonPrefixLength));
  }
  if (trace.partial && (explain || trace.partial === "patch")) headers.set("X-Akan-Rsc-Partial", trace.partial);
  if (trace.patchStartIndex !== undefined)
    headers.set(AKAN_RSC_PATCH_START_INDEX_HEADER, String(trace.patchStartIndex));
  if (trace.patchSegmentPath) headers.set(AKAN_RSC_PATCH_SEGMENT_PATH_HEADER, trace.patchSegmentPath);
  if (trace.patchStartSegment) headers.set(AKAN_RSC_PATCH_START_SEGMENT_HEADER, trace.patchStartSegment);
  if (trace.patchHeadSafe) headers.set(AKAN_RSC_PATCH_HEAD_SAFE_HEADER, "1");
  if (trace.patchHeadSnapshot) headers.set(AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER, trace.patchHeadSnapshot);
  if (trace.routeState) headers.set(AKAN_RSC_RESPONSE_STATE_HEADER, trace.routeState);
}

export async function createRscNavigationStreamResponse(
  result: Extract<RscRenderResult, { type: "stream" }>,
  { explain = false }: { explain?: boolean } = {},
): Promise<Response> {
  //? The worker's answer to a prefetch of a page that refuses them, with nothing rendered; a 204 may carry no body.
  if (result.status === 204) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  // A redirect found after Flight bytes left the worker stays in-stream: an Akan digest the client strips before RSDW.
  const response = createRscStreamResponse(result.stream, result.status ?? 200);
  appendRscTraceHeaders(response.headers, result.trace, explain);
  if (result.status === 404) response.headers.set(AKAN_RSC_NOT_FOUND_HEADER, "view");
  return response;
}
