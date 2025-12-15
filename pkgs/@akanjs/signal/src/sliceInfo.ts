import {
  arraiedModel,
  BaseInsight,
  BaseObject,
  EnumInstance,
  getNonArrayModel,
  Int,
  isEnum,
  MergedValues,
  PromiseOrObject,
  Type,
  UnType,
} from "@akanjs/base";
import { capitalize } from "@akanjs/common";
import {
  ConstantFieldTypeInput,
  DocumentModel,
  FieldToValue,
  ParamFieldType,
  PlainTypeToFieldType,
  PurifiedModel,
  QueryOf,
} from "@akanjs/constant";
import type { DatabaseModel } from "@akanjs/document";
import type { InternalParam } from "@akanjs/nest";
import type { DatabaseService } from "@akanjs/service";

import { ApiArgProps } from "./apiInfo";
import {
  ArgMeta,
  ArgType,
  getGqlMetaMapOnPrototype,
  GqlMeta,
  InternalArgMeta,
  setArgMetas,
  setGqlMetaMapOnPrototype,
  SignalOption,
} from "./signalDecorators";
import { signalInfo } from "./signalInfo";

export class SliceInfo<
  T extends string,
  Full extends BaseObject,
  Light extends BaseObject,
  Insight extends BaseInsight,
  Srvs extends { [key: string]: any } = { [key: string]: any },
  ArgNames extends string[] = [],
  Args extends any[] = [],
  InternalArgs extends any[] = [],
  ServerArgs extends any[] = [],
> {
  readonly refName: T;
  readonly full: Type<Full>;
  readonly light: Type<Light>;
  readonly insight: Type<Insight>;
  readonly argNames: ArgNames = [] as unknown as ArgNames;
  readonly args: { type: ArgType; name: string; argRef: ConstantFieldTypeInput; option?: ApiArgProps<boolean> }[] = [];
  readonly internalArgs: { type: InternalParam; option?: ApiArgProps<boolean> }[] = [];
  readonly signalOption: SignalOption;
  execFn: ((...args: [...ServerArgs, ...InternalArgs]) => QueryOf<DocumentModel<Full>>) | null = null;

  constructor(
    refName: T,
    full: Type<Full>,
    light: Type<Light>,
    insight: Type<Insight>,
    signalOption: SignalOption = {}
  ) {
    this.refName = refName;
    this.full = full;
    this.light = light;
    this.insight = insight;
    this.signalOption = signalOption;
  }
  param<
    ArgName extends string,
    Arg extends ParamFieldType,
    _ClientArg = FieldToValue<Arg>,
    _ServerArg = DocumentModel<_ClientArg>,
  >(name: ArgName, argRef: Arg, option?: Omit<ApiArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push({ type: "Param", name, argRef, option });
    return this as unknown as SliceInfo<
      T,
      Full,
      Light,
      Insight,
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
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: ArgName, argRef: Arg, option?: ApiArgProps) {
    if (this.execFn) throw new Error("Query function is already set");
    else if (this.args.at(-1)?.option?.nullable) throw new Error("Last argument is nullable");
    this.argNames.push(name);
    this.args.push({ type: "Body", name, argRef, option });
    return this as unknown as SliceInfo<
      T,
      Full,
      Light,
      Insight,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg]
    >;
  }
  search<
    ArgName extends string,
    ExplicitType = unknown,
    Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType,
    _ClientArg = PurifiedModel<_ArgType>,
    _ServerArg = DocumentModel<_ArgType>,
  >(name: ArgName, argRef: Arg, option?: Omit<ApiArgProps, "nullable">) {
    if (this.execFn) throw new Error("Query function is already set");
    this.argNames.push(name);
    this.args.push({ type: "Query", name, argRef, option: { ...option, nullable: true } });
    return this as unknown as SliceInfo<
      T,
      Full,
      Light,
      Insight,
      Srvs,
      [...ArgNames, ArgName],
      [...Args, arg: _ClientArg | null],
      InternalArgs,
      [...ServerArgs, arg: _ServerArg | undefined]
    >;
  }
  with<ArgType, Optional extends boolean = false>(argType: InternalParam<ArgType>, option?: ApiArgProps<Optional>) {
    if (this.execFn) throw new Error("Query function is already set");
    this.internalArgs.push({ type: argType, option });
    return this as unknown as SliceInfo<
      T,
      Full,
      Light,
      Insight,
      Srvs,
      ArgNames,
      Args,
      [...InternalArgs, arg: ArgType | (Optional extends true ? null : never)],
      ServerArgs
    >;
  }
  exec(
    query: (
      this: { [K in keyof Srvs as K extends string ? Uncapitalize<K> : never]: Srvs[K] },
      ...args: [...ServerArgs, ...InternalArgs]
    ) => PromiseOrObject<QueryOf<DocumentModel<Full>>>
  ) {
    if (this.execFn) throw new Error("Query function is already set");
    this.execFn = query;
    return this;
  }
  applySliceMeta(refName: string, sigRef: Type, key: string) {
    if (!this.execFn) throw new Error("Query function is not set");
    const execFn = this.execFn;
    const serviceName = `${refName}Service`;
    const argLength = this.args.length;
    const gqlMetaMap = getGqlMetaMapOnPrototype(sigRef.prototype as object);
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
    const skipLimitSortArgMetas: ArgMeta[] = [
      {
        name: "skip",
        returns: () => Int,
        argsOption: { nullable: true, example: 0 },
        key,
        idx: argLength,
        type: "Query",
      },
      {
        name: "limit",
        returns: () => Int,
        argsOption: { nullable: true, example: 20 },
        key,
        idx: argLength + 1,
        type: "Query",
      },
      {
        name: "sort",
        returns: () => String,
        argsOption: { nullable: true, example: "latest" },
        key,
        idx: argLength + 2,
        type: "Query",
      },
    ];
    const internalArgMetas: InternalArgMeta[] = this.internalArgs.map((arg, idx) => ({
      type: arg.type,
      key,
      idx,
      option: arg.option,
    }));

    // list
    const listKey = `${refName}List${capitalize(key)}`;
    const listFn = async function (
      this: Srvs & { __model: DatabaseModel<any, any, DocumentModel<Full>, any, any, any> },
      ...requestArgs: [...ServerArgs, skip: number, limit: number, sort: string, ...InternalArgs]
    ) {
      const args = requestArgs.slice(0, argLength);
      const skipLimitSort = requestArgs.slice(argLength, argLength + 3);
      const [skip = 0, limit = 20, sort = "latest"] = skipLimitSort as [number, number, string];
      const internalArgs = requestArgs.slice(argLength + 3);
      const query = (await execFn.apply(this, [...args, ...internalArgs])) as QueryOf<DocumentModel<Full>>;
      return (await (this[serviceName] as DatabaseService<any, any, any, any, any, any, any>).__list(query, {
        skip,
        limit,
        sort,
      })) as unknown as DocumentModel<Full>[];
    };
    signalInfo.setHandlerKey(listFn, listKey);
    (sigRef.prototype as object)[listKey] = listFn;
    const listApiMeta: GqlMeta = {
      returns: () => [this.full] as unknown as Type,
      signalOption: this.signalOption,
      key: listKey,
      descriptor: { value: listFn, writable: true, enumerable: false, configurable: true },
      type: "Query",
    };
    gqlMetaMap.set(listKey, listApiMeta);
    setArgMetas(
      sigRef,
      listKey,
      [...argMetas, ...skipLimitSortArgMetas],
      internalArgMetas.map((argMeta, idx) => ({ ...argMeta, idx: argLength + 3 + idx }))
    );

    // insight
    const insightKey = `${refName}Insight${capitalize(key)}`;
    const insightFn = async function (
      this: Srvs & { __model: DatabaseModel<any, any, DocumentModel<Full>, any, DocumentModel<Insight>, any> },
      ...requestArgs: [...ServerArgs, ...InternalArgs]
    ) {
      const args = requestArgs.slice(0, argLength);
      const internalArgs = requestArgs.slice(argLength);
      const query = (await execFn.apply(this, [...args, ...internalArgs])) as QueryOf<DocumentModel<Full>>;
      return (await (this[serviceName] as DatabaseService<any, any, any, any, any, any, any>).__insight(
        query
      )) as unknown as DocumentModel<Insight>;
    };
    signalInfo.setHandlerKey(insightFn, insightKey);
    (sigRef.prototype as object)[insightKey] = insightFn;
    const insightApiMeta: GqlMeta = {
      returns: () => this.insight,
      signalOption: this.signalOption,
      key: insightKey,
      descriptor: { value: insightFn, writable: true, enumerable: false, configurable: true },
      type: "Query",
    };
    gqlMetaMap.set(insightKey, insightApiMeta);
    setArgMetas(
      sigRef,
      insightKey,
      argMetas,
      internalArgMetas.map((argMeta, idx) => ({ ...argMeta, idx: argLength + idx }))
    );
    setGqlMetaMapOnPrototype(sigRef.prototype as object, gqlMetaMap);
  }
}

type SliceToSignal<
  T extends string,
  Full extends BaseObject,
  Insight extends BaseInsight,
  Args extends any[],
  Suffix extends string,
  _CapitalizedSuffix extends string = Capitalize<Suffix>,
> = {
  [K in `${T}List${_CapitalizedSuffix}`]: (
    ...args: [...Args, skip: number | null, limit: number | null, sort: string | null]
  ) => Promise<Full[]>;
} & {
  [K in `${T}Insight${_CapitalizedSuffix}`]: (...args: Args) => Promise<Insight>;
};

export type BuildSliceSignal<SliceInfoMap> = MergedValues<{
  [K in keyof SliceInfoMap]: SliceInfoMap[K] extends SliceInfo<
    infer T,
    infer Full,
    any,
    infer Insight,
    any,
    any,
    infer Args,
    any,
    any
  >
    ? SliceToSignal<T, Full, Insight, Args, K & string>
    : never;
}>;

export const sliceInit =
  <
    T extends string,
    Full extends BaseObject,
    Light extends BaseObject,
    Insight extends BaseInsight,
    Srvs extends { [key: string]: any },
  >(
    refName: T,
    full: Type<Full>,
    light: Type<Light>,
    insight: Type<Insight>
  ) =>
  (signalOption?: SignalOption) =>
    new SliceInfo<T, Full, Light, Insight, Srvs, [], [], [], []>(refName, full, light, insight, signalOption);

export type SliceApiBuilder<
  T extends string,
  Full extends BaseObject,
  Light extends BaseObject,
  Insight extends BaseInsight,
  Srvs extends { [key: string]: any } = { [key: string]: any },
  _ThisSrvs extends { [key: string]: any } = {
    [K in keyof Srvs as K extends string ? Uncapitalize<K> : never]: UnType<Srvs[K]>;
  },
> = (init: (signalOption?: SignalOption) => SliceInfo<T, Full, Light, Insight, _ThisSrvs>) => {
  [key: string]: SliceInfo<T, any, any, any, any, any, any, any, any>;
};
