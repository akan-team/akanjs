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

export interface TargetOption {
  type: "public" | "cloud" | "dev";
  short?: string | true;
  devOnly?: boolean;
  desc?: string;
  runsOnWorkspaceRoot?: boolean;
  stdio?: boolean;
}
