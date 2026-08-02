import type { ArgMeta, InternalArgMeta } from "./argMeta";
import type { DependencyCls } from "./types";

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

const camelToKebabCase = (str: string) => str.replace(/([A-Z])/g, "-$1").toLowerCase();

/**
 * CLI names a target answers to. Shared with the command-manifest generator so a lazily-loaded CLI
 * resolves `argv[2]` to the same module that `runCommands` would have registered it under.
 */
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
}
