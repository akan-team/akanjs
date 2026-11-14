import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Logger } from "akanjs/common";
import { MetricExposition } from "./metrics/metricExposition";
import type { ServerListener } from "./routing/serverListener";
import { RscWorker } from "./rscWorkerHost";
import { ServerMetrics } from "./serverMetrics";
import type { BaseBuildArtifact } from "./types";
import type { WebRouter } from "./webRouter";

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

const messagesOf = async (rsc: RscWorker, url: string) => {
  const result = await rsc.renderWithMeta(new Request(url));
  if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  return { trace: result.trace, chunks, body: Buffer.concat(chunks) };
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

  test("a stored render replays in one message the bytes it streamed in several, and counts as that many bytes", async () => {
    const env = { AKAN_RSC_RESULT_CACHE: "1", AKAN_RSC_RESULT_CACHE_PATHS: "/en/streamed" };
    await withMessagesWorker(env, async (rsc) => {
      const rendered = await messagesOf(rsc, "http://localhost/en/streamed");
      const replayed = await messagesOf(rsc, "http://localhost/en/streamed");

      expect(rendered.trace).toMatchObject({ cache: "miss" });
      expect(rendered.chunks.length).toBeGreaterThan(1);
      expect(rendered.body.toString()).toContain("late body");
      expect(replayed.trace).toMatchObject({ cache: "hit" });
      expect(replayed.chunks).toHaveLength(1);
      expect(replayed.body.equals(rendered.body)).toBe(true);
      await until(() => rsc.getMetrics().rscResultCacheEntries === 1);
      expect(rsc.getMetrics().rscResultCacheBytes).toBe(rendered.body.byteLength);
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

  test("a counter the worker registers reaches the host's exposition, and its total never drops across a recycle or a crash", async () => {
    await withMessagesWorker({}, async (rsc) => {
      const router = { getMetrics: () => rsc.getMetrics(), metricFamilies: () => rsc.metricFamilies() };
      const host = new ServerMetrics(
        { logger: new Logger("test"), serverMode: "solo" } as unknown as ConstructorParameters<typeof ServerMetrics>[0],
        {} as unknown as ServerListener,
        () => router as unknown as WebRouter,
      );
      const seen: number[] = [];
      const total = () => {
        const family = host.families().find((each) => each.name === "akan_test_counted_renders_total");
        const value = family?.type === "counter" ? family.samples.reduce((sum, sample) => sum + sample.value, 0) : 0;
        seen.push(value);
        return value;
      };
      const replaced = async (restart: (pid: number) => void) => {
        const pid = rsc.getMetrics().rscWorkerPid ?? 0;
        restart(pid);
        await until(() => {
          total();
          return rsc.status === "ready" && rsc.getMetrics().rscWorkerPid !== pid;
        });
      };

      await messagesOf(rsc, "http://localhost/en/counted");
      await messagesOf(rsc, "http://localhost/en/counted");
      await until(() => total() === 2);
      await replaced(() => expect(rsc.restartWhenIdle("test")).toBe(true));
      await messagesOf(rsc, "http://localhost/en/counted");
      await until(() => total() === 3);
      await replaced((pid) => process.kill(pid, "SIGKILL"));
      await messagesOf(rsc, "http://localhost/en/counted");
      await until(() => total() === 4);

      expect(seen.every((value, idx) => idx === 0 || value >= seen[idx - 1])).toBe(true);
      expect(MetricExposition.render(host.families(), "openmetrics")).toContain(
        'akan_test_counted_renders_total{role="solo"} 4',
      );
    });
  }, 30_000);
});
