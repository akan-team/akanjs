import type { Cls, PromiseOrObject } from "akanjs/base";
import type {
  BaseInsight,
  BaseObject,
  ConstantFieldTypeInput,
  DocumentModel,
  FieldToValue,
  ParamFieldType,
  PlainTypeToFieldType,
  PurifiedModel,
  QueryOf,
} from "akanjs/constant";
import type { FilterCls, FilterInstance } from "akanjs/document";
import type { ServiceModel } from "akanjs/service";
import {
  type ArgInfo,
  type EndpointArgProps,
  EndpointInfo,
  type InternalArgInfo,
  type InternalArgProps,
} from "./endpointInfo";
import type { InternalArgCls } from "./internalArg";
import type { CnstFull, CnstInput, CnstInsight, CnstLight, DbFilter, SignalOption, SrvMap, SrvRefName } from "./types";

export class SliceInfo<
  RefName extends string = string,
  Input = any,
  Full = any,
  Light = any,
  Insight = any,
  Filter extends FilterInstance = any,
  Srvs extends { [key: string]: any } = { [key: string]: any },
  ArgNames extends string[] = any,
  Args extends any[] = any,
  InternalArgs extends any[] = any,
  ServerArgs extends any[] = any,
> {
  readonly refName: RefName;
  readonly input: Cls<Input>;
  readonly full: Cls<Full>;
  readonly light: Cls<Light>;
  readonly insight: Cls<Insight>;
  readonly filter: FilterCls<Filter>;
  readonly argNames: ArgNames = [] as unknown as ArgNames;
  readonly args: ArgInfo<EndpointArgProps<boolean>>[] = [];
  readonly internalArgs: InternalArgInfo<boolean>[] = [];
  readonly signalOption: SignalOption;
  execFn: ((...args: [...ServerArgs, ...InternalArgs]) => QueryOf<DocumentModel<Full>>) | null = null;

  constructor(
    refName: RefName,
    input: Cls<Input>,
    full: Cls<Full>,
    light: Cls<Light>,
    insight: Cls<Insight>,
    filter: FilterCls<Filter>,
    signalOption: SignalOption = {},
  ) {
    this.refName = refName;
    this.input = input;
    this.full = full;
    this.light = light;
    this.insight = insight;
    this.filter = filter;
    this.signalOption = signalOption;
  }
  param<
    ArgName extends string,
    Arg extends ParamFieldType,
    _ClientArg = FieldToValue<Arg>,
    _ServerArg = DocumentModel<_ClientArg>,
  >(name: ArgName, arg: Arg, option?: Omit<EndpointArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("param", name, arg, option));
    return this as unknown as SliceInfo<
      RefName,
      Input,
      Full,
      Light,
      Insight,
      Filter,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg]
    >;
  }
  body<
    ArgName extends string,
    ExplicitType = unknown,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    Optional extends boolean = false,
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: ArgName, arg: Arg, option?: EndpointArgProps<Optional>) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("body", name, arg, option));
    return this as unknown as SliceInfo<
      RefName,
      Input,
      Full,
      Light,
      Insight,
      Filter,
      Srvs,
      [...ArgNames, ArgName],
      Optional extends true ? [...Args, arg?: _ClientArg | null] : [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | (Optional extends true ? undefined : never)]
    >;
  }
  search<
    ArgName extends string,
    ExplicitType = unknown,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: ArgName, arg: Arg, option?: Omit<EndpointArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("search", name, arg, { ...option, nullable: true }));
    return this as unknown as SliceInfo<
      RefName,
      Input,
      Full,
      Light,
      Insight,
      Filter,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg?: _ClientArg | null],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | undefined]
    >;
  }
  with<ArgType, Optional extends boolean = false>(
    argRef: InternalArgCls<ArgType>,
    option?: InternalArgProps<Optional>,
  ) {
    if (this.execFn) throw new Error("Query function is already set");
    this.internalArgs.push({ argRef, option });
    return this as unknown as SliceInfo<
      RefName,
      Input,
      Full,
      Light,
      Insight,
      Filter,
      Srvs,
      ArgNames,
      Args,
      [...InternalArgs, arg: NonNullable<ArgType> | (Optional extends true ? null : never)],
      ServerArgs
    >;
  }
  exec(
    query: (
      this: {
        [K in keyof Srvs as K extends string ? Uncapitalize<K> : never]: Srvs[K];
      },
      ...args: [...ServerArgs, ...InternalArgs]
    ) => PromiseOrObject<QueryOf<DocumentModel<Full>>>,
  ) {
    if (this.execFn) throw new Error("Query function is already set");
    this.execFn = query;
    return this;
  }
}

export const buildSlice =
  <
    T extends string,
    Input extends Cls<any>,
    Full extends BaseObject,
    Light extends BaseObject,
    Insight extends BaseInsight,
    Filter extends FilterInstance,
    SrvModule extends ServiceModel,
  >(
    refName: T,
    input: Cls<Input>,
    full: Cls<Full>,
    light: Cls<Light>,
    insight: Cls<Insight>,
    filter: FilterCls<Filter>,
  ) =>
  (signalOption?: SignalOption) =>
    new SliceInfo<T, Input, Full, Light, Insight, Filter, SrvMap<SrvModule>, [], [], [], []>(
      refName,
      input,
      full,
      light,
      insight,
      filter,
      signalOption,
    );

// --- Accessors ---
// Named projections for SliceInfo's 11 generics. Use these to avoid repeating
// 11-slot `extends SliceInfo<any, any, ..., infer X, any, any>` patterns.
type SliceInfoEmptyParts = {
  refName: never;
  input: never;
  full: never;
  light: never;
  insight: never;
  filter: never;
  srvs: never;
  argNames: never;
  args: never;
  internalArgs: never;
  serverArgs: never;
};
export type SliceInfoParts<S> =
  S extends SliceInfo<
    infer RefName,
    infer Input,
    infer Full,
    infer Light,
    infer Insight,
    infer Filter,
    infer Srvs,
    infer ArgNames,
    infer Args,
    infer InternalArgs,
    infer ServerArgs
  >
    ? {
        refName: RefName;
        input: Input;
        full: Full;
        light: Light;
        insight: Insight;
        filter: Filter;
        srvs: Srvs;
        argNames: ArgNames;
        args: Args;
        internalArgs: InternalArgs;
        serverArgs: ServerArgs;
      }
    : SliceInfoEmptyParts;
export type SliceInfoRefName<S> = SliceInfoParts<S>["refName"];
export type SliceInfoInput<S> = SliceInfoParts<S>["input"];
export type SliceInfoFull<S> = SliceInfoParts<S>["full"];
export type SliceInfoLight<S> = SliceInfoParts<S>["light"];
export type SliceInfoInsight<S> = SliceInfoParts<S>["insight"];
export type SliceInfoFilter<S> = SliceInfoParts<S>["filter"];
export type SliceInfoSrvs<S> = SliceInfoParts<S>["srvs"];
export type SliceInfoArgNames<S> = SliceInfoParts<S>["argNames"];
export type SliceInfoArgs<S> = SliceInfoParts<S>["args"];
export type SliceInfoInternalArgs<S> = SliceInfoParts<S>["internalArgs"];
export type SliceInfoServerArgs<S> = SliceInfoParts<S>["serverArgs"];

export type SliceBuilder<
  SrvModule extends ServiceModel,
  _Input = CnstInput<SrvModule>,
  _Full = CnstFull<SrvModule>,
  _Light = CnstLight<SrvModule>,
  _Insight = CnstInsight<SrvModule>,
  _Filter extends FilterInstance = DbFilter<SrvModule>,
  _SliceInfo = SliceInfo<SrvRefName<SrvModule>, _Input, _Full, _Light, _Insight, _Filter, SrvMap<SrvModule>>,
> = (
  init: (
    signalOption?: SignalOption,
  ) => SliceInfo<SrvRefName<SrvModule>, _Input, _Full, _Light, _Insight, _Filter, SrvMap<SrvModule>, [], [], [], []>,
) => Record<string, _SliceInfo>;
