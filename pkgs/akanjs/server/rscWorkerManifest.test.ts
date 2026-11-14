import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { ClientManifest } from "./artifact";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
const runtimeManifest: ClientManifest = {
  [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
};
const manifestOf = (id: string): ClientManifest => ({
  ...runtimeManifest,
  "manifest/widget#Widget": { id, chunks: [], name: "Widget" },
});

const withManifestWorker = async (run: (rsc: RscWorker) => Promise<void>) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_MEMORY_LOG_INTERVAL_MS: "20",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerManifest.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: runtimeManifest,
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

const flightOf = async (rsc: RscWorker, clientManifest: ClientManifest) => {
  const result = await rsc.renderWithMeta(new Request("http://localhost/en/widget"), { clientManifest });
  if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
  return await new Response(result.stream).text();
};

describe("RscWorker render manifest", () => {
  test("renders each page against the manifest its request held, sent once", async () => {
    await withManifestWorker(async (rsc) => {
      const first = manifestOf("/chunks/first.js");
      const second = manifestOf("/chunks/second.js");

      expect(await flightOf(rsc, first)).toContain("/chunks/first.js");
      expect(await flightOf(rsc, first)).toContain("/chunks/first.js");
      expect(await flightOf(rsc, second)).toContain("/chunks/second.js");
      expect(await flightOf(rsc, first)).toContain("/chunks/first.js");
    });
  }, 20_000);

  test("a worker process that replaced a crashed one renders against the manifest again, a render queued for it too", async () => {
    await withManifestWorker(async (rsc) => {
      const manifest = manifestOf("/chunks/first.js");
      expect(await flightOf(rsc, manifest)).toContain("/chunks/first.js");

      process.kill(Number(rsc.getMetrics().rscWorkerPid), "SIGKILL");
      await until(() => rsc.status === "restarting");
      const queued = flightOf(rsc, manifest);
      expect(await queued).toContain("/chunks/first.js");
      expect(rsc.getMetrics().rscWorkerRestartCount).toBe(1);
      expect(await flightOf(rsc, manifest)).toContain("/chunks/first.js");
    });
  }, 20_000);

  test("a render sent while a reload is in flight, and one after it, renders against the manifest the host held then", async () => {
    await withManifestWorker(async (rsc) => {
      const held = manifestOf("/chunks/held.js");
      const newer = manifestOf("/chunks/newer.js");
      expect(await flightOf(rsc, held)).toContain("/chunks/held.js");

      let reloaded = false;
      const reloading = rsc.reload({ clientManifest: manifestOf("/chunks/reload.js"), buildId: 2 }).then(() => {
        reloaded = true;
      });
      expect(await flightOf(rsc, held)).toContain("/chunks/held.js");
      expect(await flightOf(rsc, newer)).toContain("/chunks/newer.js");
      expect(reloaded).toBe(false);

      await reloading;
      expect(await flightOf(rsc, newer)).toContain("/chunks/newer.js");
      expect(await flightOf(rsc, held)).toContain("/chunks/held.js");
    });
  }, 20_000);
});
