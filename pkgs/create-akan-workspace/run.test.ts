import { describe, expect, spyOn, test } from "bun:test";
import type { SpawnOptions } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "./run";

interface SpawnCall {
  command: string;
  args: string[];
  options: SpawnOptions;
}

const createSpawnMock = (exitCodes: number[] = []) => {
  const calls: SpawnCall[] = [];
  const spawnCommand = (command: string, args: readonly string[], options: SpawnOptions) => {
    calls.push({ command, args: [...args], options });
    const code = exitCodes.shift() ?? 0;
    return {
      on(event: string, callback: (code: number | null, signal: NodeJS.Signals | null) => void) {
        if (event === "exit") queueMicrotask(() => callback(code, null));
        return this;
      },
    };
  };

  return { calls, spawnCommand };
};

const inRepo = async (dotenv: string | null, body: () => Promise<void>, file = ".env") => {
  const repo = mkdtempSync(path.join(tmpdir(), "create-akan-workspace-"));
  const cwd = process.cwd();
  const had = process.env.AKAN_NPM_REGISTRY;
  try {
    if (dotenv !== null) writeFileSync(path.join(repo, file), dotenv);
    process.chdir(repo);
    process.env.AKAN_NPM_REGISTRY = "http://127.0.0.1:4873";
    await body();
  } finally {
    process.chdir(cwd);
    if (had === undefined) delete process.env.AKAN_NPM_REGISTRY;
    else process.env.AKAN_NPM_REGISTRY = had;
    rmSync(repo, { recursive: true, force: true });
  }
};

describe("create-akan-workspace", () => {
  test("installs the matching Akan CLI version then forwards workspace options", async () => {
    const { calls, spawnCommand } = createSpawnMock();
    const { version } = await Bun.file(new URL("./package.json", import.meta.url)).json();

    await run({
      argv: [
        "bun",
        "create-akan-workspace",
        "my-org",
        "--app",
        "web",
        "--dir",
        "./projects",
        "--libs",
        "true",
        "--init",
        "false",
      ],
      spawnCommand: spawnCommand as never,
    });

    expect(calls.map((call) => [call.command, call.args])).toEqual([
      ["bun", ["install", "-g", `@akanjs/cli@${version}`]],
      ["akan", ["create-workspace", "my-org", "--app=web", "--dir=./projects", "--libs=true", "--init=false"]],
    ]);
    expect(calls.every((call) => call.options.stdio === "inherit")).toBe(true);
  });

  test("uses a local registry for CLI install and workspace creation", async () => {
    const { calls, spawnCommand } = createSpawnMock();
    const { version } = await Bun.file(new URL("./package.json", import.meta.url)).json();

    await run({
      argv: ["bun", "create-akan-workspace", "my-org", "--app", "web", "--registry", "http://127.0.0.1:4873/"],
      spawnCommand: spawnCommand as never,
    });

    expect(calls.map((call) => [call.command, call.args])).toEqual([
      ["bun", ["install", "-g", `@akanjs/cli@${version}`, "--registry", "http://127.0.0.1:4873"]],
      [
        "akan",
        ["create-workspace", "my-org", "--app=web", "--libs=false", "--init=true", "--registry=http://127.0.0.1:4873"],
      ],
    ]);
    expect(
      calls.every((call) => (call.options.env as NodeJS.ProcessEnv).AKAN_NPM_REGISTRY === "http://127.0.0.1:4873"),
    ).toBe(true);
  });

  test("takes the registry from the shell, but not from a dotenv file in the working directory", async () => {
    const { version } = await Bun.file(new URL("./package.json", import.meta.url)).json();
    const warned = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await inRepo(null, async () => {
        const { calls, spawnCommand } = createSpawnMock();
        await run({ argv: ["bun", "create-akan-workspace", "my-org"], spawnCommand: spawnCommand as never });
        expect(calls.at(0)?.args).toEqual([
          "install",
          "-g",
          `@akanjs/cli@${version}`,
          "--registry",
          "http://127.0.0.1:4873",
        ]);
      });
      expect(warned).not.toHaveBeenCalled();

      await inRepo("export AKAN_NPM_REGISTRY=http://127.0.0.1:4999\n", async () => {
        const { calls, spawnCommand } = createSpawnMock();
        await run({ argv: ["bun", "create-akan-workspace", "my-org"], spawnCommand: spawnCommand as never });
        expect(calls.map((call) => call.args)).toEqual([
          ["install", "-g", `@akanjs/cli@${version}`],
          ["create-workspace", "my-org", "--libs=false", "--init=true"],
        ]);
      });
      expect(warned.mock.calls.map(([line]) => line)).toEqual([
        "AKAN_NPM_REGISTRY is set in .env, which the repository controls, so it is ignored. Export it in your shell instead.",
      ]);
    } finally {
      warned.mockRestore();
    }
  });

  test.each([
    [".env.development.local", "AKAN_NPM_REGISTRY=http://127.0.0.1:4999\n"],
    [".env.production.local", "AKAN_NPM_REGISTRY=http://127.0.0.1:4999\n"],
    [".env.test.local", "AKAN_NPM_REGISTRY=http://127.0.0.1:4999\n"],
    [".env", "AKAN_NPM_REGISTRY: http://127.0.0.1:4999\n"],
    [".env.local", "export AKAN_NPM_REGISTRY:\thttp://127.0.0.1:4999\n"],
  ])("ignores the registry that %s names as %j", async (file, dotenv) => {
    const warned = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await inRepo(
        dotenv,
        async () => {
          const { calls, spawnCommand } = createSpawnMock();
          await run({ argv: ["bun", "create-akan-workspace", "my-org"], spawnCommand: spawnCommand as never });
          expect(calls.every((call) => !call.args.includes("--registry"))).toBe(true);
        },
        file,
      );
      expect(warned.mock.calls.map(([line]) => line)).toEqual([
        `AKAN_NPM_REGISTRY is set in ${file}, which the repository controls, so it is ignored. Export it in your shell instead.`,
      ]);
    } finally {
      warned.mockRestore();
    }
  });

  test("forwards libs=false when libs is omitted", async () => {
    const { calls, spawnCommand } = createSpawnMock();

    await run({
      argv: ["bun", "create-akan-workspace", "my-org", "--app", "web"],
      spawnCommand: spawnCommand as never,
    });

    expect(calls.at(1)?.args).toEqual(["create-workspace", "my-org", "--app=web", "--libs=false", "--init=true"]);
  });

  test("refuses a Bun older than its engines range before installing anything", async () => {
    const { calls, spawnCommand } = createSpawnMock();
    const printed = spyOn(console, "error").mockImplementation(() => undefined);
    const exitCode = process.exitCode;
    try {
      await run({
        argv: ["bun", "create-akan-workspace", "my-org"],
        spawnCommand: spawnCommand as never,
        bunVersion: "1.4.3",
      });

      expect(calls).toEqual([]);
      expect(process.exitCode).toBe(1);
      expect(printed).toHaveBeenCalledTimes(1);
      expect(printed.mock.calls[0]?.[0]).toContain("bun upgrade");
    } finally {
      printed.mockRestore();
      //? Bun ignores `process.exitCode = undefined`, so restoring an unset code needs the 0.
      process.exitCode = exitCode ?? 0;
    }
  });

  test("rejects and skips workspace creation when CLI install fails", async () => {
    const { calls, spawnCommand } = createSpawnMock([1]);

    await expect(
      run({
        argv: ["bun", "create-akan-workspace", "my-org"],
        spawnCommand: spawnCommand as never,
      }),
    ).rejects.toEqual({ code: 1, signal: null });
    expect(calls.map((call) => call.command)).toEqual(["bun"]);
  });
});
