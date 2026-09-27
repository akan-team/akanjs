import path from "node:path";
import type {
  checkbox as inquirerCheckbox,
  confirm as inquirerConfirm,
  input as inquirerInput,
  select as inquirerSelect,
} from "@inquirer/prompts";
import { Logger } from "akanjs/common";
import chalk from "chalk";
import { type Command, program } from "commander";
import { AppSelectionMemory } from "../appSelectionMemory";
import { AppExecutor, Executor, LibExecutor, ModuleExecutor, PkgExecutor, WorkspaceExecutor } from "../executors";
// Never the root barrel: it drags ink, ssh2 and the cloud stack into every command process.
import { FileSys, getDirname } from "../fileSys";
import type { PackageJson } from "../types";
import {
  type ArgMeta,
  type CommandContext,
  type EnumChoice,
  type EnumChoices,
  getArgMetas,
  type InternalArgMeta,
} from "./argMeta";
import { camelToKebabCase } from "./camelToKebabCase";
import { CommandContainer } from "./dependencyBuilder";
import { formatCommandHelp, formatHelp } from "./helpFormatter";
import { type CommandCls, getTargetCommandNames, getTargetMetas } from "./targetMeta";

const loggedCliErrorObjects = new WeakSet<object>();
const loggedCliErrorMessages = new Set<string>();

const formatCliError = (error: unknown): string => {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error.trim() || "Unknown error";
  if (error === null || error === undefined) return "Unknown error";
  try {
    const json = JSON.stringify(error);
    if (json) return json;
  } catch {
    return String(error);
  }
  return String(error) || "Unknown error";
};

const printCliError = (error: unknown) => {
  if (typeof error === "object" && error !== null) {
    if (loggedCliErrorObjects.has(error)) return;
    loggedCliErrorObjects.add(error);
  }
  const message = formatCliError(error);
  if (loggedCliErrorMessages.has(message)) return;
  loggedCliErrorMessages.add(message);
  Logger.rawLog(`\n${chalk.red(message)}`);
};

const handleOption = (programCommand: Command, argMeta: ArgMeta) => {
  const {
    type,
    flag = argMeta.name.slice(0, 1).toLowerCase(),
    desc = argMeta.name,
    example,
    enum: enumChoices,
    ask,
  } = argMeta.argsOption;
  const kebabName = camelToKebabCase(argMeta.name);
  const choices = enumChoices && typeof enumChoices !== "function" ? normalizeEnumChoices(enumChoices) : null;
  programCommand.option(
    `-${flag}, --${kebabName}${type === "boolean" ? " [boolean]" : ` <${kebabName}>`}`,
    `${desc}${ask ? ` (${ask})` : ""}${example ? ` (example: ${example})` : ""}${choices ? ` (choices: ${choices.map((choice) => choice.name).join(", ")})` : ""}`,
  );
  if (type === "boolean" && argMeta.argsOption.default === true)
    programCommand.option(`--no-${kebabName}`, `turn off --${kebabName}`);
  return programCommand;
};
const handleArgument = (programCommand: Command, argMeta: ArgMeta) => {
  const kebabName = camelToKebabCase(argMeta.name);
  programCommand.argument(
    `[${kebabName}]`,
    `${argMeta.argsOption.desc}${argMeta.argsOption.example ? ` (example: ${argMeta.argsOption.example})` : ""}`,
  );
  return programCommand;
};

const convertArgValue = (value: string | boolean, type: "string" | "number" | "boolean") => {
  if (type === "string") return value as string;
  else if (type === "number") return Number(value);
  else return value === true || value === "true";
};

const normalizeEnumChoices = (enumChoices: EnumChoices) =>
  enumChoices.map((choice: EnumChoice) =>
    typeof choice === "object"
      ? { value: choice.value, name: choice.label }
      : { value: choice, name: choice.toString() },
  );

// Loaded on the first prompt: a static import keeps @inquirer/prompts (~24MB) resident for a whole `akan start`.
// The types come through `import type`, which leaves no runtime edge (entryModuleGraph.test.ts asserts that).
const prompts = async () => await import("@inquirer/prompts");
const select = ((config, context) => prompts().then((m) => m.select(config, context))) as typeof inquirerSelect;
const confirm = ((config, context) => prompts().then((m) => m.confirm(config, context))) as typeof inquirerConfirm;
const input = ((config, context) => prompts().then((m) => m.input(config, context))) as typeof inquirerInput;
const checkbox = ((config, context) => prompts().then((m) => m.checkbox(config, context))) as typeof inquirerCheckbox;

// A DynamicEnum is not checked: it resolves against a context the internal args have not populated yet.
// Compared as strings: the value is still commander's raw string while a numeric choice list holds numbers.
const assertEnumChoice = (argMeta: ArgMeta, value: unknown) => {
  const enumChoices = argMeta.argsOption.enum;
  if (!enumChoices || typeof enumChoices === "function") return;
  const choices = normalizeEnumChoices(enumChoices);
  if (choices.some((choice) => String(choice.value) === String(value))) return;
  const label =
    argMeta.type === "Option" ? `option '--${camelToKebabCase(argMeta.name)}'` : `argument '${argMeta.name}'`;
  throw new Error(
    `${label} argument '${String(value)}' is invalid. Allowed choices are ${choices.map((choice) => choice.name).join(", ")}.`,
  );
};

const inputMessageOf = ({ name, argsOption: { desc, example, ask } }: ArgMeta) =>
  ask ? `${ask}: ` : desc ? `${desc}: ` : `Enter the ${name} value${example ? ` (example: ${example})` : ""}: `;

export const getOptionValue = async (argMeta: ArgMeta, opt: Record<string, unknown>, context: CommandContext) => {
  const {
    name,
    argsOption: { enum: enumChoices, default: defaultValue, type, desc, nullable, ask },
  } = argMeta;
  if (opt[argMeta.name] !== undefined) {
    assertEnumChoice(argMeta, opt[argMeta.name]);
    return convertArgValue(opt[argMeta.name] as string, type ?? "string");
  } else if (defaultValue !== undefined) return defaultValue;

  if (enumChoices) {
    const choices = normalizeEnumChoices(
      (typeof enumChoices === "function" ? await enumChoices(context) : enumChoices) ?? [],
    );
    if (choices.length === 1) return choices[0]?.value;
    return await select({ message: ask ?? desc ?? `Select the ${name} value`, choices });
  } else if (nullable) return null;
  else if (type === "boolean") {
    const message = ask ?? desc ?? `Do you want to set ${name}? ${desc ? ` (${desc})` : ""}: `;
    return await confirm({ message });
  } else return convertArgValue(await input({ message: inputMessageOf(argMeta) }), type ?? "string");
};

export const getArgumentValue = async (argMeta: ArgMeta, value: string | undefined) => {
  const { default: defaultValue, type, nullable } = argMeta.argsOption;
  if (value !== undefined) {
    assertEnumChoice(argMeta, value);
    return convertArgValue(value, type ?? "string");
  } else if (defaultValue !== undefined) return defaultValue;
  else if (nullable) return null;
  return convertArgValue(await input({ message: inputMessageOf(argMeta) }), type ?? "string");
};

const assignCommandContext = (context: CommandContext, argMeta: ArgMeta | InternalArgMeta, value: unknown) => {
  if (value instanceof AppExecutor) context.app = value;
  else if (value instanceof LibExecutor) context.lib = value;
  else if (value instanceof PkgExecutor) context.pkg = value;
  else if (value instanceof ModuleExecutor) context.module = value;
  else if (value instanceof Executor) context.exec = value;
  if (argMeta.type === "Argument" || argMeta.type === "Option") context.values[argMeta.name] = value;
  else context.values[argMeta.type.toLowerCase()] = value;
};

const assertCurrentDirectoryIsWorkspaceRoot = async () => {
  const cwd = process.cwd();
  const [hasPackageJson, hasTsConfig, hasEnv] = await Promise.all([
    FileSys.fileExists(`${cwd}/package.json`),
    FileSys.fileExists(`${cwd}/tsconfig.json`),
    FileSys.fileExists(`${cwd}/.env`),
  ]);
  if (hasPackageJson && hasTsConfig && hasEnv) return;

  throw new Error(
    [
      "Akan CLI commands must be run from the workspace root.",
      `Current directory: ${cwd}`,
      "Move to the directory that contains package.json, tsconfig.json, and .env, then run the command again.",
    ].join("\n"),
  );
};

const parseAppNameList = (value: string | string[] | undefined): string[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

// Kept out of getInternalArgumentValue: Apps is the only internal arg whose positional is variadic (an array).
export const getAppsArgumentValue = async (
  value: string | string[] | undefined,
  workspace: WorkspaceExecutor,
): Promise<AppExecutor[]> => {
  const appNames = await workspace.getApps();
  if (appNames.length === 0) throw new Error("No apps found in this workspace (apps/<appName>/akan.config.ts)");
  const requested = parseAppNameList(value);
  if (requested.includes("all")) return appNames.map((name) => AppExecutor.from(workspace, name));
  if (requested.length) {
    const unknown = requested.filter((name) => !appNames.includes(name));
    if (unknown.length)
      throw new Error(
        `Unknown app${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Available: ${appNames.join(", ")}, all`,
      );
    return [...new Set(requested)].map((name) => AppExecutor.from(workspace, name));
  }
  if (appNames.length === 1 && appNames[0]) return [AppExecutor.from(workspace, appNames[0])];
  const remembered = new Set(await AppSelectionMemory.read(workspace.workspaceRoot));
  const picked = await checkbox<string>({
    message: "Select the apps to run (space to toggle, enter to confirm)",
    choices: appNames.map((name) => ({ name, value: name, checked: remembered.has(name) })),
    // Enter with nothing ticked is a mis-keypress far more often than an intent to run nothing.
    required: true,
  });
  await AppSelectionMemory.write(workspace.workspaceRoot, picked);
  return picked.map((name) => AppExecutor.from(workspace, name));
};

export const getInternalArgumentValue = async (
  argMeta: InternalArgMeta,
  value: string | undefined,
  workspace: WorkspaceExecutor,
) => {
  if (argMeta.type === "Workspace") return workspace;
  const sysType = argMeta.type.toLowerCase();
  const [appNames, libNames, pkgNames] = await workspace.getExecs();
  if (sysType === "sys" || sysType === "exec") {
    const pkgChoices = sysType === "exec" ? pkgNames : [];
    const execOf = (name: string) => {
      if (appNames.includes(name)) return AppExecutor.from(workspace, name);
      if (libNames.includes(name)) return LibExecutor.from(workspace, name);
      if (pkgChoices.includes(name)) return PkgExecutor.from(workspace, name);
      return null;
    };
    const found = value ? execOf(value) : null;
    if (found) return found;
    const name = await select<string>({
      message: sysType === "exec" ? `Select the App or Lib or Pkg name` : `Select the App or Lib name`,
      choices: [...appNames, ...libNames, ...pkgChoices],
    });
    const picked = execOf(name);
    if (!picked) throw new Error(`Invalid system name: ${name}`);
    return picked;
  } else if (sysType === "app") {
    if (value && appNames.includes(value)) return AppExecutor.from(workspace, value);
    if (!value && appNames.length === 1 && appNames[0]) return AppExecutor.from(workspace, appNames[0]);
    const appName = await select<string>({ message: `Select the ${sysType} name`, choices: appNames });
    return AppExecutor.from(workspace, appName);
  } else if (sysType === "lib") {
    if (value && libNames.includes(value)) return LibExecutor.from(workspace, value);
    const libName = await select<string>({ message: `Select the ${sysType} name`, choices: libNames });
    return LibExecutor.from(workspace, libName);
  } else if (sysType === "pkg") {
    const pkgs = await workspace.getPkgs();
    if (value && pkgs.includes(value)) return PkgExecutor.from(workspace, value);
    const pkgName = await select<string>({ message: `Select the ${sysType} name`, choices: pkgs });
    return PkgExecutor.from(workspace, pkgName);
  } else if (sysType === "module") {
    if (value) {
      const [sysName, moduleName] = value.split(":");
      if (!sysName || !moduleName) throw new Error(`Invalid module name: ${value}`);
      if (appNames.includes(sysName)) {
        const app = AppExecutor.from(workspace, sysName);
        const modules = await app.getModules();
        if (modules.includes(moduleName)) return ModuleExecutor.from(app, moduleName);
        else throw new Error(`Invalid module name: ${moduleName}`);
      } else if (libNames.includes(sysName)) {
        const lib = LibExecutor.from(workspace, sysName);
        const modules = await lib.getModules();
        if (modules.includes(moduleName)) return ModuleExecutor.from(lib, moduleName);
      } else throw new Error(`Invalid system name: ${sysName}`);
    }
    const { type, name } = await select<{ type: "app" | "lib"; name: string }>({
      message: `select the App or Lib name`,
      choices: [
        ...appNames.map((name) => ({ name, value: { type: "app" as const, name } })),
        ...libNames.map((name) => ({ name, value: { type: "lib" as const, name } })),
      ],
    });
    const executor = type === "app" ? AppExecutor.from(workspace, name) : LibExecutor.from(workspace, name);
    const modules = await executor.getModules();
    const moduleName = await select<string>({
      message: `Select the module name`,
      choices: modules.map((name) => ({ name: `${executor.name}:${name}`, value: name })),
    });
    return ModuleExecutor.from(executor, moduleName);
  } else throw new Error(`Invalid system type: ${argMeta.type}`);
};

export const runCommands = async (...commands: CommandCls[]) => {
  process.on("unhandledRejection", (error) => {
    printCliError(error);
    process.exit(1);
  });
  const __dirname = getDirname(import.meta.url);
  const packageJsonCandidates = [`${path.dirname(Bun.main)}/package.json`, `${__dirname}/../package.json`];
  let cliPackageJson: PackageJson | null = null;
  for (const packageJsonPath of packageJsonCandidates) {
    if (!(await FileSys.fileExists(packageJsonPath))) continue;
    const packageJson = await FileSys.readJson<PackageJson>(packageJsonPath);
    if (packageJson.name === "@akanjs/cli" || packageJson.name === "@akanjs/devkit") {
      cliPackageJson = packageJson;
      break;
    }
  }
  process.env.AKAN_VERSION = cliPackageJson?.version ?? "0.0.1";

  const hasHelpFlag = process.argv.includes("--help") || process.argv.includes("-h");
  if (process.argv.length === 2 || (process.argv.length === 3 && hasHelpFlag)) {
    Logger.rawLog(formatHelp(commands, process.env.AKAN_VERSION));
    process.exit(0);
  }

  program.version(process.env.AKAN_VERSION).description("Akan CLI").configureHelp({
    helpWidth: 100,
  });
  const installedAkanPackageJson = (await FileSys.fileExists("./node_modules/akanjs/package.json"))
    ? await FileSys.readJson<PackageJson>("./node_modules/akanjs/package.json")
    : null;
  if (installedAkanPackageJson && installedAkanPackageJson.version !== process.env.AKAN_VERSION) {
    Logger.rawLog(
      chalk.yellow(
        `
Akan CLI version is mismatch with installed package. ${process.env.AKAN_VERSION} (global) vs ${installedAkanPackageJson.version} (akanjs)
It may cause unexpected behavior. Run \`akan update\` to update latest akanjs.`,
      ),
    );
  }

  for (const command of commands) {
    const targetMetas = getTargetMetas(command);
    for (const targetMeta of targetMetas) {
      const commandNames = getTargetCommandNames(targetMeta);
      for (const commandName of commandNames) {
        let programCommand = program.command(commandName, {
          hidden: targetMeta.targetOption.devOnly,
        });
        const [allArgMetas] = getArgMetas(command, targetMeta.key);
        for (const argMeta of allArgMetas) {
          if (argMeta.type === "Option") programCommand = handleOption(programCommand, argMeta);
          else if (argMeta.type === "Argument") programCommand = handleArgument(programCommand, argMeta);
          else if (argMeta.type === "Workspace") continue;
          else if (argMeta.type === "Module") {
            programCommand = programCommand.argument(
              `[sys-name:module-name]`,
              `${argMeta.type} in this workspace (apps|libs)/<sys-name>/lib/<module-name>`,
            );
          } else if (argMeta.type === "Apps") {
            programCommand = programCommand.argument(
              `[apps...]`,
              `apps in this workspace apps/<appName>, or all (space- or comma-separated; omit to pick interactively)`,
            );
          } else {
            const sysType = argMeta.type.toLowerCase();
            programCommand = programCommand.argument(
              `[${sysType}]`,
              `${sysType} in this workspace ${sysType}s/<${sysType}Name>`,
            );
          }
        }
        programCommand = programCommand.option(`-v, --verbose [boolean]`, `verbose output`);
        programCommand.helpInformation = () => {
          return formatCommandHelp(command, targetMeta.key);
        };

        programCommand.action(async (...args: unknown[]) => {
          if (!targetMeta.targetOption.stdio) Logger.rawLog();
          const cmdArgs = args.slice(0, args.length - 2);
          const opt = args[args.length - 2] as Record<string, unknown>;
          const commandArgs = [] as unknown[];
          if (targetMeta.targetOption.runsOnWorkspaceRoot) await assertCurrentDirectoryIsWorkspaceRoot();
          const workspace = WorkspaceExecutor.fromRoot();
          const commandContext: CommandContext = { values: {} };
          for (const argMeta of allArgMetas) {
            if (argMeta.type === "Option")
              commandArgs[argMeta.idx] = await getOptionValue(argMeta, opt, commandContext);
            else if (argMeta.type === "Argument")
              commandArgs[argMeta.idx] = await getArgumentValue(argMeta, cmdArgs[argMeta.idx] as string);
            else if (argMeta.type === "Apps")
              commandArgs[argMeta.idx] = await getAppsArgumentValue(
                cmdArgs[argMeta.idx] as string | string[] | undefined,
                workspace,
              );
            else
              commandArgs[argMeta.idx] = await getInternalArgumentValue(
                argMeta as InternalArgMeta,
                cmdArgs[argMeta.idx] as string,
                workspace,
              );
            if (commandArgs[argMeta.idx] instanceof AppExecutor)
              process.env.AKAN_PUBLIC_APP_NAME = (commandArgs[argMeta.idx] as AppExecutor).name;
            //? Only for a single app: with several, every env-derived answer would belong to whichever came last.
            else if (Array.isArray(commandArgs[argMeta.idx])) {
              const apps = commandArgs[argMeta.idx] as AppExecutor[];
              if (apps.length === 1 && apps[0]) process.env.AKAN_PUBLIC_APP_NAME = apps[0].name;
            }
            assignCommandContext(commandContext, argMeta, commandArgs[argMeta.idx]);
            if ((opt as { verbose?: boolean }).verbose) Executor.setVerbose(true);
          }
          const cmd = CommandContainer.get(command);

          try {
            await targetMeta.handler.call(cmd, ...commandArgs);
            if (!targetMeta.targetOption.stdio) Logger.rawLog();
          } catch (e) {
            printCliError(e);
            throw e;
          }
        });
      }
    }
  }
  // Handled here, not by the handler above: a rejection reaching the entry's top-level await prints Bun's own trace.
  await program.parseAsync(process.argv).catch((error: unknown) => {
    printCliError(error);
    process.exit(1);
  });
};
