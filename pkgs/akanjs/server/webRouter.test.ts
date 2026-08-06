import { describe, expect, test } from "bun:test";
import { DEFAULT_AKAN_I18N } from "akanjs/common";
import { createRequestStore } from "akanjs/fetch";
import {
  createRouteCacheEntry,
  isPublicRouteCacheableRequest,
  type RouteCacheInvalidation,
  type RouteCacheRenderState,
  resolveRouteCacheStoreTtl,
  shouldStoreRouteCache,
} from "./cachePolicy";
import { encodeAkanRouterState, encodeAkanRscPatchSegmentPath } from "./routeState";
import type { RscRenderResult } from "./rscWorkerHost";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import type { SsrLateRedirect } from "./ssrTypes";
import { type BaseBuildArtifact, defaultAkanImageConfig } from "./types";
import {
  cacheHtmlWhileStreaming,
  cancelStreamForHeadResponse,
  createRscNavigationStreamResponse,
  createRscNotFoundFallbackResponse,
  createRscRedirectResponse,
  createRscStreamResponse,
  DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES,
  isHtmlRouteCachePathAllowed,
  normalizeRscTargetUrlForHostBasePath,
  resolveHtmlRouteCacheStoreTtl,
  WebRouter,
} from "./webRouter";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FullSsrHandler = (req: Request) => Response | Promise<Response>;
type RouteHandler = (req: Request) => Response | Promise<Response>;

interface FakeRscWorker {
  renderCalls: Request[];
  invalidations: Array<string | RouteCacheInvalidation | undefined>;
  ready: Promise<void>;
  renderWithMeta(req: Request): Promise<RscRenderResult>;
  invalidateRouteResultCache(invalidation?: string | RouteCacheInvalidation): void;
  kill(): void;
  reload(): Promise<void>;
  getMetrics(): Record<string, unknown>;
}

function createFakeRscWorker(
  resolveRenderState: (
    req: Request,
    callIndex: number,
  ) => {
    cacheState?: RouteCacheRenderState;
    lateControl?: SsrLateRedirect | null;
    status?: number;
  } = () => ({ cacheState: { cacheable: true, revalidate: 5 } }),
): FakeRscWorker {
  return {
    renderCalls: [],
    invalidations: [],
    ready: Promise.resolve(),
    async renderWithMeta(req) {
      this.renderCalls.push(req);
      const state = resolveRenderState(req, this.renderCalls.length);
      return {
        type: "stream",
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("0:null\n"));
            controller.close();
          },
        }),
        status: state.status,
        lateControl: Promise.resolve(state.lateControl ?? null),
        cacheState: Promise.resolve(state.cacheState ?? { cacheable: true, revalidate: 5 }),
        cancel: () => {},
      };
    },
    invalidateRouteResultCache(invalidation) {
      this.invalidations.push(invalidation);
    },
    kill() {},
    async reload() {},
    getMetrics() {
      return {};
    },
  };
}

function createTestArtifact(): BaseBuildArtifact {
  return {
    rscClientUrl: "/_akan/rsc-client.js",
    vendorMap: {},
    pagesBundlePath: "/tmp/akan-test-pages.js",
    pagesBundleBuildId: 1,
    cssAssets: {},
    domains: [],
    subRoutes: {},
    basePaths: [],
    branches: [],
    i18n: DEFAULT_AKAN_I18N,
    imageConfig: defaultAkanImageConfig,
  };
}

async function withFullSsrCacheHarness<T>(
  run: (input: {
    fullSsr: FullSsrHandler;
    renderEnvRoutes: Record<string, RouteHandler>;
    fakeWorker: FakeRscWorker;
    router: WebRouter;
  }) => Promise<T>,
  options: {
    artifact?: BaseBuildArtifact;
    worker?: FakeRscWorker;
    nodeEnv?: string;
    htmlCacheEnabled?: string;
    htmlCachePaths?: string;
    htmlCacheMaxBodyBytes?: string;
    appDir?: string;
    onRenderInput?: (input: Parameters<SsrFromRscRenderer["render"]>[0]) => void;
  } = {},
): Promise<T> {
  const envSnapshot = {
    NODE_ENV: process.env.NODE_ENV,
    AKAN_PUBLIC_APP_NAME: process.env.AKAN_PUBLIC_APP_NAME,
    AKAN_PUBLIC_REPO_NAME: process.env.AKAN_PUBLIC_REPO_NAME,
    AKAN_PUBLIC_SERVE_DOMAIN: process.env.AKAN_PUBLIC_SERVE_DOMAIN,
    AKAN_PUBLIC_OPERATION_MODE: process.env.AKAN_PUBLIC_OPERATION_MODE,
    AKAN_APP_DIR: process.env.AKAN_APP_DIR,
    AKAN_HTML_RESULT_CACHE: process.env.AKAN_HTML_RESULT_CACHE,
    AKAN_HTML_RESULT_CACHE_PATHS: process.env.AKAN_HTML_RESULT_CACHE_PATHS,
    AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS: process.env.AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS,
    AKAN_HTML_RESULT_CACHE_TTL: process.env.AKAN_HTML_RESULT_CACHE_TTL,
    AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES: process.env.AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES,
  };
  process.env.NODE_ENV = options.nodeEnv ?? "production";
  process.env.AKAN_PUBLIC_APP_NAME = "akan-test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.test";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
  if (options.appDir === undefined) delete process.env.AKAN_APP_DIR;
  else process.env.AKAN_APP_DIR = options.appDir;
  if (options.htmlCacheEnabled === undefined) delete process.env.AKAN_HTML_RESULT_CACHE;
  else process.env.AKAN_HTML_RESULT_CACHE = options.htmlCacheEnabled;
  if (options.htmlCachePaths === undefined) delete process.env.AKAN_HTML_RESULT_CACHE_PATHS;
  else process.env.AKAN_HTML_RESULT_CACHE_PATHS = options.htmlCachePaths;
  delete process.env.AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS;
  process.env.AKAN_HTML_RESULT_CACHE_TTL = "30";
  if (options.htmlCacheMaxBodyBytes === undefined) delete process.env.AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES;
  else process.env.AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES = options.htmlCacheMaxBodyBytes;

  const originalRender = SsrFromRscRenderer.prototype.render;
  let renderCount = 0;
  SsrFromRscRenderer.prototype.render = async (
    input: Parameters<SsrFromRscRenderer["render"]>[0],
  ): Promise<ReadableStream<Uint8Array>> => {
    options.onRenderInput?.(input);
    renderCount += 1;
    const pathname = input.request ? new URL(input.request.url).pathname : "/unknown";
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`<html><body>${pathname}:render-${renderCount}</body></html>`));
        controller.close();
      },
    });
  };

  const fakeWorker = options.worker ?? createFakeRscWorker();
  const router = new WebRouter({
    artifact: options.artifact ?? createTestArtifact(),
    cssBytesByUrl: {},
    rsc: fakeWorker as never,
    seedIndex: { entries: [], globalLayoutFiles: [] },
    upgradeHmrWs: () => false,
  });

  try {
    const { renderEnvRoutes } = await router.initializeRoute();
    const fullSsr = renderEnvRoutes["/*"] as unknown as FullSsrHandler;
    return await run({ fullSsr, renderEnvRoutes: renderEnvRoutes as Record<string, RouteHandler>, fakeWorker, router });
  } finally {
    router.dispose();
    SsrFromRscRenderer.prototype.render = originalRender;
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("WebRouter RSC target normalization", () => {
  test("maps public host paths to the hidden basePath route for RSC navigation", () => {
    const target = new URL("https://akanjs.com/en/docs/intro/quickstart");

    const normalized = normalizeRscTargetUrlForHostBasePath(target, {
      basePath: "akanjs",
      i18n: DEFAULT_AKAN_I18N,
    });

    expect(normalized.url.href).toBe("https://akanjs.com/en/akanjs/docs/intro/quickstart");
    expect(normalized.basePath).toBe("akanjs");
  });

  test("maps debug public paths by matching configured basePath route seeds", () => {
    const target = new URL("https://akanjs-debug.akanjs.com/en/references/cli/overview");

    const normalized = normalizeRscTargetUrlForHostBasePath(target, {
      basePath: null,
      basePaths: ["office", "akanjs", "soft"],
      i18n: DEFAULT_AKAN_I18N,
      seedEntries: [
        {
          routeId: "/:lang/akanjs/references/cli/overview",
          pattern: "/:lang/akanjs/references/cli/overview",
          seeds: [],
        },
      ],
    });

    expect(normalized.url.href).toBe("https://akanjs-debug.akanjs.com/en/akanjs/references/cli/overview");
    expect(normalized.basePath).toBe("akanjs");
  });

  test("does not duplicate an already internal basePath route", () => {
    const target = new URL("https://akanjs.com/en/akanjs/docs/intro/quickstart");

    const normalized = normalizeRscTargetUrlForHostBasePath(target, {
      basePath: "akanjs",
      i18n: DEFAULT_AKAN_I18N,
    });

    expect(normalized.url.href).toBe("https://akanjs.com/en/akanjs/docs/intro/quickstart");
    expect(normalized.basePath).toBe("akanjs");
  });
});

describe("WebRouter sub route host resolution", () => {
  const artifactWithSubRoutes = (): BaseBuildArtifact => ({
    ...createTestArtifact(),
    subRoutes: { soft: ["soft.example.test"] },
    basePaths: ["soft"],
  });

  async function rscBasePathFor(
    headers: Record<string, string>,
    { env }: { env?: string } = {},
  ): Promise<string | null> {
    const previous = process.env.AKAN_SUB_ROUTE_HOSTS;
    if (env === undefined) delete process.env.AKAN_SUB_ROUTE_HOSTS;
    else process.env.AKAN_SUB_ROUTE_HOSTS = env;
    try {
      return await withFullSsrCacheHarness(
        async ({ renderEnvRoutes, fakeWorker }) => {
          await renderEnvRoutes["/__rsc"](new Request("http://internal/__rsc?url=%2Fen%2Fhome", { headers }));
          return fakeWorker.renderCalls[0]?.headers.get("x-base-path") ?? null;
        },
        { artifact: artifactWithSubRoutes() },
      );
    } finally {
      if (previous === undefined) delete process.env.AKAN_SUB_ROUTE_HOSTS;
      else process.env.AKAN_SUB_ROUTE_HOSTS = previous;
    }
  }

  test("falls back to a host injected through AKAN_SUB_ROUTE_HOSTS", async () => {
    await expect(rscBasePathFor({ host: "soft-angelo.try.example.test" })).resolves.toBeNull();
    await expect(
      rscBasePathFor({ host: "soft-angelo.try.example.test" }, { env: "soft=soft-angelo.try.example.test" }),
    ).resolves.toBe("soft");
  });

  test("keeps matching the hosts baked into the artifact", async () => {
    await expect(
      rscBasePathFor({ host: "soft.example.test" }, { env: "soft=soft-angelo.try.example.test" }),
    ).resolves.toBe("soft");
  });

  test("ignores an env basePath this build does not serve", async () => {
    await expect(
      rscBasePathFor({ host: "nope.try.example.test" }, { env: "nope=nope.try.example.test" }),
    ).resolves.toBeNull();
  });

  test("ignores an x-base-path header naming an unknown basePath", async () => {
    await expect(rscBasePathFor({ host: "soft.example.test", "x-base-path": "nonsense" })).resolves.toBe("soft");
    await expect(rscBasePathFor({ host: "akanjs.example.test", "x-base-path": "soft" })).resolves.toBe("soft");
  });
});

describe("WebRouter deep link associations", () => {
  const artifactWithDeepLinks = (): BaseBuildArtifact => ({
    ...createTestArtifact(),
    deepLinkAssociations: [
      {
        targetName: "default",
        appId: "com.minimal.app",
        domains: ["minimal.app"],
        iosTeamId: "TEAMID",
        androidSha256CertFingerprints: ["AA:BB"],
      },
      {
        targetName: "admin",
        appId: "com.minimal.admin",
        domains: ["minimal.app"],
        iosTeamId: "ADMINTEAM",
        androidSha256CertFingerprints: ["CC:DD"],
      },
    ],
  });

  test("serves apple app site association from deep link metadata", async () => {
    await withFullSsrCacheHarness(
      async ({ renderEnvRoutes }) => {
        const response = await renderEnvRoutes["/.well-known/apple-app-site-association"](
          new Request("https://minimal.app/.well-known/apple-app-site-association"),
        );
        expect(response.headers.get("Content-Type")).toContain("application/json");
        await expect(response.json()).resolves.toEqual({
          applinks: {
            apps: [],
            details: [
              { appIDs: ["TEAMID.com.minimal.app"], components: [{ "/": "/*" }] },
              { appIDs: ["ADMINTEAM.com.minimal.admin"], components: [{ "/": "/*" }] },
            ],
          },
        });
      },
      { artifact: artifactWithDeepLinks() },
    );
  });

  test("serves android asset links from deep link metadata", async () => {
    await withFullSsrCacheHarness(
      async ({ renderEnvRoutes }) => {
        const response = await renderEnvRoutes["/.well-known/assetlinks.json"](
          new Request("https://minimal.app/.well-known/assetlinks.json"),
        );
        expect(response.headers.get("Content-Type")).toContain("application/json");
        await expect(response.json()).resolves.toEqual([
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: "com.minimal.app",
              sha256_cert_fingerprints: ["AA:BB"],
            },
          },
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: "com.minimal.admin",
              sha256_cert_fingerprints: ["CC:DD"],
            },
          },
        ]);
      },
      { artifact: artifactWithDeepLinks() },
    );
  });
});

describe("WebRouter RSC redirect response", () => {
  test("uses the Akan RSC redirect envelope with status metadata", async () => {
    const response = createRscRedirectResponse("/target", "push", 308);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Akan-Redirect")).toBe("/target");
    expect(response.headers.get("X-Akan-Redirect-Method")).toBe("push");
    expect(response.headers.get("X-Akan-Redirect-Status")).toBe("308");
    await expect(response.json()).resolves.toEqual({
      type: "redirect",
      location: "/target",
      method: "push",
      status: 308,
    });
  });
});

describe("WebRouter RSC stream response", () => {
  test("preserves 404 status for not-found Flight payloads", async () => {
    const response = createRscStreamResponse("flight", 404);

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/x-component; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("flight");
  });

  test("uses an RSC payload for the not-found fallback response", async () => {
    const response = createRscNotFoundFallbackResponse();

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/x-component; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("0:null\n");
  });

  test("leaves late redirects in the streamed Flight payload for client fallback", async () => {
    const response = await createRscNavigationStreamResponse({
      type: "stream",
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('0:E{"digest":"AKAN_REDIRECT"}\n'));
          controller.close();
        },
      }),
      lateControl: Promise.resolve({ type: "redirect", location: "/target", method: "replace", status: 307 }),
      cacheState: Promise.resolve({ cacheable: false, reason: "late-redirect" }),
      cancel: () => {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/x-component; charset=utf-8");
    expect(response.headers.get("X-Akan-Redirect")).toBeNull();
    await expect(response.text()).resolves.toBe('0:E{"digest":"AKAN_REDIRECT"}\n');
  });

  test("exposes RSC navigation trace metadata on response headers", async () => {
    const response = await createRscNavigationStreamResponse({
      type: "stream",
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("0:null\n"));
          controller.close();
        },
      }),
      trace: {
        navId: "7",
        pathname: "/en/docs",
        routeId: "/:lang/docs",
        cache: "hit",
        cacheReason: "env-opt-out",
        cacheKeyHash: "abc123",
        partial: "patch",
        partialReason: "sibling-page",
        partialCommonPrefixLength: 2,
        patchStartIndex: 2,
        patchSegmentPath: encodeAkanRscPatchSegmentPath(["root:/:0", "layout:/docs:1", "page:/:lang/docs:2"]),
        patchStartSegment: "page:/:lang/docs:2",
        patchHeadSafe: true,
        routeState: encodeAkanRouterState({
          version: 1,
          buildId: 9,
          href: "https://example.test/en/docs",
          routeId: "/:lang/docs",
          segments: [{ kind: "page", path: "/:lang/docs", key: "page:/:lang/docs:0" }],
        }),
      },
      lateControl: Promise.resolve(null),
      cacheState: Promise.resolve({ cacheable: true }),
      cancel: () => {},
    });

    expect(response.headers.get("X-Akan-Rsc-Nav-Id")).toBe("7");
    expect(response.headers.get("X-Akan-Rsc-Pathname")).toBe("/en/docs");
    expect(response.headers.get("X-Akan-Rsc-Route")).toBe("/:lang/docs");
    expect(response.headers.get("X-Akan-Rsc-Cache")).toBe("hit");
    expect(response.headers.get("X-Akan-Rsc-Cache-Reason")).toBe("env-opt-out");
    expect(response.headers.get("X-Akan-Rsc-Cache-Key")).toBe("abc123");
    expect(response.headers.get("X-Akan-Rsc-Partial")).toBe("patch");
    expect(response.headers.get("X-Akan-Rsc-Partial-Reason")).toBe("sibling-page");
    expect(response.headers.get("X-Akan-Rsc-Partial-Common-Prefix")).toBe("2");
    expect(response.headers.get("X-Akan-Rsc-Patch-Start-Index")).toBe("2");
    expect(response.headers.get("X-Akan-Rsc-Patch-Segment-Path")).toBeTruthy();
    expect(response.headers.get("X-Akan-Rsc-Patch-Start-Segment")).toBe("page:/:lang/docs:2");
    expect(response.headers.get("X-Akan-Rsc-Patch-Head-Safe")).toBe("1");
    expect(response.headers.get("X-Akan-Rsc-State")).toBeTruthy();
  });

  test("exposes same-route searchParams patch trace metadata on response headers", async () => {
    const response = await createRscNavigationStreamResponse({
      type: "stream",
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("0:null\n"));
          controller.close();
        },
      }),
      trace: {
        navId: "8",
        pathname: "/en/docs",
        routeId: "/:lang/docs",
        partial: "patch",
        partialReason: "same-route-search-params",
        partialCommonPrefixLength: 3,
        patchStartIndex: 2,
        patchSegmentPath: encodeAkanRscPatchSegmentPath(["root:/:0", "layout:/docs:1", "page:/:lang/docs:2"]),
        patchStartSegment: "page:/:lang/docs:2",
        patchHeadSafe: true,
        routeState: encodeAkanRouterState({
          version: 1,
          buildId: 9,
          href: "https://example.test/en/docs?page=2",
          routeId: "/:lang/docs",
          segments: [
            { kind: "root-layout", path: "/", key: "root:/:0" },
            { kind: "layout", path: "/docs", key: "layout:/docs:1" },
            { kind: "page", path: "/:lang/docs", key: "page:/:lang/docs:2" },
          ],
        }),
      },
      lateControl: Promise.resolve(null),
      cacheState: Promise.resolve({ cacheable: true }),
      cancel: () => {},
    });

    expect(response.headers.get("X-Akan-Rsc-Partial")).toBe("patch");
    expect(response.headers.get("X-Akan-Rsc-Partial-Reason")).toBe("same-route-search-params");
    expect(response.headers.get("X-Akan-Rsc-Partial-Common-Prefix")).toBe("3");
    expect(response.headers.get("X-Akan-Rsc-Patch-Start-Index")).toBe("2");
    expect(response.headers.get("X-Akan-Rsc-Patch-Segment-Path")).toBeTruthy();
    expect(response.headers.get("X-Akan-Rsc-Patch-Start-Segment")).toBe("page:/:lang/docs:2");
    expect(response.headers.get("X-Akan-Rsc-Patch-Head-Safe")).toBe("1");
    expect(response.headers.get("X-Akan-Rsc-State")).toBeTruthy();
  });

  test("streams RSC navigation Flight without waiting for completion", async () => {
    let releaseSecond!: () => void;
    const response = await createRscNavigationStreamResponse({
      type: "stream",
      stream: new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode("first"));
          await new Promise<void>((resolve) => {
            releaseSecond = resolve;
          });
          controller.enqueue(encoder.encode("second"));
          controller.close();
        },
      }),
      lateControl: new Promise(() => {}),
      cacheState: Promise.resolve({ cacheable: true }),
      cancel: () => {},
    });
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const first = await reader?.read();
    expect(first?.done).toBe(false);
    expect(decoder.decode(first?.value)).toBe("first");

    const secondRead = reader?.read();
    const pendingSecond = await Promise.race([secondRead, sleep(20).then(() => null)]);
    expect(pendingSecond).toBeNull();

    releaseSecond();
    const second = await secondRead;
    expect(second?.done).toBe(false);
    expect(decoder.decode(second?.value)).toBe("second");
    await reader?.cancel();
  });

  test("propagates RSC navigation response cancellation to the source stream", async () => {
    let cancelledReason: unknown;
    const response = await createRscNavigationStreamResponse({
      type: "stream",
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("first"));
        },
        cancel(reason) {
          cancelledReason = reason;
        },
      }),
      lateControl: new Promise(() => {}),
      cacheState: Promise.resolve({ cacheable: false, reason: "cancelled" }),
      cancel: () => {},
    });
    const reader = response.body?.getReader();
    const reason = new Error("client disconnected");

    await reader?.read();
    await reader?.cancel(reason);

    expect(cancelledReason).toBe(reason);
  });

  test("preserves RSC navigation status while streaming", async () => {
    const response = await createRscNavigationStreamResponse({
      type: "stream",
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("flight"));
          controller.close();
        },
      }),
      status: 404,
      lateControl: Promise.resolve(null),
      cacheState: Promise.resolve({ cacheable: false, reason: "not-found" }),
      cancel: () => {},
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/x-component; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("flight");
  });
});

describe("WebRouter HTML cache streaming", () => {
  test("uses public route cache identity without mixing TTL into the key", () => {
    const request = new Request("https://example.test/docs?tab=a", {
      headers: {
        "accept-language": "ko",
        cookie: "theme=dark",
        "x-base-path": "akanjs",
        "x-locale": "ko",
      },
    });
    const url = new URL(request.url);

    expect(isPublicRouteCacheableRequest(request)).toBe(true);
    expect(isPublicRouteCacheableRequest(new Request(request, { headers: { authorization: "Bearer token" } }))).toBe(
      false,
    );
    expect(
      isPublicRouteCacheableRequest(
        new Request("https://example.test/docs", {
          headers: { cookie: "theme=dark; session=private" },
        }),
      ),
    ).toBe(false);

    const shortTtl = createRouteCacheEntry({ request, url, theme: "dark", ttl: 5 });
    const longTtl = createRouteCacheEntry({ request, url, theme: "dark", ttl: 60 });
    expect(shortTtl.key).toBe(longTtl.key);
    expect(shortTtl.ttl).toBe(5);
    expect(longTtl.ttl).toBe(60);
  });

  test("blocks route cache writes for dynamic request APIs and render controls", () => {
    const dynamicState = shouldStoreRouteCache({
      policy: { routeId: "/docs", revalidate: 60, tags: new Set(["docs"]) },
      dynamicUsage: { headers: true, cookies: false },
    });
    const redirectState = shouldStoreRouteCache({
      policy: { routeId: "/docs", revalidate: 60, tags: new Set(["docs"]) },
      dynamicUsage: { headers: false, cookies: false },
      renderControlType: "redirect",
      lateRedirect: true,
    });

    expect(dynamicState).toEqual({
      cacheable: false,
      routeId: "/docs",
      revalidate: 60,
      tags: ["docs"],
      dynamicUsage: { headers: true, cookies: false },
      reason: "dynamic-request-api",
    });
    expect(redirectState).toEqual({
      cacheable: false,
      routeId: "/docs",
      revalidate: 60,
      tags: ["docs"],
      dynamicUsage: { headers: false, cookies: false },
      reason: "late-redirect",
    });
    expect(resolveRouteCacheStoreTtl(120, { cacheable: true, revalidate: 30 })).toBe(30);
    expect(resolveRouteCacheStoreTtl(120, dynamicState)).toBeNull();
    expect(resolveRouteCacheStoreTtl(120, { cacheable: true, revalidate: false })).toBeNull();
  });

  test("uses shared allow and deny semantics for HTML cache paths", () => {
    const env = {
      AKAN_HTML_RESULT_CACHE_PATHS: " /docs, /blog ",
      AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS: "/docs/private",
    };

    expect(isHtmlRouteCachePathAllowed("/docs", env)).toBe(true);
    expect(isHtmlRouteCachePathAllowed("/docs/intro", env)).toBe(true);
    expect(isHtmlRouteCachePathAllowed("/docs-private", env)).toBe(false);
    expect(isHtmlRouteCachePathAllowed("/docs/private", env)).toBe(false);
    expect(isHtmlRouteCachePathAllowed("/docs/private/child", env)).toBe(false);
    expect(isHtmlRouteCachePathAllowed("/docs/private-ish", env)).toBe(true);
    expect(isHtmlRouteCachePathAllowed("/other", env)).toBe(false);
    expect(isHtmlRouteCachePathAllowed("/other", {}, { defaultAllow: true })).toBe(true);
  });

  test("passes through the first chunk before caching the completed HTML", async () => {
    let cachedHtml = "";
    const stream = cacheHtmlWhileStreaming(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode("<html>first"));
          await sleep(20);
          controller.enqueue(encoder.encode("second</html>"));
          controller.close();
        },
      }),
      (html) => {
        cachedHtml = html;
      },
    );
    const reader = stream.getReader();

    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(decoder.decode(first.value)).toBe("<html>first");
    expect(cachedHtml).toBe("");

    let rest = "";
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      rest += decoder.decode(next.value);
    }

    expect(rest).toBe("second</html>");
    expect(cachedHtml).toBe("<html>firstsecond</html>");
  });

  test("passes through completed HTML but skips caching when a late redirect is observed", async () => {
    let cachedHtml = "";
    const stream = cacheHtmlWhileStreaming(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("<html>redirect</html>"));
          controller.close();
        },
      }),
      (html) => {
        cachedHtml = html;
      },
      {
        shouldCache: () => Promise.resolve(false),
      },
    );

    await expect(new Response(stream).text()).resolves.toBe("<html>redirect</html>");
    expect(cachedHtml).toBe("");
  });

  test("waits for the cache decision before writing completed HTML", async () => {
    let cachedHtml = "";
    let storeTtl = 30;
    let observedStoreTtl = 0;
    const stream = cacheHtmlWhileStreaming(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("<html>cache</html>"));
          controller.close();
        },
      }),
      (html) => {
        cachedHtml = html;
        observedStoreTtl = storeTtl;
      },
      {
        shouldCache: async () => {
          await sleep(0);
          storeTtl = 5;
          return true;
        },
      },
    );

    await expect(new Response(stream).text()).resolves.toBe("<html>cache</html>");
    expect(cachedHtml).toBe("<html>cache</html>");
    expect(observedStoreTtl).toBe(5);
  });

  test("combines worker and host cache state before writing HTML", () => {
    const hostStore = createRequestStore(new Request("https://example.test/cache"));

    expect(
      resolveHtmlRouteCacheStoreTtl({
        baseTtl: 120,
        workerCacheState: { cacheable: true, revalidate: 60 },
        hostRequestStore: hostStore,
      }),
    ).toBe(60);

    hostStore.policy.revalidate = 30;
    expect(
      resolveHtmlRouteCacheStoreTtl({
        baseTtl: 120,
        workerCacheState: { cacheable: true, revalidate: 60 },
        hostRequestStore: hostStore,
      }),
    ).toBe(30);

    hostStore.dynamicUsage.headers = true;
    expect(
      resolveHtmlRouteCacheStoreTtl({
        baseTtl: 120,
        workerCacheState: { cacheable: true, revalidate: 60 },
        hostRequestStore: hostStore,
      }),
    ).toBeNull();
    hostStore.dynamicUsage.headers = false;
    expect(
      resolveHtmlRouteCacheStoreTtl({
        baseTtl: 120,
        workerCacheState: { cacheable: true, revalidate: 60 },
        hostRequestStore: hostStore,
        lateControl: { type: "redirect" },
      }),
    ).toBeNull();
  });

  test("blocks HTML cache writes for worker controls and host dynamic usage", () => {
    const hostStore = createRequestStore(new Request("https://example.test/cache"));
    const notFoundTtl = resolveHtmlRouteCacheStoreTtl({
      baseTtl: 120,
      workerCacheState: { cacheable: false, reason: "render-not-found" },
      hostRequestStore: hostStore,
    });
    const errorTtl = resolveHtmlRouteCacheStoreTtl({
      baseTtl: 120,
      workerCacheState: { cacheable: false, reason: "render-error" },
      hostRequestStore: hostStore,
    });
    const lateRedirectTtl = resolveHtmlRouteCacheStoreTtl({
      baseTtl: 120,
      workerCacheState: { cacheable: true, revalidate: 60 },
      hostRequestStore: hostStore,
      lateControl: { type: "redirect" },
    });

    expect(notFoundTtl).toBeNull();
    expect(errorTtl).toBeNull();
    expect(lateRedirectTtl).toBeNull();

    const cookieDynamicStore = createRequestStore(new Request("https://example.test/cache"));
    cookieDynamicStore.dynamicUsage.cookies = true;
    const cookieDynamicTtl = resolveHtmlRouteCacheStoreTtl({
      baseTtl: 120,
      workerCacheState: { cacheable: true, revalidate: 60 },
      hostRequestStore: cookieDynamicStore,
    });

    expect(cookieDynamicTtl).toBeNull();
  });

  test("passes through completed HTML but skips caching when the body cap is exceeded", async () => {
    let cachedHtml = "";
    let skipReason: string | undefined;
    const stream = cacheHtmlWhileStreaming(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("<html>too-large</html>"));
          controller.close();
        },
      }),
      (html) => {
        cachedHtml = html;
      },
      {
        maxBodyBytes: 4,
        onSkip: (reason) => {
          skipReason = reason;
        },
      },
    );

    await expect(new Response(stream).text()).resolves.toBe("<html>too-large</html>");
    expect(cachedHtml).toBe("");
    expect(skipReason).toBe("body-too-large");
    expect(DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES).toBeGreaterThan(0);
  });

  test("cancels the unused HTML stream for HEAD responses", async () => {
    let cancelledReason: unknown;
    const reason = new Error("HEAD response does not consume body");
    const stream = new ReadableStream<Uint8Array>({
      cancel(actualReason) {
        cancelledReason = actualReason;
      },
    });

    cancelStreamForHeadResponse(stream, reason);
    await sleep(0);

    expect(cancelledReason).toBe(reason);
  });
});

describe("WebRouter full SSR cache orchestration", () => {
  test("treats client-aborted SSR renders as closed requests instead of fatal errors", async () => {
    const worker: FakeRscWorker = {
      ...createFakeRscWorker(),
      async renderWithMeta() {
        throw new Error("The connection was closed.");
      },
    };

    await withFullSsrCacheHarness(
      async ({ fullSsr }) => {
        const response = await fullSsr(new Request("https://example.test/docs"));

        expect(response.status).toBe(499);
        expect(await response.text()).toBe("");
      },
      { worker },
    );
  });

  test("injects the initial RSC route state into the client bootstrap", async () => {
    const encodedState = encodeAkanRouterState({
      version: 1,
      buildId: 1,
      href: "https://example.test/docs",
      routeId: "/docs",
      segments: [{ kind: "page", path: "/docs", key: "page:/docs:0" }],
    });
    const worker = createFakeRscWorker(() => ({ cacheState: { cacheable: true, revalidate: 5 } }));
    const originalRenderWithMeta = worker.renderWithMeta.bind(worker);
    worker.renderWithMeta = async (req) => {
      const result = await originalRenderWithMeta(req);
      if (result.type !== "stream") return result;
      return {
        ...result,
        trace: {
          pathname: new URL(req.url).pathname,
          routeId: "/docs",
          cache: "bypass",
          routeState: encodedState,
        },
      };
    };
    const bootstrapInlines: Array<string | undefined> = [];

    await withFullSsrCacheHarness(
      async ({ fullSsr }) => {
        await fullSsr(new Request("https://example.test/docs"));
      },
      {
        worker,
        onRenderInput: (input) => bootstrapInlines.push(input.extraBootstrapInline),
      },
    );

    expect(bootstrapInlines[0]).toContain(`self.__AKAN_RSC_INITIAL_STATE__=${JSON.stringify(encodedState)};`);
  });

  test("renders worker not-found streams as full document 404 responses", async () => {
    const fakeWorker = createFakeRscWorker(() => ({
      status: 404,
      cacheState: { cacheable: false, reason: "render-not-found" },
    }));

    await withFullSsrCacheHarness(
      async ({ fullSsr }) => {
        const response = await fullSsr(new Request("https://example.test/docs/missing"));

        expect(response.status).toBe(404);
        expect(response.headers.get("X-Akan-Cache")).toBeNull();
        await expect(response.text()).resolves.toContain("/docs/missing:render-1");
      },
      { worker: fakeWorker },
    );
  });

  test("uses the host system page only when worker not-found fallback rendering is unavailable", async () => {
    const fakeWorker: FakeRscWorker = {
      ...createFakeRscWorker(),
      async renderWithMeta(req) {
        this.renderCalls.push(req);
        return { type: "not-found" };
      },
    };

    await withFullSsrCacheHarness(
      async ({ fullSsr, fakeWorker }) => {
        const response = await fullSsr(new Request("https://example.test/docs/missing"));

        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toContain("no-store");
        await expect(response.text()).resolves.toContain("Page not found");
        expect(fakeWorker.renderCalls).toHaveLength(1);
      },
      { worker: fakeWorker },
    );
  });

  test("stores completed full SSR HTML and serves the next request from cache", async () => {
    await withFullSsrCacheHarness(async ({ fullSsr, fakeWorker }) => {
      const first = await fullSsr(new Request("https://example.test/docs"));
      expect(first.headers.get("X-Akan-Cache")).toBe("MISS");
      const firstHtml = await first.text();
      expect(firstHtml).toContain("/docs:render-1");
      expect(fakeWorker.renderCalls).toHaveLength(1);

      const second = await fullSsr(new Request("https://example.test/docs"));
      expect(second.headers.get("X-Akan-Cache")).toBe("HIT");
      await expect(second.text()).resolves.toBe(firstHtml);
      expect(fakeWorker.renderCalls).toHaveLength(1);
    });
  });

  test("keeps production HTML cache on by default and allows explicit env opt-out", async () => {
    await withFullSsrCacheHarness(async ({ fullSsr, fakeWorker }) => {
      const first = await fullSsr(new Request("https://example.test/uncurated"));
      expect(first.headers.get("X-Akan-Cache")).toBe("MISS");
      await first.text();

      const second = await fullSsr(new Request("https://example.test/uncurated"));
      expect(second.headers.get("X-Akan-Cache")).toBe("HIT");
      await second.text();
      expect(fakeWorker.renderCalls).toHaveLength(1);
    });

    await withFullSsrCacheHarness(
      async ({ fullSsr, fakeWorker }) => {
        const first = await fullSsr(new Request("https://example.test/uncurated"));
        expect(first.headers.get("X-Akan-Cache")).toBe("BYPASS");
        expect(first.headers.get("X-Akan-Cache-Reason")).toBe("env-opt-out");
        await first.text();

        const second = await fullSsr(new Request("https://example.test/uncurated"));
        expect(second.headers.get("X-Akan-Cache")).toBe("BYPASS");
        await second.text();
        expect(fakeWorker.renderCalls).toHaveLength(2);
      },
      { htmlCacheEnabled: "0" },
    );
  });

  test("does not populate HTML cache from HEAD responses", async () => {
    await withFullSsrCacheHarness(async ({ fullSsr, fakeWorker }) => {
      const head = await fullSsr(new Request("https://example.test/docs/head", { method: "HEAD" }));
      expect(head.headers.get("X-Akan-Cache")).toBe("BYPASS");
      expect(head.headers.get("X-Akan-Cache-Reason")).toBe("request-not-public");
      await head.text();

      const get = await fullSsr(new Request("https://example.test/docs/head"));
      expect(get.headers.get("X-Akan-Cache")).toBe("MISS");
      await expect(get.text()).resolves.toContain("/docs/head:render-2");
      expect(fakeWorker.renderCalls).toHaveLength(2);
    });
  });

  test("does not store full SSR HTML when the body cap is exceeded", async () => {
    await withFullSsrCacheHarness(
      async ({ fullSsr, fakeWorker }) => {
        const first = await fullSsr(new Request("https://example.test/docs/large"));
        expect(first.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(first.text()).resolves.toContain("/docs/large:render-1");

        const second = await fullSsr(new Request("https://example.test/docs/large"));
        expect(second.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(second.text()).resolves.toContain("/docs/large:render-2");
        expect(fakeWorker.renderCalls).toHaveLength(2);
      },
      { htmlCacheMaxBodyBytes: "4" },
    );
  });

  test("does not store full SSR HTML when worker cache state is uncacheable", async () => {
    const fakeWorker = createFakeRscWorker(() => ({
      cacheState: { cacheable: false, reason: "dynamic-request-api" },
    }));

    await withFullSsrCacheHarness(
      async ({ fullSsr }) => {
        const first = await fullSsr(new Request("https://example.test/docs/dynamic"));
        expect(first.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(first.text()).resolves.toContain("/docs/dynamic:render-1");

        const second = await fullSsr(new Request("https://example.test/docs/dynamic"));
        expect(second.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(second.text()).resolves.toContain("/docs/dynamic:render-2");
        expect(fakeWorker.renderCalls).toHaveLength(2);
      },
      { worker: fakeWorker },
    );
  });

  test("does not store full SSR HTML when a late redirect is observed", async () => {
    const fakeWorker = createFakeRscWorker(() => ({
      cacheState: { cacheable: true, revalidate: 5 },
      lateControl: { type: "redirect", location: "/login", method: "replace", status: 307 },
    }));

    await withFullSsrCacheHarness(
      async ({ fullSsr }) => {
        const first = await fullSsr(new Request("https://example.test/docs/redirect"));
        expect(first.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(first.text()).resolves.toContain("/docs/redirect:render-1");

        const second = await fullSsr(new Request("https://example.test/docs/redirect"));
        expect(second.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(second.text()).resolves.toContain("/docs/redirect:render-2");
        expect(fakeWorker.renderCalls).toHaveLength(2);
      },
      { worker: fakeWorker },
    );
  });

  test("clears host HTML cache and forwards worker invalidation through the internal hook", async () => {
    await withFullSsrCacheHarness(async ({ fullSsr, fakeWorker, router }) => {
      const first = await fullSsr(new Request("https://example.test/docs/invalidate"));
      expect(first.headers.get("X-Akan-Cache")).toBe("MISS");
      await first.text();

      const second = await fullSsr(new Request("https://example.test/docs/invalidate"));
      expect(second.headers.get("X-Akan-Cache")).toBe("HIT");
      await second.text();
      expect(fakeWorker.renderCalls).toHaveLength(1);

      router.invalidateRouteCaches("manual");
      expect(fakeWorker.invalidations).toEqual(["manual"]);

      const third = await fullSsr(new Request("https://example.test/docs/invalidate"));
      expect(third.headers.get("X-Akan-Cache")).toBe("MISS");
      await expect(third.text()).resolves.toContain("/docs/invalidate:render-2");
      expect(fakeWorker.renderCalls).toHaveLength(2);
    });
  });

  test("invalidates only matching HTML cache entries by tag", async () => {
    const fakeWorker = createFakeRscWorker((req) => {
      const pathname = new URL(req.url).pathname;
      return {
        cacheState: {
          cacheable: true,
          routeId: pathname,
          revalidate: 30,
          tags: pathname.startsWith("/docs") ? ["docs"] : ["blog"],
        },
      };
    });

    await withFullSsrCacheHarness(
      async ({ fullSsr, router }) => {
        const docsFirst = await fullSsr(new Request("https://example.test/docs/tagged"));
        expect(docsFirst.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(docsFirst.text()).resolves.toContain("/docs/tagged:render-1");

        const blogFirst = await fullSsr(new Request("https://example.test/blog/tagged"));
        expect(blogFirst.headers.get("X-Akan-Cache")).toBe("MISS");
        const blogHtml = await blogFirst.text();
        expect(blogHtml).toContain("/blog/tagged:render-2");

        const docsHit = await fullSsr(new Request("https://example.test/docs/tagged"));
        expect(docsHit.headers.get("X-Akan-Cache")).toBe("HIT");
        await docsHit.text();
        const blogHit = await fullSsr(new Request("https://example.test/blog/tagged"));
        expect(blogHit.headers.get("X-Akan-Cache")).toBe("HIT");
        await expect(blogHit.text()).resolves.toBe(blogHtml);

        router.invalidateRouteCaches({ tags: ["docs"], reason: "manual" });
        expect(fakeWorker.invalidations).toEqual([{ tags: ["docs"], reason: "manual" }]);

        const docsAfterInvalidate = await fullSsr(new Request("https://example.test/docs/tagged"));
        expect(docsAfterInvalidate.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(docsAfterInvalidate.text()).resolves.toContain("/docs/tagged:render-3");

        const blogAfterInvalidate = await fullSsr(new Request("https://example.test/blog/tagged"));
        expect(blogAfterInvalidate.headers.get("X-Akan-Cache")).toBe("HIT");
        await expect(blogAfterInvalidate.text()).resolves.toBe(blogHtml);
      },
      { worker: fakeWorker, htmlCachePaths: "/docs,/blog" },
    );
  });

  test("invalidates only matching HTML cache entries by path", async () => {
    const fakeWorker = createFakeRscWorker((req) => {
      const pathname = new URL(req.url).pathname;
      return {
        cacheState: {
          cacheable: true,
          routeId: pathname,
          revalidate: 30,
          tags: [pathname.startsWith("/docs") ? "docs" : "blog"],
        },
      };
    });

    await withFullSsrCacheHarness(
      async ({ fullSsr, router }) => {
        const docsFirst = await fullSsr(new Request("https://example.test/docs/path"));
        expect(docsFirst.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(docsFirst.text()).resolves.toContain("/docs/path:render-1");

        const blogFirst = await fullSsr(new Request("https://example.test/blog/path"));
        expect(blogFirst.headers.get("X-Akan-Cache")).toBe("MISS");
        const blogHtml = await blogFirst.text();
        expect(blogHtml).toContain("/blog/path:render-2");

        const docsHit = await fullSsr(new Request("https://example.test/docs/path"));
        expect(docsHit.headers.get("X-Akan-Cache")).toBe("HIT");
        await docsHit.text();
        const blogHit = await fullSsr(new Request("https://example.test/blog/path"));
        expect(blogHit.headers.get("X-Akan-Cache")).toBe("HIT");
        await expect(blogHit.text()).resolves.toBe(blogHtml);

        router.invalidateRouteCaches({ paths: ["/docs"], reason: "path" });
        expect(fakeWorker.invalidations).toEqual([{ paths: ["/docs"], reason: "path" }]);

        const docsAfterInvalidate = await fullSsr(new Request("https://example.test/docs/path"));
        expect(docsAfterInvalidate.headers.get("X-Akan-Cache")).toBe("MISS");
        await expect(docsAfterInvalidate.text()).resolves.toContain("/docs/path:render-3");

        const blogAfterInvalidate = await fullSsr(new Request("https://example.test/blog/path"));
        expect(blogAfterInvalidate.headers.get("X-Akan-Cache")).toBe("HIT");
        await expect(blogAfterInvalidate.text()).resolves.toBe(blogHtml);
      },
      { worker: fakeWorker, htmlCachePaths: "/docs,/blog" },
    );
  });
});
