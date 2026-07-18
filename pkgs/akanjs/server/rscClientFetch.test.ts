import { afterEach, describe, expect, test } from "bun:test";
import {
  AKAN_RSC_CURRENT_STATE_HEADER,
  AKAN_RSC_PATCH_SEGMENT_PATH_HEADER,
  AKAN_RSC_PATCH_START_INDEX_HEADER,
  AKAN_RSC_PATCH_START_SEGMENT_HEADER,
  AKAN_RSC_STATE_VERSION_HEADER,
  type AkanRouterStateV1,
  encodeAkanRscPatchSegmentPath,
} from "./routeState";
import { fetchRscNavigationResponse } from "./rscClientFetch";
import { RSC_CONTENT_TYPE } from "./rscHttp";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
});

describe("fetchRscNavigationResponse", () => {
  test("returns patch payloads with metadata for P10c-1a shadow validation", async () => {
    Object.defineProperty(globalThis, "window", {
      value: { location: { origin: "https://example.test" } },
      configurable: true,
    });
    const currentRouterState: AkanRouterStateV1 = {
      version: 1,
      buildId: 3,
      href: "https://example.test/docs/intro",
      routeId: "/docs/intro",
      segments: [
        { kind: "root-layout", path: "/", key: "root:/:0" },
        { kind: "layout", path: "/docs", key: "layout:/docs:1" },
        { kind: "page", path: "/docs/intro", key: "page:/docs/intro:2" },
      ],
    };
    const requests: { url: string; headers: Headers }[] = [];
    let patchPayloadCancelled = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      if (requests.length === 1) {
        return new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              patchPayloadCancelled = true;
            },
          }),
          {
            headers: {
              "X-Akan-Rsc-Partial": "patch",
              [AKAN_RSC_PATCH_START_INDEX_HEADER]: "2",
              [AKAN_RSC_PATCH_SEGMENT_PATH_HEADER]: encodeAkanRscPatchSegmentPath([
                "root:/:0",
                "layout:/docs:1",
                "page:/docs/api:2",
              ]),
              [AKAN_RSC_PATCH_START_SEGMENT_HEADER]: "page:/docs/api:2",
            },
          },
        );
      }
      throw new Error("unexpected full fallback retry");
    }) as typeof fetch;

    const result = await fetchRscNavigationResponse("https://example.test/docs/api", { currentRouterState });

    expect(result.type).toBe("patch");
    expect(patchPayloadCancelled).toBe(false);
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).searchParams.get("url")).toBe("https://example.test/docs/api");
    expect(requests[0].headers.get(AKAN_RSC_STATE_VERSION_HEADER)).toBe("1");
    expect(requests[0].headers.get(AKAN_RSC_CURRENT_STATE_HEADER)).toBeTruthy();
    if (result.type !== "patch") return;
    expect(result.patch).toEqual({
      patchStartIndex: 2,
      patchStartSegmentKey: "page:/docs/api:2",
      segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs/api:2"],
    });
  });

  test("retries malformed patch responses without router state for full fallback", async () => {
    Object.defineProperty(globalThis, "window", {
      value: { location: { origin: "https://example.test" } },
      configurable: true,
    });
    const currentRouterState: AkanRouterStateV1 = {
      version: 1,
      buildId: 3,
      href: "https://example.test/docs/intro",
      routeId: "/docs/intro",
      segments: [
        { kind: "root-layout", path: "/", key: "root:/:0" },
        { kind: "layout", path: "/docs", key: "layout:/docs:1" },
        { kind: "page", path: "/docs/intro", key: "page:/docs/intro:2" },
      ],
    };
    const requests: { url: string; headers: Headers }[] = [];
    let malformedPatchCancelled = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      if (requests.length === 1) {
        return new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              malformedPatchCancelled = true;
            },
          }),
          { headers: { "X-Akan-Rsc-Partial": "patch" } },
        );
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        { headers: { "Content-Type": RSC_CONTENT_TYPE } },
      );
    }) as typeof fetch;

    const result = await fetchRscNavigationResponse("https://example.test/docs/api", { currentRouterState });

    expect(result.type).toBe("response");
    expect(malformedPatchCancelled).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0].headers.get(AKAN_RSC_STATE_VERSION_HEADER)).toBe("1");
    expect(requests[0].headers.get(AKAN_RSC_CURRENT_STATE_HEADER)).toBeTruthy();
    expect(requests[1].headers.get(AKAN_RSC_STATE_VERSION_HEADER)).toBeNull();
    expect(requests[1].headers.get(AKAN_RSC_CURRENT_STATE_HEADER)).toBeNull();
  });
});
