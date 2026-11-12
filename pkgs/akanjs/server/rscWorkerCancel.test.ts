import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const suspendingPath = "/en/suspending";

const withCancelWorker = async (run: (rsc: RscWorker) => Promise<void>) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "rendercancel",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    AKAN_MEMORY_LOG_INTERVAL_MS: "20",
    AKAN_RSC_RESULT_CACHE: "1",
    AKAN_RSC_RESULT_CACHE_PATHS: suspendingPath,
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerCancel.fixture.tsx"),
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

const renderStream = async (rsc: RscWorker, pathname: string) => {
  const result = await rsc.renderWithMeta(new Request(`http://localhost${pathname}`));
  if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
  return result;
};

const settledRenders = async (rsc: RscWorker, count: number) => {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const metrics = rsc.getMetrics();
    const settled = metrics.rscRenderCount === count && metrics.rscInFlightRenderCount === 0;
    if (settled || Date.now() > deadline) return metrics;
    await Bun.sleep(10);
  }
};

describe("RscWorker render cancel", () => {
  test("stores nothing for a render the host cancels mid-stream, so the next visitor gets the whole page", async () => {
    await withCancelWorker(async (rsc) => {
      const cancelled = await renderStream(rsc, suspendingPath);
      expect(cancelled.trace?.cache).toBe("miss");
      const reader = cancelled.stream.getReader();
      expect((await reader.read()).done).toBe(false);
      await reader.cancel();
      expect((await settledRenders(rsc, 1)).rscResultCacheEntries).toBe(0);

      const next = await renderStream(rsc, suspendingPath);
      expect(next.trace?.cache).toBe("miss");
      expect(await new Response(next.stream).text()).toContain("late content");
    });
  }, 20_000);

  test("keeps nothing of a cancel that arrives after the render ended", async () => {
    await withCancelWorker(async (rsc) => {
      const ended = await renderStream(rsc, "/en/plain");
      expect(await new Response(ended.stream).text()).toContain("plain content");
      ended.cancel();
      //? The worker handles messages in order, so it has handled the cancel by the time it starts the next render.
      const next = await renderStream(rsc, "/en/plain");
      expect(await new Response(next.stream).text()).toContain("plain content");
      expect((await settledRenders(rsc, 2)).rscInFlightRenderCount).toBe(0);
    });
  }, 20_000);
});
