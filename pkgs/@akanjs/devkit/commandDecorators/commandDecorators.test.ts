import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { AppExecutor, LibExecutor, ModuleExecutor, PkgExecutor, WorkspaceExecutor } from "../executors";
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
import {
  getAppsArgumentValue,
  getArgumentValue,
  getInternalArgumentValue,
  getOptionValue,
  rerunCommandOf,
} from "./command";
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
  const ownCwd = process.cwd();
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
    process.chdir(ownCwd);
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
  const track = tempRoots();
  //? From the workspace root, as the CLI runs: getDirInModule stats its entries relative to the process directory.
  const moduleWorkspace = async () => {
    const { root, workspace } = track(await makeCliTempWorkspace());
    process.chdir(root);
    for (const [sys, name] of [
      ["apps/web", "card"],
      ["libs/util", "photo"],
    ] as const) {
      await writeText(path.join(root, sys, "akan.config.ts"), "export default {};\n");
      await writeText(path.join(root, sys, "lib", name, `${name}.constant.ts`), "export {};\n");
    }
    await writeText(path.join(root, "apps/web/lib/_billing/billing.service.ts"), "export {};\n");
    return workspace;
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

  test("a terminal is still asked when the workspace holds a single app or lib", async () => {
    setTTY(true);
    answer = "web";
    const workspace = workspaceWith([]);
    workspace.getExecs = async () => [["web"], [], []];
    const app = await getInternalArgumentValue(sysMetaOf("sync"), undefined, workspace);
    expect(app instanceof AppExecutor ? app.name : null).toBe("web");
    expect(asked).toEqual([["web"]]);
  });

  test("without a terminal, an Exec takes the workspace's only app, lib or pkg", async () => {
    setTTY(undefined);
    const workspace = workspaceWith([]);
    workspace.getExecs = async () => [[], [], ["tools"]];
    const pkg = await getInternalArgumentValue({ key: "", idx: 0, type: "Exec" }, undefined, workspace);
    expect(pkg instanceof PkgExecutor ? pkg.name : null).toBe("tools");
    expect(asked).toEqual([]);
  });

  test("without a terminal, a command that deletes nothing takes the only lib, pkg or module; a terminal is asked", async () => {
    setTTY(undefined);
    const workspace = workspaceWith([]);
    workspace.getExecs = async () => [[], ["util"], []];
    workspace.getPkgs = async () => ["tools"];
    workspace.getDirInModule = async (basePath) => (basePath === "libs/util/lib" ? ["photo"] : []);
    const lib = await getInternalArgumentValue({ key: "", idx: 0, type: "Lib" }, undefined, workspace);
    expect(lib instanceof LibExecutor ? lib.name : null).toBe("util");
    const pkg = await getInternalArgumentValue({ key: "", idx: 0, type: "Pkg" }, undefined, workspace);
    expect(pkg instanceof PkgExecutor ? pkg.name : null).toBe("tools");
    const mod = await getInternalArgumentValue({ key: "", idx: 0, type: "Module" }, undefined, workspace);
    expect(mod instanceof ModuleExecutor ? `${mod.sys.name}:${mod.name}` : null).toBe("util:photo");
    expect(asked).toEqual([]);

    setTTY(true);
    answer = "util";
    await getInternalArgumentValue({ key: "", idx: 0, type: "Lib" }, undefined, workspace);
    expect(asked).toEqual([["util"]]);
  });

  test("without a terminal, a named target the workspace lacks is refused, not swapped for the only one", async () => {
    setTTY(undefined);
    const workspace = workspaceWith([]);
    workspace.getExecs = async () => [["web"], [], []];
    await expect(
      getInternalArgumentValue(sysMetaOf("sync"), "webb", workspace, rerunCommandOf(["sync", "webb"], ["webb"], 0)),
    ).rejects.toThrow(
      "Unknown app or lib 'webb': stdin is not a terminal to prompt on, so rerun it as `akan sync <app-or-lib>` (choices: web).",
    );
    expect(asked).toEqual([]);
  });

  test("a destructive command never takes the only app, lib, pkg or module, nor asks, terminal or not", async () => {
    const workspace = workspaceWith([]);
    workspace.getExecs = async () => [["web"], ["util"], []];
    workspace.getPkgs = async () => ["tools"];
    workspace.getDirInModule = async (basePath) => (basePath === "apps/web/lib" ? ["pokemon"] : []);
    const refusedAs = (rerun: string, choices: string) =>
      `: this command deletes files and never picks its target, so rerun it as \`${rerun}\` (choices: ${choices}).`;
    const resolve = (type: InternalArgMeta["type"], commandName: string, operands: (string | undefined)[]) =>
      getInternalArgumentValue(
        { key: "", idx: operands.length - 1, type },
        operands.at(-1),
        workspace,
        rerunCommandOf(
          [commandName, ...operands.filter((operand): operand is string => operand !== undefined)],
          operands,
          operands.length - 1,
        ),
        { destructive: true },
      );
    for (const isTTY of [true, undefined]) {
      setTTY(isTTY);
      answer = "web";
      await expect(resolve("App", "remove-application", [undefined])).rejects.toThrow(
        `Missing app${refusedAs("akan remove-application <app>", "web")}`,
      );
      await expect(resolve("Lib", "remove-library", [undefined])).rejects.toThrow(
        `Missing lib${refusedAs("akan remove-library <lib>", "util")}`,
      );
      await expect(resolve("Pkg", "remove-package", [undefined])).rejects.toThrow(
        `Missing pkg${refusedAs("akan remove-package <pkg>", "tools")}`,
      );
      await expect(resolve("Module", "remove-module", [undefined])).rejects.toThrow(
        `Missing module${refusedAs("akan remove-module <sys:module>", "web:pokemon")}`,
      );
      await expect(resolve("Sys", "remove-scalar", ["place", undefined])).rejects.toThrow(
        `Missing app or lib${refusedAs("akan remove-scalar place <app-or-lib>", "web, util")}`,
      );
      await expect(resolve("App", "remove-application", ["webb"])).rejects.toThrow(
        `Unknown app 'webb'${refusedAs("akan remove-application <app>", "web")}`,
      );
    }
    expect(asked).toEqual([]);
  });

  test("a destructive command takes the target it is named, while another still takes the only app", async () => {
    setTTY(undefined);
    const workspace = workspaceWith([]);
    workspace.getExecs = async () => [["web"], [], []];
    const named = await getInternalArgumentValue({ key: "", idx: 0, type: "App" }, "web", workspace, undefined, {
      destructive: true,
    });
    expect(named instanceof AppExecutor ? named.name : null).toBe("web");
    const taken = await getInternalArgumentValue(sysMetaOf("typecheck"), undefined, workspace);
    expect(taken instanceof AppExecutor ? taken.name : null).toBe("web");
    expect(asked).toEqual([]);
  });

  test("a module an app or a lib lacks is refused with the modules there are, in a terminal too", async () => {
    setTTY(true);
    answer = "util";
    const workspace = await moduleWorkspace();
    for (const value of ["util:nope", "web:nope"]) {
      const sysName = value.split(":")[0];
      await expect(
        getInternalArgumentValue(
          { key: "", idx: 0, type: "Module" },
          value,
          workspace,
          rerunCommandOf(["create-view", value], [value], 0),
        ),
      ).rejects.toThrow(
        `Unknown module '${value}': ${sysName} has no such module, so rerun it as \`akan create-view <sys:module>\` (choices: web:card, util:photo).`,
      );
    }
    expect(asked).toEqual([]);
    const photo = await getInternalArgumentValue({ key: "", idx: 0, type: "Module" }, "util:photo", workspace);
    expect(photo instanceof ModuleExecutor ? `${photo.sys.name}:${photo.name}` : null).toBe("util:photo");
  });

  test("a service module is taken by its exact name where the target opts in, as remove-module does", async () => {
    setTTY(true);
    const workspace = await moduleWorkspace();
    const services = { key: "", idx: 0, type: "Module", option: { services: true } } as const;
    const billing = await getInternalArgumentValue(services, "web:_billing", workspace, undefined, {
      destructive: true,
    });
    expect(billing instanceof ModuleExecutor ? `${billing.sys.name}:${billing.name}` : null).toBe("web:_billing");
    await expect(
      getInternalArgumentValue(services, undefined, workspace, rerunCommandOf(["remove-module"], [undefined], 0), {
        destructive: true,
      }),
    ).rejects.toThrow(
      "so rerun it as `akan remove-module <sys:module>` (choices: web:card, web:_billing, util:photo).",
    );
    await expect(
      getInternalArgumentValue({ key: "", idx: 0, type: "Module" }, "web:_billing", workspace),
    ).rejects.toThrow("Unknown module 'web:_billing': web has no such module");
    expect(asked).toEqual([]);
  });
});

describe("the line a refused target is rerun with", () => {
  test("puts the target in its operand slot, after the operands before it, keeping every option", () => {
    expect(rerunCommandOf(["test", "--write", "false"], [undefined, undefined], 0)("<t>")).toBe(
      "akan test <t> --write false",
    );
    expect(rerunCommandOf(["create-module", "--page", "true", "photo"], ["photo", undefined], 1)("web")).toBe(
      "akan create-module --page true photo web",
    );
    expect(rerunCommandOf(["build", "--env", "it's main"], [undefined], 0)("web")).toBe(
      "akan build web --env 'it'\\''s main'",
    );
  });

  test("takes the place of a target that was given but is not in the workspace", () => {
    expect(rerunCommandOf(["sync", "nope"], ["nope"], 0)("<app-or-lib>")).toBe("akan sync <app-or-lib>");
  });
});

describe("a target left out where no terminal can ask for it", () => {
  const track = tempRoots();
  const run = async (apps: string[], args = ["create-thing", "photo", "--force"]) => {
    const { root } = track(await makeCliTempWorkspace());
    await writeText(path.join(root, "package.json"), '{ "name": "repo", "version": "1.0.0" }\n');
    await writeText(path.join(root, "tsconfig.json"), "{}\n");
    for (const app of apps) await writeText(path.join(root, "apps", app, "akan.config.ts"), "export default {};\n");
    const entry = path.join(root, "cli.ts");
    await writeText(
      entry,
      [
        `import { App, command, runCommands, Sys } from ${JSON.stringify(path.join(import.meta.dir, "index.ts"))};`,
        'class ThingCommand extends command("thing", ({ public: target }) => ({',
        '  createThing: target({ desc: "creates a thing" })',
        '    .arg("thing", String, { desc: "name of the thing" })',
        "    .with(Sys)",
        '    .option("force", Boolean, { default: false })',
        "    .exec(async function (thing, sys, force) {",
        '      process.stdout.write(thing + " in " + sys.name + ", force " + force + "\\n");',
        "    }),",
        '  removeThing: target({ desc: "removes an app", destructive: true })',
        "    .with(App)",
        "    .exec(async function (app) {",
        '      process.stdout.write("removed " + app.name + "\\n");',
        "    }),",
        "})) {}",
        "await runCommands(ThingCommand);",
        "",
      ].join("\n"),
    );
    const proc = Bun.spawn(["bun", entry, ...args], {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, code };
  };

  test("runs on the workspace's only app or lib, naming it on stderr", async () => {
    const ran = await run(["web"]);
    expect(ran.code).toBe(0);
    expect(ran.stdout).toContain("photo in web, force true\n");
    expect(ran.stderr).toContain(
      "No app or lib named, so this runs on 'web', the only one in this workspace: akan create-thing photo web --force",
    );
  }, 30_000);

  test("exits at once with the choices and the line to rerun when there are several", async () => {
    const refused = await run(["web", "admin"]);
    expect(refused.code).toBe(2);
    expect(refused.stdout).toContain(
      "Missing app or lib: stdin is not a terminal to prompt on, so rerun it as `akan create-thing photo <app-or-lib> --force`",
    );
    expect(refused.stdout).toMatch(/\(choices: (web, admin|admin, web)\)\./);
    expect(refused.stdout).not.toContain("photo in");
  }, 30_000);

  test("a destructive command exits with the line to rerun even when the workspace has one app", async () => {
    const refused = await run(["web"], ["remove-thing"]);
    expect(refused.code).toBe(2);
    expect(refused.stdout).toContain(
      "Missing app: this command deletes files and never picks its target, so rerun it as `akan remove-thing <app>` (choices: web).",
    );
    expect(refused.stdout).not.toContain("removed");
    expect((await run(["web"], ["remove-thing", "web"])).stdout).toContain("removed web\n");
  }, 30_000);
});

describe("the exit code of a command that failed", () => {
  const track = tempRoots();
  const run = async (
    failure: string,
    { option = "", args = [], argv = ["verdict", ...args] }: { option?: string; args?: string[]; argv?: string[] } = {},
  ) => {
    const { root } = track(await makeCliTempWorkspace());
    await writeText(path.join(root, "package.json"), '{ "name": "repo", "version": "1.0.0" }\n');
    await writeText(path.join(root, "tsconfig.json"), "{}\n");
    const entry = path.join(root, "cli.ts");
    await writeText(
      entry,
      [
        `import { AkanError } from ${JSON.stringify(Bun.resolveSync("akanjs/base", import.meta.dir))};`,
        `import { CliError, command, ExitCodeError, markCliErrorPrinted, runCommands, runner, script } from ${JSON.stringify(path.join(import.meta.dir, "index.ts"))};`,
        'class VerdictRunner extends runner("verdict") {}',
        'class VerdictScript extends script("verdict", [VerdictRunner]) {}',
        'class VerdictCommand extends command("verdict", [VerdictScript], ({ public: target }) => ({',
        `  verdict: target({ desc: "fails"${option} }).exec(async function () {`,
        `    throw ${failure};`,
        "  }),",
        "})) {}",
        "await runCommands(VerdictCommand);",
        "",
      ].join("\n"),
    );
    const proc = Bun.spawn(["bun", entry, ...argv], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, code };
  };

  test("is the one an ExitCodeError carries, and 1 for any other error", async () => {
    const verdict = await run('new ExitCodeError("needs a new store build", 2)');
    expect(verdict.stdout).toContain("needs a new store build");
    expect(verdict.code).toBe(2);
    expect((await run('new Error("broke")')).code).toBe(1);
  }, 30_000);

  test("is the table's for a CliError's code, and 1 for an AkanError of any other code", async () => {
    const [checked, unknown, gone] = await Promise.all([
      run('new CliError("checkFailed", "found problems")'),
      run('new CliError("unknownTarget", "no app shop")'),
      run('new AkanError("documentNotFound", "gone")'),
    ]);
    expect([checked.code, unknown.code, gone.code]).toEqual([3, 2, 1]);
    expect(checked.stdout).toContain("found problems");
  }, 30_000);

  test("is 2 for a flag commander refuses, a value outside the choices and an unknown command", async () => {
    const choice = ' }).option("mode", String, { enum: ["a", "b"]';
    const [flag, outside, unknownCommand] = await Promise.all([
      run('new Error("broke")', { args: ["--nope"] }),
      run('new Error("broke")', { option: choice, args: ["--mode", "c"] }),
      run('new Error("broke")', { argv: ["verdikt"] }),
    ]);
    expect([flag.code, outside.code, unknownCommand.code]).toEqual([2, 2, 2]);
    expect(outside.stdout).toContain("option '--mode' argument 'c' is invalid");
    expect(unknownCommand.stderr).toContain("unknown command 'verdikt'");
  }, 30_000);

  test("is usageExitCode for a flag commander refuses before the command runs, failureExitCode after", async () => {
    const option = ", failureExitCode: 4, usageExitCode: 2";
    expect((await run('new Error("broke")', { option, args: ["--nope"] })).code).toBe(2);
    expect((await run('new Error("broke")', { option })).code).toBe(4);
  }, 30_000);

  test("runs onFailure last, told whether commander refused the line and what was given", async () => {
    const report = [
      ", stdio: true, usageExitCode: 2, onFailure: async (error, failure) => {",
      '  const line = JSON.stringify({ message: error.message, ...failure }) + "\\n";',
      "  await new Promise((resolve) => process.stdout.write(line, resolve));",
      "}",
    ].join("\n");
    const option = `${report} }).option("json", Boolean, { default: false }).option("count", Number, { nullable: true`;
    const lastOf = (stdout: string) => JSON.parse(stdout.trim().split("\n").at(-1) ?? "null");

    const refused = await run('new Error("broke")', { option, args: ["--count", "3", "--nope", "--json"] });
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("unknown option '--nope'");
    expect(lastOf(refused.stdout)).toEqual({
      message: "unknown option '--nope'",
      usage: true,
      given: { count: 3, json: true },
    });

    const thrown = await run('new Error("broke")', { option, args: ["--json"] });
    expect(thrown.code).toBe(1);
    expect(thrown.stderr).toContain("broke\n");
    expect(lastOf(thrown.stdout)).toEqual({ message: "broke", usage: false, given: { json: true } });

    const help = await run('new Error("broke")', { option, args: ["--help"] });
    expect(help.code).toBe(0);
    expect(help.stdout).not.toContain('"usage"');
  }, 60_000);

  test("with JSON asked for, ends stdout with ok, error and code, and prints the message to stderr", async () => {
    const json = ' }).option("json", Boolean, { default: false';
    const format = ' }).option("format", String, { default: "text", enum: ["text", "json"]';
    const marked =
      '(() => { const error = new CliError("checkFailed", "verify failed"); markCliErrorPrinted(error); return error; })()';
    const [unknown, plain, refused, answered, text] = await Promise.all([
      run('new CliError("unknownTarget", "no app shop")', { option: json, args: ["--json"] }),
      run('new Error("broke")', { option: format, args: ["--format", "json"] }),
      run('new Error("broke")', { option: json, args: ["--json", "--nope"] }),
      run(marked, { option: format, args: ["--format", "json"] }),
      run('new Error("broke")', { option: format }),
    ]);
    expect(unknown.code).toBe(2);
    expect(JSON.parse(unknown.stdout)).toEqual({ ok: false, error: "no app shop", code: "unknownTarget" });
    expect(unknown.stderr).toContain("no app shop");
    expect(plain.code).toBe(1);
    expect(JSON.parse(plain.stdout)).toEqual({ ok: false, error: "broke", code: "failed" });
    expect(refused.code).toBe(2);
    expect(JSON.parse(refused.stdout)).toEqual({ ok: false, error: "unknown option '--nope'", code: "usage" });
    expect(answered.code).toBe(3);
    expect(answered.stdout.trim()).toBe("");
    expect(text.stdout).toContain("broke\n");
    expect(text.stdout).not.toContain('"code"');
  }, 60_000);

  test("is usageExitCode for a usage or unknown-target failure where 2 answers something else", async () => {
    const option = ", usageExitCode: 1";
    const [flag, unknown, verdict] = await Promise.all([
      run('new Error("broke")', { option, args: ["--nope"] }),
      run('new CliError("unknownTarget", "Unknown app \'shop\'")', { option }),
      run('new ExitCodeError("needs a new store build", 2)', { option }),
    ]);
    expect([flag.code, unknown.code, verdict.code]).toEqual([1, 1, 2]);
  }, 30_000);

  test("is 130 for a prompt closed with Ctrl+C", async () => {
    const closed = await run(
      'Object.assign(new Error("User force closed the prompt with SIGINT"), { name: "ExitPromptError" })',
    );
    expect(closed.code).toBe(130);
  }, 30_000);

  test("answers JSON for an ExitCodeError, a thrown object and an unhandled rejection", async () => {
    const json = ' }).option("json", Boolean, { default: false';
    const late = 'await (void Promise.reject(new CliError("refused", "late")), new Promise(() => {}))';
    const [verdict, checked, thrown, rejected] = await Promise.all([
      run('new ExitCodeError("needs a new store build", 2)', { option: json, args: ["--json"] }),
      run('new ExitCodeError("found problems", 3)', { option: json, args: ["--json"] }),
      run('{ reason: "an object" }', { option: json, args: ["--json"] }),
      run(late, { option: json, args: ["--json"] }),
    ]);
    expect(JSON.parse(verdict.stdout)).toEqual({ ok: false, error: "needs a new store build", code: "refused" });
    expect(verdict.code).toBe(2);
    expect(JSON.parse(checked.stdout)).toEqual({ ok: false, error: "found problems", code: "checkFailed" });
    expect(checked.code).toBe(3);
    expect(JSON.parse(thrown.stdout)).toEqual({ ok: false, error: '{"reason":"an object"}', code: "failed" });
    expect(JSON.parse(rejected.stdout)).toEqual({ ok: false, error: "late", code: "refused" });
    expect(rejected.code).toBe(2);
  }, 60_000);

  test("prints nothing more for an error the command marked as printed", async () => {
    const marked = await run(
      '(() => { const error = new Error("printed already"); markCliErrorPrinted(error); return error; })()',
    );
    expect(marked.code).toBe(1);
    expect(`${marked.stdout}${marked.stderr}`).not.toContain("printed already");
  }, 30_000);
});

describe("a repeatable option", () => {
  const track = tempRoots();
  const meta: ArgMeta = {
    name: "param",
    argsOption: { type: "string", multiple: true },
    key: "run",
    idx: 0,
    type: "Option",
  };
  afterEach(() => {
    CommandContainer.clear();
  });

  test("reads every value given, in order, each against the choices, and an empty list when left out", async () => {
    expect(await getOptionValue(meta, { param: ["a=1", "b=2"] }, { values: {} })).toEqual(["a=1", "b=2"]);
    expect(await getOptionValue(meta, {}, { values: {} })).toEqual([]);
    const choices = { ...meta, argsOption: { ...meta.argsOption, enum: ["a", "b"] } };
    await expect(getOptionValue(choices, { param: ["a", "c"] }, { values: {} })).rejects.toThrow(
      "option '--param' argument 'c' is invalid",
    );
  });

  test("types the exec parameter as a list, and a positional argument cannot repeat", () => {
    const expectType = <Expected>(_value: Expected) => undefined;
    class RepeatRunner extends runner("repeat") {}
    class RepeatScript extends script("repeat", [RepeatRunner]) {}
    class RepeatCommand extends command("repeat", [RepeatScript], ({ public: target }) => ({
      run: target({ desc: "run" })
        .option("param", String, { multiple: true })
        .option("mode", String, { enum: ["a", "b"], multiple: true })
        .exec(async (param, mode) => {
          expectType<string[]>(param);
          expectType<("a" | "b")[]>(mode);
        }),
    })) {}
    expect(getTargetMetas(RepeatCommand)[0]?.key).toBe("run");
    expect(() =>
      command("repeatArg", [RepeatScript], ({ public: target }) => ({
        run: target({ desc: "run" })
          .arg("names", String, { multiple: true })
          .exec(async () => undefined),
      })),
    ).toThrow("argument 'names' cannot be multiple");
  });

  test("collects each time the flag is given, long or short", async () => {
    const { root } = track(await makeCliTempWorkspace());
    await writeText(path.join(root, "package.json"), '{ "name": "repo", "version": "1.0.0" }\n');
    await writeText(path.join(root, "tsconfig.json"), "{}\n");
    const entry = path.join(root, "cli.ts");
    await writeText(
      entry,
      [
        `import { command, runCommands, runner, script } from ${JSON.stringify(path.join(import.meta.dir, "index.ts"))};`,
        'class CollectRunner extends runner("collect") {}',
        'class CollectScript extends script("collect", [CollectRunner]) {}',
        'class CollectCommand extends command("collect", [CollectScript], ({ public: target }) => ({',
        '  collect: target({ desc: "collects", stdio: true })',
        '    .option("param", String, { multiple: true })',
        "    .exec(async function (param) {",
        "      process.stdout.write(JSON.stringify(param));",
        "    }),",
        "})) {}",
        "await runCommands(CollectCommand);",
        "",
      ].join("\n"),
    );
    const collect = async (...args: string[]) => {
      const proc = Bun.spawn(["bun", entry, "collect", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
      const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      return JSON.parse(stdout) as unknown;
    };
    expect(await collect("--param", "a=1", "-p", "b=x=y")).toEqual(["a=1", "b=x=y"]);
    expect(await collect()).toEqual([]);
  }, 30_000);
});

describe("a workspace whose akanjs is not the CLI's version", () => {
  const track = tempRoots();

  test("hears so on stderr, leaving stdout to what the command prints", async () => {
    const { root } = track(await makeCliTempWorkspace());
    await writeText(path.join(root, "package.json"), '{ "name": "repo", "version": "1.0.0" }\n');
    await writeText(path.join(root, "tsconfig.json"), "{}\n");
    await writeText(
      path.join(root, "node_modules", "akanjs", "package.json"),
      '{ "name": "akanjs", "version": "0.0.1-older" }\n',
    );
    const entry = path.join(root, "cli.ts");
    await writeText(
      entry,
      [
        `import { command, runCommands, runner, script } from ${JSON.stringify(path.join(import.meta.dir, "index.ts"))};`,
        'class PlanRunner extends runner("plan") {}',
        'class PlanScript extends script("plan", [PlanRunner]) {}',
        'class PlanCommand extends command("plan", [PlanScript], ({ public: target }) => ({',
        '  plan: target({ desc: "plans", stdio: true }).exec(async function () {',
        "    process.stdout.write(JSON.stringify({ phases: 1 }));",
        "  }),",
        "})) {}",
        "await runCommands(PlanCommand);",
        "",
      ].join("\n"),
    );
    const proc = Bun.spawn(["bun", entry, "plan"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(code).toBe(0);
    expect(stdout).toBe('{"phases":1}');
    expect(stderr).toContain("this workspace has akanjs 0.0.1-older");
  }, 30_000);
});
