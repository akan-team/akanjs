import { afterEach, describe, expect, mock, test } from "bun:test";
import { CommandContainer, getArgMetas, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { createCallRecorder, createFakeExecutor } from "../testHelpers";
import { LocalRegistryCommand } from "./localRegistry.command";
import { LocalRegistryRunner } from "./localRegistry.runner";
import { LocalRegistryScript } from "./localRegistry.script";

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
});

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
  test("normalizes the default local registry URL", () => {
    expect(new LocalRegistryRunner().getRegistryUrl("http://127.0.0.1:4873/")).toBe("http://127.0.0.1:4873");
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
