import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const withCoalesceWorker = async (run: (rsc: RscWorker) => Promise<void>) => {
  const vars: Record<string, string> = { AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx") };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerCoalesce.fixture.tsx"),
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

const streamOf = async (rsc: RscWorker, pathname: string) => {
  const result = await rsc.renderWithMeta(new Request(`http://localhost${pathname}`));
  if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
  return result.stream;
};

describe("RscWorker chunk messages", () => {
  test("sends a burst of small Flight chunks as a few larger messages", async () => {
    await withCoalesceWorker(async (rsc) => {
      const messages: Uint8Array[] = [];
      for await (const message of await streamOf(rsc, "/en/rows")) messages.push(message);
      const body = Buffer.concat(messages).toString();
      const sizes = messages.map((message) => message.byteLength);

      expect(body).toContain("row 0 of the list");
      expect(body).toContain("row 399 of the list");
      expect(body.length).toBeGreaterThan(100_000);
      expect(sizes.filter((size) => size <= 4096).length).toBeLessThan(6);
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(32 * 1024);
    });
  }, 20_000);

  test("sends what a page has rendered while the rest of it still waits on data", async () => {
    await withCoalesceWorker(async (rsc) => {
      const reader = (await streamOf(rsc, "/en/slow")).getReader();
      const decoder = new TextDecoder();
      const shell = decoder.decode((await reader.read()).value);
      let rest = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
      }

      expect(shell).toContain("shell content");
      expect(shell).toContain("waiting");
      expect(shell).not.toContain("late content");
      expect(rest).toContain("late content");
    });
  }, 20_000);
});
