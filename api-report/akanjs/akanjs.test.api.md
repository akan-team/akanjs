# `akanjs/test`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type ConformanceCacheKind = "redis" | "solid";

export declare class ConformanceEnv {
    static readonly deploymentEnvKeys: readonly [
        "AKAN_DATABASE_MODES",
        "AKAN_SOLID_DB_PATH",
        "SQLITE_DATABASE_PATH",
        "POSTGRES_URL",
        "POSTGRES_URI",
        "POSTGRES_HOST",
        "POSTGRES_PORT",
        "POSTGRES_DATABASE",
        "POSTGRES_DB",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_INSIGHT_URL"
    ];
    static isolatedProcessEnv(): Record<string, string | undefined>;
    static url(backend: ConformanceBackend): null | string;
    static has(suite: string, backend: ConformanceBackend): boolean;
    static uniqueName(prefix: string): string;
    static tempDir(prefix: string): Promise<{
        dir: string;
        remove: () => Promise<void>;
    }>;
    static postgresSchema(prefix: string, { insight }?: {
        insight?: boolean;
    }): Promise<{
        schema: string;
        url: string;
        insightUrl: string | undefined;
        drop: () => Promise<void>;
    }>;
    static createPostgresLoginRole(role: string): Promise<{
        url: string;
        drop: () => Promise<void>;
    }>;
    static cacheKinds(suite: string): ConformanceCacheKind[];
    static openCache(kind: ConformanceCacheKind, { app }?: {
        app?: string;
    }): Promise<{
        cache: RedisCache | SolidCache;
        close: () => Promise<void>;
    }>;
    static sqlDrivers(suite: string): SqlDriverKind[];
    static openSqlDriver(kind: SqlDriverKind, options?: SqlDriverOptions): Promise<SqlDriver>;
}

export type McpCatalogueCaller = {
    fetch: {
        jwt: null | string;
    };
} | {
    jwt: null | string;
};

export interface McpCatalogueOptions {
    as?: McpCatalogueCaller;
    ui?: boolean;
}

export declare class ServedMcpCatalogue {
    readonly tools: McpTool[];
    readonly prompts: McpPrompt[];
    readonly document: McpDocument;
    constructor(document: McpDocument, { tools, prompts }: {
        tools: McpTool[];
        prompts: McpPrompt[];
    });
    findTool(name: string): McpExposedEndpoint | undefined;
    get undescribed(): McpUndescribed[];
    get listingCost(): McpListingCost;
}

export interface SignalTestContext<Fetch = FetchProxy> {
    fetch: Fetch;
    target: SignalTestTarget;
    server: TestServer;
    terminate: () => Promise<void>;
}

export type SignalTestOptions = Pick<TestServerOptions, "port" | "serverMode" | "storage" | "workerId">;

export interface SignalTestTarget {
    type: "app" | "lib";
    name: string;
    env: TestEnv;
    fetch: FetchProxy;
    libs: AkanLib[];
}

export interface SqlDriver {
    kind: SqlDriverKind;
    database: PostgresDatabase | SqliteDatabase;
    dialect: SqlDialect;
    restart: () => Promise<SqlDriver>;
    sibling: (search?: SearchConfig) => Promise<SqlDriver>;
    reconfigure: (search: SearchConfig) => Promise<SqlDriver>;
    close: () => Promise<void>;
}

export type SqlDriverKind = "postgres" | "sqlite";

export type TestEnv = BaseEnv & BackendEnv;

export declare class TestServer {
    workerId: number;
    static initClient(env: BaseEnv, workerId?: number): void;
    static applyProcessEnv(env: BaseEnv, { workerId, port, serverMode, }?: {
        workerId?: number;
        port?: number;
        serverMode?: "all" | "batch" | "federation";
    }): void;
    constructor(env: TestEnv, libs: AkanLib | AkanLib[], options?: TestServerOptions);
    init(): Promise<void>;
    cleanup(): Promise<void>;
    servedMcpCatalogue({ as, ui }?: McpCatalogueOptions): Promise<ServedMcpCatalogue>;
    terminate(): Promise<void>;
}

export interface TestServerOptions {
    workerId?: number;
    port?: number;
    storage?: TestStorage;
    serverMode?: "all" | "batch" | "federation";
    listen?: boolean;
    web?: boolean;
}

export declare const configureSignalTest: (options: SignalTestOptions) => void;

export declare const getOrSetupSignalTestContext: <Fetch = FetchProxy>() => Promise<SignalTestContext<Fetch>>;

export declare const getOrSetupSignalTestFetch: <Fetch = FetchProxy>() => Promise<Fetch>;

export declare const getServedMcpCatalogue: (options?: McpCatalogueOptions) => Promise<ServedMcpCatalogue>;

export declare const getSignalTestContext: <Fetch = FetchProxy>() => SignalTestContext<Fetch>;

export declare const getSignalTestFetch: <Fetch = FetchProxy>() => Fetch;

export declare const hasSignalTestContext: () => boolean;

export declare const sample: Chance.Chance & {
    dayjs: (opt?: {
        string?: boolean | undefined;
        american?: boolean | undefined;
        year?: number | undefined;
        month?: number | undefined;
        day?: number | undefined;
        min?: Dayjs | undefined;
        max?: Dayjs | undefined;
    }) => Dayjs;
    pick: <T = unknown>(arr: T[] | readonly T[]) => T;
    picks: <T>(arr: T[] | readonly T[], count?: number, allowDuplicate?: boolean) => T[];
};

export declare const sampleOf: <Model, FieldObj extends FieldObject>(modelRef: ConstantCls<Model, FieldObj>) => SampleOf<Model>;

export declare const setupSignalTestTarget: <Fetch = FetchProxy>({ type, name, libNames, }?: {
    type?: "app" | "lib";
    name?: string;
    libNames?: string[];
}, options?: SignalTestOptions) => Promise<SignalTestContext<Fetch>>;

export declare const terminateSignalTestContext: () => Promise<void>;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type ConformanceBackend = "postgres" | "redis";

type SampleOf<Model> = DocumentModel<{
    [K in keyof Model as Model[K] extends BaseObject ? never : K]: NonNullable<Model[K]>;
}>;

interface SqlDriverOptions {
    insight?: boolean;
    memory?: boolean;
    search?: SearchConfig;
}

type TestStorage = "memory" | "tempFile";
```
