import { Any, type FIELD_META, type PromiseOrObject } from "akanjs/base";
import type {
  ConstantCls,
  ConstantField,
  ConstantFieldTypeInput,
  DocumentModel,
  FieldObject,
  FieldToValue,
  PlainTypeToFieldType,
} from "akanjs/constant";
import type { AkanJob, ServiceModel } from "akanjs/service";
import { type ArgInfo, EndpointInfo, type InternalArgInfo, type ReturnInfo } from "./endpointInfo";
import type { InternalArgCls } from "./internalArg";
import type { CnstOf, DbDoc, SignalOption, SrvMap } from "./types";

type InternalType = "resolveField" | "interval" | "cron" | "timeout" | "init" | "destroy" | "process";

interface InternalArgProps<Nullable extends boolean = false> {
  nullable?: Nullable;
}

export class InternalInfo<
  ReqType extends InternalType = InternalType,
  Srvs extends { [key: string]: any } = { [key: string]: any },
  Args extends any[] = any,
  InternalArgs extends any[] = any,
  DefaultArgs extends any[] = any,
  Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput,
  ServerReturns = any,
  Nullable extends boolean = boolean,
> {
  readonly type: ReqType;
  readonly args: ArgInfo<InternalArgProps<boolean>>[] = [];
  readonly internalArgs: InternalArgInfo<boolean>[] = [];
  readonly defaultArgs: string[] = [];
  readonly returns: ReturnInfo<Returns, Nullable>;
  readonly signalOption: SignalOption<Returns, Nullable>;

  execFn: ((...args: [...Args, ...DefaultArgs, ...InternalArgs]) => ServerReturns) | null = null;

  constructor(type: ReqType, returnRef: Returns, signalOption: SignalOption<Returns, Nullable> = {}) {
    this.type = type;
    this.returns = EndpointInfo.getReturnInfo(returnRef, signalOption);
    this.signalOption = signalOption;
    if (type === "resolveField") this.defaultArgs.push("Parent");
    else if (type === "process") this.defaultArgs.push("Job");
  }
  msg<
    ExplicitType,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    Nullable extends boolean = false,
    _FieldToValue = FieldToValue<Arg>,
  >(name: string, arg: Arg, option?: InternalArgProps<Nullable>) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.args.push(EndpointInfo.getArgInfo("msg", name, arg, option));
    return this as unknown as InternalInfo<
      ReqType,
      Srvs,
      [...Args, arg: _FieldToValue | (Nullable extends true ? undefined : never)],
      InternalArgs,
      DefaultArgs,
      Returns,
      ServerReturns,
      Nullable
    >;
  }
  with<ArgType, Optional extends boolean = false>(
    argRef: InternalArgCls<ArgType>,
    option?: InternalArgProps<Optional>,
  ) {
    if (this.execFn) throw new Error("Query function is already set");
    this.internalArgs.push({
      argRef,
      option: { ...option, ...(this.type === "resolveField" ? { nullable: true } : {}) }, //? for resolveField, nullable is true by default
    });
    return this as unknown as InternalInfo<
      ReqType,
      Srvs,
      Args,
      [
        ...InternalArgs,
        arg: NonNullable<ArgType> | (Optional extends true ? null : ReqType extends "resolveField" ? null : never),
      ],
      DefaultArgs,
      Returns,
      ServerReturns,
      Nullable
    >;
  }
  exec<
    ExecReturn extends ReqType extends "process" | "resolveField"
      ? PromiseOrObject<DocumentModel<FieldToValue<Returns>> | (Nullable extends true ? null : never)>
      : PromiseOrObject<void>,
  >(execFn: (this: Srvs, ...args: [...Args, ...DefaultArgs, ...InternalArgs]) => ExecReturn) {
    if (this.execFn) throw new Error("Query function is already set");
    this.execFn = execFn as unknown as (...args: [...Args, ...DefaultArgs, ...InternalArgs]) => ServerReturns;
    return this as unknown as InternalInfo<
      ReqType,
      Srvs,
      Args,
      InternalArgs,
      DefaultArgs,
      Returns,
      ExecReturn,
      Nullable
    >;
  }
}

type InternalInfoEmptyParts = {
  reqType: never;
  srvs: never;
  args: never;
  internalArgs: never;
  defaultArgs: never;
  returns: never;
  serverReturns: never;
  nullable: never;
};
export type InternalInfoParts<I> =
  I extends InternalInfo<
    infer ReqType,
    infer Srvs,
    infer Args,
    infer InternalArgs,
    infer DefaultArgs,
    infer Returns,
    infer ServerReturns,
    infer Nullable
  >
    ? {
        reqType: ReqType;
        srvs: Srvs;
        args: Args;
        internalArgs: InternalArgs;
        defaultArgs: DefaultArgs;
        returns: Returns;
        serverReturns: ServerReturns;
        nullable: Nullable;
      }
    : InternalInfoEmptyParts;
export type InternalInfoReqType<I> = InternalInfoParts<I>["reqType"];
export type InternalInfoSrvs<I> = InternalInfoParts<I>["srvs"];
export type InternalInfoServerArgs<I> = InternalInfoParts<I>["args"];
export type InternalInfoInternalArgs<I> = InternalInfoParts<I>["internalArgs"];
export type InternalInfoDefaultArgs<I> = InternalInfoParts<I>["defaultArgs"];
export type InternalInfoReturns<I> = InternalInfoParts<I>["returns"];
export type InternalInfoServerReturns<I> = InternalInfoParts<I>["serverReturns"];
export type InternalInfoNullable<I> = InternalInfoParts<I>["nullable"];

export type BuildInternal<SrvModule extends ServiceModel, ParentDoc = DbDoc<SrvModule>> = {
  resolveField: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: Pick<SignalOption<Returns, Nullable>, "nullable">,
  ) => InternalInfo<"resolveField", SrvMap<SrvModule>, [], [], [ParentDoc], Returns, never, Nullable>;
  interval: <Nullable extends boolean = false>(
    scheduleTime: number,
    signalOption?: SignalOption<typeof Any, Nullable>,
  ) => InternalInfo<"interval", SrvMap<SrvModule>, [], [], [], typeof Any, never, Nullable>;
  cron: <Nullable extends boolean = false>(
    scheduleCron: string,
    signalOption?: SignalOption<typeof Any, Nullable>,
  ) => InternalInfo<"cron", SrvMap<SrvModule>, [], [], [], typeof Any, never, Nullable>;
  timeout: <Nullable extends boolean = false>(
    timeout: number,
    signalOption?: SignalOption<typeof Any, Nullable>,
  ) => InternalInfo<"timeout", SrvMap<SrvModule>, [], [], [], typeof Any, never, Nullable>;
  initialize: <Nullable extends boolean = false>(
    signalOption?: SignalOption<typeof Any, Nullable>,
  ) => InternalInfo<"init", SrvMap<SrvModule>, [], [], [], typeof Any, never, Nullable>;
  destroy: <Nullable extends boolean = false>(
    signalOption?: SignalOption<typeof Any, Nullable>,
  ) => InternalInfo<"destroy", SrvMap<SrvModule>, [], [], [], typeof Any, never, Nullable>;
  process: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => InternalInfo<"process", SrvMap<SrvModule>, [], [], [AkanJob], Returns, never, Nullable>;
};

export type InternalBuilder<
  SrvModule extends ServiceModel,
  _Cnst = CnstOf<SrvModule>,
  _FullCls extends ConstantCls = [_Cnst] extends [never]
    ? never
    : _Cnst extends { full: infer Full extends ConstantCls }
      ? Full
      : never,
  _FieldObj extends FieldObject = _FullCls[typeof FIELD_META],
  _ResolveFieldObj extends FieldObject = {
    [K in keyof _FieldObj as _FieldObj[K] extends ConstantField<"resolve", any, any, any, any, any>
      ? K
      : never]: _FieldObj[K];
  },
> = (builder: BuildInternal<SrvModule>) => [_Cnst] extends [never]
  ? { [key: string]: InternalInfo<InternalType> }
  : [_FullCls] extends [never]
    ? { [key: string]: InternalInfo<InternalType> }
    : {
        [K in keyof _ResolveFieldObj]: _ResolveFieldObj[K] extends ConstantField<
          "resolve",
          infer Value,
          any,
          any,
          infer Nullable
        >
          ? InternalInfo<"resolveField", any, any, any, any, NonNullable<Value>, Nullable>
          : InternalInfo<Exclude<InternalType, "resolveField">>;
      } & { [key: string]: InternalInfo<InternalType> };

export const buildInternal = {
  resolveField: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: Pick<SignalOption<Returns, Nullable>, "nullable">,
  ) => new InternalInfo("resolveField", returnRef, signalOption),
  interval: (scheduleTime: number, signalOption?: SignalOption) =>
    new InternalInfo("interval", Any, {
      enabled: true,
      lock: true,
      scheduleType: "interval",
      scheduleTime,
      ...signalOption,
    }),
  cron: (scheduleCron: string, signalOption?: SignalOption) =>
    new InternalInfo("cron", Any, {
      enabled: true,
      lock: true,
      scheduleType: "cron",
      scheduleCron,
      ...signalOption,
    }),
  timeout: (timeout: number, signalOption?: SignalOption) =>
    new InternalInfo("timeout", Any, {
      enabled: true,
      lock: true,
      scheduleType: "timeout",
      scheduleTime: timeout,
      ...signalOption,
    }),
  initialize: (signalOption?: SignalOption) =>
    new InternalInfo("init", Any, {
      enabled: true,
      scheduleType: "init",
      ...signalOption,
    }),
  destroy: (signalOption?: SignalOption) =>
    new InternalInfo("destroy", Any, {
      enabled: true,
      lock: true,
      scheduleType: "destroy",
      ...signalOption,
    }),
  process: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) =>
    new InternalInfo("process", returnRef, {
      serverMode: "all",
      ...signalOption,
    }),
} as BuildInternal<any, any>;
