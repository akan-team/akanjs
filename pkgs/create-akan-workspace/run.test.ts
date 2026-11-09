import { describe, expect, spyOn, test } from "bun:test";
import type { SpawnOptions } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { delimiter } from "node:path";
import { isBunOnLastingPath, run } from "./run";

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

  test("takes the registry from the shell, but not from a dotenv file in the working directory", async () => {
    const { version } = await Bun.file(new URL("./package.json", import.meta.url)).json();
    const warned = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await inRepo(null, async () => {
        const { calls, spawnCommand } = createSpawnMock();
        await run({
          argv: ["bun", "create-akan-workspace", "my-org"],
          spawnCommand: spawnCommand as never,
          getGlobalBinDir: () => undefined,
        });
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
        await run({
          argv: ["bun", "create-akan-workspace", "my-org"],
          spawnCommand: spawnCommand as never,
          getGlobalBinDir: () => undefined,
        });
        expect(calls.map((call) => call.args)).toEqual([
          ["install", "-g", `@akanjs/cli@${version}`],
          ["create-workspace", "my-org", "--libs=false", "--init=true", "--sample=true"],
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
          await run({
            argv: ["bun", "create-akan-workspace", "my-org"],
            spawnCommand: spawnCommand as never,
            getGlobalBinDir: () => undefined,
          });
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
        isBunOnPath: () => true,
      });

      const env = calls.at(1)?.options.env as NodeJS.ProcessEnv;
      expect(pathOf(env)?.split(delimiter)[0]).toBe("/opt/bun-global/bin");
      expect(calls.at(1)?.args.some((arg) => arg.startsWith("--bun-dependency"))).toBe(false);
      expect(warned).toHaveBeenCalledTimes(1);
      expect(warned.mock.calls[0]?.[0]).toContain("/opt/bun-global/bin");
    } finally {
      warned.mockRestore();
    }
  });

  test("lists Bun in the workspace and points at npm when the Bun running it is not on PATH", async () => {
    const { calls, spawnCommand } = createSpawnMock();
    const warned = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await run({
        argv: ["bun", "create-akan-workspace", ".", "--app", "pokedex", "--dir", "app", "--sample", "false"],
        spawnCommand: spawnCommand as never,
        bunVersion: "1.4.4",
        getGlobalBinDir: () => "/opt/bun-global/bin",
        isBunOnPath: () => false,
      });

      expect(calls.at(1)?.args.at(-1)).toBe("--bun-dependency=1.4.4");
      expect(warned).toHaveBeenCalledTimes(1);
      expect(warned.mock.calls[0]?.[0]).toContain("`npm run build`");
      expect(warned.mock.calls[0]?.[0]).toContain("`npx akan <command>`");
      expect(warned.mock.calls[0]?.[0]).not.toContain("/opt/bun-global/bin");
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

describe("isBunOnLastingPath", () => {
  test("skips the node_modules/.bin folders npx puts on PATH for one run, in either spelling of the PATH key", () => {
    const root = mkdtempSync(path.join(tmpdir(), "create-akan-workspace-path-"));
    try {
      const npxBin = path.join(root, "_npx", "9ec17c29", "node_modules", ".bin");
      const installed = path.join(root, "bun-home", "bin");
      for (const dir of [npxBin, installed]) {
        mkdirSync(dir, { recursive: true });
        const file = path.join(dir, process.platform === "win32" ? "bun.exe" : "bun");
        writeFileSync(file, "");
        chmodSync(file, 0o755);
      }

      expect(isBunOnLastingPath({ PATH: npxBin })).toBe(false);
      expect(isBunOnLastingPath({ Path: [npxBin, installed].join(delimiter) })).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
