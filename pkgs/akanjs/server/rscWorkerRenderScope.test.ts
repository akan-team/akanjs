import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const itemId = "1234567890abcdef12345678";

const withRenderScopeWorker = async (run: (render: (url: string) => Promise<string>) => Promise<void>) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "renderscope",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerRenderScope.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  try {
    await rsc.ready;
    await run(async (url) => {
      const result = await rsc.renderWithMeta(new Request(url));
      if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
      return await new Response(result.stream).text();
    });
  } finally {
    rsc.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe("RscWorker render scope", () => {
  test("refuses a mutation a page sends while it renders, and sends the one it opts in", async () => {
    await withRenderScopeWorker(async (render) => {
      expect(await render(`http://localhost/en/approve/${itemId}`)).toContain("refused base.error.mutationInRender");
      expect(await render(`http://localhost/en/warm/${itemId}`)).toContain("sent approved");
    });
  }, 20_000);

  test("covers a legacy page module and a component React renders after the shell", async () => {
    await withRenderScopeWorker(async (render) => {
      expect(await render("http://localhost/en/legacy")).toContain("legacy refused base.error.mutationInRender");
      expect(await render("http://localhost/en/streamed")).toContain("late scope true");
    });
  }, 20_000);
});
