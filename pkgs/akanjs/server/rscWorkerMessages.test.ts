import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const withMessagesWorker = async (env: Record<string, string>, run: (rsc: RscWorker) => Promise<void>) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_MEMORY_LOG_INTERVAL_MS: "20",
    ...env,
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerMessages.fixture.tsx"),
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

const until = async (check: () => boolean) => {
  while (!check()) await Bun.sleep(5);
};

const traceOf = async (rsc: RscWorker, url: string) => {
  const result = await rsc.renderWithMeta(new Request(url));
  if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
  await new Response(result.stream).arrayBuffer();
  return result.trace;
};

describe("RscWorker messages", () => {
  test("a cancel ends the render it names while that render still waits on a component", async () => {
    await withMessagesWorker({}, async (rsc) => {
      const result = await rsc.renderWithMeta(new Request("http://localhost/en/pending"));
      if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
      const reader = result.stream.getReader();
      expect((await reader.read()).done).toBe(false);
      await until(() => rsc.getMetrics().rscInFlightRenderCount === 1);

      await reader.cancel();
      await until(() => rsc.getMetrics().rscInFlightRenderCount === 0);
    });
  }, 15_000);

  test("an invalidate-cache drops the stored render, and the counters the worker reports follow", async () => {
    await withMessagesWorker({ AKAN_RSC_RESULT_CACHE: "1", AKAN_RSC_RESULT_CACHE_PATHS: "/en/cached" }, async (rsc) => {
      expect(await traceOf(rsc, "http://localhost/en/cached")).toMatchObject({ cache: "miss" });
      expect(await traceOf(rsc, "http://localhost/en/cached")).toMatchObject({ cache: "hit" });

      rsc.invalidateRouteResultCache("test");
      expect(await traceOf(rsc, "http://localhost/en/cached")).toMatchObject({ cache: "miss" });
      await until(() => {
        const metrics = rsc.getMetrics();
        return metrics.rscResultCacheMisses === 2 && metrics.rscResultCacheEntries === 1;
      });
      expect(rsc.getMetrics().rscResultCacheHits).toBe(1);
    });
  }, 15_000);
});
