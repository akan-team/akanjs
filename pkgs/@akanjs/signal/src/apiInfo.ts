import {
  arraiedModel,
  Dayjs,
  EnumInstance,
  getNonArrayModel,
  isEnum,
  JSON,
  PromiseOrObject,
  Type,
  UnType,
} from "@akanjs/base";
import {
  ConstantFieldTypeInput,
  DocumentModel,
  FieldToValue,
  ParamFieldType,
  PlainTypeToFieldType,
  PurifiedModel,
} from "@akanjs/constant";
import { InternalParam } from "@akanjs/nest";

import {
  ArgMeta,
  ArgType,
  EndpointType,
  getGqlMetaMapOnPrototype,
  GqlMeta,
  InternalArgMeta,
  setArgMetas,
  setGqlMetaMapOnPrototype,
  SignalOption,
} from "./signalDecorators";
import { signalInfo } from "./signalInfo";

type ApiType = "query" | "mutation" | "pubsub" | "message";

export interface ApiArgProps<Optional extends boolean = false> {
  nullable?: Optional;
  example?: string | number | boolean | Dayjs;
}
export class ApiInfo<
  ReqType extends ApiType,
  Srvs extends { [key: string]: any } = { [key: string]: any },
  ArgNames extends string[] = [],
  Args extends any[] = [],
  InternalArgs extends any[] = [],
  ServerArgs extends any[] = [],
  Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput,
  ServerReturns = never,
  Nullable extends boolean = false,
> {
  readonly type: ReqType;
  readonly argNames: ArgNames = [] as unknown as ArgNames;
  readonly args: { type: ArgType; name: string; argRef: any; option?: ApiArgProps<boolean> }[] = [];
  readonly internalArgs: { type: InternalParam; option?: ApiArgProps<boolean> }[] = [];
  readonly returnRef: Returns;
  readonly signalOption: SignalOption<Returns, Nullable, any>;
  execFn: ((...args: [...ServerArgs, ...InternalArgs]) => any) | null = null;

  constructor(type: ReqType, returnRef: Returns, signalOption: SignalOption<Returns, Nullable> = {}) {
    this.type = type;
    this.returnRef = returnRef;
    this.signalOption = signalOption;
  }
  param<
    ArgName extends string,
    Arg extends ParamFieldType,
    _ClientArg = FieldToValue<Arg>,
    _ServerArg = DocumentModel<_ClientArg>,
  >(name: string, argRef: Arg, option?: Omit<ApiArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push({ type: "Param", name, argRef, option });
    return this as unknown as ApiInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg],
      Returns,
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
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: ArgName, argRef: Arg, option?: ApiArgProps<Optional>) {
    if (this.execFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push({ type: "Body", name, argRef, option });
    return this as unknown as ApiInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg | (Optional extends true ? null : never)],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | (Optional extends true ? undefined : never)],
      Returns,
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
  >(name: string, argRef: Arg, option?: Omit<ApiArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push({ type: "Room", name, argRef, option });
    return this as unknown as ApiInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg],
      Returns,
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
  >(name: string, argRef: Arg, option?: ApiArgProps<Optional>) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push({ type: "Msg", name, argRef, option });
    return this as unknown as ApiInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg | (Optional extends true ? null : never)],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | (Optional extends true ? undefined : never)],
      Returns,
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
  >(name: string, argRef: Arg, option?: Omit<ApiArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push({ type: "Query", name, argRef, option: { ...option, nullable: true } });
    return this as unknown as ApiInfo<
      ReqType,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg | null],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | undefined],
      Returns,
      ServerReturns,
      Nullable
    >;
  }
  with<ArgType, Optional extends boolean = false>(argType: InternalParam<ArgType>, option?: ApiArgProps<Optional>) {
    if (this.execFn) throw new Error("Query function is already set");
    this.internalArgs.push({ type: argType, option });
    return this as unknown as ApiInfo<
      ReqType,
      Srvs,
      ArgNames,
      Args,
      [...InternalArgs, arg: ArgType | (Optional extends true ? null : never)],
      ServerArgs,
      Returns,
      ServerReturns,
      Nullable
    >;
  }
  exec<
    ExecFn extends (
      this: Srvs,
      ...args: [...ServerArgs, ...InternalArgs]
    ) => ReqType extends "pubsub"
      ? Promise<void> | void
      : PromiseOrObject<DocumentModel<FieldToValue<Returns>> | (Nullable extends true ? null | undefined : never)>,
  >(
    execFn: ExecFn
  ): ApiInfo<ReqType, Srvs, ArgNames, Args, InternalArgs, ServerArgs, Returns, ReturnType<ExecFn>, Nullable> {
    if (this.execFn) throw new Error("Query function is already set");
    this.execFn = execFn;
    return this as unknown as ApiInfo<
      ReqType,
      Srvs,
      ArgNames,
      Args,
      InternalArgs,
      ServerArgs,
      Returns,
      ReturnType<ExecFn>,
      Nullable
    >;
  }
  static #typeTempMap: Record<ApiType, EndpointType> = {
    query: "Query",
    mutation: "Mutation",
    pubsub: "Pubsub",
    message: "Message",
  };
  applyApiMeta(sigRef: Type, key: string) {
    const execFn = this.execFn;
    if (!execFn) throw new Error("Exec function is not set");
    signalInfo.setHandlerKey(execFn, key);
    const [singleReturnRef, returnArrDepth] = getNonArrayModel(this.returnRef as Type);
    const apiMeta: GqlMeta = {
      returns: () =>
        arraiedModel(
          isEnum(singleReturnRef) ? ((singleReturnRef as EnumInstance).type as Type) : singleReturnRef,
          returnArrDepth
        ) as Type,
      signalOption: this.signalOption,
      key,
      descriptor: { value: this.execFn, writable: true, enumerable: false, configurable: true },
      type: ApiInfo.#typeTempMap[this.type],
    };
    (sigRef.prototype as object)[key] = this.execFn;
    const metadataMap = getGqlMetaMapOnPrototype(sigRef.prototype as object);
    metadataMap.set(key, apiMeta);
    setGqlMetaMapOnPrototype(sigRef.prototype as object, metadataMap);
    const argMetas: ArgMeta[] = this.args.map((arg, idx) => {
      const [singleArgRef, argArrDepth] = getNonArrayModel(arg.argRef as Type);
      const isEnumValue = isEnum(singleArgRef);
      const returnRef = arraiedModel(
        isEnumValue ? ((singleArgRef as EnumInstance).type as Type) : singleArgRef,
        argArrDepth
      );
      return {
        name: arg.name,
        returns: () => returnRef as Type,
        argsOption: { ...arg.option, enum: isEnumValue ? (arg.argRef as EnumInstance) : undefined },
        key,
        idx,
        type: arg.type,
      };
    });
    const internalArgMetas: InternalArgMeta[] = this.internalArgs.map((arg, idx) => ({
      type: arg.type,
      key,
      idx: this.args.length + idx,
      option: arg.option,
    }));
    setArgMetas(sigRef, key, argMetas, internalArgMetas);
  }
}

type ApiInfoReturn<
  ReqType extends ApiType,
  Returns extends ConstantFieldTypeInput,
  ServerReturns,
  Nullable extends boolean,
  _ReturnValue = Returns extends typeof JSON ? Awaited<ServerReturns> : FieldToValue<Returns>,
> = ReqType extends "query"
  ? Promise<_ReturnValue | (Nullable extends true ? null : never)>
  : ReqType extends "mutation"
    ? Promise<_ReturnValue | (Nullable extends true ? null : never)>
    : ReqType extends "pubsub"
      ? (_ReturnValue | (Nullable extends true ? null : never)) & { __Returns__: "Subscribe" }
      : ReqType extends "message"
        ? (_ReturnValue | (Nullable extends true ? null : never)) & { __Returns__: "Emit" }
        : never;
export type BuildApiSignal<ApiInfoMap> = {
  [K in keyof ApiInfoMap]: ApiInfoMap[K] extends ApiInfo<
    infer ReqType,
    any,
    any,
    infer Args,
    any,
    any,
    infer Returns,
    infer ServerReturns,
    infer Nullable
  >
    ? (...args: Args) => ApiInfoReturn<ReqType, Returns, ServerReturns, Nullable>
    : never;
};

export const makeApiBuilder = <Srvs extends { [key: string]: any }>() => ({
  query: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => new ApiInfo<"query", Srvs, [], [], [], [], Returns, never, Nullable>("query", returnRef, signalOption),
  mutation: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => new ApiInfo<"mutation", Srvs, [], [], [], [], Returns, never, Nullable>("mutation", returnRef, signalOption),
  pubsub: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => new ApiInfo<"pubsub", Srvs, [], [], [], [], Returns, never, Nullable>("pubsub", returnRef, signalOption),
  message: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => new ApiInfo<"message", Srvs, [], [], [], [], Returns, never, Nullable>("message", returnRef, signalOption),
});

// signal type 에 따라 기본 internal arg들 배정해주기
// pubsub은 exec 없어도 되게하기
// exec 없으면 타입에러 뜨게하기
export type ApiBuilder<
  Srvs extends { [key: string]: any } = { [key: string]: any },
  _ThisSrvs extends { [key: string]: any } = {
    [K in keyof Srvs as K extends string ? Uncapitalize<K> : never]: UnType<Srvs[K]>;
  },
> = (builder: {
  query: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => ApiInfo<"query", _ThisSrvs, [], [], [], [], Returns, never, Nullable>;
  mutation: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => ApiInfo<"mutation", _ThisSrvs, [], [], [], [], Returns, never, Nullable>;
  pubsub: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => ApiInfo<"pubsub", _ThisSrvs, [], [], [], [], Returns, never, Nullable>;
  message: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(
    returnRef: Returns,
    signalOption?: SignalOption<Returns, Nullable>
  ) => ApiInfo<"message", _ThisSrvs, [], [], [], [], Returns, never, Nullable>;
}) => { [key: string]: ApiInfo<any, any, any, any, any, any, any, any, any> };
