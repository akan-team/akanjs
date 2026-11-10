import { describe, expect, test } from "bun:test";
import path from "node:path";
import { makeCliTempWorkspace, tempRoots, writeText } from "@akanjs/devkit/testHelpers";

const track = tempRoots();
const runner = Bun.resolveSync("@akanjs/devkit/commandDecorators", import.meta.dir);

interface CliRun {
  module: string;
  command: string;
  argv: string[];
  prelude?: string[];
  stdin?: string;
}

const run = async ({ module, command, argv, prelude = [], stdin }: CliRun) => {
  const { root } = track(await makeCliTempWorkspace());
  await writeText(path.join(root, "package.json"), '{ "name": "repo", "version": "1.0.0" }\n');
  await writeText(path.join(root, "tsconfig.json"), "{}\n");
  const entry = path.join(root, "cli.ts");
  await writeText(
    entry,
    [
      `import { runCommands } from ${JSON.stringify(runner)};`,
      `import { ${command} } from ${JSON.stringify(path.join(import.meta.dir, module))};`,
      ...prelude,
      `await runCommands(${command});`,
      "",
    ].join("\n"),
  );
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AKAN_")));
  const proc = Bun.spawn(["bun", entry, ...argv], {
    cwd: root,
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...env, HOME: path.join(root, "home"), GIT_CEILING_DIRECTORIES: path.dirname(root) },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

const agent = (argv: string[], stdin?: string) =>
  run({ module: "agent/agent.command.ts", command: "AgentCommand", argv: ["agent", ...argv], stdin });

describe("akan agent", () => {
  test("exits 3 when install --check finds a file to write", async () => {
    const checked = await agent(["install", "--check"]);
    expect(checked.stdout).toContain("agent files differ");
    expect(checked.code).toBe(3);
  }, 60_000);

  test("never exits 2 from a hook, which Claude Code reads as a block, and says why on stderr", async () => {
    const [unknown, malformed, refused] = await Promise.all([
      agent(["hook", "nope"], "{}"),
      agent(["hook", "pre-edit"], "{ not json"),
      agent(["hook", "stop", "--nope"], "{}"),
    ]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("Unknown hook: nope. Use pre-edit, post-edit, stop.");
    expect(unknown.stdout.trim()).toBe("");
    expect(malformed.code).toBe(1);
    expect(malformed.stderr.trim()).not.toBe("");
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("unknown option '--nope'");
  }, 60_000);
});

describe("akan verify", () => {
  const failing = [
    `import { VerifyPipeline } from ${JSON.stringify(path.join(import.meta.dir, "verify/verifyPipeline.ts"))};`,
    "VerifyPipeline.prototype.run = async () => ({",
    '  ok: false, targets: ["demo"], ms: 0, steps: [{ name: "lint", status: "fail", ms: 0, fixed: 0 }], diagnostics: [],',
    "});",
  ];
  const verify = (argv: string[]) =>
    run({ module: "verify/verify.command.ts", command: "VerifyCommand", argv: ["verify", ...argv], prelude: failing });

  test("exits 3 when it found problems, with its own JSON report as the only stdout", async () => {
    const [text, json] = await Promise.all([verify([]), verify(["--format", "json"])]);
    expect(text.code).toBe(3);
    expect(text.stdout).toContain("verify fail");
    expect(json.code).toBe(3);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, targets: ["demo"] });
  }, 60_000);

  test("exits 2 for a target the workspace does not have", async () => {
    const unknown = await verify(["nope", "--format", "json"]);
    expect(unknown.code).toBe(2);
    expect(JSON.parse(unknown.stdout)).toEqual({
      ok: false,
      error: "nope is not an app, library or package of this workspace",
      code: "unknownTarget",
    });
  }, 60_000);
});

describe("the over-the-air commands", () => {
  const cloud = (argv: string[]) => run({ module: "cloud/cloud.command.ts", command: "CloudCommand", argv });
  const application = (argv: string[]) =>
    run({ module: "application/application.command.ts", command: "ApplicationCommand", argv });

  test("exit 1 for a usage failure, keeping 2 for the store-build verdict and the project's refusal", async () => {
    const runs = await Promise.all([
      cloud(["push-update", "--nope"]),
      cloud(["push-update", "shop", "--platform", "ios"]),
      cloud(["register-binary", "--nope"]),
      application(["pack-update", "--nope"]),
      application(["pack-update", "shop", "--platform", "ios"]),
    ]);
    expect(runs.map((each) => each.code)).toEqual([1, 1, 1, 1, 1]);
    expect(runs[1]?.stdout).toContain("Unknown app 'shop'");
  }, 90_000);
});

describe("akan migrate --json", () => {
  test("answers a code that agrees with its exit for an app the workspace does not have", async () => {
    const unknown = await run({
      module: "application/application.command.ts",
      command: "ApplicationCommand",
      argv: ["migrate", "nope", "list", "--json"],
    });
    expect(unknown.code).toBe(2);
    expect(JSON.parse(unknown.stdout.trim().split("\n").at(-1) ?? "null")).toMatchObject({
      ok: false,
      code: "notFound",
    });
  }, 60_000);
});
