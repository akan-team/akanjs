import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErrorReporting } from "../../signal/errorReporting";

type ReporterKind = "detached" | "throws" | "rejects" | "ownEndpoint";

const dirs: string[] = [];
const children: Bun.Subprocess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const source = (file: string) => JSON.stringify(join(import.meta.dir, file));

//? A real process: the runner's own `unhandledRejection` handler would fail the suite on the rejections this needs.
const reporterCallsOf = async (kind: ReporterKind): Promise<number> => {
  const dir = mkdtempSync(join(tmpdir(), "akan-reporter-loop-"));
  dirs.push(dir);
  const script = join(dir, "server.ts");
  writeFileSync(
    script,
    [
      `import { ErrorReporting } from ${source("../../signal/errorReporting.ts")};`,
      `import { logCrash } from ${source("../../signal/trace.ts")};`,
      `import { ShutdownManager } from ${source("shutdownManager.ts")};`,
      "let calls = 0;",
      "ShutdownManager.register({ debug: () => {}, error: () => {} } as never, async () => {});",
      "const endpoint = Bun.serve({",
      "  port: 0,",
      "  fetch: () => {",
      `    logCrash(null, { name: "App", type: "query", key: "orderTotal", error: new Error("no stock"), status: 503 });`,
      `    return new Response(null, { status: 503 });`,
      "  },",
      "});",
      "const reporters = {",
      `  detached: () => void Promise.reject(new Error("the tracker is down")),`,
      "  throws: () => {",
      `    throw new Error("the tracker is down");`,
      "  },",
      `  rejects: async () => await Promise.reject(new Error("the tracker is down")),`,
      "  ownEndpoint: () => void fetch(endpoint.url),",
      "};",
      "ErrorReporting.use((error, context) => {",
      "  calls += 1;",
      `  return reporters[${JSON.stringify(kind)}](error, context);`,
      "});",
      `void Promise.reject(new Error("the app's own failure"));`,
      "let settled = -1;",
      "for (let waited = 0; waited < 4_000 && (waited < 600 || settled !== calls); waited += 200) {",
      "  settled = calls;",
      "  await Bun.sleep(200);",
      "}",
      `process.send?.({ calls });`,
      "endpoint.stop(true);",
      "process.exit(0);",
    ].join("\n"),
  );
  let calls = Number.NaN;
  const child = Bun.spawn([process.execPath, script], {
    cwd: dir,
    env: { ...process.env, NODE_ENV: "test", AKAN_FATAL_UNHANDLED_REJECTION: "" },
    ipc: (message) => {
      calls = (message as { calls: number }).calls;
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  children.push(child);
  await Promise.race([child.exited, Bun.sleep(15_000)]);
  return calls;
};

test("a reporter whose own send keeps failing is called a bounded number of times, however it fails", async () => {
  const [detached, throws, rejects, ownEndpoint] = await Promise.all(
    (["detached", "throws", "rejects", "ownEndpoint"] as const).map((kind) => reporterCallsOf(kind)),
  );

  expect(detached).toBeGreaterThanOrEqual(1);
  expect(detached).toBeLessThanOrEqual(ErrorReporting.processPerMinute);
  expect([throws, rejects]).toEqual([1, 1]);
  expect(ownEndpoint).toBeGreaterThanOrEqual(1);
  expect(ownEndpoint).toBeLessThanOrEqual(ErrorReporting.perMinute);
}, 30_000);
