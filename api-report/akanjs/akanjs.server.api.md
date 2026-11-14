# `akanjs/server`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AdaptorOverride {
    role: AdaptorCls;
    adaptor: AdaptorCls;
}

export declare class AkanApp {
    readonly logger: Logger;
    constructor(serverPathOrOptions?: AkanAppOptions | string, options?: AkanAppOptions);
    start(): Promise<void>;
    stop(signal?: string): Promise<void>;
}

export interface AkanAppOptions {
    replica?: number | string;
    serverPath?: string;
    runtimeDir?: string;
    port?: number;
    wsBasePort?: number;
    openapi?: boolean;
    prefix?: string;
    websocketPrefix?: string;
    modules?: string[];
    disableModules?: string[];
    disableLibs?: string[];
    solo?: boolean;
}

export interface AkanConsoleContext extends Record<string, unknown> {
    server: AkanServer;
    env: AkanServer["env"];
    get: AkanServer["get"];
    service: <T = Service>(refName: string) => T;
    signal: <T = ServerSignal>(refName: string) => T;
    adaptor: <T = Adaptor>(refName: string) => T;
    methods: (value: unknown) => string[];
    debug: () => ReturnType<AkanServer["inspectConsole"]>;
}

export interface AkanConsoleOptions {
    prompt?: string;
    globals?: Record<string, unknown>;
    input?: typeof process.stdin;
    output?: typeof process.stdout;
    runtimeDir?: string;
}

export interface AkanImageConfig {
    deviceSizes: number[];
    imageSizes: number[];
    formats: AkanImageFormat[];
    qualities: number[];
    minimumCacheTTL: number;
    remotePatterns: AkanImagePattern[];
    localPatterns: Pick<AkanImagePattern, "pathname" | "search">[];
    dangerouslyAllowSVG: boolean;
    maximumRedirects: number;
    fetchTimeoutMs: number;
    maxRemoteBytes: number;
    maxConcurrency: number;
    maxCacheBytes?: number;
    maxQueue?: number;
    maxInputPixels?: number;
    dangerouslyAllowLocalIP?: boolean;
}

export type AkanImageFormat = "image/avif" | "image/webp";

export interface AkanImagePattern {
    protocol?: "http" | "https";
    hostname?: string;
    port?: string;
    pathname?: string;
    search?: string;
}

export declare class AkanLib {
    readonly name: string;
    readonly database: DatabaseModule[];
    readonly service: ServiceModule[];
    readonly scalar: ScalarModule[];
    readonly option: AkanOption<any>;
    constructor(name: string, props: AkanLibProps);
}

export interface AkanLibProps {
    databases: DatabaseModule[];
    services: ServiceModule[];
    scalars: ScalarModule[];
    option: AkanOption<any>;
}

export declare class AkanOption<Env extends BackendEnv = BackendEnv> {
    use(fnOrObject: ((env: Env) => Record<string, PromiseOrObject<unknown>>) | Record<string, PromiseOrObject<unknown>>): this;
    applyMiddleware(...middlewares: MiddlewareCls[]): this;
    applyAdaptor<T extends Adaptor>(role: AdaptorCls<T>, adaptor: AdaptorCls<T>): this;
    applyWebProxy(...proxies: WebProxyRegistration[]): this;
    setMcp(mcpOrFn?: ((env: Env) => McpServerOption | boolean) | McpServerOption | boolean): this;
    setAgentAccess(guards: GuardCls | GuardCls[] | null): this;
    setAgentRequestPolicy(policy: AgentRequestPolicy | null): this;
    setAgentUsage(hook: AgentUsageHook | null): this;
    setAgentQuota(hook: AgentQuotaHook | null): this;
    setAgentAccountResolver(resolver: AgentAccountResolver | null): this;
    setCrossSite(crossSite: CrossSiteOption): this;
    setRateLimit(settingOrFn: ((env: Env) => RateLimitSetting | false) | RateLimitSetting | false): this;
    setLiveRoomLimit(setting: LiveRoomLimitSetting): this;
    setSessionRefresh(hook: SessionRefreshHook | null): this;
    setLlm<Option extends LlmOption>(llmOrFn: ((env: Env) => Option) | Option): this;
    transformEnv(fn: (env: Env) => Env): this;
    resolveEnv(env: Env): Env;
    getUses(env: Env): [
        string,
        PromiseOrObject<unknown>
    ][];
    getMiddlewares(): MiddlewareCls[];
    getAdaptorOverrides(): AdaptorOverride[];
    getWebProxies(): WebProxyRegistration[];
    getMcp(env: Env): McpServerOption | boolean | undefined;
    getAgentAccess(): GuardCls | GuardCls[] | null | undefined;
    getAgentRequestPolicy(): AgentRequestPolicy | null | undefined;
    getAgentUsage(): AgentUsageHook | null | undefined;
    getAgentQuota(): AgentQuotaHook | null | undefined;
    getAgentAccountResolver(): AgentAccountResolver | null | undefined;
    getCrossSite(): CrossSiteOption | undefined;
    getRateLimit(env: Env): RateLimitSetting | false | undefined;
    getLiveRoomLimit(): LiveRoomLimitSetting | undefined;
    getSessionRefresh(): SessionRefreshHook | null | undefined;
    getLlm(env: Env): LlmOption;
}

export declare class AkanResponse {
    static next(init?: WebProxyNextInit): WebProxyResult;
    static redirect(url: URL | string, status?: number): Response;
    static rewrite(url: URL | string, init?: WebProxyNextInit): WebProxyResult;
}

export declare class AkanServer {
    status: "initialized" | "initializing" | "running" | "starting" | "stopped" | "stopping";
    readonly logger: Logger;
    readonly name: string;
    readonly libs: AkanLib[];
    readonly env: BackendEnv;
    prefix: string;
    websocketPrefix: string;
    openapi: boolean;
    mcp: boolean;
    mcpReadOnly: boolean;
    mcpAuth: McpAuthOption;
    mcpOption: Omit<McpServerOption, "auth" | "enabled" | "readOnly">;
    serverMode: "all" | "batch" | "federation";
    web: AkanWebConfig;
    modules: string[];
    disableModules: string[];
    disableLibs: string[];
    shutdownTimeoutMs: number;
    constructor(name?: string, env?: BackendEnv, serverMode?: "all" | "batch" | "federation", ...libsOrOptions: (AkanLib | AkanServerOptions)[]);
    setPrefix(prefix: string): this;
    setWebsocketPrefix(websocketPrefix: string): this;
    setOpenApi(openapi?: boolean): this;
    setWeb(web?: AkanWebOption): this;
    setMcp(mcp?: McpServerOption | boolean): this;
    get mcpRouter(): McpRouter | null;
    setDatabaseConfig(database: DatabaseConfig): this;
    setSolidConfig(solid: SolidConfig): this;
    setShutdownTimeout(timeoutMs: number): this;
    get<Srv extends ServiceCls>(cls: Srv): InstanceType<Srv>;
    get<Sig extends ServerSignalCls>(cls: Sig): InstanceType<Sig>;
    get<Adp extends AdaptorCls>(cls: Adp): InstanceType<Adp>;
    getService<T = Service>(refName: string): T;
    getSignal<T = ServerSignal>(refName: string): T;
    getAdaptor<T = Adaptor>(refName: string): T;
    inspectConsole(): AkanServerConsoleInfo;
    init(option?: {
        routes?: boolean;
        web?: AkanWebOption;
    }): Promise<this>;
    listen(): Promise<this>;
    start({ listen, web, schedules }?: {
        listen?: boolean;
        web?: AkanWebOption;
        schedules?: boolean;
    }): Promise<this>;
    stop(): Promise<void>;
}

export interface AkanServerConsoleInfo {
    name: string;
    status: AkanServer["status"];
    serverMode: AkanServer["serverMode"];
    env: Pick<BaseEnv, "appName" | "databaseMode" | "environment" | "operationMode" | "repoName" | "serveDomain">;
    services: string[];
    signals: string[];
    adaptors: string[];
    uses: string[];
    serviceStages: string[][];
    adaptorStages: string[][];
}

export interface AkanServerOptions {
    openapi?: boolean;
    mcp?: McpServerOption | boolean;
    modules?: string[];
    disableModules?: string[];
    disableLibs?: string[];
}

export interface AkanServerProps extends AkanLibProps {
    env?: BackendEnv;
    prefix?: string;
    websocketPrefix?: string;
    openapi?: boolean;
}

export type ArgType = (typeof argTypes)[number];

export type BaseBuildArtifact = {
    rscClientUrl: string;
    rscRuntimeClientManifest?: ClientManifest;
    rscRuntimeSsrManifest?: SsrManifest;
    vendorMap: Record<string, string>;
    pagesBundlePath: string;
    pagesBundleBuildId: number;
    cssAssets: Record<string, CssAsset>;
    dictAssets?: Record<string, DictAsset>;
    domains: string[];
    subRoutes: {
        [key: string]: string[];
    };
    basePaths: string[];
    branches: string[];
    i18n: AkanI18nConfig;
    imageConfig: AkanImageConfig;
    deepLinkAssociations?: MobileDeepLinkAssociation[];
    web?: AkanWebConfig;
};

export interface BuildChangesPayload {
    workspaceRoot: string;
    changes: AkanChangeMap | {
        error: string;
    };
}

export interface BuildFrameworkPayload {
    workspaceRoot: string;
    framework: FrameworkMap | null;
}

export interface BuildGraphPayload {
    workspaceRoot: string;
    graph: AkanGraph;
}

export type BuildPhase = "backend" | "barrel" | "csr" | "css" | "pages" | "route" | "scan" | "ssr";

export interface BuildRouteClientResult {
    manifestDelta: ClientManifest;
    ssrManifestDelta: SsrManifest;
    newEntries: string[];
    discoveredEntries?: string[];
    clientDeps: string[];
    clientDepsByEntry?: Record<string, string[]>;
    seenGeneration?: number;
}

export interface BuildRouteResultPayload {
    manifestDelta: Record<string, {
        id: string;
        chunks: string[];
        name: string;
        async: boolean;
    }>;
    ssrManifestDelta: Record<string, Record<string, {
        id: string;
        chunks: string[];
        name: string;
        async: boolean;
    }>>;
    newEntries: string[];
    discoveredEntries?: string[];
    clientDeps: string[];
    clientDepsByEntry?: Record<string, string[]>;
    routeId?: string;
    generation?: number;
    seenGeneration?: number;
}

export type BuilderControl = {
    type: "builder-shutdown";
    reason: string;
};

export type BuilderCsrReq = {
    type: "build-csr";
    id: number;
    reason: string;
    shell?: boolean;
};

export type BuilderCsrRes = {
    type: "build-csr-res";
    id: number;
    ok: false;
    error: string;
    kind?: BuilderFailureKind;
} | {
    type: "build-csr-res";
    id: number;
    ok: true;
};

export type BuilderEvent = {
    type: "backend-ready";
    pid: number;
} | {
    type: "boot-armed";
} | {
    type: "build-status";
    data: DevBuildStatus;
} | {
    type: "builder-metrics";
    data: BuilderMetrics;
} | {
    type: "builder-ready";
    buildId?: string;
} | {
    type: "csr-updated";
    data: CsrUpdatedPayload;
} | {
    type: "css-updated";
    data: CssPayload;
} | {
    type: "invalidate";
    kinds: ("code" | "config" | "css")[];
    files: string[];
    generation?: number;
    devPlan?: DevChangePlan;
} | {
    type: "pages-updated";
    data: PagesBundlePayload;
} | {
    type: "ssr-updated";
    data: SsrUpdatedPayload;
};

export type BuilderFailureKind = "unavailable";

export type BuilderGraphReq = {
    type: "build-graph";
    id: number;
    changes?: {
        since: null | string;
    };
    framework?: boolean;
};

export type BuilderGraphRes = {
    type: "build-graph-res";
    id: number;
    ok: false;
    error: string;
    kind?: BuilderFailureKind;
} | {
    type: "build-graph-res";
    id: number;
    ok: true;
    data: BuildChangesPayload | BuildFrameworkPayload | BuildGraphPayload;
};

export type BuilderMessage = BuilderControl | BuilderEvent | BuilderRequest | BuilderResponse;

export interface BuilderMetrics {
    rssBytes: number;
    generation: number;
    workCount: number;
}

export type BuilderReq = {
    type: "build-route";
    id: number;
    routeId: string;
    seeds: string[];
    graphSeeds?: string[];
    knownEntries: string[];
    generation?: number;
};

export type BuilderRequest = BuilderCsrReq | BuilderGraphReq | BuilderReq;

export type BuilderRes = {
    type: "build-route-res";
    id: number;
    ok: false;
    error: string;
    kind?: BuilderFailureKind;
} | {
    type: "build-route-res";
    id: number;
    ok: true;
    data: BuildRouteResultPayload;
};

export type BuilderResponse = BuilderCsrRes | BuilderGraphRes | BuilderRes;

export declare class BuilderRpc {
    constructor(handlers?: BuilderRpcEventHandlers);
    buildRoute(routeId: string, { seeds, graphSeeds, knownEntries, generation, }: {
        seeds: string[];
        graphSeeds?: string[];
        knownEntries: Set<string>;
        generation?: number;
    }): Promise<BuildRouteClientResult>;
    buildCsr(reason: string, { shell }?: {
        shell?: boolean;
    }): Promise<void>;
    buildGraph(): Promise<BuildGraphPayload>;
    buildChanges(since: null | string): Promise<BuildChangesPayload>;
    buildFramework(): Promise<BuildFrameworkPayload>;
    static isTimeout(error: unknown): error is BuilderRpcTimeout;
    static isUnavailable(error: unknown): error is BuilderRpcUnavailable;
    dispose(): void;
}

export interface BuilderRpcEventHandlers {
    onInvalidate?: (event: {
        kinds: ("code" | "config" | "css")[];
        files: string[];
        generation?: number;
    }) => void;
    onCssUpdated?: (css: CssPayload) => void;
    onPagesUpdated?: (bundle: PagesBundlePayload) => Promise<void> | void;
    onCsrUpdated?: (update: CsrUpdatedPayload) => void;
    onSsrUpdated?: (update: SsrUpdatedPayload) => void;
    onBuildStatus?: (status: DevBuildStatus) => void;
}

export interface BuilderRpcTimeout extends Error {
    timeoutMs: number;
}

export interface BuilderRpcUnavailable extends Error {
    kind: "unavailable";
}

export type BuilderStateReason = "builder-recycle";

export interface ChangeBatch {
    files: string[];
    kinds: Set<Exclude<ChangeKind, "ignore">>;
    trace?: HmrTrace;
}

export type ChangeKind = "code" | "config" | "css" | "ignore";

export type ClientManifest = Record<string, ClientManifestEntry>;

export interface ClientManifestEntry {
    id: string;
    chunks: string[];
    name: string;
    async?: boolean;
}

export interface ConstantData {
    models: Record<string, ConstantModelNode>;
    scalars: Record<string, ConstantModelView>;
    enums: Record<string, EnumNode>;
    values: Record<string, unknown>;
    primitives: string[];
    relations: RelationEdge[];
}

export type ConstantFieldKind = "hidden" | "property" | "resolve" | "secret";

export interface ConstantFieldNode {
    name: string;
    fieldKind: ConstantFieldKind;
    type: FieldType;
    arrDepth: number;
    nullable: boolean;
    immutable: boolean;
    select: boolean;
    defaultKind: "function" | "none" | "value";
    default?: unknown;
    ref?: string;
    refPath?: string;
    refType?: "child" | "parent" | "relation";
    min?: number;
    max?: number;
    minlength?: number;
    maxlength?: number;
    preset?: string;
    text?: TextFieldRole;
    accumulate?: unknown;
    example?: unknown;
    meta?: Record<string, unknown>;
    hasValidate: boolean;
}

export interface ConstantModelNode {
    refName: string;
    modelNames: Record<ConstantModelViewKey, string>;
    views: Record<ConstantModelViewKey, ConstantModelView>;
    filter?: {
        query: Record<string, FilterArg[]>;
        sort: string[];
    };
}

export interface ConstantModelView {
    modelName: string;
    modelType: ConstantType;
    fields: Record<string, ConstantFieldNode>;
}

export type ConstantModelViewKey = "full" | "input" | "insight" | "light" | "object";

export declare class ConstantSerializer {
    static serialize(): ConstantData;
}

export interface CsrUpdatedPayload {
    generation: number;
    mode: "artifact" | "registry";
    reload: boolean;
    reason?: string;
    patchUrl?: string;
    changedIds?: string[];
    trace?: HmrTrace;
}

export interface CssAsset {
    cssUrl: string;
    cssRelPath: string;
}

export interface CssPayload {
    cssAssets: Record<string, {
        cssUrl: string;
        cssRelPath: string;
    }>;
    cssBase64ByUrl: Record<string, string>;
    generation?: number;
    changedFiles?: string[];
    reason?: BuilderStateReason;
}

export interface DatabaseModule {
    constant: ConstantModel;
    database: DatabaseModel;
    service: ServiceModel;
    signal: DatabaseSignal;
}

export interface DefaultSitemapOptions {
    origin: string;
    basePath?: null | string;
    entries: RouteSeedEntry[];
    i18n: AkanI18nConfig;
}

export interface DepEdge {
    from: string;
    to: string;
    kind: DepEdgeKind;
    prop: string;
    resolvedTo?: string;
    detail?: Record<string, unknown>;
}

export type DepEdgeKind = "database" | "env" | "memory" | "plug" | "service" | "signal" | "use";

export interface DepNode {
    id: string;
    kind: DepNodeKind;
    refName: string;
    className?: string;
    stage?: number;
    enabled?: boolean;
    serviceType?: "database" | "plain";
    cnstRefName?: string;
    role?: string;
}

export type DepNodeKind = "adaptor" | "endpoint" | "env" | "internal" | "middleware" | "serverSignal" | "service" | "slice" | "use" | "webProxy";

export interface DepsData {
    app: {
        name: string;
        status: string;
        serverMode: "all" | "batch" | "federation";
        prefix: string;
        websocketPrefix: string;
        openapi: boolean;
    };
    nodes: DepNode[];
    edges: DepEdge[];
    roles: {
        role: string;
        impl: string;
    }[];
    stages: {
        adaptor: string[][];
        service: string[][];
    };
    env: {
        public: Record<string, string>;
        keys: string[];
    };
    disabledModules: {
        refName: string;
        reason: string;
    }[];
}

export declare class DepsSerializer {
    constructor(context: DepsSerializerContext);
    build(): DepsData;
}

export interface DepsSerializerContext {
    di: DiLifecycle;
    env: BaseEnv;
    name: string;
    status: string;
    serverMode: "all" | "batch" | "federation";
    prefix: string;
    websocketPrefix: string;
    openapi: boolean;
}

export declare class DevBuildRecovery {
    static recovers(previous: DevBuildStatus | undefined, status: DevBuildStatus): boolean;
}

export interface DevBuildStatus {
    generation: number;
    phase: BuildPhase;
    ok: boolean;
    files: string[];
    message?: string;
    scope?: string;
}

export type DevChangeAction = "rebuild-client" | "rebuild-css" | "report-error" | "restart-backend" | "restart-builder" | "restart-dev-host" | "sync-generated";

export interface DevChangePlan {
    generation: number;
    files: string[];
    generatedFiles: string[];
    roles: DevChangeRole[];
    actions: DevChangeAction[];
    reasonByFile: Record<string, string[]>;
}

export type DevChangeRole = "barrel" | "client" | "config" | "css" | "server" | "shared";

export interface DevtoolsApp {
    name: string;
    repoName: string;
    serveDomain: string;
    environment: string;
    operationMode: string;
    serverMode: "all" | "batch" | "federation";
    pid: number;
    replicaIdx: number;
}

export interface DevtoolsEnvelope<Kind extends string, Data> {
    kind: Kind;
    version: 1;
    generatedAt: string;
    app: DevtoolsApp;
    data: Data;
}

export interface DevtoolsIndex {
    version: 1;
    endpoints: {
        kind: string;
        path: string;
    }[];
}

export declare class DevtoolsJson {
    static toSafe(value: unknown, { maxDepth }?: {
        maxDepth?: number;
    }): unknown;
}

export declare class DevtoolsRouter {
    static readonly basePath = "/_akan";
    static readonly logger: Logger;
    static isEnabled(env: BaseEnv): boolean;
    static buildsFrom(webRouter: null | {
        readonly builderRpc: BuilderRpc | null;
    }): Pick<DevtoolsRouterContext, "buildChanges" | "buildFramework" | "buildGraph" | "web">;
    constructor(context: DevtoolsRouterContext);
    createRoutes(): HttpRoutes;
}

export interface DevtoolsRouterContext {
    di: DiLifecycle;
    env: BaseEnv;
    name: string;
    serverMode: "all" | "batch" | "federation";
    prefix: string;
    websocketPrefix: string;
    openapi: boolean;
    web?: boolean;
    getStatus: () => string;
    buildGraph?: () => Promise<BuildGraphPayload | null>;
    buildChanges?: (since: null | string) => Promise<BuildChangesPayload | null>;
    buildFramework?: () => Promise<BuildFrameworkPayload | null>;
}

export interface DictAsset {
    url: string;
    relPath: string;
}

export interface DictionaryData {
    languages: string[];
    modules: Record<string, DictionaryModuleNode>;
    dictionary: RootDictionary;
    keys: string[];
}

export interface DictionaryModuleNode {
    kind: "model" | "scalar" | "service";
    languages: string[];
}

export declare class DocPath {
    static segments(path: string): string[];
    static read(doc: Record<string, unknown>, path: string): DocSlot;
    static hasParent(doc: Record<string, unknown>, path: string): boolean;
    static anchors(doc: Record<string, unknown>, paths: string[]): string[];
    static write(doc: Record<string, unknown>, path: string, value: unknown): void;
    static remove(doc: Record<string, unknown>, path: string): void;
    static same(a: DocSlot, b: DocSlot): boolean;
    static assertDisjoint(paths: string[]): void;
}

export type DocSlot = [
    unknown
] | [
];

export interface EndpointNode {
    type: "message" | "mutation" | "prompt" | "pubsub" | "query";
    args: SerializedArg[];
    returns: SerializedReturns;
    path?: string;
    prefix?: false | string;
    globalPrefix?: false;
    guards?: string[];
    fileUpload?: boolean;
    cache?: number;
    timeout?: number;
}

export interface EnumNode {
    key: string;
    refName: string;
    values: (number | string)[];
}

export type FieldType = {
    kind: "enum";
    refName: string;
    values: (number | string)[];
} | {
    kind: "map";
    value: FieldType;
    valueArrDepth: number;
} | {
    kind: "model";
    refName: string;
    modelType: ConstantType;
    modelName: string;
} | {
    kind: "primitive";
    refName: string;
} | {
    kind: "unknown";
    refName: string;
};

export interface FilterArg {
    name: string;
    type: FieldType;
    arrDepth: number;
    nullable: boolean;
    ref?: string;
    default?: unknown;
}

export interface HmrTrace {
    eventAt?: number;
    flushAt?: number;
    batchAt?: number;
    spawnAt?: number;
    workerStartAt?: number;
    workerAt?: number;
    patchAt?: number;
    sentAt?: number;
    broadcastAt?: number;
}

export declare class HostBasePathWebProxy implements WebProxy {
    static readonly refName = "HostBasePathWebProxy";
    use(request: Bun.BunRequest): Response | import("./types").WebProxyResult | undefined;
}

export type HttpRoutes = Bun.Serve.Options<unknown>["routes"];

export interface InternalNode {
    key: string;
    type: InternalType;
    enabled: boolean;
    lock?: boolean;
    serverMode?: "all" | "batch" | "federation";
    operationMode?: string[];
    schedule?: {
        cron?: string;
        everyMs?: number;
    };
    args: SerializedArg[];
    internalArgs: string[];
    returns?: SerializedReturns;
    scheduledHere: boolean;
    skipReason?: string;
}

export type InternalType = "cron" | "destroy" | "init" | "interval" | "process" | "resolveField" | "timeout";

export interface InvalidateClientEntriesOptions {
    routePredicate: (routeId: string) => boolean;
    staleEntries: Iterable<string>;
    files?: Iterable<string>;
    batch?: number;
}

export interface LocalFile {
    filename: string;
    mimetype: string;
    encoding: string;
    localPath: string;
}

export type LocalPublish = (roomId: string, data: Uint8Array | null | object | object[]) => void;

export declare class LocaleWebProxy implements WebProxy {
    static readonly refName = "LocaleWebProxy";
    use(request: Bun.BunRequest): Response | import("./types").WebProxyResult;
}

export declare class MachineAccount implements Middleware {
    static readonly refName = "MachineAccount";
    use(): (context: SignalContext, next: () => Promise<unknown>) => Promise<unknown>;
}

export interface MachineProof {
    identity: MachineIdentity;
    expiresAt?: number;
}

export declare class MachineToken {
    static readonly type = "akan-machine+jwt";
    static audience(): string;
    static keyEpoch(): number;
    static canIssue(): boolean;
    static canVerify(): boolean;
    static publicKey(): KeyObject | null;
    static issue(identity: MachineIdentity, { expiresAt, audience }?: MachineTokenIssueOptions): string;
    static isMachineToken(token: string): boolean;
    static verify(token: string, nowSec?: number): MachineTokenVerdict;
    static fromAuthorization(authorization: null | string | undefined): MachineIdentity | null;
    static proofOf(authorization: null | string | undefined): MachineProof | null;
}

export interface MachineTokenIssueOptions {
    expiresAt?: Date | {
        toDate(): Date;
    };
    audience?: string;
}

export type MachineTokenVerdict = {
    ok: false;
    reason: string;
} | {
    ok: true;
    identity: MachineIdentity;
    expiresAt?: number;
};

export interface MatchedRoute {
    entry: RouteSeedEntry;
    params: Record<string, string>;
}

export interface McpServerOption {
    enabled?: boolean;
    readOnly?: boolean;
    excludeSignals?: string[];
    excludeEndpoints?: string[];
    path?: string;
    version?: string;
    instructions?: string;
    allowedOrigins?: string[];
    pageSize?: number;
    language?: string;
    legacyTextBlock?: boolean;
    outputSchema?: "full" | "none" | "shallow";
    auth?: McpAuthOption;
    rateLimit?: McpRateLimitOption | false;
    promptBudget?: number;
    apps?: boolean;
    modern?: boolean;
}

export interface MergedManifest {
    generation: number;
    clientManifest: ClientManifest;
    ssrManifest: SsrManifest;
    knownEntries: Set<string>;
}

export type MigrationAction = (typeof migrationActions)[number];

export interface MigrationApplyResult {
    id: string;
    runId: string;
    planHash: string;
    summary: unknown;
    changes: number;
    problems: string[];
}

export interface MigrationArgs {
    action: MigrationAction;
    target: string;
    params: Record<string, string>;
    expect: null | string;
    actor: null | string;
    items: number | undefined;
    json: boolean;
}

export interface MigrationChange {
    runId: string;
    seq: number;
    table: string;
    id: string;
    op: MigrationChangeOp;
    before: Record<string, DocSlot>;
    after: Record<string, DocSlot>;
}

export declare class MigrationChangeLog {
    readonly runId: string;
    constructor(runId: string, connection: () => AkanSqlClient);
    append(change: Omit<MigrationChange, "runId" | "seq">): Promise<void>;
    static count(connection: AkanSqlClient, runId: string): Promise<number>;
    static page(connection: AkanSqlClient, runId: string, below: null | number, limit: number): Promise<MigrationChange[]>;
}

export type MigrationChangeOp = "delete" | "insert" | "update";

export declare class MigrationChanges implements AsyncIterable<MigrationChange> {
    static readonly pageSize = 500;
    readonly skipped: MigrationSkip[];
    reverted: number;
    constructor(page: (below: null | number, limit: number) => Promise<MigrationChange[]>, table: (name: string) => MigrationTable, from?: null | number);
    [Symbol.asyncIterator](): AsyncGenerator<MigrationChange, void, unknown>;
    get reached(): null | number;
    revert(change: MigrationChange): Promise<MigrationRevertOutcome>;
    skip(change: MigrationChange, reason: string): void;
    revertAll(): Promise<void>;
}

export declare class MigrationCommand {
    static usageOf(invokedAs?: string): string;
    static jsonOf(argv: string[]): boolean;
    static parse(argv: string[], invokedAs?: string): MigrationArgs;
    static run(runner: MigrationRunner, args: MigrationArgs): Promise<MigrationCommandResult>;
    static failure(action: MigrationAction | null, error: unknown): MigrationCommandResult;
    static exitCode(result: MigrationCommandResult): 0 | 1 | 2 | 3;
    static print(result: MigrationCommandResult, json: boolean): Promise<0 | 1 | 2 | 3>;
    static render(result: MigrationCommandResult, json: boolean): string;
}

export interface MigrationCommandResult {
    ok: boolean;
    action: MigrationAction | null;
    code?: MigrationErrorCode;
    error?: string;
    runId?: null | string;
    [key: string]: unknown;
}

export declare class MigrationContext<Params = Record<string, unknown>> {
    readonly id: string;
    readonly params: Params;
    readonly logger: Logger;
    readonly get: MigrationGet;
    constructor({ id, params, logger, get, scope }: MigrationContextOption<Params>);
    readonly table: (refName: string) => MigrationTable;
    readonly createId: () => string;
    get sql(): AkanSqlClient;
    get dialect(): SqlDialect;
}

export interface MigrationContextOption<Params> {
    id: string;
    params: Params;
    logger: Logger;
    get: MigrationGet;
    scope: MigrationScope;
}

export declare class MigrationDefinition<Params = Record<never, never>, Plan extends MigrationPlan = MigrationPlan> {
    static readonly defaultSettings: MigrationSettings;
    readonly title: string;
    readonly params: MigrationParams;
    settings: MigrationSettings;
    planStage: MigrationStage<Params, Plan> | null;
    applyStage: ((ctx: MigrationContext<Params>, plan: Plan) => PromiseOrObject<void>) | null;
    verifyStage: MigrationStage<Params, string[]> | null;
    rollbackStage: ((ctx: MigrationContext<Params>, changes: MigrationChanges) => PromiseOrObject<void>) | null;
    constructor(title: string);
    static is(value: unknown): value is MigrationDefinition<Record<string, unknown>>;
    param<Name extends string, Type extends ParamFieldType, const Option extends MigrationParamOption<FieldToValue<Type>> = Record<never, never>>(name: Name, type: Type, option?: Option): MigrationDefinition<Params & {
        [K in Name]: MigrationParamValue<Type, Option>;
    }, Plan>;
    plan<NextPlan extends MigrationPlan>(fn: MigrationStage<Params, NextPlan>): MigrationDefinition<Params, NextPlan>;
    apply(fn: (ctx: MigrationContext<Params>, plan: Plan) => PromiseOrObject<void>): this;
    verify(fn: MigrationStage<Params, string[]>): this;
    rollback(fn: (ctx: MigrationContext<Params>, changes: MigrationChanges) => PromiseOrObject<void>): this;
    config(settings: Partial<MigrationSettings>): this;
}

export interface MigrationEntry {
    id: string;
    checksum: string;
    load: () => Promise<{
        default?: unknown;
    }>;
}

export declare class MigrationError extends AkanError<MigrationErrorCode> {
    runId: null | string;
    constructor(code: MigrationErrorCode, message: string, options?: {
        cause?: unknown;
    });
    static codeOf(error: unknown): MigrationErrorCode;
    static messageOf(error: unknown): string;
    static remaining(problemNum: number): string;
    static recorded(error: unknown, runId: string): MigrationError;
}

export type MigrationErrorCode = "alreadyApplied" | "failed" | "invalidParam" | "locked" | "notApplied" | "notFound" | "planChanged" | "usage" | "verifyFailed";

export type MigrationGet = AkanServer["get"];

export declare class MigrationLedger {
    constructor(connection: () => AkanSqlClient);
    insert(run: MigrationRun): Promise<MigrationRun>;
    finish(id: string, { status, planHash, summary, error, }: {
        status: MigrationRunStatus;
        planHash?: null | string;
        summary?: Record<string, unknown> | null;
        error?: null | string;
    }): Promise<void>;
    complete(id: string, { planHash, summary }: {
        planHash?: null | string;
        summary: Record<string, unknown>;
    }): Promise<void>;
    saveCheckpoint(id: string, checkpoint: Record<string, string>): Promise<void>;
    get(id: string): Promise<MigrationRun | null>;
    runsOf(migrationId?: string): Promise<MigrationRun[]>;
    interruptRunning(): Promise<void>;
    state(runs: MigrationRun[]): Promise<MigrationState>;
}

export interface MigrationListItem {
    id: string;
    title: null | string;
    checksum: string;
    status: MigrationStatus;
    appliedRunId: null | string;
    appliedAt: null | number;
    checksumMismatch: boolean;
    params: MigrationParamSpec[];
    error?: string;
}

export declare class MigrationLock {
    static readonly key = "migration:lock";
    static readonly ttlMs = 60000;
    static readonly renewMs = 15000;
    constructor(connection: () => AkanSqlClient, { inBand }?: {
        inBand?: boolean;
    });
    acquire(): Promise<boolean>;
    heartbeat({ force }?: {
        force?: boolean;
    }): Promise<void>;
    release(): Promise<void>;
}

export interface MigrationParamInfo extends MigrationParamOption {
    name: string;
    type: ParamFieldType;
}

export interface MigrationParamOption<Value = unknown> {
    desc?: string;
    enum?: readonly string[];
    default?: Value;
    nullable?: boolean;
}

export interface MigrationParamSpec {
    name: string;
    type: string;
    required: boolean;
    enum?: readonly (number | string)[];
    default?: unknown;
    desc?: string;
}

export type MigrationParamValue<Type, Option> = Option extends {
    default: unknown;
} ? MigrationParamBase<Type, Option> : Option extends {
    nullable: true;
} ? MigrationParamBase<Type, Option> | null : MigrationParamBase<Type, Option>;

export declare class MigrationParams {
    readonly list: MigrationParamInfo[];
    declare(info: MigrationParamInfo): void;
    parse(raw: Record<string, string>): Record<string, unknown>;
    revive(stored: Record<string, unknown>): Record<string, unknown>;
    specs(): MigrationParamSpec[];
}

export type MigrationPatch = Record<string, unknown>;

export interface MigrationPlan<Item = unknown> {
    summary: Record<string, unknown>;
    items?: Item[];
}

export interface MigrationPlanResult {
    id: string;
    runId: string;
    planHash: string;
    params: Record<string, unknown>;
    summary: unknown;
    items: unknown[];
    itemCount: number;
}

export interface MigrationPruneResult {
    dropped: UndeclaredIndex[];
    failed: PrunedIndex[];
}

export declare class MigrationPulse {
    static readonly holdWarnMs = 5000;
    readonly lock: MigrationLock;
    constructor(lock: MigrationLock, onLongHold?: ((heldMs: number) => void) | null);
    beat({ strict, force }: {
        strict: boolean;
        force?: boolean;
    }): Promise<void>;
    hold<T>(fn: () => Promise<T>): Promise<T>;
}

export type MigrationRevertOutcome = "changed" | "missing" | "reverted";

export interface MigrationRewriteOption {
    where?: RawFilter;
    withRemoved?: boolean;
    batchSize?: number;
}

export interface MigrationRollbackResult {
    id: string;
    runs: MigrationRollbackRun[];
}

export interface MigrationRollbackRun {
    runId: string;
    target: string;
    reverted: number;
    skipped: MigrationSkip[];
}

export interface MigrationRun {
    id: string;
    migrationId: string;
    kind: MigrationRunKind;
    status: MigrationRunStatus;
    target: null | string;
    checksum: string;
    buildId: null | string;
    params: Record<string, unknown> | null;
    planHash: null | string;
    summary: Record<string, unknown> | null;
    actor: null | string;
    checkpoint: Record<string, string> | null;
    startedAt: number;
    finishedAt: null | number;
    error: null | string;
}

export type MigrationRunKind = "apply" | "plan" | "rollback" | "verify";

export type MigrationRunStatus = "aborted" | "done" | "failed" | "running";

export declare class MigrationRunner {
    static readonly defaultItemNum = 100;
    constructor(entries: MigrationEntry[], { database, get, buildId, logger }: MigrationRunnerOption);
    list(): Promise<MigrationListItem[]>;
    undeclaredIndexes(): Promise<UndeclaredIndex[]>;
    pruneIndexes({ actor }?: {
        actor?: null | string;
    }): Promise<MigrationPruneResult>;
    plan(id: string, raw?: Record<string, string>, { actor, items }?: {
        actor?: null | string;
        items?: number;
    }): Promise<MigrationPlanResult>;
    apply(id: string, raw?: Record<string, string>, { expect, actor }?: {
        expect?: null | string;
        actor?: null | string;
    }): Promise<MigrationApplyResult>;
    verify(id: string, raw?: Record<string, string>, { actor }?: {
        actor?: null | string;
    }): Promise<MigrationVerifyResult>;
    rollback(target: string, { actor }?: {
        actor?: null | string;
    }): Promise<MigrationRollbackResult>;
}

export interface MigrationRunnerOption {
    database: DatabaseAdaptor;
    get?: MigrationGet;
    buildId?: null | string;
    logger?: Logger;
}

export declare class MigrationScope {
    readonly database: DatabaseAdaptor;
    readonly dialect: SqlDialect;
    readonly readOnly: boolean;
    readonly batchSize: number;
    readonly log: MigrationChangeLog | null;
    constructor({ database, readOnly, batchSize, log, checkpoints, beat, }: MigrationScopeOption);
    static assertBatchSize(batchSize: number): void;
    connection(): AkanSqlClient;
    now(): number;
    createId(): string;
    beat(): Promise<void>;
    transaction<T>(fn: () => Promise<T>): Promise<T>;
    nextRewrite(table: string, signature: string): {
        key: string;
        after: string | undefined;
    };
    reach(key: string, id: string): Promise<void>;
}

export interface MigrationScopeOption {
    database: DatabaseAdaptor;
    readOnly: boolean;
    batchSize: number;
    log?: MigrationChangeLog | null;
    checkpoints?: null | {
        runId: string;
        ledger: MigrationLedger;
        resumed: Record<string, string>;
    };
    beat?: () => Promise<void>;
}

export interface MigrationSettings {
    transaction: boolean;
    batchSize: number;
}

export interface MigrationSkip {
    table: string;
    id: string;
    seq: number;
    reason: string;
}

export interface MigrationState {
    applied: MigrationRun | null;
    partial: MigrationRun[];
}

export type MigrationStatus = "applied" | "partial" | "pending";

export declare class MigrationTable {
    readonly name: string;
    constructor(name: string, scope: MigrationScope);
    find(where?: RawFilter, options?: RawFindOptions): Promise<TransferRow[]>;
    get(id: string): Promise<TransferRow | null>;
    count(where?: RawFilter, options?: Omit<RawFindOptions, "limit">): Promise<number>;
    set(id: string, patch: MigrationPatch): Promise<boolean>;
    unset(id: string, paths: string[]): Promise<boolean>;
    remove(id: string): Promise<boolean>;
    restore(id: string): Promise<boolean>;
    insert(doc: Record<string, unknown>, { id, removedAt }?: {
        id?: string;
        removedAt?: null | number;
    }): Promise<string>;
    copy(id: string, patch?: MigrationPatch): Promise<string>;
    rewrite(fn: (row: TransferRow) => PromiseOrObject<MigrationPatch | false | null | undefined>, { where, withRemoved, batchSize }?: MigrationRewriteOption): Promise<{
        scanned: number;
        changed: number;
    }>;
    revert(change: MigrationChange): Promise<MigrationRevertOutcome>;
}

export interface MigrationVerifyResult {
    id: string;
    runId: string;
    problems: string[];
}

export declare class Migrations {
    readonly entries: MigrationEntry[];
    constructor(entries: MigrationEntry[]);
    runner(server: AkanServer): MigrationRunner;
    command(server: AkanServer, argv: string[], invokedAs?: string): Promise<0 | 1 | 2 | 3>;
}

export interface MobileDeepLinkAssociation {
    targetName: string;
    iosAppId: null | string;
    androidAppId: null | string;
    domains: string[];
    iosTeamId?: string;
    androidSha256CertFingerprints?: string[];
}

export declare class ModulePreloadPlan {
    constructor(table: ModulePreloadTable, clientManifest?: ClientManifest);
    knows(url: string): boolean;
    urlsOf(chunkUrls: Iterable<string>): string[];
}

export interface ModulePreloadTable {
    runtime: string[];
    vendors: Record<string, string[]>;
    chunkVendors: Record<string, string[]>;
}

export declare class NativeFile {
    static timeoutMs: number;
    static operationMode: () => string;
    static resolve(grant: string, mode: NativeFileMode): Promise<string>;
    static resolveIn(grant: string, relative: string): Promise<string>;
}

export type NativeFileMode = "folder" | "read" | "write";

export declare class NativeSecret {
    static timeoutMs: number;
    static get available(): boolean;
    static get(key: string): Promise<null | string>;
    static set(key: string, value: string): Promise<void>;
    static remove(key: string): Promise<void>;
}

export type OAuthAddressLookup = (hostname: string) => Promise<{
    address: string;
}[]>;

export declare class OAuthAuthorize {
    static parse(url: URL, { client, issuer, resource }: OAuthAuthorizeContext): OAuthAuthorizeResult;
    static sameResource(a: string, b: string): boolean;
}

export interface OAuthAuthorizeContext {
    client: OAuthClientRecord | null;
    issuer: string;
    resource: string;
}

export type OAuthAuthorizeErrorCode = "access_denied" | "invalid_request" | "invalid_scope" | "invalid_target" | "server_error" | "temporarily_unavailable" | "unauthorized_client" | "unsupported_response_type";

export interface OAuthAuthorizeParams {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state?: string;
    resource: string;
    scope?: string;
}

export type OAuthAuthorizeResult = {
    ok: false;
    response: Response;
} | {
    ok: true;
    params: OAuthAuthorizeParams;
};

export type OAuthClientAuthMethod = "client_secret_basic" | "client_secret_post" | "none";

export interface OAuthClientCredential {
    clientId?: string;
    clientSecret?: string;
    method: "basic" | "body" | "none";
}

export declare class OAuthClientIdMetadata {
    static readonly maxBytes: number;
    static readonly timeoutMs = 5000;
    static readonly defaultTtlMs = 3600000;
    static readonly minTtlMs = 60000;
    static readonly maxTtlMs = 86400000;
    static isDocumentUrl(clientId: string): boolean;
    static isFetchable(url: URL): boolean;
    static resolvesPublicly(hostname: string, resolve?: OAuthAddressLookup): Promise<boolean>;
    static fetch(clientId: string, { fetchImpl, resolve, ...policy }?: OAuthClientIdMetadataFetchOptions): Promise<OAuthClientIdMetadataResult | null>;
    static validate(clientId: string, json: unknown, policy?: OAuthRedirectPolicy): OAuthClientRecord | null;
}

export interface OAuthClientIdMetadataFetchOptions extends OAuthRedirectPolicy {
    fetchImpl?: OAuthDocumentFetch;
    resolve?: OAuthAddressLookup | false;
}

export interface OAuthClientIdMetadataResult {
    client: OAuthClientRecord;
    ttlMs: number;
}

export type OAuthClientMetadata = Pick<OAuthClientRecord, "clientName" | "grantTypes" | "redirectUris" | "tokenEndpointAuthMethod">;

export interface OAuthClientRecord {
    clientId: string;
    clientName?: string;
    redirectUris: string[];
    grantTypes: string[];
    tokenEndpointAuthMethod: OAuthClientAuthMethod;
    clientSecretHash?: string;
    source: OAuthClientSource;
}

export type OAuthClientSource = "dynamic" | "metadataDocument" | "static";

export type OAuthDocumentFetch = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;

export declare class OAuthErrors {
    static readonly noStore: {
        readonly "cache-control": "no-store";
        readonly pragma: "no-cache";
    };
    static token(error: OAuthTokenErrorCode, description: string, { method }?: {
        method?: OAuthClientCredential["method"];
    }): Response;
    static registration(error: OAuthRegistrationErrorCode, description: string): Response;
    static redirect(redirectUri: string, { error, description, state, iss }: OAuthRedirectParams & {
        error: OAuthAuthorizeErrorCode;
        description?: string;
    }): Response;
    static redirectWithCode(redirectUri: string, { code, state, iss }: OAuthRedirectParams & {
        code: string;
    }): Response;
    static page(status: number, title: string, detail: string): Response;
}

export declare class OAuthMetadata {
    static readonly wellKnownSuffix = "/.well-known/oauth-authorization-server";
    static document({ issuer, authorizationEndpoint, tokenEndpoint, registrationEndpoint, revocationEndpoint, scopesSupported, clientIdMetadataDocumentSupported, }: OAuthMetadataProps): {
        scopes_supported?: string[] | undefined;
        response_types_supported: string[];
        response_modes_supported: string[];
        grant_types_supported: string[];
        code_challenge_methods_supported: string[];
        token_endpoint_auth_methods_supported: string[];
        client_id_metadata_document_supported: boolean;
        authorization_response_iss_parameter_supported: boolean;
        revocation_endpoint?: string | undefined;
        registration_endpoint?: string | undefined;
        issuer: string;
        authorization_endpoint: string;
        token_endpoint: string;
    };
    static response(props: OAuthMetadataProps): Response;
    static wellKnownPath(issuer: string): string;
}

export interface OAuthMetadataProps {
    issuer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    revocationEndpoint?: string;
    scopesSupported?: string[];
    clientIdMetadataDocumentSupported?: boolean;
}

export declare class OAuthPkce {
    static readonly method = "S256";
    static isVerifier(value: unknown): value is string;
    static isChallenge(value: unknown): value is string;
    static challengeOf(verifier: string): string;
    static verify(verifier: unknown, challenge: string): boolean;
}

export declare class OAuthRedirect {
    static readonly loopbackHosts: ReadonlySet<string>;
    static parse(uri: string): URL | null;
    static isLoopback(url: URL): boolean;
    static isRegistrable(uri: string, { allowedSchemes }?: OAuthRedirectPolicy): boolean;
    static matches(registered: readonly string[], presented: string): boolean;
    static hostOf(uri: string): string;
}

export interface OAuthRedirectPolicy {
    allowedSchemes?: string[];
}

export declare class OAuthRegistration {
    static readonly authMethods: readonly OAuthClientAuthMethod[];
    static readonly grantTypes: readonly string[];
    static readonly maxNameLength = 200;
    static maxRedirectUris: number;
    static maxRedirectUriLength: number;
    static parse(body: unknown, policy?: OAuthRedirectPolicy): OAuthRegistrationResult;
    static response(client: OAuthClientRecord, { clientSecret, issuedAt }?: {
        clientSecret?: string;
        issuedAt?: number;
    }): Response;
}

export type OAuthRegistrationErrorCode = "invalid_client_metadata" | "invalid_redirect_uri";

export type OAuthRegistrationResult = {
    ok: false;
    response: Response;
} | {
    ok: true;
    client: OAuthClientMetadata;
};

export declare class OAuthRevocation {
    static readonly hints: readonly OAuthTokenTypeHint[];
    static parse(req: Request): Promise<OAuthRevocationParseResult>;
    static success(): Response;
}

export interface OAuthRevocationParams {
    token: string;
    tokenTypeHint?: OAuthTokenTypeHint;
    client: OAuthClientCredential;
}

export type OAuthRevocationParseResult = {
    ok: false;
    response: Response;
} | {
    ok: true;
    params: OAuthRevocationParams;
};

export declare class OAuthToken {
    static parse(req: Request): Promise<OAuthTokenParseResult>;
    static authenticate(client: OAuthClientRecord, credential: OAuthClientCredential, hash: (secret: string) => string): boolean;
    static success({ accessToken, expiresIn, refreshToken, scope }: OAuthTokenSuccess): Response;
    static credentialOf(req: Request, form: URLSearchParams): OAuthClientCredential | null;
}

export type OAuthTokenErrorCode = "invalid_client" | "invalid_grant" | "invalid_request" | "invalid_scope" | "invalid_target" | "unauthorized_client" | "unsupported_grant_type";

export type OAuthTokenParams = {
    grantType: "authorization_code";
    code: string;
    codeVerifier?: string;
    redirectUri?: string;
    resource?: string;
    client: OAuthClientCredential;
} | {
    grantType: "refresh_token";
    refreshToken: string;
    resource?: string;
    scope?: string;
    client: OAuthClientCredential;
};

export type OAuthTokenParseResult = {
    ok: false;
    response: Response;
} | {
    ok: true;
    params: OAuthTokenParams;
};

export interface OAuthTokenSuccess {
    accessToken: string;
    expiresIn: number;
    refreshToken?: string;
    scope?: string;
}

export type OAuthTokenTypeHint = "access_token" | "refresh_token";

export interface PagesBundlePayload {
    bundlePath: string;
    buildId: number;
    generation?: number;
    changedFiles?: string[];
    reason?: BuilderStateReason;
    trace?: HmrTrace;
    serverTouched?: boolean;
}

export declare class ProcessMetricsCollector {
    static parseMemoryLogIntervalMs(value?: string | undefined): number;
    static startReporting(report: () => Promise<void>): NodeJS.Timeout;
    static startEventLoopLagMonitor(intervalMs?: number): void;
    static collect(extra?: AkanMetricsReport): Promise<AkanMetricsReport>;
    static formatBytes(bytes?: number): string;
    static format(metrics: AkanMetricsReport): string;
}

export declare const ROUTE_SEED_INDEX_JSON = "route-seed-index.json";

export interface RelationEdge {
    from: string;
    fromView: ConstantType;
    field: string;
    to: string;
    toView: ConstantType;
    arrDepth: number;
    nullable: boolean;
    refType?: "child" | "parent" | "relation";
}

export interface RemoteAccess {
    token(): Promise<null | string>;
    renew(): Promise<null | string>;
}

export type RemoteAddressLookup = (hostname: string) => Promise<{
    address: string;
    family?: number;
}[]>;

export interface RemoteAuthServer {
    issuer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    revocationEndpoint?: string;
    resource: string;
    secretPost: boolean;
}

export interface RemoteClient {
    clientId: string;
    clientSecret?: string;
}

export declare class RemoteError extends AkanError<RemoteErrorCode, {
    challenge?: string;
    status?: number;
}> {
    constructor(code: RemoteErrorCode, message: string, data?: {
        challenge?: string;
        status?: number;
    });
}

export type RemoteErrorCode = "remoteOAuth" | "remoteProtocol" | "remoteTooLarge" | "remoteUnauthorized" | "remoteUnavailable" | "remoteUrlRejected";

export declare class RemoteFetch {
    static readonly timeoutMs = 30000;
    static readonly maxBytes: number;
    constructor(options?: RemoteFetchOptions);
    get allowsPrivate(): boolean;
    parse(input: URL | string): URL;
    send(input: URL | string, request?: RemoteRequest): Promise<RemoteResponse>;
    json(input: URL | string, request?: RemoteRequest): Promise<{
        status: number;
        body: unknown;
    }>;
}

export interface RemoteFetchOptions {
    allowPrivate?: boolean;
    lookup?: RemoteAddressLookup;
    fetchImpl?: (input: URL, init: RequestInit & {
        tls?: {
            serverName: string;
        };
    }) => Promise<Response>;
    timeoutMs?: number;
    maxBytes?: number;
}

export declare class RemoteMcp {
    static readonly protocolVersion = "2025-06-18";
    static readonly maxToolPages = 20;
    constructor(fetcher: RemoteFetch, url: string, token: null | string, options?: RemoteMcpOptions);
    listTools(): Promise<RemoteMcpTool[]>;
    callTool(name: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<RemoteMcpCallResult>;
    readResource(uri: string, maxBytes?: number): Promise<{
        uri?: string;
        mimeType?: string;
        text?: string;
        _meta?: unknown;
    }[]>;
    static textOf(content: readonly RemoteMcpContent[]): string;
}

export interface RemoteMcpCallResult {
    content: RemoteMcpContent[];
    structuredContent?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
    isError: boolean;
    code?: string;
}

export interface RemoteMcpContent {
    type?: string;
    text?: string;
    resource?: {
        uri?: string;
        mimeType?: string;
        text?: string;
    };
}

export interface RemoteMcpOptions {
    clientName?: string;
    maxBytes?: number;
    signal?: AbortSignal;
}

export interface RemoteMcpTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
    };
    _meta?: Record<string, unknown>;
}

export declare class RemoteOAuth {
    static readonly resourceWellKnown = "/.well-known/oauth-protected-resource";
    static readonly serverWellKnown = "/.well-known/oauth-authorization-server";
    static readonly openidWellKnown = "/.well-known/openid-configuration";
    static pkce(): {
        verifier: string;
        challenge: string;
        state: string;
    };
    static discover(fetcher: RemoteFetch, mcpUrl: string, challenge?: null | string): Promise<RemoteAuthServer>;
    static register(fetcher: RemoteFetch, server: RemoteAuthServer, { redirectUri, clientName }: {
        redirectUri: string;
        clientName: string;
    }): Promise<RemoteClient>;
    static authorizeUrl(server: RemoteAuthServer, request: {
        clientId: string;
        redirectUri: string;
        state: string;
        challenge: string;
    }): string;
    static exchange(fetcher: RemoteFetch, server: Pick<RemoteAuthServer, "resource" | "tokenEndpoint">, grant: {
        code: string;
        verifier: string;
        redirectUri: string;
        client: RemoteClient;
    }): Promise<RemoteTokens>;
    static refresh(fetcher: RemoteFetch, server: Pick<RemoteAuthServer, "resource" | "tokenEndpoint">, grant: {
        refreshToken: string;
        client: RemoteClient;
    }): Promise<RemoteTokens>;
    static revoke(fetcher: RemoteFetch, revocationEndpoint: string, token: string, client: RemoteClient): Promise<void>;
}

export interface RemoteRequest {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    maxBytes?: number;
}

export interface RemoteResponse {
    status: number;
    headers: Headers;
    text: string;
}

export interface RemoteScreen {
    html: string;
    href?: string;
}

export declare class RemoteSource implements AgentLoopRemote {
    static readonly disconnected = "remoteDisconnected";
    static readonly viewBytes: number;
    readonly name: string;
    readonly description: string;
    constructor(props: RemoteSourceProps);
    static endpointOf(fetcher: RemoteFetch, input: string): string;
    list(): Promise<AgentTool[] | null>;
    call(tool: string, args: Record<string, unknown>): Promise<AgentLoopRemoteResult>;
    screen(tool: string, args: Record<string, unknown>): Promise<RemoteScreen | null>;
    view(uri: string): Promise<null | string>;
    viewCall(tool: string, args: Record<string, unknown>): Promise<RemoteMcpCallResult | null>;
    static framed(html: string, origin: string): string;
}

export interface RemoteSourceProps {
    name: string;
    url: string;
    description: string;
    allow?: readonly string[];
    access: RemoteAccess;
    fetcher: RemoteFetch;
    clientName?: string;
}

export interface RemoteTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
}

export interface RenderState {
    buildId: number;
    cssAssets: Record<string, CssAsset>;
    cssBytesByUrl: Record<string, Uint8Array>;
    csrGeneration?: number;
    ssrGeneration?: number;
    ssrEpoch?: number;
}

export type ResolvedAkanImageConfig = Required<AkanImageConfig>;

export declare class RouteClientCache {
    merged: MergedManifest;
    constructor({ buildRoute, onMerge }: RouteClientCacheOptions);
    get revision(): number;
    seed(manifest: RoutesManifest): void;
    ensure(routeId: string, seeds: string[]): Promise<MergedManifest>;
    snapshot(): MergedManifest;
    invalidate(predicate: (routeId: string) => boolean, { files, batch }?: {
        files?: Iterable<string>;
        batch?: number;
    }): string[];
    invalidateClientEntries({ routePredicate, staleEntries, files, batch, }: InvalidateClientEntriesOptions): string[];
    clear(): string[];
}

export interface RouteRow {
    signal: string;
    key: string;
    source: "crud" | "declared" | "slice";
    type: "message" | "mutation" | "prompt" | "pubsub" | "query";
    transport: "http" | "ws";
    method: "GET" | HttpMutationMethod | null;
    path: string;
    guards: string[];
    cache?: number;
    timeout?: number;
    fileUpload?: boolean;
}

export interface RouteSeedEntry {
    routeId: string;
    pattern: string;
    seeds: string[];
}

export interface RouteSeedIndex {
    entries: RouteSeedEntry[];
    globalLayoutFiles: string[];
}

export declare class RouteSeedIndexStore {
    static load(artifactDir: string): Promise<RouteSeedIndex>;
    static normalize(index: SerializedRouteSeedIndex, artifactDir: string): RouteSeedIndex;
    static match(pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null;
    static matchPrefix(pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null;
}

export interface RoutesManifest {
    routeIds: string[];
    clientManifest: ClientManifest;
    ssrManifest: SsrManifest;
    knownEntries: string[];
    modulePreloads?: ModulePreloadTable;
}

export declare class RoutesManifestStore {
    static serialize(manifest: RoutesManifest, artifactDir: string): RoutesManifest;
    static read(artifactDir: string): Promise<RoutesManifest | null>;
    static normalize(manifest: SerializedRoutesManifest, artifactDir: string): RoutesManifest;
}

export interface ScalarModule {
    constant: ScalarConstantModel;
    database: DatabaseCls;
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

export interface SerializedReturns {
    refName: (string & {}) | Exclude<DefaultPrimitiveName, "Map" | "Upload">;
    modelType?: "full" | "input" | "insight" | "light" | "scalar";
    arrDepth?: number;
    partial?: string[];
    nullable?: boolean;
}

export interface ServiceModule {
    service: ServiceModel;
    signal: ServiceSignal;
}

export type SessionRefreshHook = (request: Request) => PromiseOrObject<null | string[] | undefined>;

export interface SignalData {
    prefix: string;
    websocketPrefix: string;
    signals: Record<string, SignalNode>;
    routes: RouteRow[];
    guards: string[];
    middlewares: string[];
}

export interface SignalNode {
    refName: string;
    kind: "database" | "service";
    cnstRefName?: string;
    classNames: {
        internal?: string;
        endpoint: string;
        slice?: string;
        server?: string;
    };
    guards: {
        get?: string[];
        cru?: string[];
        create?: string[];
        update?: string[];
        remove?: string[];
    };
    internal: Record<string, InternalNode>;
    slice: Record<string, SliceNode>;
    endpoint: Record<string, EndpointNode>;
    generated: {
        crud: Record<string, EndpointNode>;
        slice: Record<string, EndpointNode>;
    };
}

export interface SignalRouteOptions {
    globalPrefix?: false;
}

export type SignalRoutes = {
    routes: HttpRoutes;
    wsRoutes: WebsocketRoutes;
    routeOptions?: Record<string, SignalRouteOptions>;
};

export declare class SignalSerializer {
    static serialize({ di, serverMode, prefix, websocketPrefix }: SignalSerializerContext): SignalData;
}

export interface SignalSerializerContext {
    di: DiLifecycle;
    serverMode: "all" | "batch" | "federation";
    prefix: string;
    websocketPrefix: string;
}

export interface SliceNode {
    args: SerializedArg[];
    path?: string;
    guards?: string[];
}

export interface SsrManifest {
    moduleLoading: null | {
        prefix: string;
        crossOrigin?: string;
    };
    moduleMap: Record<string, Record<string, SsrManifestEntry>>;
}

export interface SsrManifestEntry {
    id: string;
    chunks: string[];
    name: string;
    async?: boolean;
}

export interface SsrUpdatedPayload {
    generation: number;
    reload: boolean;
    reason?: string;
    patchUrl?: string;
    changedIds?: string[];
    trace?: HmrTrace;
    hold?: boolean;
    batchGeneration?: number;
    epoch?: number;
    first?: boolean;
}

export declare class StageFailedError extends AkanError<"stageFailed"> {
    readonly errors: Error[];
    constructor(message: string, errors: Error[]);
}

/** @deprecated */
export declare const Transaction: () => MethodDecorator;

export declare const Try: () => (_target: unknown, key: string, descriptor: PropertyDescriptor) => void;

export interface Unserializable {
    __akan: "unserializable";
    type: "bigint" | "circular" | "class" | "depth-limit" | "function" | "symbol";
    name?: string;
}

export interface WebProxy {
    use(request: Bun.BunRequest): PromiseOrObject<WebProxyReturn>;
}

export type WebProxyCls = Cls<WebProxy, {
    readonly refName: string;
}>;

export type WebProxyMatcher = ((request: Request) => boolean) | RegExp | string;

export type WebProxyNextInit = {
    request?: {
        headers?: HeadersInit;
    };
};

export type WebProxyRegistration = WebProxyCls | {
    proxy: WebProxyCls;
    matcher?: WebProxyMatcher;
};

export type WebProxyResult = {
    readonly [WEB_PROXY_RESULT]: true;
    readonly type: "next";
    readonly request?: {
        readonly headers?: HeadersInit;
    };
} | {
    readonly [WEB_PROXY_RESULT]: true;
    readonly type: "rewrite";
    readonly url: URL | string;
    readonly request?: {
        readonly headers?: HeadersInit;
    };
};

export type WebProxyReturn = Response | WebProxyResult | undefined;

export interface WebProxyRunResult {
    request: Request;
    response?: Response;
}

export declare class WebProxyRunner {
    static create(registrations?: WebProxyRegistration[]): WebProxyRunner | null;
    constructor(registrations?: WebProxyRegistration[]);
    run(input: Request): Promise<WebProxyRunResult>;
}

export type WebsocketRoute = (ws: Bun.ServerWebSocket<unknown>, data: unknown[], event?: "message" | "subscribe" | "unsubscribe", request?: {
    since?: WebsocketRoomCursor;
}) => PromiseOrObject<unknown>;

export type WebsocketRoutes = Record<string, WebsocketRoute>;

export declare const assertAkanConsoleAllowed: (env?: Partial<Pick<BaseEnv, "environment" | "operationMode">>) => void;

export declare const copyBunRequestFields: (target: Request, source: Request) => Request;

/** @internal */
export declare const createAkanConsoleContext: (server: AkanServer, globals?: Record<string, unknown>) => AkanConsoleContext;

/** @internal */
export declare const createAkanConsoleLogCommands: (appName: string, runtimeDir: string) => Record<string, AkanConsoleCommand>;

export declare function createDefaultAkanOption(): AkanOption<BackendEnv>;

export declare function createDefaultSitemapUrls({ origin, basePath, entries, i18n }: DefaultSitemapOptions): string[];

export declare function createDefaultSitemapXml({ origin, basePath, entries, i18n }: DefaultSitemapOptions): string;

export declare function createSitemapXml(urls: string[]): string;

export declare const defaultAkanImageConfig: ResolvedAkanImageConfig;

export declare const evaluateAkanConsoleInput: (source: string, context: Record<string, unknown>) => Promise<unknown>;

export declare const getAkanConsoleMethods: (value: unknown) => string[];

export declare function getAkanImageWidths(config: Pick<AkanImageConfig, "deviceSizes" | "imageSizes">): number[];

export declare function getSitemapBasePath(pathname: string, basePaths: readonly string[], headerBasePath?: null | string): null | string | undefined;

export declare const getWebConfigFromEnv: () => AkanWebConfig;

export declare const isAkanConsoleInputComplete: (source: string) => boolean;

/** @deprecated */
export declare function isSitemapPath(pathname: string, basePaths: readonly string[]): boolean;

export declare function mergeAkanImageConfig(config?: Partial<AkanImageConfig>): ResolvedAkanImageConfig;

export declare const migration: (title: string) => MigrationDefinition<Record<never, never>, MigrationPlan<unknown>>;

export declare const migrationActions: readonly [
    "list",
    "plan",
    "apply",
    "verify",
    "rollback",
    "indexes",
    "prune-indexes"
];

/** @internal */
export declare const parseAkanConsoleQuery: (args: string) => Record<string, string>;

export declare const resolveWebConfig: (web: Partial<AkanWebConfig> | undefined) => AkanWebConfig;

export declare const startAkanConsole: (server: AkanServer, options?: AkanConsoleOptions) => Promise<void>;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface AkanConsoleCommand {
    desc: string;
    run: (args: string, session: AkanConsoleSession) => Promise<void> | void;
}

declare class AkanConsoleSession {
    constructor(options: AkanConsoleSessionOptions);
    onClose(dispose: () => void): void;
    write(text: string): void;
    run(): Promise<void>;
}

interface AkanConsoleSessionOptions {
    context: Record<string, unknown>;
    prompt: string;
    banner?: string;
    input?: typeof process.stdin;
    output?: typeof process.stdout;
    commands?: Record<string, AkanConsoleCommand>;
}

declare class DiLifecycle {
    readonly logger: Logger;
    readonly registry: import("akanjs/service").InjectRegistry;
    readonly live: import("akanjs/service").LiveRegistry;
    readonly hierarchy: {
        adaptorStages: string[][];
        serviceStages: string[][];
    };
    readonly webProxies: WebProxyRegistration[];
    readonly disabledModules: Map<string, string>;
    readonly initTimings: Map<string, number>;
    get modules(): {
        database: ReadonlyMap<string, DatabaseModule>;
        service: ReadonlyMap<string, ServiceModule>;
        scalar: ReadonlyMap<string, ScalarModule>;
        adaptor: ReadonlyMap<string, AdaptorCls>;
        middleware: ReadonlyMap<string, MiddlewareCls>;
    };
    constructor({ env, modules, disableModules, disableLibs }: DiLifecycleProps, ...libs: AkanLib[]);
    initializeAll(): Promise<SignalRoutes>;
    destroyAll(): Promise<void>;
    registerSchedule(serverMode: "all" | "batch" | "federation"): void;
    runSchedulerInit(): Promise<void>;
    runSchedulerDestroy(): Promise<void>;
    destroyUses(): Promise<void>;
    getWebsocketAdaptor(): WebsocketAdaptor | undefined;
    getByClass(cls: ServiceCls): Service;
    getByClass(cls: ServerSignalCls): ServerSignal;
    getByClass(cls: AdaptorCls): Adaptor;
    getService<T = Service>(refName: string): T;
    getSignal<T = ServerSignal>(refName: string): T;
    getAdaptor<T = Adaptor>(refName: string): T;
}

interface DiLifecycleProps {
    env: BackendEnv;
    modules?: string[];
    disableModules?: string[];
    disableLibs?: string[];
}

interface McpAppShellSource {
    read(app: string): Promise<null | string>;
}

interface McpAuthOption {
    authorizationServers?: string[];
    scopes?: string[];
    resource?: string;
    verify?: (token: string) => PromiseOrObject<Record<string, unknown> | null>;
}

interface McpRateLimitOption {
    calls?: number;
    windowMs?: number;
    concurrent?: number;
}

declare class McpRouter {
    static readonly logger: Logger;
    static readonly listingWarnBytes: number;
    constructor(props: McpRouterProps);
    createRoutes(): HttpRoutes;
    report(): void;
    get document(): McpDocument;
    listFor(req: Request, { ui }?: {
        ui?: boolean;
    }): Promise<{
        tools: McpTool[];
        prompts: McpPrompt[];
    }>;
}

interface McpRouterProps {
    registry: InjectRegistry;
    env: BackendEnv;
    live: LiveRegistry;
    middleware: Map<string, MiddlewareCls>;
    path?: string;
    version?: string;
    instructions?: string;
    allowedOrigins?: string[];
    readOnly?: boolean;
    excludeSignals?: string[];
    excludeEndpoints?: string[];
    pageSize?: number;
    language?: string;
    legacyTextBlock?: boolean;
    pagePrompts?: PagePromptSource;
    promptBudget?: number;
    outputSchema?: McpOutputSchemaMode;
    auth?: McpAuthOption;
    rateLimit?: McpRateLimitOption | false;
    apps?: boolean;
    appShell?: McpAppShellSource;
    modern?: boolean;
}

type MigrationParamBase<Type, Option> = Option extends {
    enum: readonly (infer Value)[];
} ? Value : FieldToValue<Type>;

type MigrationStage<Params, Result> = (ctx: MigrationContext<Params>) => PromiseOrObject<Result>;

interface OAuthRedirectParams {
    state?: string;
    iss: string;
}

type OnMergeFn = (routeId: string, info: {
    delta: BuildRouteClientResult;
    merged: MergedManifest;
    generation: number;
}) => Promise<void> | void;

type RouteBuildFn = (routeId: string, info: {
    seeds: string[];
    knownEntries: Set<string>;
    generation: number;
}) => Promise<BuildRouteClientResult>;

interface RouteClientCacheOptions {
    buildRoute: RouteBuildFn;
    onMerge?: OnMergeFn;
}

type SerializedRouteSeedEntry = Pick<RouteSeedEntry, "routeId"> & Partial<Pick<RouteSeedEntry, "pattern" | "seeds">>;

interface SerializedRouteSeedIndex {
    entries: SerializedRouteSeedEntry[];
    globalLayoutFiles?: string[];
}

type SerializedRoutesManifest = Omit<RoutesManifest, "knownEntries"> & Partial<Pick<RoutesManifest, "knownEntries">>;

declare const WEB_PROXY_RESULT: unique symbol;
```
