import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

interface Rendered {
  status: number | "not-found";
  body: string;
  lateNotFound: boolean;
}

const notFoundErrorRow = /^[0-9a-z]+:E\{[^\n]*AKAN_NOT_FOUND/m;

const withNotFoundWorker = async (run: (render: (url: string) => Promise<Rendered>) => Promise<void>) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "notfound",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerNotFound.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  try {
    await rsc.ready;
    await run(async (url) => {
      const result = await rsc.renderWithMeta(new Request(url));
      if (result.type === "not-found") return { status: "not-found", body: "", lateNotFound: false };
      if (result.type !== "stream") throw new Error(`expected a stream, got ${result.type}`);
      const body = await new Response(result.stream).text();
      return { status: result.status ?? 200, body, lateNotFound: (await result.lateControl)?.type === "not-found" };
    });
  } finally {
    rsc.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe("RscWorker not-found raised by a route", () => {
  test("answers a path value the type refuses with 404 and the layout's NotFound before any byte", async () => {
    await withNotFoundWorker(async (render) => {
      const refused = await render("http://localhost/en/drawing/not-an-id");
      expect(refused.status).toBe(404);
      expect(refused.body).toContain("root missing");
      expect(refused.body).not.toMatch(notFoundErrorRow);

      const accepted = await render("http://localhost/en/drawing/1234567890abcdef12345678");
      expect(accepted.status).toBe(200);
      expect(accepted.body).toContain("drawing 1234567890abcdef12345678");
    });
  }, 20_000);

  test("renders the nearest layout's NotFound for router.notFound(), sync or after an await", async () => {
    await withNotFoundWorker(async (render) => {
      for (const url of [
        "http://localhost/en/nfprobesync",
        "http://localhost/en/nfprobe",
        "http://localhost/en/docs/gone",
      ]) {
        const rendered = await render(url);
        expect(rendered.body).toContain("root missing");
        expect(rendered.body).not.toMatch(notFoundErrorRow);
        expect(rendered.status === 404 || rendered.lateNotFound).toBe(true);
      }
    });
  }, 20_000);
});
