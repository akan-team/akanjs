import type {
  App,
  ArgMeta,
  ArgsOption,
  ArgType,
  CommandContext,
  Exec,
  InternalArgMeta,
  InternalArgToken,
  Lib,
  Module,
  Pkg,
  PrimitiveArgType,
  Sys,
} from "./argMeta";
import { normalizePrimitiveArgType } from "./argMeta";
import {
  assertUniqueDependencies,
  type DependencyCls,
  type DependencyInstanceMap,
  type DependencyKey,
  injectDependencies,
} from "./dependencyBuilder";
import { COMMAND_META, type CommandCls, type TargetMeta, type TargetOption } from "./targetMeta";

type PrimitiveValue<T extends PrimitiveArgType> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
    ? number
    : boolean;
type MaybeNullable<Value, Option> = Option extends { nullable: true } ? Value | null : Value;
// A DynamicEnum yields never (a function is no readonly array), so ArgValue falls back to the primitive type.
type EnumValue<Option> = Option extends { enum: infer Choices }
  ? Choices extends readonly (infer Choice)[]
    ? Choice extends { value: infer Value }
      ? Value
      : Choice
    : never
  : never;
type ArgValue<Type extends PrimitiveArgType, Option> = [EnumValue<Option>] extends [never]
  ? PrimitiveValue<Type>
  : EnumValue<Option>;
type AddArg<Params extends unknown[], Type extends PrimitiveArgType, Option> = [
  ...Params,
  MaybeNullable<ArgValue<Type, Option>, Option>,
];
type AddInternalArg<Params extends unknown[], Token extends InternalArgToken> = [...Params, Token["_value"]];
type AddInternalArgs<Params extends unknown[], Tokens extends readonly InternalArgToken[]> = Tokens extends readonly [
  infer Head extends InternalArgToken,
  ...infer Rest extends InternalArgToken[],
]
  ? AddInternalArgs<AddInternalArg<Params, Head>, Rest>
  : Params;
type ContextFromToken<Token extends InternalArgToken> = Token["_value"] extends App
  ? { app: App }
  : Token["_value"] extends Lib
    ? { lib: Lib }
    : Token["_value"] extends Sys
      ? { sys: Sys }
      : Token["_value"] extends Pkg
        ? { pkg: Pkg }
        : Token["_value"] extends Module
          ? { module: Module }
          : Token["_value"] extends Exec
            ? { exec: Exec }
            : object;
type AddInternalContext<Context, Tokens extends readonly InternalArgToken[]> = Tokens extends readonly [
  infer Head extends InternalArgToken,
  ...infer Rest extends InternalArgToken[],
]
  ? AddInternalContext<Context & ContextFromToken<Head>, Rest>
  : Context;
type CommandHandler<Deps extends readonly DependencyCls[], Params extends unknown[]> = (
  this: DependencyInstanceMap<Deps>,
  ...args: Params
) => unknown | Promise<unknown>;

const argMetaOf = (
  type: ArgType,
  name: string,
  primitive: PrimitiveArgType,
  argsOption: object | undefined,
  idx: number,
): ArgMeta => ({ name, argsOption: { ...argsOption, type: normalizePrimitiveArgType(primitive) }, key: "", idx, type });

class TargetBuilder<Deps extends readonly DependencyCls[], Params extends unknown[] = [], Context = object> {
  readonly #args: (ArgMeta | InternalArgMeta)[];

  constructor(
    private readonly targetOption: TargetOption,
    args: (ArgMeta | InternalArgMeta)[] = [],
  ) {
    this.#args = args;
  }

  #add<NextParams extends unknown[], NextContext = Context>(...argMetas: (ArgMeta | InternalArgMeta)[]) {
    return new TargetBuilder<Deps, NextParams, NextContext>(this.targetOption, [...this.#args, ...argMetas]);
  }

  arg<Type extends PrimitiveArgType, const Option extends ArgsOption<Context> = ArgsOption<Context>>(
    name: string,
    type: Type,
    argsOption: Option = {} as Option,
  ) {
    return this.#add<AddArg<Params, Type, Option>>(argMetaOf("Argument", name, type, argsOption, this.#args.length));
  }

  option<Type extends PrimitiveArgType, const Option extends ArgsOption<Context> = ArgsOption<Context>>(
    name: string,
    type: Type,
    argsOption: Option = {} as Option,
  ) {
    return this.#add<AddArg<Params, Type, Option>>(argMetaOf("Option", name, type, argsOption, this.#args.length));
  }

  with<const Tokens extends readonly InternalArgToken[]>(...tokens: Tokens) {
    return this.#add<AddInternalArgs<Params, Tokens>, AddInternalContext<Context, Tokens>>(
      ...tokens.map((token, offset) => ({
        key: "",
        idx: this.#args.length + offset,
        type: token.type,
        ...(token.option ? { option: token.option } : {}),
      })),
    );
  }

  exec(handler: CommandHandler<Deps, Params>) {
    return {
      args: this.#args,
      handler: handler as TargetMeta["handler"],
      targetOption: this.targetOption,
    };
  }
}

type TargetDefinition = ReturnType<TargetBuilder<readonly DependencyCls[], unknown[]>["exec"]>;
type CommandBuilderContext<Deps extends readonly DependencyCls[]> = {
  public: (targetOption?: Omit<TargetOption, "type">) => TargetBuilder<Deps>;
  cloud: (targetOption?: Omit<TargetOption, "type">) => TargetBuilder<Deps>;
  dev: (targetOption?: Omit<TargetOption, "type">) => TargetBuilder<Deps>;
  arg: <Type extends PrimitiveArgType, const Option extends ArgsOption<CommandContext> = ArgsOption<CommandContext>>(
    name: string,
    type: Type,
    argsOption?: Option,
  ) => ArgMeta;
  option: <Type extends PrimitiveArgType, const Option extends ArgsOption<CommandContext> = ArgsOption<CommandContext>>(
    name: string,
    type: Type,
    argsOption?: Option,
  ) => ArgMeta;
};
type CommandBuilder<Deps extends readonly DependencyCls[]> = (
  context: CommandBuilderContext<Deps>,
) => Record<string, TargetDefinition>;

const createTarget =
  <Deps extends readonly DependencyCls[]>(type: TargetOption["type"]) =>
  (targetOption: Omit<TargetOption, "type"> = {}) =>
    new TargetBuilder<Deps>({ runsOnWorkspaceRoot: true, ...targetOption, type });

const createContext = <Deps extends readonly DependencyCls[]>(): CommandBuilderContext<Deps> => ({
  public: createTarget<Deps>("public"),
  cloud: createTarget<Deps>("cloud"),
  dev: createTarget<Deps>("dev"),
  arg: (name, type, argsOption) => argMetaOf("Argument", name, type, argsOption, -1),
  option: (name, type, argsOption) => argMetaOf("Option", name, type, argsOption, -1),
});

const buildCommandMeta = (definitions: Record<string, TargetDefinition>) => {
  const commandMeta = new Map<string, TargetMeta>();
  for (const [key, definition] of Object.entries(definitions)) {
    commandMeta.set(key, {
      key,
      args: definition.args.map((arg) => ({ ...arg, key })),
      handler: definition.handler,
      targetOption: definition.targetOption,
    });
  }
  return commandMeta;
};

export function command<RefName extends string, Deps extends readonly DependencyCls[]>(
  refName: RefName,
  deps: Deps,
  builder: CommandBuilder<Deps>,
): CommandCls<DependencyInstanceMap<Deps>, DependencyKey<RefName, "command">>;
export function command<RefName extends string>(
  refName: RefName,
  builder: CommandBuilder<[]>,
): CommandCls<DependencyInstanceMap<[]>, DependencyKey<RefName, "command">>;
export function command<RefName extends string, Deps extends readonly DependencyCls[]>(
  refName: RefName,
  depsOrBuilder: Deps | CommandBuilder<[]>,
  builder?: CommandBuilder<Deps>,
) {
  const deps = (Array.isArray(depsOrBuilder) ? depsOrBuilder : []) as unknown as Deps;
  const commandBuilder = (Array.isArray(depsOrBuilder) ? builder : depsOrBuilder) as CommandBuilder<Deps>;
  assertUniqueDependencies(deps);
  const commandMeta = buildCommandMeta(commandBuilder(createContext<Deps>()));

  class CommandBase {
    static readonly refName = refName;
    static readonly dependencyKind = "command";
    static readonly dependencyKey = `${refName}Command` as const;
    static readonly [COMMAND_META] = commandMeta;

    constructor() {
      injectDependencies(this, deps);
    }
  }

  return CommandBase as unknown as CommandCls<DependencyInstanceMap<Deps>, DependencyKey<RefName, "command">>;
}
