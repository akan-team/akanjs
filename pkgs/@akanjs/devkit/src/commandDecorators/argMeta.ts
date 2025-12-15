import "reflect-metadata";

import type {
  AppExecutor,
  Executor,
  LibExecutor,
  ModuleExecutor,
  PkgExecutor,
  SysExecutor,
  WorkspaceExecutor,
} from "../executors";
import type { Type } from "./types";

export const argTypes = ["Argument", "Option"] as const;
export type ArgType = (typeof argTypes)[number];

export const internalArgTypes = ["Workspace", "App", "Lib", "Sys", "Pkg", "Module", "Exec"] as const;
export type InternalArgType = (typeof internalArgTypes)[number];

interface ArgsOption {
  type?: "string" | "number" | "boolean";
  flag?: string;
  desc?: string;
  default?: string | number | boolean;
  nullable?: boolean;
  example?: string | number | boolean;
  enum?: (string | number)[] | readonly (string | number)[] | { label: string; value: string | number | boolean }[];
  ask?: string;
}
export interface ArgMeta {
  name: string;
  argsOption: ArgsOption;
  key: string;
  idx: number;
  type: ArgType;
}
export interface InternalArgMeta {
  key: string;
  idx: number;
  type: InternalArgType;
  option?: { nullable?: boolean };
}

export const getArgMetas = (command: Type, key: string) => {
  const allArgMetas = getArgMetasOnPrototype(command.prototype as object, key);
  const argMetas = allArgMetas.filter((argMeta) => argMeta.type === "Option");
  const internalArgMetas = allArgMetas.filter((argMeta) => argMeta.type !== "Option");
  return [allArgMetas, argMetas, internalArgMetas] as [(ArgMeta | InternalArgMeta)[], ArgMeta[], InternalArgMeta[]];
};
const getArgMetasOnPrototype = (prototype: object, key: string): (ArgMeta | InternalArgMeta)[] => {
  return (Reflect.getMetadata("args", prototype, key) as (ArgMeta | InternalArgMeta)[] | undefined) ?? [];
};
const setArgMetasOnPrototype = (prototype: object, key: string, argMetas: (ArgMeta | InternalArgMeta)[]) => {
  Reflect.defineMetadata("args", argMetas, prototype, key);
};

const getArg = (type: ArgType) =>
  function (name: string, argsOption: ArgsOption = {}) {
    return function (prototype: object, key: string, idx: number) {
      const argMetas = getArgMetasOnPrototype(prototype, key);
      argMetas[idx] = { name, argsOption, key, idx, type };
      setArgMetasOnPrototype(prototype, key, argMetas);
    };
  };
export const Argument = getArg("Argument");
export const Option = getArg("Option");

const createArgMetaDecorator = (type: InternalArgType) => {
  return function (option: { nullable?: boolean } = {}) {
    return function (prototype: object, key: string, idx: number) {
      const argMetas = getArgMetasOnPrototype(prototype, key);
      argMetas[idx] = { key, idx, type, option };
      setArgMetasOnPrototype(prototype, key, argMetas);
    };
  };
};

export const App = createArgMetaDecorator("App");
export type App = AppExecutor;

export const Lib = createArgMetaDecorator("Lib");
export type Lib = LibExecutor;

export const Sys = createArgMetaDecorator("Sys");
export type Sys = SysExecutor;

export const Exec = createArgMetaDecorator("Exec");
export type Exec = Executor;

export const Pkg = createArgMetaDecorator("Pkg");
export type Pkg = PkgExecutor;

export const Module = createArgMetaDecorator("Module");
export type Module = ModuleExecutor;

export const Workspace = createArgMetaDecorator("Workspace");
export type Workspace = WorkspaceExecutor;
