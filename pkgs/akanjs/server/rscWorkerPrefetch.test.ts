import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AKAN_RSC_PREFETCH_HEADER } from "./routeState";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";
import { createRscNavigationStreamResponse } from "./webRouter";

interface PrefetchWorker {
  answer: (url: string, prefetch: boolean, headers?: Record<string, string>) => Promise<Response>;
  renders: (name: string) => number;
}

const withPrefetchWorker = async (run: (worker: PrefetchWorker) => Promise<void>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-prefetch-"));
  const renderLog = path.join(dir, "render.log");
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_TEST_RENDER_LOG: renderLog,
    AKAN_PUBLIC_APP_NAME: "prefetch",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerPrefetch.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  try {
    await rsc.ready;
    await run({
      answer: async (url, prefetch, headers = {}) => {
        const result = await rsc.renderWithMeta(new Request(url, { headers }), { prefetch });
        if (result.type !== "stream") throw new Error(`expected a stream, got ${result.type}`);
        return await createRscNavigationStreamResponse(result);
      },
      renders: (name) =>
        (fs.existsSync(renderLog) ? fs.readFileSync(renderLog, "utf8").split("\n") : []).filter((line) => line === name)
          .length,
    });
  } finally {
    rsc.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("RscWorker prefetch opt-out", () => {
  test("answers a prefetch of a page that opts out with an empty 204, and renders it for the click", async () => {
    await withPrefetchWorker(async ({ answer, renders }) => {
      const prefetched = await answer("http://localhost/en/views", true);
      expect(prefetched.status).toBe(204);
      expect(prefetched.headers.get("Cache-Control")).toBe("no-store");
      expect(await prefetched.text()).toBe("");
      expect(renders("views")).toBe(0);

      const clicked = await answer("http://localhost/en/views", false);
      expect(clicked.status).toBe(200);
      expect(await clicked.text()).toContain("views body");
      expect(renders("views")).toBe(1);

      const plain = await answer("http://localhost/en/plain", true);
      expect(plain.status).toBe(200);
      expect(await plain.text()).toContain("plain body");
    });
  }, 20_000);

  test("renders a page that opts out for a request that only carries the prefetch header, as a document load may", async () => {
    await withPrefetchWorker(async ({ answer, renders }) => {
      const loaded = await answer("http://localhost/en/views", false, { [AKAN_RSC_PREFETCH_HEADER]: "1" });
      expect(loaded.status).toBe(200);
      expect(renders("views")).toBe(1);
    });
  }, 20_000);

  test("opts out every page under a layout that does, unless the page opts back in", async () => {
    await withPrefetchWorker(async ({ answer, renders }) => {
      expect((await answer("http://localhost/en/counted/item", true)).status).toBe(204);
      expect(renders("counted item")).toBe(0);

      const reopened = await answer("http://localhost/en/counted/open", true);
      expect(reopened.status).toBe(200);
      expect(await reopened.text()).toContain("counted open body");
    });
  }, 20_000);
});
