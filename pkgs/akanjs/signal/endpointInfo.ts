import {
  arraiedModel,
  type Cls,
  type Dayjs,
  type EnumInstance,
  getNonArrayModel,
  isEnum,
  type PromiseOrObject,
} from "akanjs/base";
import type {
  ConstantFieldType,
  ConstantFieldTypeInput,
  DocumentModel,
  FieldToValue,
  ParamFieldType,
  PlainTypeToFieldType,
  PurifiedModel,
  UploadableClientArg,
} from "akanjs/constant";
import type { ServiceModel } from "akanjs/service";
import type { InternalArgCls } from "./internalArg";
import type { ArgType, SignalOption, SrvMap } from "./types";

export type EndpointType = "query" | "mutation" | "pubsub" | "message";

export interface EndpointArgProps<Optional extends boolean = false> {
  nullable?: Optional;
  example?: string | number | boolean | Dayjs;
}
export interface InternalArgProps<Optional extends boolean = false> {
  nullable?: Optional;
}

export interface ReturnInfo<Returns extends ConstantFieldTypeInput = any, Nullable extends boolean = false> {
  returnRef: Returns;
  arrDepth: number;
  enum?: EnumInstance;
  nullable?: Nullable;
}

export interface ArgInfo<ArgProps = any> {
  type: ArgType;
  name: string;
  argRef: ConstantFieldType;
  arrDepth: number;
  enum?: EnumInstance;
  option?: ArgProps;
}
export interface InternalArgInfo<Optional extends boolean = false> {
  argRef: InternalArgCls;
  option?: InternalArgProps<Optional>;
}
export class EndpointInfo<
  ReqType extends EndpointType = EndpointType,
  Srvs extends { [key: string]: any } = { [key: string]: any },
  ArgNames extends string[] = any,
  Args extends any[] = any,
  InternalArgs extends any[] = any,
  ServerArgs extends any[] = any,
  Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput,
  ClientReturns = never,
  ServerReturns = never,
  Nullable extends boolean = boolean,
> {
  readonly type: ReqType;
  readonly argNames: ArgNames = [] as unknown as ArgNames;
  readonly args: ArgInfo<EndpointArgProps<boolean>>[] = [];
  readonly internalArgs: InternalArgInfo<boolean>[] = [];
  readonly returns: ReturnInfo<Returns, Nullable>;
  readonly signalOption: SignalOption<Returns, Nullable, any>;
  execFn: ((...args: [...ServerArgs, ...InternalArgs]) => PromiseOrObject<any>) | null = null;
  static getArgInfo(
    type: ArgType,
    name: string,
    arg: ConstantFieldTypeInput,
    option?: EndpointArgProps<boolean>,
  ): ArgInfo {
    const [singleArg, arrDepth] = getNonArrayModel(arg as Cls);
    const isArgEnum = isEnum(singleArg);
    const argRef = isArgEnum ? (singleArg as EnumInstance).type : singleArg;
    return {
      type,
      name,
      argRef: argRef as ConstantFieldType,
      arrDepth,
      enum: isArgEnum ? (singleArg as EnumInstance) : undefined,
      option,
    };
  }
  static getReturnInfo<
    Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput,
    Nullable extends boolean = false,
  >(modelRef: Returns, signalOption: SignalOption<Returns, Nullable> = {}): ReturnInfo<Returns, Nullable> {
    const [singleReturn, arrDepth] = getNonArrayModel(modelRef as Cls);
    const isReturnEnum = isEnum(singleReturn);
    const returnRef = isReturnEnum ? (singleReturn as EnumInstance).type : singleReturn;
    return {
      returnRef: returnRef as Returns,
      arrDepth,
      enum: isReturnEnum ? (singleReturn as EnumInstance) : undefined,
      nullable: (signalOption.nullable ?? false) as Nullable,
    };
  }

  constructor(type: ReqType, returnRef: Returns, signalOption: SignalOption<Returns, Nullable> = {}) {
    this.type = type;
    this.returns = EndpointInfo.getReturnInfo(returnRef, signalOption);
    this.signalOption = signalOption;
  }
  param<
    ArgName extends string,
    Arg extends ParamFieldType,
    _ClientArg = FieldToValue<Arg>,
    _ServerArg = DocumentModel<_ClientArg>,
  >(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("param", name, arg, option));
    return this as unknown as EndpointInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg],
      Returns,
      ClientReturns,
      ServerReturns,
      Nullable
    >;
  }
  body<
    ArgName extends string,
    ExplicitType = unknown,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    Optional extends boolean = false,
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = UploadableClientArg<PurifiedModel<_ArgType>>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: ArgName, arg: Arg, option?: EndpointArgProps<Optional>) {
    if (this.execFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("body", name, arg, option));
    return this as unknown as EndpointInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      Optional extends true ? [...Args, arg?: _ClientArg | null] : [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | (Optional extends true ? undefined : never)],
      Returns,
      ClientReturns,
      ServerReturns,
      Nullable
    >;
  }
  room<
    ArgName extends string,
    ExplicitType = unknown,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("room", name, arg, option));
    return this as unknown as EndpointInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg],
      Returns,
      ClientReturns,
      ServerReturns,
      Nullable
    >;
  }
  msg<
    ArgName extends string,
    ExplicitType = unknown,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    Optional extends boolean = false,
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: string, arg: Arg, option?: EndpointArgProps<Optional>) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("msg", name, arg, option));
    return this as unknown as EndpointInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      Optional extends true ? [...Args, arg?: _ClientArg | null] : [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | (Optional extends true ? undefined : never)],
      Returns,
      ClientReturns,
      ServerReturns,
      Nullable
    >;
  }
  search<
    ArgName extends string,
    ExplicitType = unknown,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push(EndpointInfo.getArgInfo("search", name, arg, { ...option, nullable: true }));
    return this as unknown as EndpointInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg?: _ClientArg | null],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | undefined],
      Returns,
      ClientReturns,
      ServerReturns,
      Nullable
    >;
  }
  _addArgs(args: ArgInfo<EndpointArgProps<boolean>>[]) {
    for (const arg of args) {
      const argRef = arraiedModel(arg.enum ?? arg.argRef, arg.arrDepth);
      switch (arg.type) {
        case "param":
          this.param(arg.name, argRef as ParamFieldType, arg.option);
          break;
        case "body":
          this.body(arg.name, argRef, arg.option);
          break;
        case "search":
          this.search(arg.name, argRef, arg.option);
          break;
        case "room":
          this.room(arg.name, argRef, arg.option);
          break;
        case "msg":
          this.msg(arg.name, argRef, arg.option);
          break;
        default:
          throw new Error(`Invalid argument type: ${arg.type}`);
      }
    }
    return this;
  }
  with<ArgType, Optional extends boolean = false>(
    argRef: InternalArgCls<ArgType>,
    option?: InternalArgProps<Optional>,
  ) {
    if (this.execFn) throw new Error("Query function is already set");
    this.internalArgs.push({ argRef, option });
    return this as unknown as EndpointInfo<
      ReqType,
      Srvs,
      ArgNames,
      Args,
      [...InternalArgs, arg: NonNullable<ArgType> | (Optional extends true ? null : never)],
      ServerArgs,
      Returns,
      ClientReturns,
      ServerReturns,
      Nullable
    >;
  }
  _addInternalArgs(args: InternalArgInfo<boolean>[]) {
    for (const arg of args) this.with(arg.argRef, arg.option);
    return this;
  }
  exec<
    ExecFn extends (
      this: Srvs,
      ...args: [...ServerArgs, ...InternalArgs]
    ) => ReqType extends "pubsub"
      ? Promise<void> | void
      : PromiseOrObject<DocumentModel<FieldToValue<Returns>> | (Nullable extends true ? null | undefined : never)>,
  >(
    execFn: ExecFn,
  ): EndpointInfo<
    ReqType,
    Srvs,
    ArgNames,
    Args,
    InternalArgs,
    ServerArgs,
    Returns,
    FieldToValue<Returns>,
    ReturnType<ExecFn>,
    Nullable
  > {
    if (this.execFn) throw new Error("Query function is already set");
    this.execFn = execFn;
    return this as unknown as EndpointInfo<
      ReqType,
      Srvs,
      ArgNames,
      Args,
      InternalArgs,
      ServerArgs,
      Returns,
      FieldToValue<Returns>,
      ReturnType<ExecFn>,
      Nullable
    >;
  }

  getPath(key: string) {
    if (this.signalOption.path) return `${this.signalOption.path.startsWith("/") ? "" : "/"}${this.signalOption.path}`;
    else
      return `/${[
        this.signalOption.name ?? key,
        ...this.args.filter((arg) => arg.type === "param").map((arg) => `:${arg.name}`),
      ].join("/")}`;
  }
}

// TODO: signal type 에 따라 기본 internal arg들 배정해주기
// TODO: pubsub은 exec 없어도 되게하기
// TODO: exec 없으면 타입에러 뜨게하기
export type BuildEndpoint<SrvModule extends ServiceModel = ServiceModel> = {
  query: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => EndpointInfo<"query", SrvMap<SrvModule>, [], [], [], [], Returns, never, never, Nullable>;
  mutation: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => EndpointInfo<"mutation", SrvMap<SrvModule>, [], [], [], [], Returns, never, never, Nullable>;
  pubsub: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => EndpointInfo<"pubsub", SrvMap<SrvModule>, [], [], [], [], Returns, never, never, Nullable>;
  message: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => EndpointInfo<"message", SrvMap<SrvModule>, [], [], [], [], Returns, never, never, Nullable>;
};

export const buildEndpoint = {
  query: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => new EndpointInfo("query", returnRef, signalOption),
  mutation: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => new EndpointInfo("mutation", returnRef, signalOption),
  pubsub: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => new EndpointInfo("pubsub", returnRef, signalOption),
  message: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>,
  ) => new EndpointInfo("message", returnRef, signalOption),
} as unknown as BuildEndpoint<any>;

export type EndpointBuilder<SrvModule extends ServiceModel = ServiceModel> = (builder: BuildEndpoint<SrvModule>) => {
  [key: string]: EndpointInfo;
};

// --- Accessors ---
// Named projections for EndpointInfo's 10 generics. Use these instead of
// re-inferring the whole shape so that parameter-order refactors only need
// to be reflected in one place.
type EndpointInfoEmptyParts = {
  reqType: never;
  srvs: never;
  argNames: never;
  args: never;
  internalArgs: never;
  serverArgs: never;
  returnRef: never;
  clientReturns: never;
  serverReturns: never;
  nullable: never;
};
export type EndpointInfoParts<E> =
  E extends EndpointInfo<
    infer ReqType,
    infer Srvs,
    infer ArgNames,
    infer Args,
    infer InternalArgs,
    infer ServerArgs,
    infer Returns,
    infer ClientReturns,
    infer ServerReturns,
    infer Nullable
  >
    ? {
        reqType: ReqType;
        srvs: Srvs;
        argNames: ArgNames;
        args: Args;
        internalArgs: InternalArgs;
        serverArgs: ServerArgs;
        returnRef: Returns;
        clientReturns: ClientReturns;
        serverReturns: ServerReturns;
        nullable: Nullable;
      }
    : EndpointInfoEmptyParts;
export type EndpInfoReqType<E> = EndpointInfoParts<E>["reqType"];
export type EndpInfoSrvs<E> = EndpointInfoParts<E>["srvs"];
export type EndpInfoArgNames<E> = EndpointInfoParts<E>["argNames"];
export type EndpInfoArgs<E> = EndpointInfoParts<E>["args"];
export type EndpInfoInternalArgs<E> = EndpointInfoParts<E>["internalArgs"];
export type EndpInfoServerArgs<E> = EndpointInfoParts<E>["serverArgs"];
export type EndpInfoReturnRef<E> = EndpointInfoParts<E>["returnRef"];
export type EndpInfoClientReturns<E> = EndpointInfoParts<E>["clientReturns"];
export type EndpInfoServerReturns<E> = EndpointInfoParts<E>["serverReturns"];
export type EndpInfoNullable<E> = EndpointInfoParts<E>["nullable"];
