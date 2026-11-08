import { describe, expect, it } from "bun:test";
import { executeCommandStream } from "./executeCommand";

describe("executeCommandStream", () => {
  it("rejects a timed-out command whose process group already exited, and the process stays up", async () => {
    const script = [
      `import { executeCommandStream } from ${JSON.stringify(`${import.meta.dir}/executeCommand.ts`)};`,
      `process.on("uncaughtException", (error) => { console.info("uncaught", error.code); process.exit(3); });`,
      `const outcome = await executeCommandStream("bash -c 'set -m; sleep 2 & exit 0'", { timeoutMs: 500 }).then(`,
      `  () => "resolved",`,
      `  (error) => String(error),`,
      `);`,
      `await Bun.sleep(200);`,
      `console.info(outcome);`,
      `process.exit(0);`,
    ].join("\n");
    const run = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" });
    const [code, stdout] = await Promise.all([run.exited, new Response(run.stdout).text()]);
    expect({ code, outcome: stdout.trim() }).toEqual({ code: 0, outcome: expect.stringContaining("timed out") });
  }, 10_000);

  it("rejects a command still running when its timeout passes", async () => {
    await expect(executeCommandStream("sleep 5", { timeoutMs: 200 })).rejects.toThrow("timed out");
  });
});
