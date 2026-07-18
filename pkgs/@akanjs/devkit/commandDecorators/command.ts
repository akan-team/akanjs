import path from "node:path";
import { confirm, input, select } from "@inquirer/prompts";
import { Logger } from "akanjs/common";
import chalk from "chalk";
import { type Command, program } from "commander";

import { FileSys, getDirname, type PackageJson } from "..";
import { AppExecutor, Executor, LibExecutor, ModuleExecutor, PkgExecutor, WorkspaceExecutor } from "../executors";
import {
  type ArgMeta,
  type CommandContext,
  type EnumChoice,
  type EnumChoices,
  getArgMetas,
  type InternalArgMeta,
} from "./argMeta";
import { CommandContainer } from "./dependencyBuilder";
import { formatCommandHelp, formatHelp } from "./helpFormatter";
import { type CommandCls, getTargetMetas } from "./targetMeta";

const camelToKebabCase = (str: string) => str.replace(/([A-Z])/g, "-$1").toLowerCase();
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

const resolveEnumChoices = async (argMeta: ArgMeta, context: CommandContext) => {
  const enumChoices = argMeta.argsOption.enum;
  if (!enumChoices) return null;
  if (typeof enumChoices === "function") return await enumChoices(context);
  return enumChoices;
};

const getOptionValue = async (argMeta: ArgMeta, opt: Record<string, unknown>, context: CommandContext) => {
  const {
    name,
    argsOption: { enum: enumChoices, default: defaultValue, type, desc, nullable, example, ask },
  } = argMeta;
  if (opt[argMeta.name] !== undefined) return convertArgValue(opt[argMeta.name] as string, type ?? "string");
  else if (defaultValue !== undefined) return defaultValue;

  if (enumChoices) {
    const choices = normalizeEnumChoices((await resolveEnumChoices(argMeta, context)) ?? []);
    if (choices.length === 1) return choices[0]?.value;
    const choice = await select({ message: ask ?? desc ?? `Select the ${name} value`, choices });
    return choice;
  } else if (nullable) return null;
  else if (type === "boolean") {
    const message = ask ?? desc ?? `Do you want to set ${name}? ${desc ? ` (${desc})` : ""}: `;
    return await confirm({ message });
  } else {
    const message = ask
      ? `${ask}: `
      : desc
        ? `${desc}: `
        : `Enter the ${name} value${example ? ` (example: ${example})` : ""}: `;
    if (argMeta.argsOption.nullable) return await input({ message });
    else return convertArgValue(await input({ message }), type ?? "string");
  }
};

const getArgumentValue = async (argMeta: ArgMeta, value: string | undefined) => {
  const {
    name,
    argsOption: { default: defaultValue, type, desc, nullable, example, ask },
  } = argMeta;
  if (value !== undefined) return convertArgValue(value, type ?? "string");
  else if (defaultValue !== undefined) return defaultValue;
  else if (nullable) return null;

  const message = ask
    ? `${ask}: `
    : desc
      ? `${desc}: `
      : `Enter the ${name} value${example ? ` (example: ${example})` : ""}: `;
  return convertArgValue(await input({ message }), type ?? "string");
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

export const getInternalArgumentValue = async (
  argMeta: InternalArgMeta,
  value: string | undefined,
  workspace: WorkspaceExecutor,
) => {
  if (argMeta.type === "Workspace") return workspace;
  const sysType = argMeta.type.toLowerCase();
  const [appNames, libNames, pkgNames] = await workspace.getExecs();
  if (sysType === "sys") {
    if (value && appNames.includes(value)) return AppExecutor.from(workspace, value);
    else if (value && libNames.includes(value)) return LibExecutor.from(workspace, value);
    else {
      const sysName = await select<string>({
        message: `Select the App or Lib name`,
        choices: [...appNames, ...libNames],
      });
      if (appNames.includes(sysName)) return AppExecutor.from(workspace, sysName);
      else if (libNames.includes(sysName)) return LibExecutor.from(workspace, sysName);
      else throw new Error(`Invalid system name: ${sysName}`);
    }
  } else if (sysType === "exec") {
    if (value && appNames.includes(value)) return AppExecutor.from(workspace, value);
    else if (value && libNames.includes(value)) return LibExecutor.from(workspace, value);
    else if (value && pkgNames.includes(value)) return PkgExecutor.from(workspace, value);
    else {
      const execName = await select<string>({
        message: `Select the App or Lib or Pkg name`,
        choices: [...appNames, ...libNames, ...pkgNames],
      });
      if (appNames.includes(execName)) return AppExecutor.from(workspace, execName);
      else if (libNames.includes(execName)) return LibExecutor.from(workspace, execName);
      else if (pkgNames.includes(execName)) return PkgExecutor.from(workspace, execName);
      else throw new Error(`Invalid system name: ${execName}`);
    }
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

  // Custom help handling
  const hasHelpFlag = process.argv.includes("--help") || process.argv.includes("-h");
  const hasCommand = process.argv.length > 2 && !process.argv[2]?.startsWith("-");

  // Show help if: 1) explicit --help flag, or 2) no command provided (just "akan")
  if (hasHelpFlag || !hasCommand) {
    if (process.argv.length === 2 || (process.argv.length === 3 && hasHelpFlag)) {
      // Global help (no specific command)
      Logger.rawLog(formatHelp(commands, process.env.AKAN_VERSION));
      process.exit(0);
    }
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
      const kebabKey = camelToKebabCase(targetMeta.key);
      const commandNames =
        targetMeta.targetOption.short === true
          ? [
              kebabKey,
              typeof targetMeta.targetOption.short === "string"
                ? targetMeta.targetOption.short
                : kebabKey
                    .split("-")
                    .map((s) => s.slice(0, 1))
                    .join(""),
            ]
          : [kebabKey];
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
          } else {
            const sysType = argMeta.type.toLowerCase();
            programCommand = programCommand.argument(
              `[${sysType}]`,
              `${sysType} in this workspace ${sysType}s/<${sysType}Name>`,
            );
          }
        }
        programCommand = programCommand.option(`-v, --verbose [boolean]`, `verbose output`);

        // Override help completely for each command
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
            else
              commandArgs[argMeta.idx] = await getInternalArgumentValue(
                argMeta as InternalArgMeta,
                cmdArgs[argMeta.idx] as string,
                workspace,
              );
            // set app name to env
            if (commandArgs[argMeta.idx] instanceof AppExecutor)
              process.env.AKAN_PUBLIC_APP_NAME = (commandArgs[argMeta.idx] as AppExecutor).name;
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
  await program.parseAsync(process.argv);
};
