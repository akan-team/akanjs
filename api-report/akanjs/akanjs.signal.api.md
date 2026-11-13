# `akanjs/signal`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class Agent extends Agent_base {
}

export type AgentBaseVerb = NonNullable<ReturnType<typeof mcpBaseVerbOf>>;

export interface AgentCandidate {
    refName: string;
    key: string;
    endpoint: SerializedEndpoint;
    origin: AgentOrigin;
    signal: SerializedSignal;
    slice?: SerializedSlice;
    baseVerb?: AgentBaseVerb;
}

export declare class AgentCatalogue {
    static candidates(serializedSignal: Record<string, SerializedSignal>, { excludeSignals }?: {
        excludeSignals?: string[];
    }): AgentCandidate[];
    readonly refusals: AgentRefusal[];
    constructor(options?: AgentCatalogueOptions);
    get undescribed(): AgentUndescribed[];
    claim(key: string): boolean;
    refuse(key: string, reason: string): void;
    texts(titleKey: string, descKey?: string): {
        description?: string | undefined;
        title?: string | undefined;
    };
    entryTexts(refName: string, key: string): {
        description?: string | undefined;
        title?: string | undefined;
    };
}

export interface AgentCatalogueOptions {
    resolveDescription?: (key: string) => string | undefined;
    excludeSignals?: string[];
}

export declare class AgentEndpoint extends AgentEndpoint_base {
}

export declare class AgentInternal extends AgentInternal_base {
}

export declare class AgentMeter {
    static usageTimeoutMs: number;
    static use({ usage, quota, serial, }: {
        usage?: AgentUsageHook | null;
        quota?: AgentQuotaHook | null;
        serial?: boolean;
    }): void;
    static turnOf(account: unknown, { headers, ip }?: {
        headers?: Headers;
        ip?: null | string;
    }): AgentTurnContext;
    static run<T extends null | {
        usage?: LlmUsage;
        model?: string;
    }>(account: unknown, turn: () => Promise<T>, scope?: AgentMeterScope): Promise<T>;
}

export interface AgentMeterScope {
    turn?: AgentTurnContext;
    request?: LlmTurnRequest;
    signal?: AbortSignal;
}

export type AgentOrigin = "base" | "endpoint" | "slice";

export interface AgentQuotaCheck {
    account: unknown;
    turn: AgentTurnContext;
    request?: LlmTurnRequest;
}

export type AgentQuotaHook = (check: AgentQuotaCheck) => PromiseOrObject<boolean>;

export interface AgentRefusal {
    key: string;
    reason: string;
}

export declare class AgentRelayAccess implements Guard {
    static name: string;
    static use(guards: GuardCls | GuardCls[] | null): void;
    static get hasPolicy(): boolean;
    static get scope(): GuardScope;
    canPass(context: SignalContext): Promise<boolean>;
}

export declare class AgentRelayPolicy {
    static readonly defaultLimits: Readonly<AgentRequestLimits>;
    static use(policy: AgentRequestPolicy | null): void;
    static apply(request: LlmTurnRequest, context: AgentRequestContext | AgentTurnContext): Promise<LlmTurnRequest>;
    static capped(request: LlmTurnRequest, limits?: Partial<AgentRequestLimits>): LlmTurnRequest;
}

/** @deprecated */
export interface AgentRequestContext {
    account: unknown;
    ip: null | string;
}

export interface AgentRequestLimits {
    messages: number;
    tools: number;
    context: number;
    chars: number;
    attachmentChars: number;
}

export type AgentRequestPolicy = (request: LlmTurnRequest, context: AgentTurnContext) => PromiseOrObject<LlmTurnRequest>;

export declare class AgentStop extends AgentStop_base {
}

export declare class AgentTurn extends AgentTurn_base {
    isToolUse(): boolean;
}

export interface AgentTurnContext {
    id: string;
    headers: Headers;
    account: unknown;
    ip: null | string;
    loop?: {
        id: string;
        round: number;
    };
    meta?: Record<string, string>;
}

export declare class AgentTurnDocument extends AgentTurnDocument_base {
}

export type AgentTurnOutcome = "aborted" | "failed" | "ok";

export declare class AgentTurnStream {
    static wants(request: Bun.BunRequest): boolean;
    static failure(error: unknown): {
        message: string;
        code: string;
        data?: Record<string, number | string>;
        overflow?: {
            limit?: number;
        };
    };
    static response(run: RunTurn): Response;
}

export interface AgentUndescribed {
    key: string;
    reason: string;
}

export type AgentUsageHook = (report: AgentUsageReport) => PromiseOrObject<void>;

export interface AgentUsageReport {
    account: unknown;
    turn: AgentTurnContext;
    model: null | string;
    usage: LlmUsage;
    estimated?: boolean;
    outcome: AgentTurnOutcome;
}

export interface ArgInfo<ArgProps = any> {
    type: ArgType;
    name: string;
    argRef: ConstantFieldType;
    arrDepth: number;
    enum?: EnumInstance;
    option?: ArgProps;
}

export type ArgType = (typeof argTypes)[number];

export declare class Base extends Base_base {
}

export declare class BaseEndpoint extends BaseEndpoint_base {
}

export declare class BaseInternal extends BaseInternal_base {
}

export type BuildEndpoint<SrvModule extends ServiceModel = ServiceModel> = {
    query: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>) => EndpointInfo<"query", SrvMap<SrvModule>, [
    ], [
    ], [
    ], [
    ], Returns, never, never, Nullable>;
    mutation: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>) => EndpointInfo<"mutation", SrvMap<SrvModule>, [
    ], [
    ], [
    ], [
    ], Returns, never, never, Nullable>;
    pubsub: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>) => EndpointInfo<"pubsub", SrvMap<SrvModule>, [
    ], [
    ], [
    ], [
    ], Returns, never, never, Nullable>;
    message: <Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>) => EndpointInfo<"message", SrvMap<SrvModule>, [
    ], [
    ], [
    ], [
    ], Returns, never, never, Nullable>;
};

export type BuildInternal<SrvModule extends ServiceModel, ParentDoc = DbDoc<SrvModule>> = {
    resolveField: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: Pick<SignalOption<Returns, Nullable>, "nullable">) => InternalInfo<"resolveField", SrvMap<SrvModule>, [
    ], [
    ], [
        ParentDoc
    ], Returns, never, Nullable>;
    interval: <Nullable extends boolean = false>(scheduleTime: number, signalOption?: SignalOption<typeof Any, Nullable>) => InternalInfo<"interval", SrvMap<SrvModule>, [
    ], [
    ], [
    ], typeof Any, never, Nullable>;
    cron: <Nullable extends boolean = false>(scheduleCron: string, signalOption?: SignalOption<typeof Any, Nullable>) => InternalInfo<"cron", SrvMap<SrvModule>, [
    ], [
    ], [
    ], typeof Any, never, Nullable>;
    timeout: <Nullable extends boolean = false>(timeout: number, signalOption?: SignalOption<typeof Any, Nullable>) => InternalInfo<"timeout", SrvMap<SrvModule>, [
    ], [
    ], [
    ], typeof Any, never, Nullable>;
    initialize: <Nullable extends boolean = false>(signalOption?: SignalOption<typeof Any, Nullable>) => InternalInfo<"init", SrvMap<SrvModule>, [
    ], [
    ], [
    ], typeof Any, never, Nullable>;
    destroy: <Nullable extends boolean = false>(signalOption?: SignalOption<typeof Any, Nullable>) => InternalInfo<"destroy", SrvMap<SrvModule>, [
    ], [
    ], [
    ], typeof Any, never, Nullable>;
    process: <Returns extends ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>) => InternalInfo<"process", SrvMap<SrvModule>, [
    ], [
    ], [
        AkanJob
    ], Returns, never, Nullable>;
};

export declare class CallerAccount implements InternalArg<unknown> {
    getArg(context: SignalContext): unknown;
}

export type CanonicalLineMode = "all" | "off" | "slow";

export type CnstCapitalizedRefName<S extends ServiceModel> = CnstOf<S>["_CapitalizedRefName"];

export type CnstDefault<S extends ServiceModel> = CnstOf<S>["_Default"];

export type CnstDefaultInput<S extends ServiceModel> = CnstOf<S>["_DefaultInput"];

export type CnstDefaultState<S extends ServiceModel> = CnstOf<S>["_DefaultState"];

export type CnstFull<S extends ServiceModel> = CnstOf<S>["_Full"];

export type CnstInput<S extends ServiceModel> = CnstOf<S>["_Input"];

export type CnstInsight<S extends ServiceModel> = CnstOf<S>["_Insight"];

export type CnstLight<S extends ServiceModel> = CnstOf<S>["_Light"];

export type CnstOf<S extends ServiceModel> = NonNullable<S["cnst"]>;

export type CnstPurifiedInput<S extends ServiceModel> = CnstOf<S>["_PurifiedInput"];

export type CnstRefName<S extends ServiceModel> = CnstOf<S>["refName"];

export type CnstStateInsight<S extends ServiceModel> = CnstOf<S>["_StateInsight"];

export type CnstStateLight<S extends ServiceModel> = CnstOf<S>["_StateLight"];

export declare class CrossSiteGuard {
    static readonly logger: Logger;
    static readonly nativeOrigins: readonly [
        "app://localhost",
        "https://app.localhost"
    ];
    static configure({ allowedOrigins, enabled }: CrossSiteOption): void;
    static option(): Required<CrossSiteOption>;
    static reset(): void;
    static assertJsonBody(contentType: null | string): void;
    static assertOrigin(req: Request, url: URL, key: string): void;
    static corsOrigin(req: Request): null | string;
    static preflight(req: Request, methods: string[]): Response;
    static withCors(req: Request, res: Response): Response;
}

export interface CrossSiteOption {
    allowedOrigins?: string[];
    enabled?: boolean;
}

export declare class DatabaseSignal<IntlCls extends InternalCls = InternalCls, EndpCls extends EndpointCls = EndpointCls, SlceCls extends SliceCls = SliceCls, SrvrCls extends ServerSignalCls = ServerSignalCls> {
    internal: IntlCls;
    endpoint: EndpCls;
    slice: SlceCls;
    server: SrvrCls;
    serializedSignal: SerializedSignal;
    constructor(internal: IntlCls, endpoint: EndpCls, slice: SlceCls, server: SrvrCls, origin?: string);
}

export type DbDoc<S extends ServiceModel> = DbOf<S>["_Doc"];

export type DbFilter<S extends ServiceModel> = DbOf<S>["_Filter"];

export type DbOf<S extends ServiceModel> = NonNullable<S["db"]>;

export type DbQuery<S extends ServiceModel> = DbOf<S>["_Query"];

export type DbSort<S extends ServiceModel> = DbOf<S>["_Sort"];

export type EndpInfoArgNames<E> = EndpointInfoParts<E>["argNames"];

export type EndpInfoArgs<E> = EndpointInfoParts<E>["args"];

export type EndpInfoClientReturns<E> = EndpointInfoParts<E>["clientReturns"];

export type EndpInfoInternalArgs<E> = EndpointInfoParts<E>["internalArgs"];

export type EndpInfoNullable<E> = EndpointInfoParts<E>["nullable"];

export type EndpInfoReqType<E> = EndpointInfoParts<E>["reqType"];

export type EndpInfoReturnRef<E> = EndpointInfoParts<E>["returnRef"];

export type EndpInfoServerArgs<E> = EndpointInfoParts<E>["serverArgs"];

export type EndpInfoServerReturns<E> = EndpointInfoParts<E>["serverReturns"];

export type EndpInfoSrvs<E> = EndpointInfoParts<E>["srvs"];

export interface Endpoint<DictShape extends EndpointDictArgShape = Record<never, never>> extends Adaptor {
    readonly [ENDPOINT_DICT_SHAPE]: DictShape;
}

export interface EndpointArgProps<Optional extends boolean = false> {
    nullable?: Optional;
    example?: Dayjs | boolean | number | string;
}

export type EndpointBuilder<SrvModule extends ServiceModel = ServiceModel> = (builder: BuildEndpoint<SrvModule>) => {
    [key: string]: EndpointInfo;
};

export type EndpointCls<SrvModule extends ServiceModel = ServiceModel, EndpointInfoObj extends {
    [key: string]: EndpointInfo;
} = {
    [key: string]: EndpointInfo;
}> = AdaptorCls<Endpoint<EndpointDictShape<EndpointInfoObj>>> & {
    baseName: SrvRefName<SrvModule>;
    srv: SrvModule;
    prototype: Endpoint<EndpointDictShape<EndpointInfoObj>>;
    [ENDPOINT_META]: EndpointInfoObj;
};

export type EndpointDictArgShape = {
    [key: string]: readonly string[];
};

export type EndpointDictShape<EndpointInfoObj extends {
    [key: string]: EndpointInfo;
}> = {
    [K in keyof EndpointInfoObj]: EndpInfoArgNames<EndpointInfoObj[K]>;
};

export declare class EndpointErrorContract {
    static assertDeclared(errors: EndpointErrors | undefined): void;
    static keysOf(errors: EndpointErrors | undefined): string[];
    static checkThrown(endpoint: Adaptor, endpointInfo: EndpointInfo, key: string, thrownKey: string): void;
    static promised(endpointInfo: EndpointInfo, error: ExceptionLike): boolean;
    static wireKey(error: ExceptionLike): string;
}

export type EndpointErrorKey = `${string}.error.${string}`;

export interface EndpointErrors {
    readonly [status: number]: readonly EndpointErrorKey[];
}

export declare class EndpointInfo<ReqType extends EndpointType = EndpointType, Srvs extends {
    [key: string]: any;
} = {
    [key: string]: any;
}, ArgNames extends string[] = any, Args extends any[] = any, InternalArgs extends any[] = any, ServerArgs extends any[] = any, Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, ClientReturns = never, ServerReturns = never, Nullable extends boolean = boolean> {
    readonly type: ReqType;
    readonly argNames: ArgNames;
    readonly args: ArgInfo<EndpointArgProps<boolean>>[];
    readonly internalArgs: InternalArgInfo<boolean>[];
    readonly returns: ReturnInfo<Returns, Nullable>;
    readonly signalOption: SignalOption<Returns, Nullable, any>;
    execFn: ((...args: [
        ...ServerArgs,
        ...InternalArgs
    ]) => PromiseOrObject<any>) | null;
    static getArgInfo(type: ArgType, name: string, arg: ConstantFieldTypeInput, option?: EndpointArgProps<boolean>): ArgInfo;
    static getReturnInfo<Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(modelRef: Returns, signalOption?: SignalOption<Returns, Nullable>): ReturnInfo<Returns, Nullable>;
    constructor(type: ReqType, returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>);
    param<ArgName extends string, Arg extends ParamFieldType, _ClientArg = FieldToValue<Arg>, _ServerArg = ServerArgModel<_ClientArg>>(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">): EndpointInfo<ReqType, Srvs, [
        ...ArgNames,
        ArgName
    ], [
        ...Args,
        arg: _ClientArg
    ], InternalArgs, [
        ...ServerArgs,
        arg: _ServerArg
    ], Returns, ClientReturns, ServerReturns, Nullable>;
    body<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, Optional extends boolean = false, _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType, _ClientArg = UploadableClientArg<PurifiedModel<_ArgType>>, _ServerArg = ServerArgModel<_ArgType>>(name: ArgName, arg: Arg, option?: EndpointArgProps<Optional>): EndpointInfo<ReqType, Srvs, [
        ...ArgNames,
        ArgName
    ], Optional extends true ? [
        ...Args,
        arg?: _ClientArg | null
    ] : [
        ...Args,
        arg: _ClientArg
    ], InternalArgs, [
        ...ServerArgs,
        arg: (Optional extends true ? undefined : never) | _ServerArg
    ], Returns, ClientReturns, ServerReturns, Nullable>;
    room<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType, _ClientArg = PurifiedModel<_ArgType>, _ServerArg = DocumentModel<_ArgType>>(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">): EndpointInfo<ReqType, Srvs, [
        ...ArgNames,
        ArgName
    ], [
        ...Args,
        arg: _ClientArg
    ], InternalArgs, [
        ...ServerArgs,
        arg: _ServerArg
    ], Returns, ClientReturns, ServerReturns, Nullable>;
    msg<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, Optional extends boolean = false, _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType, _ClientArg = PurifiedModel<_ArgType>, _ServerArg = ServerArgModel<_ArgType>>(name: string, arg: Arg, option?: EndpointArgProps<Optional>): EndpointInfo<ReqType, Srvs, [
        ...ArgNames,
        ArgName
    ], Optional extends true ? [
        ...Args,
        arg?: _ClientArg | null
    ] : [
        ...Args,
        arg: _ClientArg
    ], InternalArgs, [
        ...ServerArgs,
        arg: (Optional extends true ? undefined : never) | _ServerArg
    ], Returns, ClientReturns, ServerReturns, Nullable>;
    search<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType, _ClientArg = PurifiedModel<_ArgType>, _ServerArg = ServerArgModel<_ArgType>>(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">): EndpointInfo<ReqType, Srvs, [
        ...ArgNames,
        ArgName
    ], [
        ...Args,
        arg?: _ClientArg | null
    ], InternalArgs, [
        ...ServerArgs,
        arg: _ServerArg | undefined
    ], Returns, ClientReturns, ServerReturns, Nullable>;
    _addArgs(args: ArgInfo<EndpointArgProps<boolean>>[]): this;
    with<ArgType, Optional extends boolean = false>(argRef: InternalArgCls<ArgType>, option?: InternalArgProps<Optional>): EndpointInfo<ReqType, Srvs, ArgNames, Args, [
        ...InternalArgs,
        arg: (Optional extends true ? null : never) | NonNullable<ArgType>
    ], ServerArgs, Returns, ClientReturns, ServerReturns, Nullable>;
    _addRoomArgs(args: ArgInfo<EndpointArgProps<boolean>>[]): this;
    _addInternalArgs(args: InternalArgInfo<boolean>[]): this;
    exec<ExecFn extends (this: Srvs, ...args: [
        ...ServerArgs,
        ...InternalArgs
    ]) => ReqType extends "pubsub" ? Promise<void> | void : PromiseOrObject<(Nullable extends true ? null | undefined : never) | DocumentModel<FieldToValue<Returns>>>>(execFn: ExecFn): EndpointInfo<ReqType, Srvs, ArgNames, Args, InternalArgs, ServerArgs, Returns, FieldToValue<Returns>, ReturnType<ExecFn>, Nullable>;
    getPath(key: string): string;
    getRoutePath(key: string, defaultPrefix?: string): string;
    static resolveServicePrefix(prefix: false | string | undefined, defaultPrefix?: string): string;
}

export type EndpointInfoParts<E> = E extends EndpointInfo<infer ReqType, infer Srvs, infer ArgNames, infer Args, infer InternalArgs, infer ServerArgs, infer Returns, infer ClientReturns, infer ServerReturns, infer Nullable> ? {
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
} : EndpointInfoEmptyParts;

export declare class EndpointRateLimit {
    static configure(setting: RateLimitSetting | false): void;
    static applyEnv(value: string | undefined, environment: string): void;
    static reset(): void;
    static budgetOf(key: string, endpointInfo: EndpointInfo): ResolvedBudget | null;
    static admit(context: SignalContext, phase: "account" | "ip"): Promise<void> | undefined;
}

export type EndpointType = "message" | "mutation" | "pubsub" | "query";

export declare class Exception extends AkanError {
    readonly details?: undefined | unknown;
    constructor(statusCode: number, message: string, details?: undefined | unknown, data?: unknown);
    get forwarded(): boolean;
    toJSON(): {
        data?: null | undefined | {};
        details?: null | undefined | {};
        error: string;
        statusCode: number;
    };
    static BadRequest: StatusException;
    static Unauthorized: StatusException;
    static Forbidden: StatusException;
    static NotFound: StatusException;
    static Conflict: StatusException;
    static UnsupportedMediaType: StatusException;
    static Error: StatusException;
}

export interface ExceptionLike {
    statusCode: number;
    toJSON: () => object;
}

export declare class FetchSerializer {
    static logger: Logger;
    static serializeDatabaseSignal(sliceCls: SliceCls, endpointCls: EndpointCls): SerializedSignal;
    static serializeServiceSignal(endpointCls: EndpointCls): SerializedSignal;
    static serializeRegistry(live: LiveRegistry | null | undefined): {
        signal: {
            [key: string]: SerializedSignal;
        };
    };
}

export interface Guard {
    canPass(context: SignalContext): PromiseOrObject<boolean>;
}

export type GuardCls<Name extends string = string> = Cls<Guard, {
    readonly name: Name;
    readonly scope: GuardScope;
    readonly agents?: boolean;
}>;

export type GuardScope = "account" | "resource";

export declare class HttpExecutionContext<Appended = unknown> {
    req: Bun.BunRequest & Appended;
    res: {
        new (body?: BodyInit | null, init?: ResponseInit): Response;
        prototype: Response;
        error(): Response;
        json(data: any, init?: ResponseInit): Response;
        redirect(url: URL | string, status?: number): Response;
    };
    params: RuntimeRecord;
    searchParams: RuntimeRecord;
    body: RuntimeRecord;
    constructor(req: Bun.BunRequest);
    get url(): URL;
    getArgs(endpointInfo: EndpointInfo): Promise<unknown[]>;
    defersBody(endpointInfo: EndpointInfo): boolean;
    readArgs(endpointInfo: EndpointInfo, { body }?: {
        body?: boolean;
    }): Promise<unknown[]>;
    parseArg(arg: ArgInfo, raw: unknown): unknown;
    makeResponse(result: unknown, endpointInfo: EndpointInfo): Response;
    static wireOf(result: unknown, endpointInfo: EndpointInfo): unknown;
}

export type HttpMutationMethod = "DELETE" | "PATCH" | "POST" | "PUT";

export type HttpPeerResolver = (req: Request) => null | undefined | {
    address: string;
    port: number;
};

export type InterceptorCls<Methods = Record<never, never>, InjectMap extends {
    [key: string]: InjectInfo;
} = Record<never, never>> = Cls<Methods & ExtractInjectInfoObject<InjectMap> & {
    readonly logger: Logger;
    onInit(): Promise<void> | void;
    onDestroy(): Promise<void> | void;
    intercept(context: SignalContext): AsyncGenerator<unknown> | Promise<unknown>;
}, {
    readonly [INJECT_META]: InjectMap;
    readonly refName: string;
}>;

export interface Internal extends Adaptor {
    schedule: ScheduleAdaptor;
    queue: QueueAdaptor;
}

export interface InternalArg<ArgType = unknown> {
    getArg: (context: SignalContext) => PromiseOrObject<ArgType | null>;
}

export type InternalArgCls<ArgType = unknown> = Cls<InternalArg<ArgType>>;

export interface InternalArgInfo<Optional extends boolean = false> {
    argRef: InternalArgCls;
    option?: InternalArgProps<Optional>;
}

export interface InternalArgProps<Optional extends boolean = false> {
    nullable?: Optional;
}

export type InternalBuilder<SrvModule extends ServiceModel, _Cnst = CnstOf<SrvModule>, _FullCls extends ConstantCls = [
    _Cnst
] extends [
    never
] ? never : _Cnst extends {
    full: infer Full extends ConstantCls;
} ? Full : never, _FieldObj extends FieldObject = _FullCls[typeof FIELD_META], _ResolveFieldObj extends FieldObject = {
    [K in keyof _FieldObj as _FieldObj[K] extends ConstantField<"resolve", any, any, any, any, any> ? K : never]: _FieldObj[K];
}> = (builder: BuildInternal<SrvModule>) => [
    _Cnst
] extends [
    never
] ? {
    [key: string]: InternalInfo<InternalType>;
} : [
    _FullCls
] extends [
    never
] ? {
    [key: string]: InternalInfo<InternalType>;
} : {
    [K in keyof _ResolveFieldObj]: _ResolveFieldObj[K] extends ConstantField<"resolve", infer Value, any, any, infer Nullable> ? InternalInfo<"resolveField", any, any, any, any, NonNullable<Value>, Nullable> : InternalInfo<Exclude<InternalType, "resolveField">>;
} & {
    [key: string]: InternalInfo<InternalType>;
};

export type InternalCls<SrvModule extends ServiceModel = ServiceModel, InternalInfoMap extends {
    [key: string]: InternalInfo;
} = {
    [key: string]: InternalInfo;
}> = AdaptorCls & {
    refName: `${SrvRefName<SrvModule>}Internal`;
    srv: SrvModule;
    [INTERNAL_META]: InternalInfoMap;
};

export declare class InternalInfo<ReqType extends InternalType = InternalType, Srvs extends {
    [key: string]: any;
} = {
    [key: string]: any;
}, Args extends any[] = any, InternalArgs extends any[] = any, DefaultArgs extends any[] = any, Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, ServerReturns = any, Nullable extends boolean = boolean> {
    readonly type: ReqType;
    readonly args: ArgInfo<InternalArgProps<boolean>>[];
    readonly internalArgs: InternalArgInfo<boolean>[];
    readonly defaultArgs: string[];
    readonly returns: ReturnInfo<Returns, Nullable>;
    readonly signalOption: SignalOption<Returns, Nullable>;
    execFn: ((...args: [
        ...Args,
        ...DefaultArgs,
        ...InternalArgs
    ]) => ServerReturns) | null;
    constructor(type: ReqType, returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>);
    msg<ExplicitType, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, Nullable extends boolean = false, _FieldToValue = FieldToValue<Arg>>(name: string, arg: Arg, option?: InternalArgProps<Nullable>): InternalInfo<ReqType, Srvs, [
        ...Args,
        arg: (Nullable extends true ? undefined : never) | _FieldToValue
    ], InternalArgs, DefaultArgs, Returns, ServerReturns, Nullable>;
    with<ArgType, Optional extends boolean = false>(argRef: InternalArgCls<ArgType>, option?: InternalArgProps<Optional>): InternalInfo<ReqType, Srvs, Args, [
        ...InternalArgs,
        arg: (Optional extends true ? null : ReqType extends "resolveField" ? null : never) | NonNullable<ArgType>
    ], DefaultArgs, Returns, ServerReturns, Nullable>;
    exec<ExecReturn extends ReqType extends "process" | "resolveField" ? PromiseOrObject<(Nullable extends true ? null : never) | DocumentModel<FieldToValue<Returns>>> : PromiseOrObject<void>>(execFn: (this: Srvs, ...args: [
        ...Args,
        ...DefaultArgs,
        ...InternalArgs
    ]) => ExecReturn): InternalInfo<ReqType, Srvs, Args, InternalArgs, DefaultArgs, Returns, ExecReturn, Nullable>;
}

export type InternalInfoDefaultArgs<I> = InternalInfoParts<I>["defaultArgs"];

export type InternalInfoInternalArgs<I> = InternalInfoParts<I>["internalArgs"];

export type InternalInfoNullable<I> = InternalInfoParts<I>["nullable"];

export type InternalInfoParts<I> = I extends InternalInfo<infer ReqType, infer Srvs, infer Args, infer InternalArgs, infer DefaultArgs, infer Returns, infer ServerReturns, infer Nullable> ? {
    reqType: ReqType;
    srvs: Srvs;
    args: Args;
    internalArgs: InternalArgs;
    defaultArgs: DefaultArgs;
    returns: Returns;
    serverReturns: ServerReturns;
    nullable: Nullable;
} : InternalInfoEmptyParts;

export type InternalInfoReqType<I> = InternalInfoParts<I>["reqType"];

export type InternalInfoReturns<I> = InternalInfoParts<I>["returns"];

export type InternalInfoServerArgs<I> = InternalInfoParts<I>["args"];

export type InternalInfoServerReturns<I> = InternalInfoParts<I>["serverReturns"];

export type InternalInfoSrvs<I> = InternalInfoParts<I>["srvs"];

export declare class Ip implements InternalArg<null | string> {
    getArg(context: SignalContext): null | string;
}

export type JsonSchema = Record<string, unknown>;

export declare class JsonSchemaBuilder {
    constructor({ refPrefix, nullable, face, }?: JsonSchemaBuilderOptions);
    arg(arg: SerializedArg): JsonSchema;
    upload(arg: SerializedArg): JsonSchema;
    returns(returns: SerializedReturns): JsonSchema;
    model(modelRef: ConstantCls, options?: JsonSchemaModelOptions): JsonSchema;
    allModelSchemas(options?: JsonSchemaModelOptions): Record<string, JsonSchema>;
    referencedSchemas(seed: unknown, allSchemas?: Record<string, JsonSchema>): {
        [k: string]: JsonSchema;
    };
    collectRefNames(value: unknown): Set<string>;
    static primitive(refName: string, { idPattern, face }?: Pick<JsonSchemaModelOptions, "idPattern"> & {
        face?: JsonSchemaFace;
    }): JsonSchema;
}

export interface JsonSchemaBuilderOptions {
    refPrefix?: string;
    nullable?: "anyOf" | "type";
    face?: JsonSchemaFace;
}

export type JsonSchemaFace = "agent" | "wire";

export interface JsonSchemaModelOptions {
    readable?: boolean;
    relations?: JsonSchemaRelations;
    idPattern?: boolean;
}

export type JsonSchemaRelations = "id" | "inline" | "named";

export interface LiveEndpointOption {
    refName: string;
    sliceKey: string;
    sort: string[];
    fallback: "invalidate" | null;
    payload: "id" | "light";
    pauseOn: string[];
}

export interface LiveEventPayload {
    op: "enter" | "invalidate" | "leave" | "update";
    id: string;
    light?: null | object;
}

export interface LiveSliceOption<ArgName extends string = string> {
    sort?: string[];
    fallback?: "invalidate";
    payload?: "id" | "light";
    pauseOn?: ArgName[];
}

export declare class Logging extends Logging_base {
    use(): Promise<(context: SignalContext, next: () => Promise<unknown>) => Promise<unknown>>;
}

export declare const MCP_APP_META: {
    readonly snapshot: "akanjs/snapshot";
    readonly account: "akanjs/account";
    readonly readOnly: "akanjs/readOnly";
    readonly view: "akanjs/view";
    readonly value: "akanjs/value";
    readonly error: "akanjs/error";
};

export declare const MCP_LEGACY_PRIOR_VERSION = "2025-06-18";

export declare const MCP_LEGACY_VERSION = "2025-11-25";

export declare const MCP_META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";

export declare const MCP_META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";

export declare const MCP_META_PREFIX = "io.modelcontextprotocol/";

export declare const MCP_META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";

export declare const MCP_META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

export declare const MCP_MODERN_VERSION = "2026-07-28";

export declare const MCP_SCREEN_REFUSAL: {
    readonly gated: "This screen is not available to the signed-in account.";
    readonly notFound: "No screen exists for these arguments.";
    readonly failed: "The page failed to load.";
};

export declare const MCP_SUPPORTED_VERSIONS: readonly [
    "2026-07-28",
    "2025-11-25",
    "2025-06-18"
];

export declare const MCP_UI_EXTENSION = "io.modelcontextprotocol/ui";

export declare const MCP_UI_LEGACY_RESOURCE_URI = "ui/resourceUri";

export declare const MCP_UI_MIME_TYPE = "text/html;profile=mcp-app";

export declare class Machine implements InternalArg<MachineIdentity | null> {
    getArg(context: SignalContext): MachineIdentity | null;
}

export interface MachineIdentity {
    kind: string;
    id: string;
    version: number;
}

export interface McpAppSnapshotRecord {
    key: string;
    args: Record<string, unknown>;
    value: unknown;
}

export declare class McpDocument {
    static readonly listKey = "items";
    readonly tools: McpTool[];
    readonly appTools: McpTool[];
    readonly appOnly: McpRefusal[];
    readonly resourceTemplates: McpResourceTemplate[];
    readonly resources: McpResource[];
    readonly refusals: McpRefusal[];
    readonly undescribed: McpUndescribed[];
    readonly unmatchedExclusions: {
        signals: string[];
        endpoints: string[];
    };
    constructor(serializedSignal: Record<string, SerializedSignal>, options?: McpDocumentOptions);
    get listingCost(): McpListingCost;
    findTool(name: string): McpExposedEndpoint | undefined;
    resourceUri(key: string, args: Record<string, unknown>): string | undefined;
    resolveResource(uri: string): null | {
        exposed: McpExposedEndpoint;
        args: Record<string, string | string[]>;
    };
    static structuredContent(endpoint: SerializedEndpoint, value: unknown): undefined | {};
    isAppOnly(name: string): boolean;
}

export interface McpDocumentOptions {
    resolveDescription?: (key: string) => string | undefined;
    excludeSignals?: string[];
    excludeEndpoints?: string[];
    readOnly?: boolean;
    outputSchema?: McpOutputSchemaMode;
    apps?: boolean;
    agent?: boolean;
}

export type McpEra = "legacy" | "modern";

export declare const McpErrorCode: {
    readonly parse: -32700;
    readonly invalidRequest: -32600;
    readonly methodNotFound: -32601;
    readonly invalidParams: -32602;
    readonly internal: -32603;
    readonly rateLimited: -32010;
    readonly headerMismatch: -32020;
    readonly unsupportedProtocolVersion: -32022;
};

export type McpErrorCodeValue = (typeof McpErrorCode)[keyof typeof McpErrorCode];

export interface McpExposedEndpoint {
    refName: string;
    key: string;
    endpoint: SerializedEndpoint;
}

export interface McpImageContent {
    type: "image";
    data: string;
    mimeType: string;
}

export type McpJsonRpcMessage = McpJsonRpcRequest & Partial<McpJsonRpcResponse>;

export interface McpJsonRpcRequest {
    jsonrpc: "2.0";
    id?: null | number | string;
    method?: string;
    params?: Record<string, unknown>;
}

export interface McpJsonRpcResponse {
    jsonrpc: "2.0";
    id: null | number | string;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

export interface McpListingCost {
    bytes: number;
    bySignal: McpSignalCost[];
}

export type McpOutputSchemaMode = "full" | "none" | "shallow";

export declare class McpProgress {
    static report(progress: number, option?: McpProgressOption): void;
    static get streaming(): boolean;
    static run<T>(channel: McpProgress, exec: () => Promise<T>): Promise<T>;
    readonly started: Promise<void>;
    constructor();
    get signal(): AbortSignal;
    reports(): AsyncGenerator<McpProgressReport>;
    end(): void;
    abort(): void;
}

export interface McpProgressOption {
    total?: number;
    message?: string;
}

export interface McpProgressReport extends McpProgressOption {
    progress: number;
}

export interface McpPrompt {
    name: string;
    title?: string;
    description?: string;
    arguments?: McpPromptArgument[];
}

export interface McpPromptArgument {
    name: string;
    description?: string;
    required?: boolean;
}

export type McpProtocolVersion = (typeof MCP_SUPPORTED_VERSIONS)[number];

export type McpRefusal = AgentRefusal;

export interface McpResource {
    uri: string;
    name: string;
    title?: string;
    description?: string;
    mimeType?: string;
    _meta?: Record<string, unknown>;
}

export interface McpResourceContents {
    uri: string;
    mimeType: string;
    text: string;
    _meta?: Record<string, unknown>;
}

export interface McpResourceTarget {
    endpointKey: string;
    args: Record<string, string | string[]>;
}

export interface McpResourceTemplate {
    uriTemplate: string;
    name: string;
    title?: string;
    description?: string;
    mimeType?: string;
}

export interface McpSignalCost {
    refName: string;
    entries: number;
    bytes: number;
}

export interface McpTextContent {
    type: "text";
    text: string;
}

export interface McpTool {
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: McpToolAnnotations;
    _meta?: {
        ui?: McpToolUiMeta;
        [MCP_UI_LEGACY_RESOURCE_URI]?: string;
    };
}

export interface McpToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}

export interface McpToolResult {
    content: (McpImageContent | McpTextContent)[];
    structuredContent?: unknown;
    isError?: boolean;
    _meta?: Record<string, unknown>;
}

export interface McpToolUiMeta {
    resourceUri?: string;
    visibility?: McpUiVisibility[];
}

export type McpUiVisibility = "app" | "model";

export type McpUndescribed = AgentUndescribed;

export declare class McpUriTemplate {
    static readonly scheme = "akan";
    static model(refName: string): string;
    static list(refName: string, sliceKey: string, argNames: string[]): string;
    static expand(template: string, args: Record<string, unknown>): string;
    static parse(uri: string): McpResourceTarget | null;
}

export interface Middleware<Env extends BackendEnv = BackendEnv> {
    use(env: Env): PromiseOrObject<(context: SignalContext, next: () => Promise<unknown>) => PromiseOrObject<unknown>>;
}

export type MiddlewareCls = Cls<Middleware, {
    readonly refName: string;
}>;

export declare class Msg {
    static readonly schema: JsonSchema;
    static user(text: string, annotations?: PromptAnnotations): PromptMessage;
    static assistant(text: string, annotations?: PromptAnnotations): PromptMessage;
    static resource(uri: string, value: unknown, { model, ...annotations }?: {
        model?: PromptModel;
    } & PromptAnnotations): PromptMessage;
    static mask(model: PromptModel, value: unknown): unknown;
    static link(source: PromptFileSource | string, { name, description, ...annotations }?: {
        name?: string;
        description?: string;
    } & PromptAnnotations): PromptMessage;
    static image(data: string, mimeType: string, annotations?: PromptAnnotations): PromptMessage;
    static audio(data: string, mimeType: string, annotations?: PromptAnnotations): PromptMessage;
    static imageOf(file: PromptFileSource, annotations?: PromptAnnotations): Promise<PromptMessage>;
    static normalize(value: unknown): PromptMessage[];
}

export declare class None implements Guard {
    static name: string;
    static scope: GuardScope;
    canPass(context: SignalContext): boolean;
}

export interface OpenApiDocument {
    openapi: "3.1.0";
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: {
        url: string;
        description?: string;
    }[];
    paths: Record<string, OpenApiPathItem>;
    components: {
        schemas: Record<string, JsonSchema>;
        securitySchemes?: Record<string, JsonSchema>;
    };
}

export interface OpenApiDocumentOptions {
    title?: string;
    version?: string;
    servers?: {
        url: string;
        description?: string;
    }[];
    description?: string;
    resolveDescription?: (key: string) => string | undefined;
    excludeSignals?: string[];
    includeNonStandardPaths?: boolean;
}

export interface PagePromptEntry {
    kind: "app" | "prompt";
    name: string;
    description: string;
    arguments: McpPromptArgument[];
    pattern: string;
}

export interface PagePromptRecord {
    key: string;
    args: Record<string, unknown>;
    returns: {
        refName: string;
        modelType?: string;
        arrDepth?: number;
        nullable?: boolean;
    };
    value?: unknown;
    error?: string;
}

export type PagePromptRefusal = "argument" | "error" | "forbidden" | "not-found" | "redirect" | "unknown";

export interface PagePromptRoute {
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
}

export type PagePromptRun = {
    ok: false;
    reason: PagePromptRefusal;
    message: string;
} | {
    ok: true;
    url: string;
    records: PagePromptRecord[];
    route: PagePromptRoute;
};

export interface PagePromptRunInput {
    name: string;
    arguments: Record<string, string>;
    headers: [
        string,
        string
    ][];
    language?: string;
}

export interface PagePromptSource {
    list(): Promise<PagePromptEntry[]>;
    visible(input: PagePromptVisibleInput): Promise<string[]>;
    run(input: PagePromptRunInput): Promise<PagePromptRun>;
}

export interface PagePromptVisibleInput {
    names: string[];
    headers: [
        string,
        string
    ][];
    language?: string;
}

export interface PromptAnnotations {
    audience?: PromptRole[];
    priority?: number;
    lastModified?: string;
}

export interface PromptBinaryContent {
    type: "audio" | "image";
    data: string;
    mimeType: string;
    annotations?: PromptAnnotations;
}

export type PromptContent = PromptBinaryContent | PromptEmbeddedResourceContent | PromptResourceLinkContent | PromptTextContent;

export interface PromptEmbeddedResourceContent {
    type: "resource";
    resource: {
        uri: string;
        mimeType: string;
        text: string;
    };
    annotations?: PromptAnnotations;
}

export declare class PromptError extends AkanError<PromptErrorCode> {
    constructor(code: PromptErrorCode, message: string);
}

export type PromptErrorCode = "inlineFailed" | "invalidPrompt" | "unmaskedResource";

export interface PromptFileSource {
    url: string;
    filename?: string;
    mimetype?: string;
}

export interface PromptMessage {
    role: PromptRole;
    content: PromptContent;
}

export type PromptModel = MaskModel;

export interface PromptResourceLinkContent {
    type: "resource_link";
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    annotations?: PromptAnnotations;
}

export type PromptResult = PromptMessage[] | string;

export type PromptRole = "assistant" | "user";

export interface PromptTextContent {
    type: "text";
    text: string;
    annotations?: PromptAnnotations;
}

export declare class Public implements Guard {
    static name: string;
    static scope: GuardScope;
    canPass(context: SignalContext): boolean;
}

export interface RateLimitBudget {
    calls: number;
    windowMs?: number;
    by?: "account" | "ip";
}

export interface RateLimitSetting {
    enabled?: boolean;
    budget?: RateLimitBudget;
    endpoints?: {
        [key: string]: Partial<RateLimitBudget> | false;
    };
    accountKey?: (account: unknown) => null | string | undefined;
}

export declare class Req implements InternalArg {
    getArg(context: SignalContext): Bun.BunRequest;
}

export declare class Res implements InternalArg {
    getArg(context: SignalContext): {
        new (body?: BodyInit | null, init?: ResponseInit): Response;
        prototype: Response;
        error(): Response;
        json(data: any, init?: ResponseInit): Response;
        redirect(url: URL | string, status?: number): Response;
    };
}

export declare class ResolveFieldContext {
    signalContext: SignalContext | null;
    internalInfo: InternalInfo<"resolveField">;
    internal: Internal;
    parent: unknown;
    constructor(parent: unknown, { signalContext, internalInfo, internal, }: {
        signalContext: SignalContext | null;
        internalInfo: InternalInfo<"resolveField">;
        internal: Internal;
    });
    exec(): Promise<any>;
}

export interface ResolvedLiveSliceOption {
    sort: string[];
    fallback: "invalidate" | null;
    payload: "id" | "light";
    pauseOn: string[];
}

export interface ResolvedSliceCrud {
    get: boolean;
    create: boolean;
    update: boolean;
    remove: boolean;
}

export interface ResolvedSliceMcp {
    get: McpShelf;
    create: McpShelf;
    update: McpShelf;
    remove: McpShelf;
}

export interface ReturnInfo<Returns extends ConstantFieldTypeInput = any, Nullable extends boolean = false> {
    returnRef: Returns;
    arrDepth: number;
    enum?: EnumInstance;
    nullable?: Nullable;
}

export interface SerializedArg {
    type: ArgType;
    refName: (string & {}) | Exclude<DefaultPrimitiveName, "Map">;
    name: string;
    modelType?: "input" | "insight" | "object" | "scalar";
    arrDepth?: number;
    nullable?: boolean;
    example?: Date | boolean | number | string;
    enum?: string;
    oneOf?: (number | string)[];
    ref?: string;
}

export interface SerializedEndpoint extends SerializedSignalOption {
    type: "message" | "mutation" | "pubsub" | "query";
    returns: SerializedReturns;
    timeout?: number;
    errors?: EndpointErrors;
    destructive?: boolean;
}

export interface SerializedFilter {
    filter: {
        [key: string]: SerializedArg[];
    };
    sortKeys: string[];
    sorts?: {
        [key: string]: {
            [path: string]: -1 | 1;
        };
    };
}

export interface SerializedReturns {
    refName: (string & {}) | Exclude<DefaultPrimitiveName, "Map" | "Upload">;
    modelType?: "full" | "input" | "insight" | "light" | "scalar";
    arrDepth?: number;
    partial?: string[];
    nullable?: boolean;
}

export interface SerializedSignal {
    prefix?: string;
    slice?: {
        [key: string]: SerializedSlice;
    };
    endpoint: {
        [key: string]: SerializedEndpoint;
    };
    filter?: SerializedFilter;
    getGuards?: string[];
    cruGuards?: string[];
    createGuards?: string[];
    updateGuards?: string[];
    removeGuards?: string[];
    mcp?: SerializedSignalShelf;
    crud?: SerializedSignalMcp;
    agents?: SerializedSignalMcp;
    origin?: string[];
}

export interface SerializedSignalMcp {
    get?: false;
    create?: false;
    update?: false;
    remove?: false;
}

export interface SerializedSignalShelf {
    get?: "agent" | false;
    create?: "agent" | false;
    update?: "agent" | false;
    remove?: "agent" | false;
}

export interface SerializedSlice extends SerializedSignalOption {
    live?: {
        sort: string[];
        pauseOn?: string[];
    };
}

export interface ServerSignal extends Adaptor {
    readonly websocket: ServerWebSocket;
    readonly queue: QueueAdaptor;
}

export type ServerSignalCls<EnpCls = unknown, IntCls = unknown> = AdaptorCls<ServerSignalMethods<EnpCls, IntCls> & ServerSignal> & ServerSignalClsStatics;

export type ServerSignalClsStatics = {
    readonly refName: string;
    readonly [INJECT_META]: {
        queue: QueueAdaptor;
    };
    readonly [ENDPOINT_META]: {
        [key: string]: EndpointInfo;
    };
    readonly [INTERNAL_META]: {
        [key: string]: InternalInfo;
    };
};

export type ServerSignalMethods<EnpCls, IntCls> = EndpointServerSignalMethods<EnpCls> & InternalServerSignalMethods<IntCls>;

export declare class ServiceSignal<IntlCls extends InternalCls = InternalCls, EndpCls extends EndpointCls = EndpointCls, SrvrCls extends ServerSignalCls = ServerSignalCls> {
    internal: IntlCls;
    endpoint: EndpCls;
    server: SrvrCls;
    serializedSignal: SerializedSignal;
    constructor(internal: IntlCls, endpoint: EndpCls, server: SrvrCls, origin?: string);
}

export declare class SignalContext<Ctx extends HttpExecutionContext | WebSocketExecutionContext = HttpExecutionContext | WebSocketExecutionContext, Env extends BackendEnv = BackendEnv> {
    key: string;
    transport: SignalTransportType;
    ctx: Ctx;
    endpointInfo: EndpointInfo;
    adaptor: Adaptor;
    readonly origin: TraceOrigin;
    internalArgs: unknown[];
    trace: SignalTrace | null;
    constructor(key: string, reqOrWsReq: Bun.BunRequest | WebSocketRequest, option: SignalContextOption<Ctx, Env>);
    getAdaptor<T extends Adaptor>(adaptorCls: AdaptorCls<T>): T;
    getService<T>(refName: string): T;
    init(): Promise<this>;
    get bodyReadTime(): {
        ms: number;
        pending: Promise<void> | null;
    };
    isBodyReadFailure(error: unknown): boolean;
    get args(): unknown[];
    set args(args: unknown[]);
    static unguardedOpen(): boolean;
    authorize(): Promise<boolean>;
    canListForAccount(): Promise<boolean>;
    static setHttpPeerResolver(resolve: HttpPeerResolver | null): void;
    exec(): Promise<unknown>;
    static wasReported(error: unknown): boolean;
    static run<T>(endpoint: Adaptor, endpointInfo: EndpointInfo, key: string, origin: TraceOrigin, fn: () => Promise<T>): Promise<T>;
    static try(endpoint: Adaptor, endpointInfo: EndpointInfo, key: string, fn: () => Promise<Response | undefined>): Promise<Response | undefined>;
    static resolveReturn(value: unknown, { signalContext, returnRef, arrDepth, registry, live, cache, path, }: {
        signalContext: SignalContext | null;
        returnRef: ConstantFieldTypeInput;
        arrDepth: number;
        registry: InjectRegistry;
        live: LiveRegistry;
        cache?: ResolveCache;
        path?: string;
    }): Promise<unknown>;
    static loadNested(value: unknown, service: DatabaseService, { arrDepth }: {
        arrDepth: number;
    }): Promise<unknown>;
    getHttpContext<Appended = unknown>(): HttpExecutionContext<Appended>;
    getWebSocketContext<Appended = unknown>(): WebSocketExecutionContext<Appended>;
    get<T = unknown>(key: string): T | null;
    getClientIp(): null | string;
    static carryClientIp(target: Request, source: Request): void;
    static clientIpOf(req: Request): null | string;
    static isTrustedHop(req: Request): boolean;
    getClientPort(): null | number;
    getRoomId(key: string): string;
    getRequestRoomId(key: string): string;
    getLiveRoomId(key: string, query: unknown): string;
    getEnv(): Env;
    getArg<T = unknown>(argName: string): T | undefined;
}

export declare class SignalContractError extends AkanError<SignalContractErrorCode> {
}

export type SignalContractErrorCode = "bytesThroughAny" | "noHandler" | "notRegistered" | "undefinedReturn" | "wrongTransport";

export declare class SignalDeclarationError extends AkanError<SignalDeclarationErrorCode> {
}

export type SignalDeclarationErrorCode = "baseMismatch" | "handlerAlreadySet" | "invalidArgType" | "invalidErrors" | "liveAlreadySet" | "missingModel" | "missingSlice" | "nullableLastArg";

export declare class SignalFailure {
    static readonly message = "Internal Server Error";
    static get detailed(): boolean;
    static reset(): void;
    static generalized(error: unknown): {
        error: string;
        statusCode: number;
        code?: string;
    };
    static codeOf(error: unknown, status: number | undefined): string;
    static body<Extra extends Record<string, unknown> = Record<string, never>>(error: unknown, extra?: Extra): Extra & {
        error: string;
        statusCode: number;
        code?: string;
        timestamp: string;
        stack?: string;
    };
    static response(error: unknown, extra?: Record<string, unknown>): Response;
    static headersOf(error: unknown, statusCode: number): Record<string, string>;
}

export interface SignalOption<Response = any, Nullable extends boolean = false, _Key = keyof UnCls<Response>> extends InitOption, TimerOption {
    nullable?: Nullable;
    name?: string;
    default?: boolean;
    path?: string;
    serverMode?: "all" | "batch" | "federation";
    timeout?: number;
    onFailed?: (this: any, job: AkanJob, error: unknown) => Promise<void> | void;
    partial?: _Key[] | readonly _Key[];
    cache?: number;
    rateLimit?: RateLimitBudget | false;
    guards?: GuardCls[];
    middlewares?: MiddlewareCls[];
    prefix?: false | string;
    globalPrefix?: false;
    method?: HttpMutationMethod;
    fileUpload?: boolean;
    mcp?: McpShelf;
    destructive?: boolean;
    errors?: EndpointErrors;
    backpressure?: "coalesce" | "queue";
    live?: LiveEndpointOption;
    scheduleType?: "cron" | "destroy" | "init" | "interval" | "timeout";
    scheduleCron?: string;
    scheduleTime?: number;
    lock?: boolean;
    enabled?: boolean;
}

export declare class SignalRegistry {
    static registerDatabase<RefName extends string, IntlCls extends InternalCls, EndpCls extends EndpointCls, SlceCls extends SliceCls, SrvrCls extends ServerSignalCls>(refName: RefName, internal: SignalWithBase<RefName, IntlCls>, endpoint: SignalWithBase<RefName, EndpCls>, slice: SignalWithBase<RefName, SlceCls>, server: SrvrCls, origin?: string): DatabaseSignal<IntlCls, EndpCls, SlceCls, SrvrCls>;
    static getDatabase(refName: string): DatabaseSignal<InternalCls, EndpointCls, SliceCls, ServerSignalCls> | undefined;
    static registerService<RefName extends string, IntlCls extends InternalCls, EndpCls extends EndpointCls, SrvrCls extends ServerSignalCls>(refName: RefName, internal: SignalWithBase<RefName, IntlCls>, endpoint: SignalWithBase<RefName, EndpCls>, server: SrvrCls, origin?: string): ServiceSignal<IntlCls, EndpCls, SrvrCls>;
    static getService(refName: string): ServiceSignal<InternalCls, EndpointCls, ServerSignalCls> | undefined;
}

export declare class SignalTrace {
    static readonly defaultFlightMaxRecords = 65536;
    readonly endpointKey: string;
    readonly endpointType: string;
    readonly origin: TraceOrigin;
    readonly mode: TraceMode;
    readonly startedAt: number;
    readonly spans: SpanRecord[];
    readonly attrs: LogAttrs;
    dbQueryCount: number;
    dbQueryMs: number;
    cacheHits: number;
    cacheMisses: number;
    dataLoaderBatchCount: number;
    dataLoaderKeyCount: number;
    outcome: TraceOutcome | null;
    status: null | number;
    error: unknown;
    debugSev: null | number;
    flight: LogFlightRecorder | null;
    constructor(endpointKey: string, endpointType: string, { mode, origin }?: {
        mode?: TraceMode;
        origin?: TraceOrigin;
    });
    get traceId(): string;
    static create(endpointKey: string, endpointType: string, origin: TraceOrigin): SignalTrace | null;
    static get activeFlights(): number;
    get endpoint(): string;
    startFlightRecorder(): boolean;
    applyDebugHeader(value: null | string | undefined): boolean;
    setAttr(key: string, value: LogAttrs[string]): void;
    recordSpan(name: string, durationMs: number): void;
    countDbQuery(durationMs: number): void;
    countCache(hit: boolean): void;
    countDataLoaderBatch(keyCount: number): void;
    fail(error: unknown): void;
    finalize(): void;
}

export type SignalTransportType = "http" | "websocket";

export type SignalType = "restapi" | "websocket";

export type SlceCnstCapitalizedRefName<S extends SliceCls> = CnstCapitalizedRefName<SlceSrv<S>>;

export type SlceCnstDefault<S extends SliceCls> = CnstDefault<SlceSrv<S>>;

export type SlceCnstDefaultInput<S extends SliceCls> = CnstDefaultInput<SlceSrv<S>>;

export type SlceCnstDefaultState<S extends SliceCls> = CnstDefaultState<SlceSrv<S>>;

export type SlceCnstFull<S extends SliceCls> = CnstFull<SlceSrv<S>>;

export type SlceCnstInput<S extends SliceCls> = CnstInput<SlceSrv<S>>;

export type SlceCnstInsight<S extends SliceCls> = CnstInsight<SlceSrv<S>>;

export type SlceCnstLight<S extends SliceCls> = CnstLight<SlceSrv<S>>;

export type SlceCnstPurifiedInput<S extends SliceCls> = CnstPurifiedInput<SlceSrv<S>>;

export type SlceCnstRefName<S extends SliceCls> = CnstRefName<SlceSrv<S>>;

export type SlceCnstStateInsight<S extends SliceCls> = CnstStateInsight<SlceSrv<S>>;

export type SlceCnstStateLight<S extends SliceCls> = CnstStateLight<SlceSrv<S>>;

export type SlceDbFilter<S extends SliceCls> = DbFilter<SlceSrv<S>>;

export type SlceDbQuery<S extends SliceCls> = DbQuery<SlceSrv<S>>;

export type SlceDbSort<S extends SliceCls> = DbSort<SlceSrv<S>>;

export type SlceSrv<S extends SliceCls> = S["srv"];

export interface Slice<DictShape extends SliceDictArgShape = Record<never, never>> extends Adaptor {
    readonly [SLICE_DICT_SHAPE]: DictShape;
}

export type SliceBuilder<SrvModule extends ServiceModel, _Input = CnstInput<SrvModule>, _Full = CnstFull<SrvModule>, _Light = CnstLight<SrvModule>, _Insight = CnstInsight<SrvModule>, _Filter extends FilterInstance = DbFilter<SrvModule>, _SliceInfo = SliceInfo<SrvRefName<SrvModule>, _Input, _Full, _Light, _Insight, _Filter, SrvMap<SrvModule>>> = (init: (signalOption?: SignalOption) => SliceInfo<SrvRefName<SrvModule>, _Input, _Full, _Light, _Insight, _Filter, SrvMap<SrvModule>, [
], [
], [
], [
]>) => Record<string, _SliceInfo>;

export type SliceCls<SrvModule extends ServiceModel = ServiceModel, SliceInfoObj extends {
    [key: string]: SliceInfo;
} = {
    [key: string]: SliceInfo;
}> = AdaptorCls<Slice<SliceDictShape<SliceInfoObj>>> & {
    baseName: SrvRefName<SrvModule>;
    srv: SrvModule;
    prototype: Slice<SliceDictShape<SliceInfoObj>>;
    [SLICE_META]: SliceInfoObj;
    getGuards: GuardCls[];
    cruGuards: GuardCls[];
    createGuards: GuardCls[];
    updateGuards: GuardCls[];
    removeGuards: GuardCls[];
    mcp: ResolvedSliceMcp;
    crud: ResolvedSliceCrud;
};

export type SliceDictArgShape = {
    [key: string]: readonly string[];
};

export type SliceDictShape<SliceInfoObj extends {
    [key: string]: SliceInfo;
}> = {
    [K in keyof SliceInfoObj]: SliceInfoArgNames<SliceInfoObj[K]>;
};

export declare class SliceInfo<RefName extends string = string, Input = any, Full = any, Light = any, Insight = any, Filter extends FilterInstance = any, Srvs extends {
    [key: string]: any;
} = {
    [key: string]: any;
}, ArgNames extends string[] = any, Args extends any[] = any, InternalArgs extends any[] = any, ServerArgs extends any[] = any> {
    readonly refName: RefName;
    readonly input: Cls<Input>;
    readonly full: Cls<Full>;
    readonly light: Cls<Light>;
    readonly insight: Cls<Insight>;
    readonly filter: FilterCls<Filter>;
    readonly argNames: ArgNames;
    readonly args: ArgInfo<EndpointArgProps<boolean>>[];
    readonly internalArgs: InternalArgInfo<boolean>[];
    readonly signalOption: SignalOption;
    liveOption: ResolvedLiveSliceOption | null;
    execFn: ((...args: [
        ...ServerArgs,
        ...InternalArgs
    ]) => QueryOf<DocumentModel<Full>>) | null;
    constructor(refName: RefName, input: Cls<Input>, full: Cls<Full>, light: Cls<Light>, insight: Cls<Insight>, filter: FilterCls<Filter>, signalOption?: SignalOption);
    param<ArgName extends string, Arg extends ParamFieldType, _ClientArg = FieldToValue<Arg>, _ServerArg = ServerArgModel<_ClientArg>>(name: ArgName, arg: Arg, option?: Omit<EndpointArgProps, "nullable">): SliceInfo<RefName, Input, Full, Light, Insight, Filter, Srvs, [
        ...ArgNames,
        ArgName
    ], [
        ...Args,
        arg: _ClientArg
    ], InternalArgs, [
        ...ServerArgs,
        arg: _ServerArg
    ]>;
    body<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, Optional extends boolean = false, _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType, _ClientArg = UploadableClientArg<PurifiedModel<_ArgType>>, _ServerArg = ServerArgModel<_ArgType>>(name: ArgName, arg: Arg, option?: EndpointArgProps<Optional>): SliceInfo<RefName, Input, Full, Light, Insight, Filter, Srvs, [
        ...ArgNames,
        ArgName
    ], Optional extends true ? [
        ...Args,
        arg?: _ClientArg | null
    ] : [
        ...Args,
        arg: _ClientArg
    ], InternalArgs, [
        ...ServerArgs,
        arg: (Optional extends true ? undefined : never) | _ServerArg
    ]>;
    search<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, _ArgType = unknown extends ExplicitType ? FieldToValue<Arg> : ExplicitType, _ClientArg = PurifiedModel<_ArgType>, _ServerArg = ServerArgModel<_ArgType>>(name: ArgName, arg: Arg, option?: Omit<EndpointArgProps, "nullable">): SliceInfo<RefName, Input, Full, Light, Insight, Filter, Srvs, [
        ...ArgNames,
        ArgName
    ], [
        ...Args,
        arg?: _ClientArg | null
    ], InternalArgs, [
        ...ServerArgs,
        arg: _ServerArg | undefined
    ]>;
    with<ArgType, Optional extends boolean = false>(argRef: InternalArgCls<ArgType>, option?: InternalArgProps<Optional>): SliceInfo<RefName, Input, Full, Light, Insight, Filter, Srvs, ArgNames, Args, [
        ...InternalArgs,
        arg: (Optional extends true ? null : never) | NonNullable<ArgType>
    ], ServerArgs>;
    live(option?: LiveSliceOption<ArgNames[number]>): this;
    exec(query: (this: {
        [K in keyof Srvs as K extends string ? Uncapitalize<K> : never]: Srvs[K];
    }, ...args: [
        ...ServerArgs,
        ...InternalArgs
    ]) => PromiseOrObject<QueryOf<DocumentModel<Full>>>): this;
}

export type SliceInfoArgNames<S> = SliceInfoParts<S>["argNames"];

export type SliceInfoArgs<S> = SliceInfoParts<S>["args"];

export type SliceInfoFilter<S> = SliceInfoParts<S>["filter"];

export type SliceInfoFull<S> = SliceInfoParts<S>["full"];

export type SliceInfoInput<S> = SliceInfoParts<S>["input"];

export type SliceInfoInsight<S> = SliceInfoParts<S>["insight"];

export type SliceInfoInternalArgs<S> = SliceInfoParts<S>["internalArgs"];

export type SliceInfoLight<S> = SliceInfoParts<S>["light"];

export type SliceInfoParts<S> = S extends SliceInfo<infer RefName, infer Input, infer Full, infer Light, infer Insight, infer Filter, infer Srvs, infer ArgNames, infer Args, infer InternalArgs, infer ServerArgs> ? {
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
} : SliceInfoEmptyParts;

export type SliceInfoRefName<S> = SliceInfoParts<S>["refName"];

export type SliceInfoServerArgs<S> = SliceInfoParts<S>["serverArgs"];

export type SliceInfoSrvs<S> = SliceInfoParts<S>["srvs"];

export interface SpanRecord {
    name: string;
    durationMs: number;
}

export type SrvMap<S extends ServiceModel> = S["srvMap"];

export type SrvOf<S extends ServiceModel> = S["srv"];

export type SrvRefName<S extends ServiceModel> = SrvOf<S>["refName"];

export interface StatusException {
    new (message?: string, details?: unknown): Exception;
    is(error: unknown, ...codes: string[]): error is Exception;
}

export declare class Timeout extends Timeout_base {
    use(): Promise<(context: SignalContext, next: () => Promise<unknown>) => Promise<unknown>>;
}

export type TraceMode = "context" | "full";

export type TraceOrigin = "http" | "internal" | "mcp" | "page" | "websocket";

export type TraceOutcome = "error" | "ok";

export type TypedServerSignalCls<EnpCls, IntCls> = AdaptorCls<ServerSignalMethods<EnpCls, IntCls> & ServerSignal> & ServerSignalClsStatics;

export type WebSocketEventType = "close" | "message" | "open" | "subscribe" | "unsubscribe";

export declare class WebSocketExecutionContext<Appended = unknown> {
    ws: Bun.ServerWebSocket<Appended>;
    data: unknown[];
    roomId: string;
    eventType: WebSocketEventType;
    onDisconnect: Set<() => PromiseOrObject<void>>;
    onUnsubscribe: Set<() => PromiseOrObject<void>>;
    constructor(wsReq: WebSocketRequest);
    getArgs(endpointInfo: EndpointInfo): Promise<unknown[]>;
    readArgs(endpointInfo: EndpointInfo): Promise<unknown[]>;
    parseArg(arg: ArgInfo, raw: unknown): unknown;
    makeResponse(result: unknown, endpointInfo: EndpointInfo): Response;
    on: (event: "disconnect" | "unsubscribe", handler: () => PromiseOrObject<void>) => void;
    off: (event: "disconnect" | "unsubscribe", handler: () => PromiseOrObject<void>) => void;
}

export type WebsocketAuthAck = {
    type: "auth";
    revokedRooms: string[];
};

export type WebsocketMessageData = {
    type: "msg";
    key: string;
    data: object | object[];
};

export type WebsocketPublishData = {
    type: "pub";
    roomId: string;
    data: null | object | object[];
    seq?: number;
};

export type WebsocketReqData = {
    key: string;
    data: unknown[];
    subscribe?: boolean;
    since?: WebsocketRoomCursor;
};

export type WebsocketResData = WebsocketAuthAck | WebsocketMessageData | WebsocketPublishData | WebsocketResyncData | WebsocketSubscribeAck;

export type WebsocketResyncData = {
    type: "resync";
    roomId: string;
    seq?: number;
};

export type WebsocketRoomCursor = {
    epoch: string;
    seq: number;
};

export type WebsocketSubscribeAck = {
    type: "sub";
    roomId: string;
    requestRoomId: string;
    subscribe: boolean;
    cursor?: WebsocketRoomCursor;
    replayed?: boolean;
};

export declare class Ws implements InternalArg {
    getArg(context: SignalContext): {
        ws: Bun.ServerWebSocket<{
            socketId: string;
        }>;
        socketId: string;
        subscribe: boolean;
        on: (event: "disconnect" | "unsubscribe", handler: () => PromiseOrObject<void>) => void;
        off: (event: "disconnect" | "unsubscribe", handler: () => PromiseOrObject<void>) => void;
    };
}

export declare const agent: import("./signalRegistry").ServiceSignal<typeof AgentInternal, typeof AgentEndpoint, typeof Agent>;

export declare const agentTurnConstant: import("akanjs/constant").ScalarConstantModel<"agentTurn", AgentTurn, import("akanjs/constant").DefaultOf<AgentTurn>, {
    text: string;
    toolCalls: unknown[];
    stop: NonNullable<"end" | "length" | "toolUse">;
} & {}, {
    text: string;
    toolCalls: unknown[];
    stop: "end" | "length" | "toolUse";
} & {}>;

export declare const agentTurnDocument: import("akanjs/document").DatabaseCls<AgentTurnDocument>;

export declare const argTypes: readonly [
    "body",
    "param",
    "search",
    "upload",
    "msg",
    "room"
];

export declare const base: import("./signalRegistry").ServiceSignal<typeof BaseInternal, typeof BaseEndpoint, typeof Base>;

export declare const buildEndpoint: BuildEndpoint<any>;

export declare const buildInternal: BuildInternal<any, any>;

export declare const buildSlice: <T extends string, Input extends Cls<any>, Full extends BaseObject, Light extends BaseObject, Insight extends BaseInsight, Filter extends FilterInstance, SrvModule extends ServiceModel>(refName: T, input: Cls<Input>, full: Cls<Full>, light: Cls<Light>, insight: Cls<Insight>, filter: FilterCls<Filter>) => (signalOption?: SignalOption) => SliceInfo<T, Input, Full, Light, Insight, Filter, SrvMap<SrvModule>, [
], [
], [
], [
]>;

export declare const createOpenApiDocument: (serializedSignal: Record<string, SerializedSignal>, options?: OpenApiDocumentOptions) => OpenApiDocument;

export declare function endpoint<SrvModule extends ServiceModel, Builder extends EndpointBuilder<SrvModule>, LibEndpoints extends readonly EndpointCls[]>(srv: SrvModule, builder: Builder, ...libEndpoints: LibEndpoints): EndpointCls<SrvModule, LibEndpoints extends readonly [
] ? ReturnType<Builder> : Assign<MergeEndpointMetas<LibEndpoints>, ReturnType<Builder>>>;

export declare const fetch: import("akanjs/fetch").FetchClientType<[
    import("./signalRegistry").ServiceSignal<typeof BaseInternal, typeof BaseEndpoint, typeof Base>,
    import("./signalRegistry").ServiceSignal<typeof import("./agent.signal").AgentInternal, typeof import("./agent.signal").AgentEndpoint, typeof import("./agent.signal").Agent>
]>;

export declare const getCanonicalLineMode: () => CanonicalLineMode;

export declare const getCurrentTrace: () => SignalTrace | undefined;

export declare const getFlightThresholdMs: () => number;

export declare const getSerializedSignal: () => {
    [key: string]: import("./types").SerializedSignal;
};

export declare const getTraceSnapshot: () => {
    enabled: boolean;
    endpoints: {
        endpoint: string;
        requests: number;
        avgDbQueriesPerRequest: number;
        avgDbQueryMsPerRequest: number;
        cacheHitRatio: null | number;
        avgDataLoaderBatchSize: null | number;
        spans: {
            name: string;
            count: number;
            meanMs: number;
            p50Ms: number;
            p95Ms: number;
            p99Ms: number;
            maxMs: number;
        }[];
    }[];
};

export declare const guard: <T extends string>(name: T) => GuardCls<T>;

export declare const guardOf: (GuardCls: GuardCls) => Guard;

export declare function intercept<Name extends string>(name: Name): InterceptorCls;
export declare function intercept<Name extends string, Injection extends InjectBuilder<"env" | "memory" | "use">>(refName: Name, injectBuilder: Injection): InterceptorCls<Record<never, never>, ReturnType<Injection>>;

export declare function internal<SrvModule extends ServiceModel, InternalInfoMap extends ReturnType<InternalBuilder<SrvModule>>, LibInternals extends InternalCls[]>(srv: SrvModule, internalBuilder: (builder: BuildInternal<SrvModule>) => InternalInfoMap, ...libInternals: LibInternals): InternalCls<SrvModule, MergeAllKeyOfObjects<LibInternals, typeof INTERNAL_META> & InternalInfoMap>;

/** @internal */
export declare const isDebugHeaderAllowed: () => boolean;

export declare const isExceptionLike: (error: unknown) => error is ExceptionLike;

export declare const isFlightRecorderEnabled: () => boolean;

export declare const isLocalDevRuntime: ({ environment, operationMode, }?: {
    environment?: string;
    operationMode?: string;
}) => boolean;

export declare const isLogContextEnabled: () => boolean;

export declare const isTraceEnabled: () => boolean;

export declare const middleware: (refName: string) => {
    new (): {
        use(env: BackendEnv): Promise<(context: SignalContext, next: () => Promise<unknown>) => Promise<unknown>>;
    };
    refName: string;
};

export declare const refusesAgents: (guards: readonly GuardCls[] | undefined) => boolean;

export declare const runTraced: <T>(trace: SignalTrace | null, fn: () => Promise<T>) => Promise<T>;

/** @deprecated */
export declare const runWithTrace: <T>(trace: SignalTrace, fn: () => T) => T;

export declare const serverSignal: <EnpCls, IntCls>(endpointRef: EnpCls, internalRef: IntCls) => ServerSignalCls<EnpCls, IntCls>;

export declare const setCanonicalLineMode: (mode: CanonicalLineMode) => void;

export declare const setFlightRecorderEnabled: (enabled: boolean) => void;

export declare const setFlightThresholdMs: (ms: number) => void;

export declare const setLogContextEnabled: (enabled: boolean) => void;

export declare const setTraceEnabled: (enabled: boolean) => void;

export declare function slice<SrvModule extends ServiceModel, BuildSlice extends SliceBuilder<SrvModule>, LibSlices extends SliceCls[], _Input = CnstInput<SrvModule>, _Full = CnstFull<SrvModule>, _Light = CnstLight<SrvModule>, _Insight = CnstInsight<SrvModule>, _Filter extends FilterInstance = DbFilter<SrvModule>, _QueryKey extends string = RootSliceQueryKey<_Filter>>(srv: SrvModule, option: RootSliceOption, sliceBuilder: BuildSlice, ...libSlices: LibSlices): SliceCls<SrvModule, LibSlices extends [
] ? Assign<ReturnType<BuildSlice>, RootSliceInfoObj<SrvModule, _Input, _Full, _Light, _Insight, _Filter, _QueryKey>> : Assign<ExtendSliceInfoObj<SrvModule, LibSlices>, Assign<ReturnType<BuildSlice>, RootSliceInfoObj<SrvModule, _Input, _Full, _Light, _Insight, _Filter, _QueryKey>>>>;

export declare function sliceEndpoint<SrvModule extends ServiceModel, Builder extends EndpointBuilder<SrvModule>>(srv: SrvModule, builder: Builder): EndpointCls<SrvModule, ReturnType<Builder>>;

export declare const traceAggregator: TraceAggregator;

export declare const traceCache: (hit: boolean) => void;

export declare const traceDataLoaderBatch: (keyCount: number) => void;

/** @deprecated */
export declare const traceDbQuery: (durationMs: number) => void;

export declare const traceSpan: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
declare const AgentEndpoint_base: import("./endpoint").EndpointCls<import("akanjs/service").ServiceModel<typeof import("akanjs/service").AgentService, any, any, {
    agentService: import("akanjs/service").AgentService;
}>, {
    runAgentTurn: import("./endpointInfo").EndpointInfo<"mutation", {
        agentService: import("akanjs/service").AgentService;
    }, [
        "messages",
        "tools",
        "context",
        "instructions"
    ], [
        arg: unknown[],
        arg: unknown[],
        arg: unknown[],
        arg?: null | string | undefined
    ], [
        arg: Bun.BunRequest<string>,
        arg: null | {},
        arg: null | string
    ], [
        arg: unknown[],
        arg: unknown[],
        arg: unknown[],
        arg: string | undefined
    ], typeof AgentTurn, AgentTurn, Promise<AgentTurn | {
        limits?: import("akanjs/service").LlmLimits | undefined;
        model?: string | undefined;
        usage?: import("akanjs/service").LlmUsage | undefined;
        text: string;
        toolCalls: import("akanjs/service").AgentWireToolCall[];
        stop: "end" | "length" | "toolUse";
    }>, false>;
}>;

declare const AgentInternal_base: import("./internal").InternalCls<import("akanjs/service").ServiceModel<typeof import("akanjs/service").AgentService, any, any, {
    agentService: import("akanjs/service").AgentService;
}>, {}>;

declare const AgentStop_base: import("akanjs/base").EnumInstance<"agentStop", "end" | "length" | "toolUse">;

declare const AgentTurnDocument_base: import("akanjs/document").DatabaseCls<{
    text: string;
    toolCalls: unknown[];
    stop: NonNullable<"end" | "length" | "toolUse">;
} & {}>;

declare const AgentTurn_base: import("akanjs/constant").ConstantCls<import("akanjs/constant").ExtractFieldInfoObject<{
    text: {
        readonly value: StringConstructor;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: StringConstructor | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", StringConstructor | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", StringConstructor, any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    toolCalls: {
        readonly value: (typeof Any)[];
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: (typeof Any)[] | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[] | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[], any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    stop: {
        readonly value: typeof AgentStop;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: true;
        _isPrimitive: false;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: null | typeof AgentStop;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: true;
            _isPrimitive: false;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", null | typeof AgentStop, any, any, true, false, true, false, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", typeof AgentStop, any, any, false, false, true, false, false, false, false, false, {
            [key: string]: any;
        }>;
    };
}>, import("akanjs/constant").FieldInfoObjectToFieldObject<{
    text: {
        readonly value: StringConstructor;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: StringConstructor | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", StringConstructor | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", StringConstructor, any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    toolCalls: {
        readonly value: (typeof Any)[];
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: (typeof Any)[] | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[] | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[], any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    stop: {
        readonly value: typeof AgentStop;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: true;
        _isPrimitive: false;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: null | typeof AgentStop;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: true;
            _isPrimitive: false;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", null | typeof AgentStop, any, any, true, false, true, false, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", typeof AgentStop, any, any, false, false, true, false, false, false, false, false, {
            [key: string]: any;
        }>;
    };
}>, import("akanjs/constant").ExtractFieldInfoObject<{
    text: {
        readonly value: StringConstructor;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: StringConstructor | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", StringConstructor | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", StringConstructor, any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    toolCalls: {
        readonly value: (typeof Any)[];
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: (typeof Any)[] | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[] | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[], any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    stop: {
        readonly value: typeof AgentStop;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: true;
        _isPrimitive: false;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: null | typeof AgentStop;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: true;
            _isPrimitive: false;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", null | typeof AgentStop, any, any, true, false, true, false, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", typeof AgentStop, any, any, false, false, true, false, false, false, false, false, {
            [key: string]: any;
        }>;
    };
}>, import("akanjs/constant").FieldInfoObjectToFieldObject<{
    text: {
        readonly value: StringConstructor;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: StringConstructor | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", StringConstructor | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", StringConstructor, any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    toolCalls: {
        readonly value: (typeof Any)[];
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: false;
        _isPrimitive: true;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: (typeof Any)[] | null;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: false;
            _isPrimitive: true;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[] | null, any, any, true, false, false, true, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", (typeof Any)[], any, any, false, false, false, true, false, false, false, false, {
            [key: string]: any;
        }>;
    };
    stop: {
        readonly value: typeof AgentStop;
        readonly type: import("akanjs/constant").ConstantFieldTypeInput;
        readonly option: import("akanjs/constant").ConstantFieldProps;
        explicitType: any;
        mapValue: any;
        _isEnum: true;
        _isPrimitive: false;
        _isScalar: false;
        _isRelation: false;
        _isHidden: false;
        _isSecret: false;
        _isMap: false;
        optional(): {
            readonly value: null | typeof AgentStop;
            readonly type: import("akanjs/constant").ConstantFieldTypeInput;
            readonly option: import("akanjs/constant").ConstantFieldProps;
            explicitType: any;
            mapValue: any;
            _isEnum: true;
            _isPrimitive: false;
            _isScalar: false;
            _isRelation: false;
            _isHidden: false;
            _isSecret: false;
            _isMap: false;
            optional(): any;
            meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
            toField(): import("akanjs/constant").ConstantField<"property", null | typeof AgentStop, any, any, true, false, true, false, false, false, false, false, {
                [key: string]: any;
            }>;
        };
        meta(meta: import("akanjs/constant").ConstantFieldProps["meta"]): any;
        toField(): import("akanjs/constant").ConstantField<"property", typeof AgentStop, any, any, false, false, true, false, false, false, false, false, {
            [key: string]: any;
        }>;
    };
}>, "input" | "scalar", {
    optional: never;
    relation: never;
    primitive: "text" | "toolCalls";
    scalar: never;
    enum: "stop";
    map: never;
    hidden: never;
    secret: never;
}>;

declare const Agent_base: import("./serverSignal").ServerSignalCls<typeof AgentEndpoint, typeof AgentInternal>;

declare const BaseEndpoint_base: import("./endpoint").EndpointCls<import("akanjs/service").ServiceModel<typeof import("akanjs/service").BaseService, any, any, {
    baseService: import("akanjs/service").BaseService;
}>, {
    ping: import("./endpointInfo").EndpointInfo<"query", {
        baseService: import("akanjs/service").BaseService;
    }, [
    ], [
    ], [
    ], [
    ], StringConstructor, string, string, false>;
    pingBody: import("./endpointInfo").EndpointInfo<"mutation", {
        baseService: import("akanjs/service").BaseService;
    }, [
        "data"
    ], [
        arg: string
    ], [
    ], [
        arg: string
    ], StringConstructor, string, string, false>;
    pingParam: import("./endpointInfo").EndpointInfo<"query", {
        baseService: import("akanjs/service").BaseService;
    }, [
        string
    ], [
        arg: string
    ], [
    ], [
        arg: string
    ], StringConstructor, string, string, false>;
    pingQuery: import("./endpointInfo").EndpointInfo<"query", {
        baseService: import("akanjs/service").BaseService;
    }, [
        string
    ], [
        arg?: null | string | undefined
    ], [
    ], [
        arg: string | undefined
    ], StringConstructor, string, string, true>;
    wsPing: import("./endpointInfo").EndpointInfo<"message", {
        baseService: import("akanjs/service").BaseService;
    }, [
        string
    ], [
        arg?: null | string | undefined
    ], [
    ], [
        arg: string | undefined
    ], StringConstructor, string, string, false>;
    pubsubPing: import("./endpointInfo").EndpointInfo<"pubsub", {
        baseService: import("akanjs/service").BaseService;
    }, [
    ], [
    ], [
    ], [
    ], StringConstructor, string, void, false>;
}>;

declare const BaseInternal_base: import("./internal").InternalCls<import("akanjs/service").ServiceModel<typeof import("akanjs/service").BaseService, any, any, {
    baseService: import("akanjs/service").BaseService;
}>, {}>;

declare const Base_base: import("./serverSignal").ServerSignalCls<typeof BaseEndpoint, typeof BaseInternal>;

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

type EndpointMetaOf<EndpCls> = EndpCls extends EndpointCls<any, infer EndpointInfoObj> ? EndpointInfoObj : never;

type EndpointPubsubPayload<E> = DocumentModel<EndpInfoClientReturns<E>> | EndpInfoClientReturns<E>;

type EndpointServerSignalMethods<EnpCls> = [
    EnpCls
] extends [
    {
        [ENDPOINT_META]: infer EndpointInfoObj;
    }
] ? {
    [K in keyof EndpointInfoObj as EndpInfoReqType<EndpointInfoObj[K]> extends "pubsub" ? K : never]: (...args: [
        ...EndpInfoServerArgs<EndpointInfoObj[K]>,
        data: EndpointPubsubPayload<EndpointInfoObj[K]>
    ]) => void;
} : Record<never, never>;

type ExtendSliceInfoObj<SrvModule extends ServiceModel, LibSlices extends SliceCls[], _Input = CnstInput<SrvModule>, _Full = CnstFull<SrvModule>, _Light = CnstLight<SrvModule>, _Insight = CnstInsight<SrvModule>, _Filter extends FilterInstance = DbFilter<SrvModule>, _Merged = MergeAllKeyOfObjects<LibSlices, typeof SLICE_META>> = {
    [K in keyof _Merged]: _Merged[K] extends SliceInfo ? SliceInfo<SrvRefName<SrvModule>, _Input, _Full, _Light, _Insight, _Filter, SliceInfoSrvs<_Merged[K]>, SliceInfoArgNames<_Merged[K]>, SliceInfoArgs<_Merged[K]>, SliceInfoInternalArgs<_Merged[K]>, SliceInfoServerArgs<_Merged[K]>> : never;
};

interface InitOption {
    serverMode?: "all" | "batch" | "federation";
    operationMode?: ("cloud" | "edge" | "local" | (string & {}))[];
    enabled?: boolean;
    once?: boolean;
}

interface InternalArgProps<Nullable extends boolean = false> {
    nullable?: Nullable;
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

type InternalServerSignalMethods<IntCls> = [
    IntCls
] extends [
    {
        [INTERNAL_META]: infer InternalInfoObj;
    }
] ? {
    [K in keyof InternalInfoObj as InternalInfoReqType<InternalInfoObj[K]> extends "process" ? K : never]: (...args: [
        ...args: InternalInfoServerArgs<InternalInfoObj[K]>,
        jobOptions?: AkanJobOptions
    ]) => Promise<AkanJob<unknown, unknown>>;
} : Record<never, never>;

type InternalType = "cron" | "destroy" | "init" | "interval" | "process" | "resolveField" | "timeout";

declare const Logging_base: {
    new (): {
        use(env: BackendEnv): Promise<(context: SignalContext, next: () => Promise<unknown>) => Promise<unknown>>;
    };
    refName: string;
};

type MergeEndpointMetas<EndpClses extends readonly EndpointCls[], Acc = unknown> = EndpClses extends readonly [
    infer First extends EndpointCls,
    ...infer Rest extends readonly EndpointCls[]
] ? MergeEndpointMetas<Rest, Assign<Acc, EndpointMetaOf<First>>> : Acc;

type OpenApiOperation = Record<string, unknown>;

type OpenApiPathItem = Record<string, OpenApiOperation>;

type ResolveCache = Map<ConstantFieldTypeInput, Map<string, Promise<unknown>>>;

type ResolvedBudget = Required<RateLimitBudget>;

type RootSliceInfoObj<SrvModule extends ServiceModel, _Input, _Full, _Light, _Insight, _Filter extends FilterInstance, _QueryKey extends string> = {
    "": SliceInfo<SrvRefName<SrvModule>, _Input, _Full, _Light, _Insight, _Filter, SrvMap<SrvModule>, [
        "queryKey",
        "args"
    ], [
        queryKey?: _QueryKey | null,
        args?: null | unknown[]
    ], [
    ], [
        _QueryKey | undefined,
        undefined | unknown[]
    ]>;
};

interface RootSliceOption {
    guards?: {
        root?: GuardCls | GuardCls[];
        get?: GuardCls | GuardCls[] | false;
        cru?: GuardCls | GuardCls[] | false;
        create?: GuardCls | GuardCls[] | false;
        update?: GuardCls | GuardCls[] | false;
        remove?: GuardCls | GuardCls[] | false;
    };
    mcp?: McpShelf | {
        root?: McpShelf;
        get?: McpShelf;
        cru?: McpShelf;
        create?: McpShelf;
        update?: McpShelf;
        remove?: McpShelf;
    };
    prefix?: string;
}

type RootSliceQueryKey<Filter extends FilterInstance> = Extract<keyof Filter["query"], string>;

type RunTurn = (onDelta: (delta: string) => void, signal: AbortSignal) => Promise<StreamedTurn>;

type RuntimeRecord = Record<string, unknown>;

interface SerializedSignalOption {
    args: SerializedArg[];
    path?: string;
    prefix?: false | string;
    globalPrefix?: false;
    guards?: string[];
    method?: HttpMutationMethod;
    fileUpload?: boolean;
    mcp?: "agent" | false;
    agents?: false;
}

type SignalBaseRef<SigCls> = SigCls extends {
    srv: {
        srv: {
            refName: infer RefName;
        };
    };
} ? RefName : never;

interface SignalContextOption<Ctx, Env extends BackendEnv> {
    endpointInfo: EndpointInfo;
    adaptor: Adaptor;
    registry: InjectRegistry;
    env: Env;
    live: LiveRegistry;
    middleware: Map<string, MiddlewareCls>;
    ctx?: Ctx;
    origin?: TraceOrigin;
    trace?: SignalTrace | null;
}

type SignalWithBase<RefName extends string, SigCls> = SignalBaseRef<SigCls> extends RefName ? SigCls : never;

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

interface StreamedTurn {
    text?: string;
    toolCalls?: AgentWireToolCall[];
    stop?: "end" | "length" | "toolUse";
    usage?: LlmUsage;
    limits?: LlmLimits;
}

declare const Timeout_base: {
    new (): {
        use(env: BackendEnv): Promise<(context: SignalContext, next: () => Promise<unknown>) => Promise<unknown>>;
    };
    refName: string;
};

interface TimerOption {
    serverMode?: "all" | "batch" | "federation";
    operationMode?: ("cloud" | "edge" | "local" | (string & {}))[];
    lock?: boolean;
    enabled?: boolean;
}

declare class TraceAggregator {
    ingest(trace: SignalTrace): void;
    reset(): void;
    snapshot(): {
        enabled: boolean;
        endpoints: {
            endpoint: string;
            requests: number;
            avgDbQueriesPerRequest: number;
            avgDbQueryMsPerRequest: number;
            cacheHitRatio: null | number;
            avgDataLoaderBatchSize: null | number;
            spans: {
                name: string;
                count: number;
                meanMs: number;
                p50Ms: number;
                p95Ms: number;
                p99Ms: number;
                maxMs: number;
            }[];
        }[];
    };
}

interface WebSocketRequest {
    ws: Bun.ServerWebSocket<unknown>;
    data: unknown[];
    eventType: WebSocketEventType;
}
```
