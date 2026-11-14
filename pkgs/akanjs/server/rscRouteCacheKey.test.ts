import { describe, expect, test } from "bun:test";
import path from "node:path";
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

const proxiedRequest = (pathname: string, acceptLanguage: string) => {
  const [, locale = "", ...rest] = pathname.split("/");
  return new Request(`http://localhost${pathname}`, {
    headers: { "accept-language": acceptLanguage, "x-locale": locale, "x-path": `/${rest.join("/")}` },
  });
};

const renderOf = async (rsc: RscWorker, request: Request) => {
  const result = await rsc.renderWithMeta(request);
  if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
  const body = await new Response(result.stream).text();
  return { cache: result.trace?.cache, body };
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
