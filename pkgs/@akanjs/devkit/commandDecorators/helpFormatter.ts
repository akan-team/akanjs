import chalk from "chalk";

import { type EnumChoice, getArgMetas } from "./argMeta";
import { camelToKebabCase } from "./camelToKebabCase";
import { type CommandCls, getTargetMetas } from "./targetMeta";

const formatChoice = (choice: EnumChoice) => (typeof choice === "object" ? choice.label : choice.toString());

const groupCommands = (commands: CommandCls[]) => {
  const groups = new Map<string, { key: string; args: string[]; desc?: string }[]>();
  for (const command of commands) {
    const group = groups.getOrInsert(command.name.replace("Command", ""), []);
    for (const targetMeta of getTargetMetas(command)) {
      if (targetMeta.targetOption.devOnly) continue;
      const [allArgMetas] = getArgMetas(command, targetMeta.key);
      const args = allArgMetas
        .filter((arg) => arg.type !== "Option")
        .map((arg) => {
          if (arg.type === "Workspace") return "";
          if (arg.type === "Module") return "[sys:module]";
          if (arg.type === "Argument") return `[${arg.name}]`;
          return `[${arg.type.toLowerCase()}]`;
        })
        .filter(Boolean);
      group.push({ key: camelToKebabCase(targetMeta.key), args, desc: targetMeta.targetOption.desc });
    }
  }
  return groups;
};

export const formatHelp = (commands: CommandCls[], version: string) => {
  const lines = [
    "",
    chalk.bold.cyan("  ╔═══════════════════════════════════════════════════╗"),
    chalk.bold.cyan("  ║") +
      chalk.bold.white("              Akan.js Framework CLI            ") +
      chalk.bold.cyan("    ║"),
    chalk.bold.cyan("  ╚═══════════════════════════════════════════════════╝"),
    "",
    chalk.gray(`  Version: ${version}`),
    "",
    chalk.bold.yellow("  USAGE"),
    "",
    chalk.gray("    $ ") + chalk.white("akan") + chalk.gray(" <command> [options]"),
    "",
    chalk.bold.yellow("  COMMANDS"),
    "",
  ];
  for (const [groupName, cmds] of groupCommands(commands)) {
    if (cmds.length === 0) continue;
    lines.push(chalk.bold.magenta(`    ${groupName}`), "");
    for (const cmd of cmds) {
      const cmdPrefix = `      ${chalk.green(cmd.key)}${cmd.args.length > 0 ? chalk.gray(` ${cmd.args.join(" ")}`) : ""}`;
      if (!cmd.desc) lines.push(cmdPrefix);
      else if (cmdPrefix.length + cmd.desc.length + 3 < 70) lines.push(`${cmdPrefix}  ${chalk.gray(cmd.desc)}`);
      else lines.push(cmdPrefix, `        ${chalk.gray(cmd.desc)}`);
    }
    lines.push("");
  }
  lines.push(
    chalk.bold.yellow("  OPTIONS"),
    "",
    `      ${chalk.green("-v, --verbose")}      ${chalk.gray("Enable verbose output")}`,
    `      ${chalk.green("-h, --help")}         ${chalk.gray("Display this help message")}`,
    `      ${chalk.green("-V, --version")}      ${chalk.gray("Output version number")}`,
    "",
    chalk.bold.yellow("  EXAMPLES"),
    "",
    chalk.gray("    # Create a new workspace"),
    chalk.white("    $ akan create-workspace myproject"),
    "",
    chalk.gray("    # Start development server"),
    chalk.white("    $ akan start myapp"),
    "",
    chalk.gray("    # Create a new module"),
    chalk.white("    $ akan create-module userProfile"),
    "",
    chalk.gray("  Documentation: ") + chalk.cyan("https://akanjs.com/docs"),
    chalk.gray("  Report issues: ") + chalk.cyan("https://github.com/akan-team/akanjs/issues"),
    "",
  );
  return lines.join("\n");
};

export const formatCommandHelp = (command: CommandCls, key: string) => {
  const [allArgMetas, optionArgs] = getArgMetas(command, key);
  const kebabKey = camelToKebabCase(key);
  const commandDesc = getTargetMetas(command).find((t) => t.key === key)?.targetOption.desc;
  const nonOptionArgs = allArgMetas.filter((arg) => arg.type !== "Option");
  const args = nonOptionArgs
    .map((arg) => {
      if (arg.type === "Workspace") return "";
      if (arg.type === "Module") return "[sys:module]";
      if (arg.type === "Apps") return "[apps...]";
      if (arg.type === "Argument") return `[${camelToKebabCase(arg.name)}]`;
      return `[${arg.type.toLowerCase()}]`;
    })
    .filter(Boolean)
    .join(" ");

  const lines = ["", chalk.bold.cyan(`  Command: ${kebabKey}`)];
  if (commandDesc) lines.push(chalk.gray(`  ${commandDesc}`));
  lines.push(
    "",
    chalk.bold.yellow("  USAGE"),
    "",
    chalk.gray("    $ ") + chalk.white(`akan ${kebabKey}`) + (args ? chalk.gray(` ${args}`) : ""),
    "",
  );
  if (nonOptionArgs.length > 0) {
    lines.push(chalk.bold.yellow("  ARGUMENTS"), "");
    for (const arg of nonOptionArgs) {
      if (arg.type === "Workspace") continue;
      let argName: string;
      let argDesc: string;
      let example = "";
      if (arg.type === "Argument") {
        argName = camelToKebabCase(arg.name);
        argDesc = arg.argsOption.desc ?? "";
        example = arg.argsOption.example ? chalk.gray(` (e.g., ${String(arg.argsOption.example)})`) : "";
      } else if (arg.type === "Module") {
        argName = "sys:module";
        argDesc = "Module in format: app-name:module-name or lib-name:module-name";
      } else if (arg.type === "Apps") {
        argName = "apps...";
        argDesc = "App names, space- or comma-separated, or all. Omit to pick them interactively";
      } else {
        argName = arg.type.toLowerCase();
        argDesc = `${arg.type} name in this workspace`;
      }
      lines.push(`      ${chalk.green(argName)}      ${chalk.gray(argDesc)}${example}`);
    }
    lines.push("");
  }

  if (optionArgs.length > 0) {
    lines.push(chalk.bold.yellow("  OPTIONS"), "");
    for (const arg of optionArgs) {
      const opt = arg.argsOption;
      const flag = opt.flag ? `-${opt.flag}, ` : "";
      const kebabName = camelToKebabCase(arg.name);
      const negation = opt.type === "boolean" && opt.default === true ? `, --no-${kebabName}` : "";
      const optName = `${flag}--${kebabName}${negation}`;
      const optDesc = opt.desc ?? "";
      const defaultVal = opt.default !== undefined ? chalk.gray(` [default: ${String(opt.default)}]`) : "";
      const repeatable = opt.multiple ? chalk.gray(" (repeatable)") : "";
      const choices = opt.enum
        ? chalk.gray(
            typeof opt.enum === "function" ? " ([dynamic choices])" : ` (${opt.enum.map(formatChoice).join(", ")})`,
          )
        : "";
      lines.push(`      ${chalk.green(optName)}      ${chalk.gray(optDesc)}${defaultVal}${choices}${repeatable}`);
    }
    lines.push("");
  }

  return lines.join("\n");
};
