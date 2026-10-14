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

const withNotFoundWorker = async (
  run: (render: (url: string, headers?: Record<string, string>) => Promise<Rendered>) => Promise<void>,
) => {
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
    await run(async (url, headers = {}) => {
      const result = await rsc.renderWithMeta(new Request(url, { headers }));
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

describe("RscWorker fallback document request scope", () => {
  test("renders a fallback raised before any byte under its own request while another render is in flight", async () => {
    await withNotFoundWorker(async (render) => {
      const slow = render("http://localhost/en/slowread", { cookie: "theme=bee", "x-base-path": "bee" });
      await Bun.sleep(200);
      const refused = await render("http://localhost/en/drawing/not-an-id", {
        cookie: "theme=ant",
        "x-base-path": "ant",
      });
      const slowRendered = await slow;

      expect(refused.status).toBe(404);
      expect(refused.body).toContain("root missing /en/drawing/not-an-id theme=ant base=ant");
      expect(slowRendered.body).toContain("slow theme=bee base=bee");
    });
  }, 20_000);
});

describe("RscWorker render request scope", () => {
  test("reads each render's own request after an await and inside a streamed boundary", async () => {
    await withNotFoundWorker(async (render) => {
      for (const [route, text] of [
        ["afterawait", "after"],
        ["streamed", "streamed"],
      ] as const) {
        const ant = render(`http://localhost/en/${route}`, { cookie: "theme=ant", "x-base-path": "ant" });
        await Bun.sleep(100);
        const bee = render(`http://localhost/en/${route}`, { cookie: "theme=bee", "x-base-path": "bee" });
        const [antRendered, beeRendered] = await Promise.all([ant, bee]);

        expect(antRendered.body).toContain(`${text} theme=ant base=ant`);
        expect(beeRendered.body).toContain(`${text} theme=bee base=bee`);
      }
    });
  }, 20_000);
});

describe("RscWorker redirect raised by a route", () => {
  test("is a real redirect when the body awaited no I/O first, a layout's included, and a late one after it", async () => {
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
      for (const [route, location] of [
        ["rdsync", "/en/target"],
        ["rdresolved", "/en/target"],
        ["gate/inner", "/en/signin"],
      ] as const) {
        const result = await rsc.renderWithMeta(new Request(`http://localhost/en/${route}`));
        expect(result).toMatchObject({ type: "redirect", location, status: 307 });
      }
      const late = await rsc.renderWithMeta(new Request("http://localhost/en/rdio"));
      if (late.type !== "stream") throw new Error(`expected a stream, got ${late.type}`);
      await new Response(late.stream).text();
      expect(await late.lateControl).toMatchObject({ type: "redirect", location: "/en/target" });
    } finally {
      rsc.kill();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 20_000);
});
