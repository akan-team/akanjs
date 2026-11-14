import { describe, expect, test } from "bun:test";
import path from "node:path";
import { decodeAkanRouterState } from "./routeState";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const withCacheWorker = async (run: (rsc: RscWorker) => Promise<void>) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_RSC_RESULT_CACHE: "1",
    AKAN_RSC_RESULT_CACHE_PATHS: "/en,/ko",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscRouteCacheKey.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  try {
    await rsc.ready;
    await run(rsc);
  } finally {
    rsc.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const proxiedRequest = (href: string, acceptLanguage: string) => {
  const [, locale = "", ...rest] = new URL(href, "http://localhost").pathname.split("/");
  return new Request(`http://localhost${href}`, {
    headers: { "accept-language": acceptLanguage, "x-locale": locale, "x-path": `/${rest.join("/")}` },
  });
};

const renderOf = async (rsc: RscWorker, request: Request) => {
  const result = await rsc.renderWithMeta(request);
  if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
  const body = await new Response(result.stream).text();
  return { cache: result.trace?.cache, body, href: decodeAkanRouterState(result.trace?.routeState)?.href };
};

describe("route cache key", () => {
  test("two visitors asking in different languages for one locale's page share its entry", async () => {
    await withCacheWorker(async (rsc) => {
      const korean = await renderOf(rsc, proxiedRequest("/ko/plain", "ko-KR,ko;q=0.9"));
      const english = await renderOf(rsc, proxiedRequest("/ko/plain", "en-US,en;q=0.8"));

      expect(korean.cache).toBe("miss");
      expect(english.cache).toBe("hit");
      expect(english.body).toBe(korean.body);
    });
  }, 15_000);

  test("pages that resolve to different locales keep separate entries", async () => {
    await withCacheWorker(async (rsc) => {
      expect((await renderOf(rsc, proxiedRequest("/ko/plain", "ko"))).cache).toBe("miss");
      expect((await renderOf(rsc, proxiedRequest("/en/plain", "ko"))).cache).toBe("miss");
      expect((await renderOf(rsc, proxiedRequest("/en/plain", "en"))).cache).toBe("hit");
    });
  }, 15_000);

  test("a page that reads the request's Accept-Language renders for each reader", async () => {
    await withCacheWorker(async (rsc) => {
      const korean = await renderOf(rsc, proxiedRequest("/en/language", "ko"));
      const english = await renderOf(rsc, proxiedRequest("/en/language", "en"));

      expect(korean.body).toContain("language=ko");
      expect(english.cache).toBe("miss");
      expect(english.body).toContain("language=en");
    });
  }, 15_000);
});

describe("route cache query", () => {
  test("requests that differ only in parameter order or a tracking parameter share one entry", async () => {
    await withCacheWorker(async (rsc) => {
      const first = await renderOf(rsc, proxiedRequest("/en/plain?b=2&a=1", "en"));
      const reordered = await renderOf(rsc, proxiedRequest("/en/plain?a=1&b=2", "en"));
      const tracked = await renderOf(rsc, proxiedRequest("/en/plain?utm_source=news&a=1&gclid=x1&b=2", "en"));
      const other = await renderOf(rsc, proxiedRequest("/en/plain?a=1&b=3", "en"));

      expect([first.cache, reordered.cache, tracked.cache, other.cache]).toEqual(["miss", "hit", "hit", "miss"]);
      expect(first.href).toBe("http://localhost/en/plain?a=1&b=2");
      expect(tracked.body).toBe(first.body);
    });
  }, 15_000);

  test("a page renders the values it declares while its key leaves out tracking parameters", async () => {
    await withCacheWorker(async (rsc) => {
      const newest = await renderOf(rsc, proxiedRequest("/en/list?sort=new&utm_campaign=spring", "en"));
      const again = await renderOf(rsc, proxiedRequest("/en/list?fbclid=f1&sort=new", "en"));
      const oldest = await renderOf(rsc, proxiedRequest("/en/list?sort=old", "en"));

      expect([newest.cache, again.cache, oldest.cache]).toEqual(["miss", "hit", "miss"]);
      expect(newest.body).toContain("sort=new");
      expect(oldest.body).toContain("sort=old");
    });
  }, 15_000);

  test("a page that sets canonicalQuery false keeps an entry per query as requested", async () => {
    await withCacheWorker(async (rsc) => {
      const first = await renderOf(rsc, proxiedRequest("/en/exact?b=2&a=1", "en"));
      const reordered = await renderOf(rsc, proxiedRequest("/en/exact?a=1&b=2", "en"));
      const tracked = await renderOf(rsc, proxiedRequest("/en/exact?b=2&a=1&utm_source=news", "en"));
      const repeated = await renderOf(rsc, proxiedRequest("/en/exact?b=2&a=1", "en"));

      expect([first.cache, reordered.cache, tracked.cache, repeated.cache]).toEqual(["miss", "miss", "miss", "hit"]);
      expect(first.href).toBe("http://localhost/en/exact?b=2&a=1");
    });
  }, 15_000);

  test("a layout that sets canonicalQuery false covers the pages under it", async () => {
    await withCacheWorker(async (rsc) => {
      expect((await renderOf(rsc, proxiedRequest("/en/archive/item?b=2&a=1", "en"))).cache).toBe("miss");
      expect((await renderOf(rsc, proxiedRequest("/en/archive/item?a=1&b=2", "en"))).cache).toBe("miss");
    });
  }, 15_000);

  test("a page that declares a tracking parameter is keyed on it and renders it", async () => {
    await withCacheWorker(async (rsc) => {
      const news = await renderOf(rsc, proxiedRequest("/en/campaign?utm_source=news", "en"));
      const ads = await renderOf(rsc, proxiedRequest("/en/campaign?utm_source=ads", "en"));

      expect([news.cache, ads.cache]).toEqual(["miss", "miss"]);
      expect(ads.body).toContain("source=ads");
    });
  }, 15_000);

  test("a page without a declared search receives every parameter and is keyed on the query as requested", async () => {
    await withCacheWorker(async (rsc) => {
      const news = await renderOf(rsc, proxiedRequest("/en/legacy?utm_source=news", "en"));
      const ads = await renderOf(rsc, proxiedRequest("/en/legacy?utm_source=ads", "en"));

      expect([news.cache, ads.cache]).toEqual(["miss", "miss"]);
      expect(ads.body).toContain("ads");
    });
  }, 15_000);
});
