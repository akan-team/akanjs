import { describe, expect, test } from "bun:test";
import path from "node:path";

const probe = async (env: Record<string, string>) => {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AKAN_TEST_")));
  const proc = Bun.spawn(["bun", "test", "--isolate", "./test/requireBackendsProbe.fixture.ts"], {
    cwd: path.resolve(import.meta.dir, ".."),
    env: { ...inherited, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { text: Bun.stripANSI(`${out}\n${err}`), exitCode };
};

describe("ConformanceEnv.requireBackends", () => {
  test("announces the skipped backend and passes when the switch is off", async () => {
    const { text, exitCode } = await probe({});
    expect(exitCode).toBe(0);
    expect(text).toContain("probe: postgres cases skipped");
  });

  test("fails a missing backend when the switch is on", async () => {
    const { text, exitCode } = await probe({ AKAN_TEST_REQUIRE_BACKENDS: "1" });
    expect(exitCode).not.toBe(0);
    expect(text).toContain("(fail) probe: postgres backend is required");
    expect(text).toContain("AKAN_TEST_POSTGRES_URL is not set while AKAN_TEST_REQUIRE_BACKENDS=1");
  });

  test("fails nothing when the switch is on and the backend is configured", async () => {
    const { text, exitCode } = await probe({
      AKAN_TEST_REQUIRE_BACKENDS: "1",
      AKAN_TEST_POSTGRES_URL: "postgres://akan:akan@localhost:1/akan",
    });
    expect(text).not.toContain("postgres backend is required");
    expect(exitCode).toBe(0);
  });
});
