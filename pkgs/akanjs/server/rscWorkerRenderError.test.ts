import { describe, expect, test } from "bun:test";
import path from "node:path";
import { type LogRecord, logSeverity } from "akanjs/common";
import { mapFlightLineRows } from "./flightRowReader";
import { rscErrorRowWatcher } from "./rscHttp";
import { RscWorker } from "./rscWorkerHost";
import type { SsrLateControl } from "./ssrTypes";
import type { BaseBuildArtifact } from "./types";

interface Rendered {
  status: number | "not-found" | "redirect";
  body: string;
  lateControl: SsrLateControl | null;
}

interface Harness {
  render: (route: string) => Promise<Rendered>;
  loggedError: (text: string) => Promise<LogRecord | undefined>;
}

const driverMessage = 'duplicate key value violates unique constraint "user_email_key" (email=alice@example.com)';

const errorRowDigest = (body: string): unknown => {
  const row = body.match(/^[0-9a-z]+:E(\{[^\n]*\})$/m)?.[1];
  return row ? (JSON.parse(row) as { digest?: unknown }).digest : undefined;
};

const readsAsFailed = async (body: string): Promise<boolean> => {
  let failed = false;
  const stream = new Response(body).body ?? new ReadableStream();
  await new Response(
    mapFlightLineRows(
      stream,
      rscErrorRowWatcher(() => (failed = true)),
    ),
  ).text();
  return failed;
};

const withRenderErrorWorker = async (nodeEnv: string, run: (harness: Harness) => Promise<void>) => {
  const vars: Record<string, string> = {
    NODE_ENV: nodeEnv,
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "rendererror",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerRenderError.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  const logged: LogRecord[] = [];
  rsc.onLogRecords = (records) => logged.push(...records);
  try {
    await rsc.ready;
    rsc.setLogLevel(logSeverity.error);
    await run({
      render: async (route) => {
        const result = await rsc.renderWithMeta(new Request(`http://localhost/en/${route}`));
        if (result.type === "not-found") return { status: "not-found", body: "", lateControl: null };
        if (result.type === "redirect") return { status: "redirect", body: result.location, lateControl: null };
        const body = await new Response(result.stream).text();
        return { status: result.status ?? 200, body, lateControl: await result.lateControl };
      },
      loggedError: async (text) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const record = logged.find((entry) => entry.level === "error" && entry.message.includes(text));
          if (record) return record;
          await Bun.sleep(20);
        }
        return undefined;
      },
    });
  } finally {
    rsc.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe("RscWorker render error digest in production", () => {
  test("is an id the error's log line carries, never the thrown message, a typed Err's key included", async () => {
    await withRenderErrorWorker("production", async ({ render, loggedError }) => {
      for (const [route, thrown] of [
        ["driver", "email=alice@example.com"],
        ["denied", "drawing.error.denied"],
      ] as const) {
        const rendered = await render(route);
        expect(rendered.status).toBe(200);
        expect(rendered.body).toContain("loading");
        expect(rendered.body).not.toContain(thrown);
        const digest = errorRowDigest(rendered.body);
        expect(digest).toMatch(/^[0-9a-f]{8}$/);

        const record = await loggedError(`digest=${digest}`);
        expect(record?.message).toContain(`[rsc] render failed path=/en/${route} digest=${digest}:`);
        expect(record?.message).toContain(thrown);
      }
    });
  }, 20_000);

  test("keeps a redirect, a not-found and the .error() view's digest as they were", async () => {
    await withRenderErrorWorker("production", async ({ render }) => {
      const moved = await render("moved");
      expect(errorRowDigest(moved.body)).toMatch(/^AKAN_REDIRECT;/);
      expect(moved.lateControl).toMatchObject({ type: "redirect", location: "/en/target" });

      const gone = await render("gone");
      expect(errorRowDigest(gone.body)).toBe("AKAN_NOT_FOUND");
      expect(gone.lateControl).toEqual({ type: "not-found" });

      const denied = await render("failing/denied");
      expect(denied.status).toBe(500);
      expect(denied.body).toContain("failing error AKAN_RENDER_ERROR");
      expect(denied.body).not.toContain("drawing.error.denied");
    });
  }, 20_000);
});

describe("RscWorker render error digest in development", () => {
  test("is the thrown message, a typed Err's key included", async () => {
    await withRenderErrorWorker("development", async ({ render }) => {
      expect(errorRowDigest((await render("driver")).body)).toBe(driverMessage);
      expect(errorRowDigest((await render("denied")).body)).toBe("drawing.error.denied");
    });
  }, 20_000);

  test("is never empty, so the browser reads the failure, while a rejection a component caught reads as none", async () => {
    await withRenderErrorWorker("development", async ({ render }) => {
      const blank = (await render("blank")).body;
      expect(errorRowDigest(blank)).toBe("AKAN_RENDER_ERROR");
      expect(await readsAsFailed(blank)).toBe(true);

      const caught = (await render("caught")).body;
      expect(caught).toContain("fallback");
      expect(caught).toMatch(/^[0-9a-z]+:E\{"digest":"",/m);
      expect(await readsAsFailed(caught)).toBe(false);
    });
  }, 20_000);
});
