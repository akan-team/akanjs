# `akanjs/fetch`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type Account<AddData = unknown> = {
    appName: string;
    environment: Environment;
} & AddData;

export declare class AgentStop extends AgentStop_base {
}

export declare class AgentTurn extends AgentTurn_base {
    isToolUse(): boolean;
}

export interface AkanDynamicUsage {
    headers: boolean;
    cookies: boolean;
}

export interface AkanRequestPolicy {
    routeId?: string;
    cacheable?: boolean;
    revalidate?: false | number;
    tags: Set<string>;
}

export interface AkanRequestStore {
    request: Request;
    theme?: AkanTheme;
    frameState?: unknown;
    queryCache: Map<string, Promise<unknown>>;
    queryLog: RequestQueryRecord[];
    policy: AkanRequestPolicy;
    dynamicUsage: AkanDynamicUsage;
}

export type AkanTheme = "css" | "system" | (string & {});

export declare class AppScope {
    static run<T>(app: string, load: () => T): T;
    static current(): string | undefined;
}

export type ClientEdit<RefName extends string, Model> = PromiseOrObject<ServerEdit<RefName, Model>>;

export type ClientInit<RefName extends string, Light, Insight = any, QueryArgs = any, Filter extends FilterInstance = any> = PromiseOrObject<ServerInit<RefName, Light, Insight, QueryArgs, Filter>>;

export type ClientSignal<RefName extends string = string, SlceCls extends SliceCls = SliceCls, Cnst extends ConstantModel = ConstantModel> = {
    refName: RefName;
    _slice: SlceCls;
    cnst: Cnst;
    fetch: FetchProxy<any>;
    slices: ClientSlice[];
    serializedSignal: SerializedSignal;
};

export type ClientSlice = {
    refName: string;
    sliceName: string;
    serializedSlice: SerializedSlice;
};

export type ClientView<RefName extends string, Model> = PromiseOrObject<ServerView<RefName, Model>>;

export interface CookieEntry {
    name: string;
    value: string;
}

export type EditHandle<RefName extends string, Full> = FetchHandleOf<EditReturn<RefName, Full>, {
    [K in RefName]: Promise<Full>;
} & {
    [K in `${RefName}Edit`]: Promise<ServerEdit<RefName, Full>>;
}>;

export type EditReturn<RefName extends string, Full> = {
    [K in RefName]: Full;
} & {
    [K in `${RefName}Edit`]: ServerEdit<RefName, Full>;
};

export interface ErrorConstructor {
    fromJSON: (payload: ErrorResponsePayload) => RestoredError;
}

export interface ErrorResponsePayload {
    error: string;
    statusCode?: number;
    code?: string;
    data?: Record<string, unknown>;
    details?: unknown;
    path?: string;
    timestamp?: string;
}

export interface FetchBridge {
    call(request: FetchBridgeCall): Promise<unknown>;
}

export interface FetchBridgeCall {
    key: string;
    type: "mutation" | "query";
    args: UnknownRecord;
    returns: SerializedReturns;
    timeout?: false | number;
    signal?: AbortSignal;
}

export interface FetchClaim {
    key: string;
    by: string;
}

export declare class FetchClient {
    readonly logger: Logger;
    readonly origin: string;
    readonly http: HttpClient;
    readonly ws: WsClient;
    readonly handler: Record<string, FetchHandler>;
    readonly slice: Record<string, SliceMeta>;
    readonly sortKeyMap: Map<string, string[]>;
    readonly sortValueMap: Map<string, {
        [key: string]: {
            [path: string]: -1 | 1;
        };
    }>;
    readonly filterQueryMap: Map<string, {
        [queryKey: string]: SerializedArg[];
    }>;
    serializedSignal: {
        [key: string]: SerializedSignal;
    };
    jwt: null | string;
    constructor(origin: string, handler?: Record<string, FetchHandler>, serializedSignal?: {
        [key: string]: SerializedSignal;
    }, ErrorCls?: ErrorConstructor | undefined);
    static get sharedSerializedSignal(): {
        [key: string]: SerializedSignal;
    };
    static resetSharedRegistry(): void;
    static setBridge(bridge: FetchBridge | null): void;
    static get bridge(): FetchBridge | null;
    static get bridged(): boolean;
    static resetSharedClient(): void;
    static useTestClientIps(enabled?: boolean): void;
    get ownSerializedSignal(): {
        [key: string]: SerializedSignal;
    };
    setTimeout(timeout?: false | number): void;
    setErrorConstructor(ErrorCls?: ErrorConstructor): void;
    applySignal(serializedSignal: {
        [key: string]: SerializedSignal;
    }, { share }?: {
        share?: boolean;
    }): this;
    connect(): void;
    connectOnUse(): void;
    disconnect(): void;
    clone({ origin, connect, jwt, clientIp, ws, retry, }?: {
        origin?: string;
        connect?: boolean;
        jwt?: string;
        clientIp?: null | string;
        ws?: WsClientOptions;
        retry?: RetryPolicy | false;
    }): FetchProxy<unknown, Record<never, never>>;
    configureWs(options: WsClientOptions): void;
    setJwt(jwt: null | string): void;
    static paginationArgs: SerializedArg[];
    static makeHttpUrl(key: string, endpoint: SerializedEndpoint, prefix: string | undefined, argMap: Map<string, unknown>): string;
    static getBaseEndpoint(refName: string, signal: SerializedSignal): {
        [key: string]: SerializedEndpoint;
    };
    static claimsOf(refName: string, signal: SerializedSignal): {
        handlers: FetchClaim[];
        sockets: FetchClaim[];
    };
    static getEndpointFromSlice(refName: string, suffix: string, slice: SerializedSlice): {
        [key: string]: SerializedEndpoint;
    };
    static classifyHttpArgs(args: SerializedArg[]): {
        paramArgs: SerializedArg[];
        searchArgs: SerializedArg[];
        bodyArgs: SerializedArg[];
        uploadArgs: SerializedArg[];
    };
    static from<Signals extends readonly FetchSignalInput[]>(...signals: Signals): FetchClientType<Signals>;
    static build<SigType extends {
        fetch: any;
    }>(constant: object, serializedSignal: {
        [key: string]: SerializedSignal;
    }, { origin, connect, base, Err, timeout, }?: {
        origin?: string;
        connect?: boolean;
        base?: FetchProxy;
        Err?: ErrorConstructor;
        timeout?: false | number;
    }): {
        sig: ClientSignalMap<SigType>;
        fetch: SigType["fetch"];
    };
}

export type FetchClientType<Signals extends readonly FetchSignalInput[]> = FetchProxy<MergeAllFetchTypes<Signals>, GetSliceMetaObjFromDatabaseSignals<Signals>>;

export type FetchHandleOf<Awaited, Fields> = PromiseLike<Awaited> & Fields;

export interface FetchInitForm<Input, Filter extends FilterInstance> {
    page?: number;
    limit?: number;
    sort?: ExtractSort<Filter>;
    default?: Partial<DefaultOf<Input>>;
    invalidate?: boolean;
    insight?: boolean;
}

export type FetchProxy<FetchType = unknown, SliceMetaObj extends Record<string, SliceMeta> = Record<never, never>> = typeof global.fetch & FetchClient & FetchType & {
    slice: SliceMetaObj;
    instance: FetchClient;
    _FetchType: FetchType;
    _SliceMetaObj: SliceMetaObj;
};

export type FetchProxySignalInput<FetchType = unknown, SliceMetaObj extends Record<string, SliceMeta> = Record<never, never>> = {
    handler: Record<string, unknown>;
    serializedSignal: Record<string, SerializedSignal>;
    ownSerializedSignal?: Record<string, SerializedSignal>;
    _FetchType: FetchType;
    _SliceMetaObj: SliceMetaObj;
};

export type FetchSignalInput = DatabaseSignal | FetchProxySignalInput | ServiceSignal;

export type FetchTypeOfSignal<Signal extends FetchSignalInput> = Signal extends {
    _FetchType: infer FetchType;
} ? FetchType : Signal extends {
    endpoint: infer EndpCls extends EndpointCls;
    slice: infer SlceCls extends SliceCls;
} ? GetFetchTypeFromEndpoint<EndpCls, SlceCls> & GetFetchTypeFromSlice<SlceCls> : Signal extends {
    endpoint: infer EndpCls extends EndpointCls;
} ? GetFetchTypeFromEndpoint<EndpCls> : unknown;

export type GetFetchTypeFromEndpoint<EndpCls extends EndpointCls, SlceCls extends SliceCls | never = never, _EndpointInfoObj extends {
    [key: string]: EndpointInfo;
} = EndpCls[typeof ENDPOINT_META]> = PrimaryFetchType<_EndpointInfoObj, SlceCls> & PubsubFetchType<_EndpointInfoObj, SlceCls> & MessageListenFetchType<_EndpointInfoObj, SlceCls>;

export type GetFetchTypeFromSlice<SlceCls extends SliceCls> = SlceCls["srv"]["cnst"] extends ConstantModel ? SlceCls["srv"]["db"] extends DatabaseModel ? SliceListFetch<SlceCls> & SliceInsightFetch<SlceCls> & SliceInitFetch<SlceCls> & SliceGetInitFetch<SlceCls> & RawBaseSliceFetchType<_RefName<SlceCls>, _Input<SlceCls>, _Full<SlceCls>, _Light<SlceCls>, _Cap<SlceCls>, _PurifiedInput<SlceCls>> & AppliedBaseSliceFetchType<_RefName<SlceCls>, _Input<SlceCls>, _Full<SlceCls>, _Cap<SlceCls>, _PurifiedInput<SlceCls>> : never : never;

export type GetSliceMetaObjFromDatabaseSignals<Signals extends readonly unknown[], Acc extends Record<string, SliceMeta> = Record<never, never>> = Signals extends readonly [
    infer First,
    ...infer Rest
] ? GetSliceMetaObjFromDatabaseSignals<Rest, Acc & GetSliceMetaObjFromSignal<First>> : Acc;

export declare class HttpClient {
    readonly baseUrl: string;
    constructor(baseUrl: string, options?: HttpClientOptions);
    setErrorConstructor(ErrorCls?: ErrorConstructor): void;
    setTimeout(timeout?: false | number): void;
    get timeout(): false | number | undefined;
    setRetry(retry: RetryPolicy | false): void;
    get retry(): RetryPolicy | false;
    get<Returns = unknown>(url: string, options?: FetchOptions): Promise<Returns>;
    send<Returns = unknown>(method: HttpMutationMethod, url: string, data: FormData | Record<string, unknown>, options?: FetchOptions): Promise<Returns>;
    put<Returns = unknown>(url: string, data: FormData | Record<string, unknown>, options?: FetchOptions): Promise<Returns>;
    post<Returns = unknown>(url: string, data: FormData | Record<string, unknown>, options?: FetchOptions): Promise<Returns>;
    delete<Returns = unknown>(url: string, options?: FetchOptions): Promise<Returns>;
    abortError(signal: AbortSignal): unknown;
    static abortErrorOf(signal: AbortSignal, ErrorCls?: ErrorConstructor): unknown;
    static retryWait(error: unknown, attempt: number, { attempts, ...backoff }: RetryPolicy): null | number;
    static makePath(key: string, paramArgs: SerializedArg[], prefix?: string): string;
    static makeUrl(path: string, searchArgs: SerializedArg[], argMap: Map<string, unknown>): string;
    static makeBody(bodyArgs: SerializedArg[], uploadArgs: SerializedArg[], argMap: Map<string, unknown>): FormData | {
        [k: string]: unknown;
    };
}

export interface HttpClientOptions {
    headers?: Record<string, string>;
    timeout?: false | number;
    ErrorCls?: ErrorConstructor;
}

export type InitHandle<RefName extends string, Suffix extends string, Light, Insight, Args, Filter extends FilterInstance> = FetchHandleOf<InitReturn<RefName, Suffix, Light, Insight, Args, Filter>, InitHandleShape<RefName, Capitalize<Suffix>, ServerInit<RefName, Light, Insight, Args, Filter>, Light extends {
    id: string;
} ? Light : {
    id: string;
}, Insight>>;

export type InitReturn<RefName extends string, Suffix extends string, Light, Insight, Args, Filter extends FilterInstance> = InitReturnShape<RefName, Capitalize<Suffix>, ServerInit<RefName, Light, Insight, Args, Filter>, Light extends {
    id: string;
} ? Light : {
    id: string;
}, Insight>;

export type MergeAllFetchTypes<Signals extends readonly FetchSignalInput[]> = MergeProxyFetchTypes<Signals> extends infer ProxyFetch ? MergeDirectFetchTypes<Signals> extends infer DirectFetch ? Omit<ProxyFetch, keyof DirectFetch> & DirectFetch : never : never;

export interface QuerySetting {
    queryKey: string;
    args?: (() => unknown[]) | unknown[];
    queryArgs?: (() => unknown[]) | unknown[];
}

/** @internal */
export declare class RenderScope {
    static run<T>(render: () => T): T;
    static active(): boolean;
}

export interface RequestQueryRecord {
    key: string;
    args: Record<string, unknown>;
    returns: {
        refName: string;
        modelType?: string;
        arrDepth?: number;
        nullable?: boolean;
    };
    value: Promise<unknown>;
}

export interface RequestStorage {
    run<T>(store: AkanRequestStore | Request, callback: () => T): T;
    getStore(): AkanRequestStore | undefined;
}

export interface RestoredError extends Error {
    error?: string;
    statusCode?: number;
    code?: string;
    data?: unknown;
    details?: unknown;
    path?: string;
    timestamp?: string;
    toJSON?: () => ErrorResponsePayload;
}

export type ServerEdit<RefName extends string, Model> = {
    refName: RefName;
} & {
    [K in `${RefName}Obj`]: GetStateObject<Model>;
} & {
    [K in `${RefName}ViewAt`]: Date;
};

export type ServerInit<RefName extends string, Light, Insight = any, QueryArgs = any, Filter extends FilterInstance = any> = ServerInitShape<RefName, QueryArgs, Capitalize<RefName>, GetStateObject<Light>, GetStateObject<Insight>, ExtractSort<Filter>>;

export type ServerView<RefName extends string, Model> = {
    refName: RefName;
} & {
    [K in `${RefName}Obj`]: GetStateObject<Model>;
} & {
    [K in `${RefName}ViewAt`]: Date;
};

export declare class SessionCookie {
    static claimsKey(): string;
    static claimsOf(jwt: string): string;
    static issue(jwt: string, { maxAge }?: SessionCookieIssueOption): string[];
    static expire(): string[];
}

export type SliceMeta<Sort = unknown> = {
    refName: string;
    sliceName: string;
    argLength: number;
    _Sort?: Sort;
};

export declare class StreamedRead {
    static mark(reason: unknown): void;
    static is(reason: unknown): boolean;
}

export type ViewHandle<RefName extends string, Full> = FetchHandleOf<ViewReturn<RefName, Full>, {
    [K in RefName]: Promise<Full>;
} & {
    [K in `${RefName}View`]: Promise<ServerView<RefName, Full>>;
}>;

export type ViewReturn<RefName extends string, Full> = {
    [K in RefName]: Full;
} & {
    [K in `${RefName}View`]: ServerView<RefName, Full>;
};

export declare class WsClient {
    static makeRoomId(key: string, args: unknown[]): string;
    static readonly stableMs = 5000;
    static renewTimeoutMs: number;
    static readonly defaultOutboxLimit = 100;
    readonly logger: Logger;
    readonly url: string;
    connected: boolean;
    constructor(url: string, ErrorCls?: ErrorConstructor | undefined);
    setErrorConstructor(ErrorCls?: ErrorConstructor): void;
    configure(options: WsClientOptions): this;
    get state(): WsClientState;
    setJwt(jwt: null | string): void;
    connectOnUse(): void;
    connect(): void;
    destroy(): void;
    on<Data = unknown>(key: string, callback: (data: Data) => void): this;
    once<Data = unknown>(key: string, callback: (data: Data) => void): this;
    off<Data = unknown>(key: string, callback: (data: Data) => void): this;
    removeAllListeners(key: string): this;
    hasListeners(key: string): boolean;
    emit(key: string, data: WsRequestPayload): this;
    subscribe(option: RoomSubscription): this;
    unsubscribe(option: RoomSubscription): void;
}

export interface WsClientOptions {
    reconnect?: WsClientReconnectOptions | false;
    headers?: Record<string, string>;
    tls?: {
        rejectUnauthorized?: boolean;
        ca?: string | string[];
    };
    onStateChange?: (state: WsClientState) => void;
    onRevoked?: (roomId: string) => void;
    onError?: (error: unknown, key?: string) => void;
    onCredentialExpired?: () => unknown;
    outboxLimit?: number;
}

export interface WsClientReconnectOptions extends BackoffPolicy {
    maxAttempts?: number;
}

export type WsClientState = "closed" | "connecting" | "gaveUp" | "open";

export declare const agentTurnConstant: import("akanjs/constant").ScalarConstantModel<"agentTurn", AgentTurn, import("akanjs/constant").DefaultOf<AgentTurn>, {
    text: string;
    toolCalls: unknown[];
    stop: NonNullable<"end" | "length" | "toolUse">;
} & {}, {
    text: string;
    toolCalls: unknown[];
    stop: "end" | "length" | "toolUse";
} & {}>;

/** @internal */
export declare function cacheTag(...tags: string[]): AkanRequestPolicy | undefined;

export declare function claimRequestQuery<T>(key: string, factory: () => Promise<T>): {
    value: Promise<T>;
    owned: boolean;
};

export declare function cookieJar(options?: {
    trackDynamic?: boolean;
}): CookieJar;

export declare function cookies(options?: {
    trackDynamic?: boolean;
}): Map<string, CookieEntry>;

export declare function createRequestStore(request: Request, policy?: Partial<Omit<AkanRequestPolicy, "tags">>): AkanRequestStore;

export declare const getDefaultAccount: () => Account;

export declare function getRequest(options?: {
    trackDynamic?: boolean;
}): Request | undefined;

export declare function getRequestDynamicUsage(): AkanDynamicUsage | undefined;

export declare function getRequestFrameState<FrameState = unknown>(): FrameState | undefined;

export declare function getRequestPolicy(): AkanRequestPolicy | undefined;

export declare function getRequestStore(): AkanRequestStore | undefined;

export declare function getRequestTheme(): AkanTheme | undefined;

export declare function headers(options?: {
    trackDynamic?: boolean;
}): Map<string, string>;

export declare function memoizeRequestQuery<T>(key: string, factory: () => Promise<T>): Promise<T>;

/** @deprecated */
export declare function parseCookieHeader(cookieHeader: string): Map<string, CookieEntry>;

export declare function recordRequestQuery(record: RequestQueryRecord): void;

export declare const requestStorage: RequestStorage | null;

export declare const restoreRemoteError: (body: unknown, fallbackStatusCode: number, ErrorCls?: ErrorConstructor) => RestoredError;

export declare function setRequestFrameState(frameState: unknown): void;

export declare function setRequestTheme(theme: AkanTheme | undefined): void;

export declare function untrackedCookieJar(): CookieJar;

export declare function untrackedCookies(): Map<string, CookieEntry>;

export declare function untrackedHeaders(): Map<string, string>;

export declare function untrackedRequest(): Request | undefined;

export declare function updateRequestPolicy(patch: Partial<Omit<AkanRequestPolicy, "tags">> & {
    tags?: Iterable<string>;
}): AkanRequestPolicy | undefined;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
declare const AgentStop_base: import("akanjs/base").EnumInstance<"agentStop", "end" | "length" | "toolUse">;

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

type AppliedBaseSliceFetchType<RefName extends string, Input, Full, _CapitalizedRefName extends string = Capitalize<RefName>, _PurifiedInput = PurifiedModel<Input>> = {
    [K in `view${_CapitalizedRefName}`]: (id: string, option?: FetchPolicy) => ViewHandle<RefName, Full>;
} & {
    [K in `get${_CapitalizedRefName}View`]: (id: string, option?: FetchPolicy) => Promise<ServerView<RefName, Full>>;
} & {
    [K in `edit${_CapitalizedRefName}`]: (id: string, option?: FetchPolicy) => EditHandle<RefName, Full>;
} & {
    [K in `get${_CapitalizedRefName}Edit`]: (id: string, option?: FetchPolicy) => Promise<ServerEdit<RefName, Full>>;
} & {
    [K in `add${_CapitalizedRefName}Files`]: (fileList: FileList | File[], parentId?: string, option?: FetchPolicy) => Promise<ProtoFile[]>;
} & {
    [K in `merge${_CapitalizedRefName}`]: (modelOrId: Full | string, data: Partial<_PurifiedInput>, option?: FetchPolicy) => Promise<Full>;
};

type ClientSignalMap<SigType extends {
    fetch: any;
}> = {
    [K in keyof SigType as SigType[K] extends DatabaseSignal<any, any, any, any> ? K : never]: SigType[K] extends DatabaseSignal<any, any, infer SlceCls, any> ? ClientSignal<SlceCls["baseName"], SlceCls, SlceCls["srv"]["cnst"]> : never;
};

type EndpInfoReturns<E, SlceCls extends SliceCls | never> = OrNull<EndpointClientReturns<E, SlceCls>, EndpInfoNullable<E>>;

type EndpointClientReturns<E, SlceCls extends SliceCls | never> = [
    SlceCls
] extends [
    never
] ? EndpInfoClientReturns<E> : ExtendedEndpointReturn<EndpInfoClientReturns<E>, SlceCnstFull<SlceCls>, SlceCnstLight<SlceCls>, SlceCnstInsight<SlceCls>>;

type ExtendedEndpointReturn<ClientReturns, Full, Light, Insight> = unknown extends ClientReturns ? ClientReturns : ClientReturns extends (infer R)[] ? ExtendedEndpointReturn<R, Full, Light, Insight>[] : Full extends ClientReturns ? Full : Light extends ClientReturns ? Light : Insight extends ClientReturns ? Insight : ClientReturns;

type FetchHandler = (...args: unknown[]) => PromiseOrObject<unknown>;

type FetchInitOption<Input, Filter extends FilterInstance> = FetchPolicy & FetchInitForm<Input, Filter>;

type FetchKeysOfProxySignal<Signal> = Signal extends {
    _FetchType: infer FetchType;
} ? keyof FetchType : never;

type FetchKeysOfProxySignals<Signals extends readonly FetchSignalInput[]> = FetchKeysOfProxySignal<Signals[number]>;

interface FetchOptions extends Pick<HttpClientOptions, "headers" | "timeout"> {
    baseUrl?: string;
    retry?: RetryPolicy | false;
    idempotencyKey?: string;
    signal?: AbortSignal;
}

type GetSliceMetaObjFromSignal<Signal> = Signal extends {
    _SliceMetaObj: infer SliceMetaObj extends Record<string, SliceMeta>;
} ? SliceMetaObj : Signal extends DatabaseSignal ? {
    [K in `${Signal["slice"]["baseName"]}${Capitalize<keyof Signal["slice"][typeof SLICE_META] & string>}`]: SliceMeta<SlceDbSort<Signal["slice"]>>;
} : Record<never, never>;

type InitHandleShape<RefName extends string, CapSuffix extends string, Init, ListItem extends {
    id: string;
}, Insight> = {
    [K in `${RefName}Init${CapSuffix}`]: Promise<Init>;
} & {
    [K in `${RefName}List${CapSuffix}`]: Promise<DataList<ListItem>>;
} & {
    [K in `${RefName}Insight${CapSuffix}`]: Promise<Insight>;
};

type InitReturnShape<RefName extends string, CapSuffix extends string, Init, ListItem extends {
    id: string;
}, Insight> = {
    [K in `${RefName}Init${CapSuffix}`]: Init;
} & {
    [K in `${RefName}List${CapSuffix}`]: DataList<ListItem>;
} & {
    [K in `${RefName}Insight${CapSuffix}`]: Insight;
};

type LastProxyFetchValue<Signals extends readonly FetchSignalInput[], Key extends PropertyKey, Current = never> = Signals extends readonly [
    infer First extends FetchSignalInput,
    ...infer Rest extends readonly FetchSignalInput[]
] ? First extends {
    _FetchType: infer FetchType;
} ? Key extends keyof FetchType ? LastProxyFetchValue<Rest, Key, FetchType[Key]> : LastProxyFetchValue<Rest, Key, Current> : LastProxyFetchValue<Rest, Key, Current> : Current;

type MergeDirectFetchTypes<Signals extends readonly FetchSignalInput[], Acc = Record<never, never>> = Signals extends readonly [
    infer First extends FetchSignalInput,
    ...infer Rest extends readonly FetchSignalInput[]
] ? First extends {
    _FetchType: unknown;
} ? MergeDirectFetchTypes<Rest, Acc> : MergeDirectFetchTypes<Rest, Acc & FetchTypeOfSignal<First>> : Acc;

type MergeProxyFetchTypes<Signals extends readonly FetchSignalInput[]> = [
    FetchKeysOfProxySignals<Signals>
] extends [
    never
] ? Record<never, never> : {
    [Key in FetchKeysOfProxySignals<Signals>]: LastProxyFetchValue<Signals, Key>;
};

type MessageEmitFn<E> = (...args: [
    ...EndpInfoArgs<E>,
    fetchPolicy?: FetchPolicy
]) => void;

type MessageListenFetchType<EInfoObj extends {
    [key: string]: EndpointInfo;
}, SlceCls extends SliceCls | never> = {
    [K in keyof EInfoObj as EndpInfoReqType<EInfoObj[K]> extends "message" ? K extends string ? `listen${Capitalize<K>}` : never : never]: MessageListenFn<EInfoObj[K], SlceCls>;
};

type MessageListenFn<E, SlceCls extends SliceCls | never> = (handleEvent: (data: EndpInfoReturns<E, SlceCls>) => PromiseOrObject<void>, options?: FetchPolicy) => () => void;

type OrNull<T, Nullable> = Nullable extends true ? T | null : T;

type PrimaryFetchFn<E, SlceCls extends SliceCls | never> = EndpInfoReqType<E> extends "mutation" | "query" ? QueryOrMutationFetchFn<E, SlceCls> : EndpInfoReqType<E> extends "prompt" ? PromptFetchFn<E> : EndpInfoReqType<E> extends "message" ? MessageEmitFn<E> : never;

type PrimaryFetchType<EInfoObj extends {
    [key: string]: EndpointInfo;
}, SlceCls extends SliceCls | never> = {
    [K in keyof EInfoObj as EndpInfoReqType<EInfoObj[K]> extends "message" | "mutation" | "prompt" | "query" ? K : never]: PrimaryFetchFn<EInfoObj[K], SlceCls>;
};

type PromptFetchFn<E> = (...args: [
    ...EndpInfoArgs<E>,
    fetchPolicy?: FetchPolicy
]) => Promise<PromptMessage[]>;

type PubsubFetchType<EInfoObj extends {
    [key: string]: EndpointInfo;
}, SlceCls extends SliceCls | never> = {
    [K in keyof EInfoObj as EndpInfoReqType<EInfoObj[K]> extends "pubsub" ? K extends string ? `subscribe${Capitalize<K>}` : never : never]: PubsubSubscribeFn<EInfoObj[K], SlceCls>;
};

type PubsubSubscribeFn<E, SlceCls extends SliceCls | never> = (...args: [
    ...EndpInfoArgs<E>,
    handleEvent: (data: EndpInfoReturns<E, SlceCls>) => PromiseOrObject<void>,
    options?: FetchPolicy
]) => () => void;

type QueryOrMutationFetchFn<E, SlceCls extends SliceCls | never> = (...args: [
    ...EndpInfoArgs<E>,
    fetchPolicy?: FetchPolicy
]) => Promise<EndpInfoReturns<E, SlceCls>>;

type RawBaseSliceFetchType<RefName extends string, Input, Full, Light, _CapitalizedRefName extends string = Capitalize<RefName>, _PurifiedInput = PurifiedModel<Input>> = {
    [K in RefName]: (id: string, fetchPolicy?: FetchPolicy) => Promise<Full>;
} & {
    [K in `light${_CapitalizedRefName}`]: (id: string, fetchPolicy?: FetchPolicy) => Promise<Light>;
} & {
    [K in `create${_CapitalizedRefName}`]: (input: _PurifiedInput, fetchPolicy?: FetchPolicy) => Promise<Full>;
} & {
    [K in `update${_CapitalizedRefName}`]: (id: string, input: _PurifiedInput, fetchPolicy?: FetchPolicy) => Promise<Full>;
} & {
    [K in `remove${_CapitalizedRefName}`]: (id: string, fetchPolicy?: FetchPolicy) => Promise<Full>;
};

interface RoomSubscription {
    key: string;
    data: unknown[];
    handleEvent: (data: unknown) => void;
    handleResync?: () => void;
}

type ServerInitShape<RefName extends string, QueryArgs, CapRefName extends string, LightObj, InsightObj, Sort> = SliceMeta & {
    [K in `${RefName}ObjList`]: LightObj[];
} & {
    [K in `${RefName}ObjInsight`]: InsightObj | null;
} & {
    [K in `pageOf${CapRefName}`]: number;
} & {
    [K in `lastPageOf${CapRefName}`]: number;
} & {
    [K in `limitOf${CapRefName}`]: number;
} & {
    [K in `hasMoreOf${CapRefName}`]: boolean;
} & {
    [K in `queryArgsOf${CapRefName}`]: QueryArgs;
} & {
    [K in `sortOf${CapRefName}`]: Sort;
} & {
    [K in `${RefName}InitAt`]: Date;
};

interface SessionCookieIssueOption {
    maxAge?: number;
}

type SliceGetInitFetch<S extends SliceCls> = {
    [Suffix in keyof _SliceMap<S> as Suffix extends string ? `get${_Cap<S>}Init${Capitalize<Suffix>}` : never]: (...args: [
        ...SliceInfoArgs<_SliceMap<S>[Suffix]>,
        option?: SliceInitOption<S>
    ]) => Promise<SliceServerInit<S, Suffix>>;
};

type SliceInit<S extends SliceCls, Suffix extends keyof _SliceMap<S>> = InitHandle<_RefName<S>, Suffix & string, _Light<S>, _Insight<S>, SliceInfoArgs<_SliceMap<S>[Suffix]>, _Filter<S>>;

type SliceInitFetch<S extends SliceCls> = {
    [Suffix in keyof _SliceMap<S> as Suffix extends string ? `init${_Cap<S>}${Capitalize<Suffix>}` : never]: (...args: [
        ...SliceInfoArgs<_SliceMap<S>[Suffix]>,
        option?: SliceInitOption<S>
    ]) => SliceInit<S, Suffix>;
};

type SliceInitOption<S extends SliceCls> = FetchInitOption<_Input<S>, _Filter<S>>;

type SliceInsightFetch<S extends SliceCls> = {
    [Suffix in keyof _SliceMap<S> as Suffix extends string ? `${_RefName<S>}Insight${Capitalize<Suffix>}` : never]: (...args: [
        ...SliceInfoArgs<_SliceMap<S>[Suffix]>,
        fetchPolicy?: FetchPolicy
    ]) => Promise<_Insight<S>>;
};

type SliceListFetch<S extends SliceCls> = {
    [Suffix in keyof _SliceMap<S> as Suffix extends string ? `${_RefName<S>}List${Capitalize<Suffix>}` : never]: (...args: [
        ...SliceInfoArgs<_SliceMap<S>[Suffix]>,
        skip?: null | number,
        limit?: null | number,
        sort?: _Sort<S> | null,
        fetchPolicy?: FetchPolicy
    ]) => Promise<_Light<S>[]>;
};

type SliceServerInit<S extends SliceCls, Suffix extends keyof _SliceMap<S>> = ServerInit<_RefName<S>, _Light<S>, _Insight<S>, SliceInfoArgs<_SliceMap<S>[Suffix]>, _Filter<S>>;

type UnknownRecord = Record<string, unknown>;

type WsRequestPayload = unknown | unknown[];

type _Cap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;

type _Filter<S extends SliceCls> = SlceDbFilter<S>;

type _Full<S extends SliceCls> = SlceCnstFull<S>;

type _Input<S extends SliceCls> = SlceCnstInput<S>;

type _Insight<S extends SliceCls> = SlceCnstInsight<S>;

type _Light<S extends SliceCls> = SlceCnstLight<S>;

type _PurifiedInput<S extends SliceCls> = SlceCnstPurifiedInput<S>;

type _RefName<S extends SliceCls> = SlceCnstRefName<S>;

type _SliceMap<S extends SliceCls> = S[typeof SLICE_META];

type _Sort<S extends SliceCls> = SlceDbSort<S>;
```
