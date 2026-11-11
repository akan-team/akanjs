import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import path from "node:path";
import { CommandContainer, getArgMetas, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import {
  createCallRecorder,
  createFakeExecutor,
  makeCliTempWorkspace,
  tempRoots,
} from "@akanjs/devkit/test/testHelpers";
import { Logger } from "akanjs/common";
import { LocalRegistryCommand } from "./localRegistry.command";
import { LocalRegistryRunner } from "./localRegistry.runner";
import { LocalRegistryScript } from "./localRegistry.script";

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
});
const track = tempRoots();

describe("LocalRegistryCommand", () => {
  test("uses globally unique dev-only command names", () => {
    const metas = getTargetMetas(LocalRegistryCommand);

    expect(metas.map((meta) => meta.key)).toEqual(["startRegistry", "resetRegistry", "smokeRegistry"]);
    expect(metas.every((meta) => meta.targetOption.devOnly)).toBe(true);
    expect(
      getArgMetas(LocalRegistryCommand, "smokeRegistry")[1].find((meta) => meta.name === "tag")?.argsOption.flag,
    ).toBe("g");
  });
});

describe("LocalRegistryScript", () => {
  test("tests, builds, publishes Akan packages, and runs the generated workspace smoke", async () => {
    const script = CommandContainer.get(LocalRegistryScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);

    script.packageScript.updateWorskpaceRootPackageJson = async (...args) =>
      recorder.record("updateRootPackageJson", ...args);
    script.localRegistryRunner.start = async (...args) => {
      recorder.record("start", ...args);
      return "http://127.0.0.1:4873";
    };
    script.cloudRunner.getAkanPkgs = async (...args) => {
      recorder.record("getAkanPkgs", ...args);
      return ["akanjs", "@akanjs/cli"];
    };
    script.applicationScript.test = async (...args) => recorder.record("test", ...args);
    script.packageScript.buildPackage = async (...args) => recorder.record("buildPackage", ...args);
    script.packageScript.verifyAkanPublishPackages = async (...args) =>
      recorder.record("verifyAkanPublishPackages", ...args);
    script.cloudRunner.deployAkan = async (...args) => recorder.record("deployAkan", ...args);
    script.localRegistryRunner.smoke = async (...args) => recorder.record("smoke", ...args);

    await script.smoke(workspace as never, { tag: "rc", registryUrl: "http://127.0.0.1:4873" });

    expect(recorder.names()).toEqual([
      "start",
      "getAkanPkgs",
      "updateRootPackageJson",
      "test",
      "test",
      "buildPackage",
      "buildPackage",
      "verifyAkanPublishPackages",
      "deployAkan",
      "smoke",
    ]);
    expect(recorder.calls.at(-3)?.args).toEqual([workspace]);
    expect(recorder.calls.at(-2)?.args).toEqual([
      workspace,
      ["akanjs", "@akanjs/cli"],
      { registryUrl: "http://127.0.0.1:4873", confirmPublish: false, tag: "rc" },
    ]);
    expect(recorder.calls.at(-1)?.args).toEqual([workspace, { registryUrl: "http://127.0.0.1:4873" }]);
  });
});

describe("LocalRegistryRunner", () => {
  test("smoke hands the generated workspace an env without this repo's .env keys, so its own .env decides", async () => {
    const { root } = track(await makeCliTempWorkspace());
    await Bun.write(path.join(root, ".env"), "AKAN_PUBLIC_ENV=debug\nAKAN_PUBLIC_REPO_NAME=akanjs\n");
    const saved = { env: process.env.AKAN_PUBLIC_ENV, repo: process.env.AKAN_PUBLIC_REPO_NAME };
    Object.assign(process.env, { AKAN_PUBLIC_ENV: "debug", AKAN_PUBLIC_REPO_NAME: "akanjs" });
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", { workspaceRoot: root }, recorder);
    try {
      await new LocalRegistryRunner().smoke(workspace as never, { registryUrl: "http://127.0.0.1:4873" });
    } finally {
      for (const [key, value] of [
        ["AKAN_PUBLIC_ENV", saved.env],
        ["AKAN_PUBLIC_REPO_NAME", saved.repo],
      ] as const)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }

    const spawns = recorder.calls.filter((call) => call.name === "workspace.spawn");
    expect(spawns.map((call) => (call.args[1] as string[])[0])).toEqual([
      "dist/pkgs/create-akan-workspace/index.js",
      "typecheck",
      "build",
    ]);
    for (const call of spawns) {
      const { env } = call.args[2] as { env: Record<string, string | undefined> };
      expect(env).not.toHaveProperty("AKAN_PUBLIC_ENV");
      expect(env).not.toHaveProperty("AKAN_PUBLIC_REPO_NAME");
      expect(env.AKAN_NPM_REGISTRY).toBe("http://127.0.0.1:4873");
    }
  });

  test("normalizes the default local registry URL", () => {
    expect(new LocalRegistryRunner().getRegistryUrl("http://127.0.0.1:4873/")).toBe("http://127.0.0.1:4873");
  });

  test("publishes the registry port on the interface its URL names, loopback by default", async () => {
    const { root } = track(await makeCliTempWorkspace());
    const runWith = async (registryUrl?: string) => {
      const recorder = createCallRecorder();
      const workspace = createFakeExecutor(
        "workspace",
        {
          workspaceRoot: root,
          spawn: async (command: string, args: string[]) => {
            recorder.record("workspace.spawn", command, args);
            if (args[0] === "inspect") throw new Error("No such object: akan-verdaccio");
            return "";
          },
        },
        recorder,
      );
      await new LocalRegistryRunner().start(workspace as never, { registryUrl });
      const run = recorder.calls.find((call) => (call.args[1] as string[])[0] === "run")?.args[1] as string[];
      return run[run.indexOf("-p") + 1];
    };

    expect(await runWith("http://127.0.0.1:4873")).toBe("127.0.0.1:4873:4873");
    expect(await runWith("http://localhost:4900")).toBe("127.0.0.1:4900:4873");
    expect(await runWith("http://0.0.0.0:4873")).toBe("0.0.0.0:4873:4873");
  });

  test("warns when the running registry container listens on every interface", async () => {
    const warn = spyOn(Logger, "warn");
    const inspected = JSON.stringify([
      { HostConfig: { PortBindings: { "4873/tcp": [{ HostIp: "", HostPort: "4873" }] } } },
    ]);
    const workspace = createFakeExecutor("workspace", { spawn: async () => inspected });

    await new LocalRegistryRunner().start(workspace as never, { registryUrl: "http://127.0.0.1:4873" });

    expect(warn.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "listens on every network interface",
    );
  });

  test("typechecks the generated published-package workspace before building it", async () => {
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);

    await new LocalRegistryRunner().smoke(workspace as never, { registryUrl: "http://127.0.0.1:4873/" });

    const spawnCalls = recorder.calls.filter((call) => call.name === "workspace.spawn");
    expect(spawnCalls.map((call) => call.args.slice(0, 2))).toEqual([
      [
        process.execPath,
        [
          "dist/pkgs/create-akan-workspace/index.js",
          "akan-local-smoke",
          "--app",
          "demo",
          "--dir",
          ".akan/e2e",
          "--init",
          "true",
          "--registry",
          "http://127.0.0.1:4873",
        ],
      ],
      ["akan", ["typecheck", "demo"]],
      ["akan", ["build", "demo"]],
    ]);
  });
});
