import { afterEach, describe, expect, test } from "bun:test";
import { AppExecutor, WorkspaceExecutor } from "../executors";
import { App, getArgMetas, Lib, Module, Pkg, Sys, Workspace } from "./argMeta";
import { getInternalArgumentValue } from "./command";
import { command } from "./commandBuilder";
import {
  assertUniqueDependencies,
  CommandContainer,
  getDependencyKey,
  injectDependencies,
  runner,
  script,
} from "./dependencyBuilder";
import { formatCommandHelp, formatHelp } from "./helpFormatter";
import { getTargetMetas } from "./targetMeta";

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
const stripAnsi = (value: string) => value.replace(ansiPattern, "");

describe("command helper metadata", () => {
  afterEach(() => {
    CommandContainer.clear();
  });

  test("records targets, args, options, and internal executor tokens", () => {
    class ExampleRunner extends runner("example") {
      run() {
        return "ok";
      }
    }

    class ExampleScript extends script("example", [ExampleRunner]) {
      callRunner() {
        return this.exampleRunner.run();
      }
    }

    class ExampleCommand extends command("example", [ExampleScript], ({ public: publicTarget, dev }) => ({
      createModule: publicTarget({ short: true, desc: "Create a module" })
        .arg("moduleName", String, { desc: "module name", example: "user" })
        .option("count", Number, { desc: "count", default: 1 })
        .option("force", Boolean, { desc: "force", default: false })
        .with(Workspace, App, Lib, Sys, Pkg, Module)
        .exec(function (moduleName, count, force, workspace, app, lib, sys, pkg, module) {
          expect(this.exampleScript.callRunner()).toBe("ok");
          return { moduleName, count, force, workspace, app, lib, sys, pkg, module };
        }),
      devOnlyTask: dev({ devOnly: true, desc: "Hidden task" })
        .arg("targetName", String)
        .exec((targetName) => targetName),
    })) {}

    const targetMetas = getTargetMetas(ExampleCommand);
    expect(targetMetas.map((target) => target.key)).toEqual(["createModule", "devOnlyTask"]);
    expect(targetMetas[0]?.targetOption).toEqual({
      runsOnWorkspaceRoot: true,
      short: true,
      desc: "Create a module",
      type: "public",
    });
    expect(targetMetas[1]?.targetOption).toEqual({
      runsOnWorkspaceRoot: true,
      devOnly: true,
      desc: "Hidden task",
      type: "dev",
    });

    const [allArgMetas, optionMetas, internalArgMetas] = getArgMetas(ExampleCommand, "createModule");
    expect(allArgMetas.map((arg) => [arg.type, arg.idx])).toEqual([
      ["Argument", 0],
      ["Option", 1],
      ["Option", 2],
      ["Workspace", 3],
      ["App", 4],
      ["Lib", 5],
      ["Sys", 6],
      ["Pkg", 7],
      ["Module", 8],
    ]);
    expect(optionMetas.map((arg) => arg.name)).toEqual(["count", "force"]);
    const internalArgTypes = internalArgMetas.map((arg) => arg.type as string);
    expect(internalArgTypes).toEqual(["Argument", "Workspace", "App", "Lib", "Sys", "Pkg", "Module"]);

    const commandInstance = CommandContainer.get(ExampleCommand);
    const result = targetMetas[0]?.handler.call(
      commandInstance,
      "profile",
      2,
      true,
      { name: "workspace" },
      { name: "app" },
      { name: "lib" },
      { name: "sys" },
      { name: "pkg" },
      { name: "module" },
    );
    expect(result).toMatchObject({ moduleName: "profile", count: 2, force: true });
  });

  test("formats global and command help from helper metadata", () => {
    class HelpCommand extends command("help", ({ public: publicTarget, dev }) => ({
      buildApp: publicTarget({ desc: "Build app" })
        .with(App)
        .option("write", Boolean, { desc: "write generated files", default: true })
        .option("mode", String, {
          desc: "build mode",
          enum: [
            { label: "Fast", value: "fast" },
            { label: "Full", value: "full" },
          ],
        })
        .exec(() => undefined),
      generateModule: publicTarget({ desc: "Generate module" })
        .with(Module)
        .arg("modelName", String, { desc: "model name" })
        .exec(() => undefined),
      hiddenTask: dev({ devOnly: true, desc: "Hidden task" }).exec(() => undefined),
    })) {}

    const globalHelp = stripAnsi(formatHelp([HelpCommand], "1.2.3"));
    expect(globalHelp).toContain("Version: 1.2.3");
    expect(globalHelp).toContain("build-app [app]");
    expect(globalHelp).toContain("generate-module [sys:module] [modelName]");
    expect(globalHelp).not.toContain("hidden-task");

    const commandHelp = stripAnsi(formatCommandHelp(HelpCommand, "buildApp"));
    expect(commandHelp).toContain("akan build-app [app]");
    expect(commandHelp).toContain("--write");
    expect(commandHelp).toContain("[default: true]");
    expect(commandHelp).toContain("Fast, Full");
  });

  test("resolves the only app without prompting for selection", async () => {
    const workspace = new WorkspaceExecutor({ workspaceRoot: "/workspace", repoName: "repo" });
    workspace.getExecs = async () => [["single-command-test-app"], [], []];

    const app = await getInternalArgumentValue({ key: "", idx: 0, type: "App" }, undefined, workspace);

    expect(app).toBeInstanceOf(AppExecutor);
    expect(app.name).toBe("single-command-test-app");
    expect(app.workspace).toBe(workspace);
  });
});

describe("command helper dependency injection", () => {
  afterEach(() => {
    CommandContainer.clear();
  });

  test("creates stable dependency keys and singleton injected instances", () => {
    class StableRunner extends runner("stable") {
      readonly id = Math.random();
    }

    class StableScript extends script("stable", [StableRunner]) {}

    expect(StableRunner.refName).toBe("stable");
    expect(StableRunner.dependencyKind).toBe("runner");
    expect(StableRunner.dependencyKey).toBe("stableRunner");
    expect(StableScript.dependencyKind).toBe("script");
    expect(StableScript.dependencyKey).toBe("stableScript");
    expect(getDependencyKey(StableScript)).toBe("stableScript");

    const first = CommandContainer.get(StableScript);
    const second = CommandContainer.get(StableScript);
    expect(first).toBe(second);
    expect(first.stableRunner).toBe(CommandContainer.get(StableRunner));
    expect(Object.keys(first)).not.toContain("stableRunner");

    expect(() => {
      first.stableRunner = new StableRunner();
    }).toThrow();
  });

  test("rejects duplicate dependencies by class or generated key", () => {
    class OneRunner extends runner("duplicate") {}
    class AnotherRunner extends runner("duplicate") {}

    expect(() => assertUniqueDependencies([OneRunner, OneRunner])).toThrow("Duplicate command dependency class");
    expect(() => assertUniqueDependencies([OneRunner, AnotherRunner])).toThrow(
      'Duplicate command dependency key "duplicateRunner"',
    );
    expect(() => script("broken", [OneRunner, AnotherRunner])).toThrow(
      'Duplicate command dependency key "duplicateRunner"',
    );
  });

  test("injectDependencies detects circular command dependencies", () => {
    class CircularA {
      static readonly refName = "circularA";
      static readonly dependencyKind = "script";
      static readonly dependencyKey = "circularAScript";

      constructor() {
        CommandContainer.get(CircularB);
      }
    }

    class CircularB {
      static readonly refName = "circularB";
      static readonly dependencyKind = "script";
      static readonly dependencyKey = "circularBScript";

      constructor() {
        CommandContainer.get(CircularA);
      }
    }

    expect(() => CommandContainer.get(CircularA)).toThrow("Circular command dependency");
  });

  test("injects explicit dependency lists into arbitrary objects", () => {
    class DirectRunner extends runner("direct") {
      value = "runner";
    }

    const target = {};
    const injected = injectDependencies(target, [DirectRunner]);
    expect(injected.directRunner.value).toBe("runner");

    const descriptor = Object.getOwnPropertyDescriptor(injected, "directRunner");
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.writable).toBe(false);
  });
});
