import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { AppExecutor, LibExecutor, WorkspaceExecutor } from "../executors";
import { makeCliTempWorkspace, tempRoots, writeText } from "../testHelpers";
import {
  App,
  type ArgMeta,
  type ArgsOption,
  getArgMetas,
  type InternalArgMeta,
  Lib,
  Module,
  Pkg,
  Sys,
  SysOrOnlyApp,
  Workspace,
} from "./argMeta";
import { getAppsArgumentValue, getArgumentValue, getInternalArgumentValue, getOptionValue } from "./command";
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
    expect(commandHelp).toContain("--write, --no-write");
    expect(commandHelp).toContain("[default: true]");
    expect(commandHelp).toContain("Fast, Full");
  });

  test("resolves the only app without prompting for selection", async () => {
    const workspace = new WorkspaceExecutor({ workspaceRoot: "/workspace", repoName: "repo" });
    workspace.getExecs = async () => [["single-command-test-app"], [], []];

    const app = await getInternalArgumentValue({ key: "", idx: 0, type: "App" }, undefined, workspace);

    if (!(app instanceof AppExecutor)) throw new Error(`expected an AppExecutor, got ${app.constructor.name}`);
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

describe("enum arg choices", () => {
  const optionMeta = (enumChoices: ArgsOption["enum"]): ArgMeta => ({
    name: "format",
    argsOption: { type: "string", enum: enumChoices },
    key: "run",
    idx: 0,
    type: "Option",
  });
  const argumentMeta = (enumChoices: ArgsOption["enum"]): ArgMeta => ({
    ...optionMeta(enumChoices),
    name: "action",
    type: "Argument",
  });
  const context = { values: {} };

  test("passes a declared choice through", async () => {
    expect(await getOptionValue(optionMeta(["text", "json"]), { format: "json" }, context)).toBe("json");
  });

  test("rejects an undeclared value in commander's wording", async () => {
    await expect(getOptionValue(optionMeta(["text", "json"]), { format: "yaml" }, context)).rejects.toThrow(
      "option '--format' argument 'yaml' is invalid. Allowed choices are text, json.",
    );
  });

  test("names a positional argument as an argument", async () => {
    await expect(getArgumentValue(argumentMeta(["scan", "ssr"]), "sssr")).rejects.toThrow(
      "argument 'action' argument 'sssr' is invalid. Allowed choices are scan, ssr.",
    );
  });

  test("kebab-cases a camelCase option name the way the flag is spelled", async () => {
    await expect(
      getOptionValue({ ...optionMeta(["apk", "aab"]), name: "assembleType" }, { assembleType: "ipa" }, context),
    ).rejects.toThrow("option '--assemble-type'");
  });

  test("compares a labelled choice by its value, not its label", async () => {
    const labelled = optionMeta([{ label: "JSON output", value: "json" }]);
    expect(await getOptionValue(labelled, { format: "json" }, context)).toBe("json");
    await expect(getOptionValue(labelled, { format: "JSON output" }, context)).rejects.toThrow("is invalid");
  });

  test("leaves a dynamic choice list unchecked", async () => {
    expect(
      await getOptionValue(
        optionMeta(() => ["text"]),
        { format: "anything" },
        context,
      ),
    ).toBe("anything");
  });

  test("a nullable option left out is null, not a prompt for one of its choices", async () => {
    const arch = { ...optionMeta(["arm64", "x64"]), name: "arch" };
    expect(await getOptionValue({ ...arch, argsOption: { ...arch.argsOption, nullable: true } }, {}, context)).toBe(
      null,
    );
  });

  test("an option with no enum is unaffected", async () => {
    expect(await getOptionValue(optionMeta(undefined), { format: "whatever" }, context)).toBe("whatever");
  });
});

describe("prompts on a stdin that is not a terminal", () => {
  const ownIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });
  });
  afterEach(() => {
    if (ownIsTTY) Object.defineProperty(process.stdin, "isTTY", ownIsTTY);
    else Reflect.deleteProperty(process.stdin, "isTTY");
  });
  const metaOf = (type: "Argument" | "Option", name: string, argsOption: ArgsOption = {}): ArgMeta => ({
    name,
    argsOption: { type: "string", ...argsOption },
    key: "run",
    idx: 0,
    type,
  });
  const context = { values: {} };
  const workspaceWith = (appNames: string[]) => {
    const workspace = new WorkspaceExecutor({ workspaceRoot: "/workspace", repoName: "repo" });
    workspace.getExecs = async () => [appNames, ["util"], []];
    workspace.getApps = async () => appNames;
    return workspace;
  };

  test("a missing positional is refused by name instead of read from the pipe", async () => {
    await expect(getArgumentValue(metaOf("Argument", "name", { desc: "secret name" }), undefined)).rejects.toThrow(
      "Missing argument 'name': stdin is not a terminal to prompt on, so pass it on the command line.",
    );
    await expect(getArgumentValue(metaOf("Argument", "action", { enum: ["scan", "ssr"] }), undefined)).rejects.toThrow(
      "Missing argument 'action': stdin is not a terminal to prompt on, so pass it on the command line (choices: scan, ssr).",
    );
  });

  test("a missing option names its flag and the values it takes", async () => {
    await expect(
      getOptionValue(metaOf("Option", "platform", { enum: ["ios", "android"] }), {}, context),
    ).rejects.toThrow(
      "Missing option '--platform': stdin is not a terminal to prompt on, so pass it on the command line (choices: ios, android).",
    );
    await expect(
      getOptionValue(
        metaOf("Option", "format", { enum: [{ label: "JSON output", value: "json" }, "text"] }),
        {},
        context,
      ),
    ).rejects.toThrow("(choices: json, text)");
    await expect(getOptionValue(metaOf("Option", "assembleType"), {}, context)).rejects.toThrow(
      "Missing option '--assemble-type'",
    );
    await expect(getOptionValue(metaOf("Option", "force", { type: "boolean" }), {}, context)).rejects.toThrow(
      "Missing option '--force'",
    );
  });

  test("a value given, defaulted, nullable or the only choice still resolves without a prompt", async () => {
    expect(await getArgumentValue(metaOf("Argument", "name"), "NPM_TOKEN")).toBe("NPM_TOKEN");
    expect(await getOptionValue(metaOf("Option", "env", { default: "main" }), {}, context)).toBe("main");
    expect(await getOptionValue(metaOf("Option", "host", { nullable: true }), {}, context)).toBe(null);
    expect(await getOptionValue(metaOf("Option", "target", { enum: async () => ["default"] }), {}, context)).toBe(
      "default",
    );
    const [app] = await getAppsArgumentValue(undefined, workspaceWith(["web"]));
    expect(app?.name).toBe("web");
  });

  test("an app that is missing or unknown is refused with the workspace's apps", async () => {
    const workspace = workspaceWith(["web", "admin"]);
    await expect(getInternalArgumentValue({ key: "", idx: 0, type: "App" }, undefined, workspace)).rejects.toThrow(
      "Missing app: stdin is not a terminal to prompt on, so pass it on the command line (choices: web, admin).",
    );
    await expect(getInternalArgumentValue({ key: "", idx: 0, type: "App" }, "globex", workspace)).rejects.toThrow(
      "Unknown app 'globex'",
    );
    await expect(getInternalArgumentValue({ key: "", idx: 0, type: "Sys" }, "globex", workspace)).rejects.toThrow(
      "Unknown app or lib 'globex': stdin is not a terminal to prompt on, so pass it on the command line (choices: web, admin, util).",
    );
    await expect(getInternalArgumentValue({ key: "", idx: 0, type: "Module" }, undefined, workspace)).rejects.toThrow(
      "Missing module",
    );
    await expect(getAppsArgumentValue(undefined, workspace)).rejects.toThrow("(choices: web, admin, all)");
  });
});

describe("enum arg type inference", () => {
  afterEach(() => {
    CommandContainer.clear();
  });

  //? Compile-time only: if `enum` stops narrowing, the parameter widens and these calls stop typechecking.
  const expectLiteral = <Expected>(_value: Expected) => undefined;

  test("a static enum narrows the exec parameter to its declared choices", () => {
    class InferenceRunner extends runner("inference") {}
    class InferenceScript extends script("inference", [InferenceRunner]) {}

    class InferenceCommand extends command("inference", [InferenceScript], ({ public: target }) => ({
      run: target({ desc: "run" })
        .arg("action", String, { enum: ["scan", "ssr"] })
        .option("format", String, { enum: ["text", "json"], default: "text" })
        .option("count", Number, { enum: [1, 2] })
        .option("scope", String, { enum: ["all", "one"], nullable: true })
        .option("label", String, { enum: [{ label: "JSON output", value: "json" }] })
        .option("plain", String, { desc: "no choices declared" })
        .option("dynamic", String, { enum: () => ["a", "b"] })
        .exec(async (action, format, count, scope, label, plain, dynamic) => {
          expectLiteral<"scan" | "ssr">(action);
          expectLiteral<"text" | "json">(format);
          expectLiteral<1 | 2>(count);
          expectLiteral<"all" | "one" | null>(scope);
          expectLiteral<"json">(label);
          expectLiteral<string>(plain);
          expectLiteral<string>(dynamic);
        }),
    })) {}

    const [targetMeta] = getTargetMetas(InferenceCommand);
    expect(targetMeta?.key).toBe("run");
    expect(targetMeta?.args.map((arg) => ("name" in arg ? arg.name : arg.type))).toEqual([
      "action",
      "format",
      "count",
      "scope",
      "label",
      "plain",
      "dynamic",
    ]);
  });
});

describe("a Sys that defaults to the only app", () => {
  const ownIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const asked: unknown[] = [];
  let answer = "";
  const setTTY = (isTTY: boolean | undefined) =>
    Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
  beforeEach(() => {
    asked.length = 0;
    mock.module("@inquirer/prompts", () => ({
      select: async ({ choices }: { choices: unknown[] }) => {
        asked.push(choices);
        return answer;
      },
    }));
  });
  afterEach(() => {
    CommandContainer.clear();
    if (ownIsTTY) Object.defineProperty(process.stdin, "isTTY", ownIsTTY);
    else Reflect.deleteProperty(process.stdin, "isTTY");
  });
  const workspaceWith = (appNames: string[]) => {
    const workspace = new WorkspaceExecutor({ workspaceRoot: "/workspace", repoName: "repo" });
    workspace.getExecs = async () => [appNames, ["util"], []];
    return workspace;
  };
  const sysMetaOf = (key: "typecheck" | "sync") => {
    class OnlyAppCommand extends command("onlyApp", ({ public: target }) => ({
      typecheck: target({ desc: "opted in" })
        .with(SysOrOnlyApp)
        .exec((sys) => sys),
      sync: target({ desc: "plain" })
        .with(Sys)
        .exec((sys) => sys),
    })) {}
    const meta = getArgMetas(OnlyAppCommand, key)[0].find((arg): arg is InternalArgMeta => arg.type === "Sys");
    if (!meta) throw new Error(`no Sys meta on ${key}`);
    return meta;
  };

  test("the opted-in command takes a one-app workspace's app without asking, even on a piped stdin", async () => {
    setTTY(undefined);
    const meta = sysMetaOf("typecheck");
    expect(meta.option).toEqual({ onlyApp: true });

    const app = await getInternalArgumentValue(meta, undefined, workspaceWith(["web"]));
    expect(app instanceof AppExecutor ? app.name : null).toBe("web");
    expect(asked).toEqual([]);
  });

  test("a plain Sys command still asks app or library in a one-app workspace", async () => {
    setTTY(true);
    answer = "util";
    const meta = sysMetaOf("sync");
    expect(meta.option).toBeUndefined();

    const lib = await getInternalArgumentValue(meta, undefined, workspaceWith(["web"]));
    expect(lib instanceof LibExecutor ? lib.name : null).toBe("util");
    expect(asked).toEqual([["web", "util"]]);
  });

  test("the opted-in command still asks when the workspace has two apps", async () => {
    setTTY(true);
    answer = "admin";
    const app = await getInternalArgumentValue(sysMetaOf("typecheck"), undefined, workspaceWith(["web", "admin"]));
    expect(app instanceof AppExecutor ? app.name : null).toBe("admin");
    expect(asked).toEqual([["web", "admin", "util"]]);
  });
});

describe("the exit code of a command that failed", () => {
  const track = tempRoots();
  const run = async (failure: string) => {
    const { root } = track(await makeCliTempWorkspace());
    await writeText(path.join(root, "package.json"), '{ "name": "repo", "version": "1.0.0" }\n');
    await writeText(path.join(root, "tsconfig.json"), "{}\n");
    const entry = path.join(root, "cli.ts");
    await writeText(
      entry,
      [
        `import { command, ExitCodeError, runCommands, runner, script } from ${JSON.stringify(path.join(import.meta.dir, "index.ts"))};`,
        'class VerdictRunner extends runner("verdict") {}',
        'class VerdictScript extends script("verdict", [VerdictRunner]) {}',
        'class VerdictCommand extends command("verdict", [VerdictScript], ({ public: target }) => ({',
        '  verdict: target({ desc: "fails" }).exec(async function () {',
        `    throw ${failure};`,
        "  }),",
        "})) {}",
        "await runCommands(VerdictCommand);",
        "",
      ].join("\n"),
    );
    const proc = Bun.spawn(["bun", entry, "verdict"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return { stdout, code };
  };

  test("is the one an ExitCodeError carries, and 1 for any other error", async () => {
    const verdict = await run('new ExitCodeError("needs a new store build", 2)');
    expect(verdict.stdout).toContain("needs a new store build");
    expect(verdict.code).toBe(2);
    expect((await run('new Error("broke")')).code).toBe(1);
  }, 30_000);
});
