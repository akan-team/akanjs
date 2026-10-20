import type { ArgMeta, InternalArgMeta } from "./argMeta";
import { camelToKebabCase } from "./camelToKebabCase";
import type { Cls, DependencyCls } from "./dependencyBuilder";

export const COMMAND_META: unique symbol = Symbol("akan.command.meta");

export interface TargetMeta {
  key: string;
  targetOption: TargetOption;
  args: (ArgMeta | InternalArgMeta)[];
  handler: (this: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
}

export interface CommandStatics {
  [COMMAND_META]: Map<string, TargetMeta>;
}

export type CommandCls<Instance = unknown, Key extends string = string> = DependencyCls<Instance, Key> & CommandStatics;

export const getTargetMetas = (command: CommandCls): TargetMeta[] => {
  const targetMetaMap = command[COMMAND_META];
  if (!targetMetaMap) throw new Error(`TargetMeta is not defined for ${command.name}`);
  return [...targetMetaMap.values()];
};

/** Shared with the command-manifest generator, so a lazily loaded CLI maps argv[2] to the module runCommands would. */
export const getTargetCommandNames = (targetMeta: TargetMeta): string[] => {
  const kebabKey = camelToKebabCase(targetMeta.key);
  if (targetMeta.targetOption.short !== true) return [kebabKey];
  return [
    kebabKey,
    kebabKey
      .split("-")
      .map((s) => s.slice(0, 1))
      .join(""),
  ];
};

export interface TargetOption {
  type: "public" | "cloud" | "dev";
  short?: string | true;
  devOnly?: boolean;
  desc?: string;
  runsOnWorkspaceRoot?: boolean;
  stdio?: boolean;
  failureExitCode?: number;
  usageExitCode?: number;
  /** Runs after the CLI printed a failure and before it exits, so what it writes ends the output. */
  onFailure?: (error: unknown, failure: TargetFailure) => void | Promise<void>;
}

export interface TargetFailure {
  /** commander refused a flag or argument before the command ran, and printed why. */
  usage: boolean;
  /** The options given on the command line as the command would receive them, without defaults or prompts. */
  given: { [name: string]: unknown };
}

export const Commands = () => {
  return (target: Cls) => {
    // not implemented yet
  };
};
