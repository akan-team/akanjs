import { afterAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { RscFirstRenderMemory } from "./rscFirstRenderMemory";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const mib = 1024 * 1024;

const scripted = () => {
  let rss = 100 * mib;
  const memory = {
    grow: (bytes: number) => {
      rss += bytes;
    },
    read: () => ({ rss, heapUsed: rss / 2, external: 0, arrayBuffers: 0 }),
  };
  return { memory, recorder: new RscFirstRenderMemory(true, memory.read) };
};

describe("first-render memory per route", () => {
  test("is off unless AKAN_MEMORY_LOG=1, reading no memory and reporting nothing", () => {
    let reads = 0;
    const off = new RscFirstRenderMemory(false, () => {
      reads += 1;
      return { rss: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
    });
    off.end(off.begin("/:lang/hello"), ["./hello/_index.tsx"]);

    expect([off.report, reads]).toEqual([undefined, 0]);
  });

  test("keeps each route's first render only, with its deltas and the modules it loaded", () => {
    const { memory, recorder } = scripted();
    const first = recorder.begin("/:lang/hello");
    memory.grow(6 * mib);
    recorder.end(first, ["./hello/_index.tsx"]);
    const again = recorder.begin("/:lang/hello");
    memory.grow(40 * mib);
    recorder.end(again, []);

    expect(again).toBeNull();
    expect(recorder.report).toEqual([
      {
        routeId: "/:lang/hello",
        rssDeltaBytes: 6 * mib,
        heapUsedDeltaBytes: 3 * mib,
        externalDeltaBytes: 0,
        arrayBuffersDeltaBytes: 0,
        loadedModules: ["./hello/_index.tsx"],
      },
    ]);
  });

  test("lists the largest RSS growth first and keeps no more than its cap", () => {
    const { memory, recorder } = scripted();
    for (let i = 1; i <= RscFirstRenderMemory.maxRoutes + 5; i++) {
      const start = recorder.begin(`/route${i}`);
      memory.grow(((i * 7) % 25) * mib);
      recorder.end(start, []);
    }
    const deltas = recorder.report?.map((entry) => entry.rssDeltaBytes / mib) ?? [];

    expect(deltas).toHaveLength(RscFirstRenderMemory.maxRoutes);
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
    expect(deltas.slice(-1)[0]).toBeGreaterThan(0);
  });

  test("of two first renders of one route running together, the first to finish is the one kept", () => {
    const { memory, recorder } = scripted();
    const one = recorder.begin("/shop");
    const two = recorder.begin("/shop");
    memory.grow(2 * mib);
    recorder.end(two, ["./shop/_index.tsx"]);
    memory.grow(9 * mib);
    recorder.end(one, ["./shop/_index.tsx"]);

    expect(recorder.report?.map((entry) => entry.rssDeltaBytes)).toEqual([2 * mib]);
  });
});

describe("first-render memory in the RSC worker's metrics report", () => {
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const env: Record<string, string> = {
    NODE_ENV: "production",
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "firstrender",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    AKAN_MEMORY_LOG: "1",
    AKAN_MEMORY_LOG_INTERVAL_MS: "50",
  };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  let rsc: RscWorker | null = null;

  afterAll(() => {
    rsc?.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("names a route once, with the modules its first render loaded, next to the last-render fields", async () => {
    Object.assign(process.env, env);
    rsc = new RscWorker({
      pagesBundlePath: path.join(import.meta.dir, "requestIdPropagation.fixture.tsx"),
      pagesBundleBuildId: 1,
      rscRuntimeClientManifest: {
        [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
      },
    } as unknown as BaseBuildArtifact);
    const worker = rsc;
    await worker.ready;
    for (const view of [1, 2]) {
      const result = await worker.renderWithMeta(new Request(`http://localhost/en/hello?view=${view}`), {});
      if (result.type === "stream") await new Response(result.stream).text();
    }
    const deadline = Date.now() + 3_000;
    while ((worker.getMetrics().rscRenderCount ?? 0) < 2 && Date.now() < deadline) await Bun.sleep(20);
    const metrics = worker.getMetrics();

    expect(metrics.rscRenderCount).toBe(2);
    expect(metrics.rscFirstRenderMemory?.map((entry) => entry.routeId)).toEqual(["/:lang/hello"]);
    expect(metrics.rscFirstRenderMemory?.[0]?.loadedModules).toContain("./hello/_index.tsx");
    expect(typeof metrics.rscFirstRenderMemory?.[0]?.rssDeltaBytes).toBe("number");
  });
});
