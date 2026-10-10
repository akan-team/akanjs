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
}

export const Commands = () => {
  return (target: Cls) => {
    // not implemented yet
  };
};
