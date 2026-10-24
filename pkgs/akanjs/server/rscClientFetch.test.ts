import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AKAN_RSC_CURRENT_STATE_HEADER,
  AKAN_RSC_NOT_FOUND_HEADER,
  AKAN_RSC_PATCH_SEGMENT_PATH_HEADER,
  AKAN_RSC_PATCH_START_INDEX_HEADER,
  AKAN_RSC_PATCH_START_SEGMENT_HEADER,
  AKAN_RSC_STATE_VERSION_HEADER,
  encodeAkanRscPatchSegmentPath,
} from "./routeState";
import { fetchRscNavigationResponse } from "./rscClientFetch";
import { RSC_CONTENT_TYPE } from "./rscHttp";
import { makeRouterState } from "./rscNavigation.fixture";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: { location: { origin: "https://example.test" } },
    configurable: true,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
});

describe("fetchRscNavigationResponse", () => {
  test("returns patch payloads with metadata for P10c-1a shadow validation", async () => {
    const currentRouterState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
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
    const currentRouterState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
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

  test("follows a replace redirect with a push while the navigation owns no entry yet", async () => {
    globalThis.fetch = (async () =>
      new Response(null, {
        headers: { "X-Akan-Redirect": "/signin", "X-Akan-Redirect-Method": "replace" },
      })) as unknown as typeof fetch;
    const followed: { href: string; replace?: boolean }[] = [];
    const navigate = (href: string, options?: { replace?: boolean }) => {
      followed.push({ href, replace: options?.replace });
    };

    await fetchRscNavigationResponse("https://example.test/private", {
      currentRouterState: null,
      navigate,
      replaceOnRedirect: () => false,
    });
    await fetchRscNavigationResponse("https://example.test/private", {
      currentRouterState: null,
      navigate,
      replaceOnRedirect: () => true,
    });

    expect(followed).toEqual([
      { href: "/signin", replace: false },
      { href: "/signin", replace: true },
    ]);
  });

  test("reports a 404 as not-found and never hands its body to the decoder", async () => {
    let bodyCancelled = false;
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("0:null\n"));
            controller.close();
          },
          cancel() {
            bodyCancelled = true;
          },
        }),
        { status: 404, headers: { "Content-Type": RSC_CONTENT_TYPE } },
      )) as unknown as typeof fetch;

    const result = await fetchRscNavigationResponse("https://example.test/nope", { currentRouterState: null });

    expect(result.type).toBe("not-found");
    expect(bodyCancelled).toBe(true);
  });

  test("hands a rendered not-found view to the decoder whole, even when it carries a patch decision", async () => {
    let bodyCancelled = false;
    const requests: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('0:"vault missing"\n'));
            controller.close();
          },
          cancel() {
            bodyCancelled = true;
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": RSC_CONTENT_TYPE,
            [AKAN_RSC_NOT_FOUND_HEADER]: "view",
            "X-Akan-Rsc-Partial": "patch",
            [AKAN_RSC_PATCH_START_INDEX_HEADER]: "1",
            [AKAN_RSC_PATCH_SEGMENT_PATH_HEADER]: encodeAkanRscPatchSegmentPath(["root:/:0", "page:/vault:1"]),
            [AKAN_RSC_PATCH_START_SEGMENT_HEADER]: "page:/vault:1",
          },
        },
      );
    }) as unknown as typeof fetch;

    const result = await fetchRscNavigationResponse("https://example.test/vault", {
      currentRouterState: makeRouterState("https://example.test/docs/intro", "/docs/intro"),
    });

    expect(result).toMatchObject({ type: "response", notFound: true });
    expect(bodyCancelled).toBe(false);
    expect(requests).toHaveLength(1);
  });
});
