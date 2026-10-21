import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MigrateJobs, type MigrateProcessOutput } from "./migrateJobs";
import { OpsRoute } from "./opsRoute";

const root = mkdtempSync(path.join(tmpdir(), "akan-migrate-jobs-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const planHash = "a".repeat(64);
const answered = (stdout: string, code = 0, stderr = ""): MigrateProcessOutput => ({ code, stdout, stderr });

describe("MigrateJobs", () => {
  test("turns a body into ops migrate arguments, every option in --name=value form", () => {
    expect(
      MigrateJobs.requestOf(
        { id: "j1", action: "apply", target: "202610201519_taskDue", params: { due: "-1d" }, expect: planHash },
        "u1",
      ),
    ).toEqual({
      id: "j1",
      action: "apply",
      argv: ["apply", "202610201519_taskDue", "--param=due=-1d", `--expect=${planHash}`, "--actor=u1", "--json"],
    });
    expect(MigrateJobs.requestOf({ id: "j2", action: "plan", target: "m1", items: 0 }, undefined)).toMatchObject({
      argv: ["plan", "m1", "--items=0", "--json"],
    });
    expect(MigrateJobs.requestOf({ id: "j3", action: "list" }, "u1")).toMatchObject({ argv: ["list", "--json"] });
  });

  test("refuses what could reach the command as anything but its own argument", () => {
    const refusals: [Record<string, unknown> | null, string | undefined, string][] = [
      [null, "u1", "the body must be a JSON object"],
      [{ id: "j", action: "plan", target: "m1", actor: "u2" }, "u1", "actor comes from the token's sub"],
      [{ id: "j", action: "plan", target: "m1", param: { a: "1" } }, "u1", "unknown fields: param"],
      [{ id: "-j", action: "plan", target: "m1" }, "u1", "id must match"],
      [{ id: "j", action: "drop", target: "m1" }, "u1", "action must be one of"],
      [{ id: "j", action: "rollback", target: "r1" }, undefined, "rollback needs the token's sub"],
      [{ id: "j", action: "plan", target: "--expect=x" }, "u1", "target must match"],
      [{ id: "j", action: "plan", target: "m1", params: { "a b": "1" } }, "u1", "params must map names to strings"],
      [{ id: "j", action: "plan", target: "m1", params: { _a: "1" } }, "u1", "params must map names to strings"],
      [{ id: "j", action: "plan", target: "m1", params: { a: 1 } }, "u1", "params must map names to strings"],
      [{ id: "j", action: "plan", target: "m1", params: ["a=1"] }, "u1", "params must map names to strings"],
      [{ id: "j", action: "apply", target: "m1", expect: "abc" }, "u1", "expect must be a planHash"],
      [{ id: "j", action: "plan", target: "m1", items: 1.5 }, "u1", "items must be a whole number"],
    ];
    for (const [body, actor, reason] of refusals) expect(MigrateJobs.requestOf(body, actor)).toContain(reason);
  });

  test("records the result and exit code it answered, and a used id or a running job refuses another", async () => {
    let finish: (output: MigrateProcessOutput) => void = () => {};
    const jobs = new MigrateJobs(() => new Promise((resolve) => (finish = resolve)));
    expect(jobs.start({ id: "j1", action: "verify", argv: [] })).toMatchObject({ id: "j1", status: "running" });
    expect(jobs.start({ id: "j2", action: "list", argv: [] })).toBe("busy");
    finish(answered('{"ok":false,"action":"verify","code":"verifyFailed","problems":["x"]}', 3));
    await jobs.idle();
    expect(jobs.get("j1")).toMatchObject({
      status: "done",
      exitCode: 3,
      result: { ok: false, code: "verifyFailed" },
      finishedAt: expect.any(String),
    });
    expect(jobs.start({ id: "j1", action: "list", argv: [] })).toBe("exists");
  });

  test("fails a job whose child printed no result, with the last line it wrote to stderr", async () => {
    const jobs = new MigrateJobs(async () => answered("booting\n", 1, "first\nSQLITE_CANTOPEN: unable to open\n"));
    jobs.start({ id: "j1", action: "plan", argv: [] });
    await jobs.idle();
    expect(jobs.get("j1")).toMatchObject({ status: "failed", error: "SQLITE_CANTOPEN: unable to open" });
  });

  test("remembers the newest jobs only", async () => {
    const jobs = new MigrateJobs(async () => answered('{"ok":true,"action":"list"}'));
    for (let idx = 0; idx <= MigrateJobs.maxRemembered; idx++) {
      jobs.start({ id: `j${idx}`, action: "list", argv: [] });
      await jobs.idle();
    }
    expect(jobs.get("j0")).toBeNull();
    expect(jobs.get(`j${MigrateJobs.maxRemembered}`)).toMatchObject({ status: "done" });
  });

  test("runs the entry script as ops migrate in a child and reads its stdout", async () => {
    const script = path.join(root, "main.ts");
    writeFileSync(
      script,
      'console.info("a log line");\nconsole.info(JSON.stringify({ ok: true, action: "list", argv: process.argv.slice(2) }));\n',
    );
    const { code, stdout } = await OpsRoute.migrateInChild(["list", "--json"], script);
    expect(code).toBe(0);
    expect(JSON.parse(stdout.trim().split("\n").at(-1) ?? "")).toEqual({
      ok: true,
      action: "list",
      argv: ["ops", "migrate", "list", "--json"],
    });
  });
});
