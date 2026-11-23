import { describe, expect, test } from "bun:test";
import path from "node:path";
import { type LogRecord, logSeverity } from "akanjs/common";
import { RscWorker } from "./rscWorkerHost";
import type { SsrLateControl } from "./ssrTypes";
import type { BaseBuildArtifact } from "./types";

interface Rendered {
  outcome: "stream" | "not-found" | "redirect" | "failed";
  body: string;
  lateControl: SsrLateControl | null;
}

interface Harness {
  render: (route: string) => Promise<Rendered>;
  logged: () => Promise<string[]>;
}

const withPrestartWorker = async (nodeEnv: string, run: (harness: Harness) => Promise<void>) => {
  const vars: Record<string, string> = {
    NODE_ENV: nodeEnv,
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "levelprestart",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerLevelPrestart.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {},
  } as unknown as BaseBuildArtifact);
  const records: LogRecord[] = [];
  rsc.onLogRecords = (batch) => records.push(...batch);
  try {
    await rsc.ready;
    rsc.setLogLevel(logSeverity.error);
    await run({
      render: async (route) => {
        const result = await rsc.renderWithMeta(new Request(`http://localhost/en/${route}`)).catch((error) => error);
        if (result instanceof Error) return { outcome: "failed", body: result.message, lateControl: null };
        if (result.type !== "stream") return { outcome: result.type, body: "", lateControl: null };
        const body = await new Response(result.stream).text();
        return { outcome: "stream", body, lateControl: await result.lateControl };
      },
      logged: async () => {
        await Bun.sleep(300);
        return records.filter((record) => record.level === "error").map((record) => record.message);
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

const spanOf = (body: string, name: string) => {
  const match = body.match(new RegExp(`${name} ([\\d.]+) ([\\d.]+)`));
  return { start: Number(match?.[1]), end: Number(match?.[2]) };
};

for (const nodeEnv of ["production", "development"]) {
  describe(`RscWorker route levels in ${nodeEnv}`, () => {
    test("start together once the guards let the route in, each still nested in the one above", async () => {
      await withPrestartWorker(nodeEnv, async ({ render }) => {
        const { outcome, body } = await render("overlap/inner");
        expect(outcome).toBe("stream");
        const outer = spanOf(body, "outer");
        const inner = spanOf(body, "inner");
        const pageSpan = spanOf(body, "page");
        expect(inner.start).toBeLessThan(outer.end);
        expect(pageSpan.start).toBeLessThan(outer.end);
        expect(pageSpan.start).toBeLessThan(inner.end);
        expect(body.indexOf("outer ")).toBeLessThan(body.indexOf("inner "));
      });
    }, 20_000);

    test("a layout that redirects, answers not-found or fails discards the page under it without logging it", async () => {
      await withPrestartWorker(nodeEnv, async ({ render, logged }) => {
        const redirected = await render("redirected");
        const kind = redirected.outcome === "redirect" ? redirected.outcome : redirected.lateControl?.type;
        expect(kind).toBe("redirect");

        const missing = await render("missing");
        expect(missing.outcome === "not-found" || missing.lateControl?.type === "not-found").toBe(true);

        const broken = await render("broken");
        expect(broken).toMatchObject({ outcome: "failed", body: "layout broke" });

        const messages = await logged();
        expect(messages.some((message) => message.includes("layout broke"))).toBe(true);
        expect(messages.filter((message) => message.includes("page below"))).toEqual([]);
        expect(messages.filter((message) => message.includes("unhandled rejection"))).toEqual([]);
        expect((await render("overlap/inner")).outcome).toBe("stream");
      });
    }, 20_000);

    test("a page failing under a layout that rendered is logged once, as its own render failure", async () => {
      await withPrestartWorker(nodeEnv, async ({ render, logged }) => {
        expect(await render("failing")).toMatchObject({ outcome: "failed", body: "page failed on its own" });
        const messages = (await logged()).filter((message) => message.includes("page failed on its own"));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("[rsc] render failed");
      });
    }, 20_000);
  });
}
