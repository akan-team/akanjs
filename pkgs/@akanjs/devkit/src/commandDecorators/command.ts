import { Logger } from "@akanjs/common";
import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { Command, program } from "commander";
import fs from "fs";

import { getDirname, type PackageJson } from "..";
import { AppExecutor, Executor, LibExecutor, ModuleExecutor, PkgExecutor, WorkspaceExecutor } from "../executors";
import { type ArgMeta, getArgMetas, type InternalArgMeta } from "./argMeta";
import { getTargetMetas } from "./targetMeta";
import type { Type } from "./types";

const camelToKebabCase = (str: string) => str.replace(/([A-Z])/g, "-$1").toLowerCase();

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
  const choices = enumChoices?.map((choice: string | number | { label: string; value: string | number | boolean }) =>
    typeof choice === "object"
      ? { value: choice.value, name: choice.label }
      : { value: choice, name: choice.toString() }
  );
  programCommand.option(
    `-${flag}, --${kebabName}${type === "boolean" ? " [boolean]" : ` <${kebabName}>`}`,
    `${desc}${ask ? ` (${ask})` : ""}${example ? ` (example: ${example})` : ""}${choices ? ` (choices: ${choices.map((choice) => choice.name).join(", ")})` : ""}`
  );
  return programCommand;
};
const handleArgument = (programCommand: Command, argMeta: ArgMeta) => {
  const kebabName = camelToKebabCase(argMeta.name);
  if ((argMeta.argsOption.type ?? "string") !== "string")
    throw new Error(`Argument type must be string: ${argMeta.name}`);
  programCommand.argument(
    `[${kebabName}]`,
    `${argMeta.argsOption.desc}${argMeta.argsOption.example ? ` (example: ${argMeta.argsOption.example})` : ""}`
  );
  return programCommand;
};

const convertOptionValue = (value: string | boolean, type: "string" | "number" | "boolean") => {
  if (type === "string") return value as string;
  else if (type === "number") return Number(value);
  else return value === true || value === "true";
};

const getOptionValue = async (argMeta: ArgMeta, opt: Record<string, unknown>) => {
  const {
    name,
    argsOption: { enum: enumChoices, default: defaultValue, type, desc, nullable, example, ask },
  } = argMeta;
  if (opt[argMeta.name] !== undefined) return convertOptionValue(opt[argMeta.name] as string, type ?? "string");
  else if (defaultValue !== undefined) return defaultValue;
  else if (nullable) return null;

  if (enumChoices) {
    const choices = enumChoices.map((choice: string | number | { label: string; value: string | number | boolean }) =>
      typeof choice === "object"
        ? { value: choice.value, name: choice.label }
        : { value: choice, name: choice.toString() }
    );
    const choice = await select({ message: ask ?? desc ?? `Select the ${name} value`, choices });
    return choice;
  } else if (type === "boolean") {
    const message = ask ?? desc ?? `Do you want to set ${name}? ${desc ? ` (${desc})` : ""}: `;
    return await confirm({ message });
  } else {
    const message = ask
      ? `${ask}: `
      : desc
        ? `${desc}: `
        : `Enter the ${name} value${example ? ` (example: ${example})` : ""}: `;
    if (argMeta.argsOption.nullable) return await input({ message });
    else return convertOptionValue(await input({ message }), type ?? "string");
  }
};

const getArgumentValue = async (argMeta: ArgMeta, value: string | undefined) => {
  const {
    name,
    argsOption: { default: defaultValue, type, desc, nullable, example, ask },
  } = argMeta;
  if (value !== undefined) return value;
  else if (defaultValue !== undefined) return defaultValue as string;
  else if (nullable) return null;

  const message = ask
    ? `${ask}: `
    : desc
      ? `${desc}: `
      : `Enter the ${name} value${example ? ` (example: ${example})` : ""}: `;
  return await input({ message });
};

const getInternalArgumentValue = async (
  argMeta: InternalArgMeta,
  value: string | undefined,
  workspace: WorkspaceExecutor
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

export const runCommands = async (...commands: Type[]) => {
  process.on("unhandledRejection", (error) => {
    process.exit(1);
  });
  const __dirname = getDirname(import.meta.url);
  const hasPackageJson = fs.existsSync(`${__dirname}/../package.json`);
  process.env.AKAN_VERSION = hasPackageJson
    ? (JSON.parse(fs.readFileSync(`${__dirname}/../package.json`, "utf8")) as PackageJson).version
    : "0.0.1";
  program.version(process.env.AKAN_VERSION).description("Akan CLI");
  const akanBasePackageJson = fs.existsSync("./node_modules/@akanjs/base/package.json")
    ? (JSON.parse(fs.readFileSync("./node_modules/@akanjs/base/package.json", "utf8")) as PackageJson)
    : null;
  if (akanBasePackageJson && akanBasePackageJson.version !== process.env.AKAN_VERSION) {
    Logger.rawLog(
      chalk.yellow(
        `
Akan CLI version is mismatch with installed package. ${process.env.AKAN_VERSION} (global) vs ${akanBasePackageJson.version} (base)
It may cause unexpected behavior. Run \`akan update\` to update latest akanjs.`
      )
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
              `${argMeta.type} in this workspace (apps|libs)/<sys-name>/lib/<module-name>`
            );
          } else {
            const sysType = argMeta.type.toLowerCase();
            programCommand = programCommand.argument(
              `[${sysType}]`,
              `${sysType} in this workspace ${sysType}s/<${sysType}Name>`
            );
          }
        }
        programCommand = programCommand.option(`-v, --verbose [boolean]`, `verbose output`);
        programCommand.action(async (...args: unknown[]) => {
          Logger.rawLog();
          const cmdArgs = args.slice(0, args.length - 2);
          const opt = args[args.length - 2] as Record<string, unknown>;
          const commandArgs = [] as unknown[];
          const workspace = WorkspaceExecutor.fromRoot();
          for (const argMeta of allArgMetas) {
            if (argMeta.type === "Option") commandArgs[argMeta.idx] = await getOptionValue(argMeta, opt);
            else if (argMeta.type === "Argument")
              commandArgs[argMeta.idx] = await getArgumentValue(argMeta, cmdArgs[argMeta.idx] as string);
            else
              commandArgs[argMeta.idx] = await getInternalArgumentValue(
                argMeta as InternalArgMeta,
                cmdArgs[argMeta.idx] as string,
                workspace
              );
            // set app name to env
            if (commandArgs[argMeta.idx] instanceof AppExecutor)
              process.env.NEXT_PUBLIC_APP_NAME = (commandArgs[argMeta.idx] as AppExecutor).name;
            if ((opt as { verbose?: boolean }).verbose) Executor.setVerbose(true);
          }
          const cmd = new command() as { [key: string]: (...args: unknown[]) => Promise<unknown> };

          try {
            await cmd[targetMeta.key](...commandArgs);
            Logger.rawLog();
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
            Logger.rawLog(`\n${chalk.red(errMsg)}`);
            throw e;
          }
        });
      }
    }
  }
  await program.parseAsync(process.argv);
};
