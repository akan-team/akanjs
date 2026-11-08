import { describe, expect, spyOn, test } from "bun:test";
import type { SpawnOptions } from "node:child_process";
import { delimiter } from "node:path";
import { run } from "./run";

interface SpawnCall {
  command: string;
  args: string[];
  options: SpawnOptions;
}

const createSpawnMock = (outcomes: (number | Error)[] = []) => {
  const calls: SpawnCall[] = [];
  const spawnCommand = (command: string, args: readonly string[], options: SpawnOptions) => {
    calls.push({ command, args: [...args], options });
    const outcome = outcomes.shift() ?? 0;
    return {
      on(event: string, callback: (...args: unknown[]) => void) {
        if (outcome instanceof Error) {
          if (event === "error") queueMicrotask(() => callback(outcome));
        } else if (event === "exit") queueMicrotask(() => callback(outcome, null));
        return this;
      },
    };
  };

  return { calls, spawnCommand };
};

//? Windows spells the key `Path`, and the env the run hands a child is a plain copy without case-insensitive lookup.
const pathOf = (env: NodeJS.ProcessEnv) => env[Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH"];

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
        "--sample",
        "false",
      ],
      spawnCommand: spawnCommand as never,
    });

    expect(calls.map((call) => [call.command, call.args])).toEqual([
      ["bun", ["install", "-g", `@akanjs/cli@${version}`]],
      [
        "akan",
        [
          "create-workspace",
          "my-org",
          "--app=web",
          "--dir=./projects",
          "--libs=true",
          "--init=false",
          "--sample=false",
        ],
      ],
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
        [
          "create-workspace",
          "my-org",
          "--app=web",
          "--libs=false",
          "--init=true",
          "--sample=true",
          "--registry=http://127.0.0.1:4873",
        ],
      ],
    ]);
    expect(
      calls.every((call) => (call.options.env as NodeJS.ProcessEnv).AKAN_NPM_REGISTRY === "http://127.0.0.1:4873"),
    ).toBe(true);
  });

  test("forwards libs=false and sample=true when they are omitted", async () => {
    const { calls, spawnCommand } = createSpawnMock();

    await run({
      argv: ["bun", "create-akan-workspace", "my-org", "--app", "web"],
      spawnCommand: spawnCommand as never,
    });

    expect(calls.at(1)?.args).toEqual([
      "create-workspace",
      "my-org",
      "--app=web",
      "--libs=false",
      "--init=true",
      "--sample=true",
    ]);
  });

  test('forwards "." so the workspace is created in --dir itself', async () => {
    const { calls, spawnCommand } = createSpawnMock();

    await run({
      argv: ["bun", "create-akan-workspace", ".", "--app", "web", "--dir", "app", "-s", "false"],
      spawnCommand: spawnCommand as never,
    });

    expect(calls.at(1)?.args).toEqual([
      "create-workspace",
      ".",
      "--app=web",
      "--dir=app",
      "--libs=false",
      "--init=true",
      "--sample=false",
    ]);
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

  test("runs akan with Bun's global bin on PATH and says when the shell cannot reach it", async () => {
    const { calls, spawnCommand } = createSpawnMock();
    const warned = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await run({
        argv: ["bun", "create-akan-workspace", "my-org", "--app", "web"],
        spawnCommand: spawnCommand as never,
        getGlobalBinDir: () => "/opt/bun-global/bin",
      });

      const env = calls.at(1)?.options.env as NodeJS.ProcessEnv;
      expect(pathOf(env)?.split(delimiter)[0]).toBe("/opt/bun-global/bin");
      expect(warned).toHaveBeenCalledTimes(1);
      expect(warned.mock.calls[0]?.[0]).toContain("/opt/bun-global/bin");
    } finally {
      warned.mockRestore();
    }
  });

  test("leaves PATH alone when Bun's global bin is already on it", async () => {
    const { calls, spawnCommand } = createSpawnMock();
    const warned = spyOn(console, "warn").mockImplementation(() => undefined);
    const firstOnPath = process.env.PATH?.split(delimiter)[0] ?? "";
    try {
      await run({
        argv: ["bun", "create-akan-workspace", "my-org", "--app", "web"],
        spawnCommand: spawnCommand as never,
        getGlobalBinDir: () => firstOnPath,
      });

      const env = calls.at(1)?.options.env as NodeJS.ProcessEnv;
      expect(env.PATH).toBe(process.env.PATH);
      expect(warned).not.toHaveBeenCalled();
    } finally {
      warned.mockRestore();
    }
  });

  test("rejects instead of hanging when akan cannot be spawned", async () => {
    const notFound = new Error('Executable not found in $PATH: "akan"');
    const { calls, spawnCommand } = createSpawnMock([0, notFound]);

    await expect(
      run({
        argv: ["bun", "create-akan-workspace", "my-org"],
        spawnCommand: spawnCommand as never,
        getGlobalBinDir: () => undefined,
      }),
    ).rejects.toBe(notFound);
    expect(calls.map((call) => call.command)).toEqual(["bun", "akan"]);
  });
});
