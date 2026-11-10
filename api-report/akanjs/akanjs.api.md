# `akanjs`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AkanApiConfig {
    prefix: string;
    websocketPrefix: string;
}

export interface AkanAssetsConfig {
    pruneFonts: boolean;
    keepFonts: string[];
}

export type AkanBinConfig = Record<string, {
    [platform in BinPlatform]?: AkanBinSource;
}>;

export interface AkanBinPathSource {
    path: string;
    file?: string;
}

export type AkanBinSource = AkanBinPathSource | AkanBinUrlSource;

export interface AkanBinUrlSource {
    url: string;
    sha256: string;
    file?: string;
}

export type AkanConfigFile = object;

export interface AkanDatabaseConfig {
    modes: DatabaseMode[];
}

export interface AkanExecutor {
    readonly name: string;
    readonly type: "app" | "lib";
    readonly cwdPath: string;
    getPath(rel: string): string;
    exists(rel: string): Promise<boolean>;
    readFile(rel: string): Promise<string>;
    writeFile(rel: string, content: string, opts?: {
        overwrite?: boolean;
        silent?: boolean;
    }): Promise<unknown>;
    mkdir(rel: string): Promise<unknown>;
    removeDir(rel: string): Promise<unknown>;
    cp(src: string, dest: string): Promise<void>;
    readdir(rel: string): Promise<string[]>;
    getFilesAndDirs(rel: string): Promise<{
        files: string[];
        dirs: string[];
    }>;
    scan(options?: {
        refresh?: boolean;
        write?: boolean;
    }): Promise<AkanScanInfo>;
}

export interface AkanNativeAndroidConfig {
    indexPath?: string;
    sha256CertFingerprints?: string[];
    googleServices?: string;
    push?: NonNullable<AkanNativeConfig["push"]>["android"];
    autoplay?: boolean;
    manifest?: string[];
    application?: string[];
    activity?: string[];
    files?: Record<string, string>;
}

export interface AkanNativeAppConfig extends AkanNativeSettings {
    targets?: Record<string, AkanNativeSettings>;
}

export type AkanNativeAppId = string | {
    default?: string;
    ios?: string;
    android?: string;
    macos?: string;
    windows?: string;
    linux?: string;
};

export interface AkanNativeAppResult {
    appName: string;
    appId: AkanNativeAppId;
    fileName?: string;
    version: string;
    buildNum: number;
    targets: Record<string, AkanNativeTarget>;
}

export interface AkanNativeDeepLinks {
    schemes?: string[];
    domains?: string[];
}

export interface AkanNativeDesktopConfig {
    indexPath?: string;
    server?: AkanNativeDesktopServerConfig | boolean;
    recovery?: "errorPage" | "reload";
    window?: {
        fullscreen?: boolean;
        skipTaskbar?: boolean;
        frameless?: boolean;
    };
    screenCapture?: "auto" | "picker";
    webview2?: "bootstrapper" | "standalone";
    publisher?: string;
    entitlements?: Record<string, AkanNativeValue>;
    dmg?: AkanNativeDmgConfig;
}

export interface AkanNativeDesktopServerConfig {
    omit?: string[];
    profile?: string;
    modules?: string[];
    env?: Record<string, string>;
    restart?: "forever" | number;
    watchdog?: boolean | {
        intervalMs?: number;
        failures?: number;
    };
}

export interface AkanNativeDmgConfig {
    background?: false | string;
    background2x?: string;
    window?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
    };
    iconSize?: number;
    textSize?: number;
    app?: {
        x: number;
        y: number;
    };
    applications?: {
        x: number;
        y: number;
    };
}

export interface AkanNativeIosConfig {
    indexPath?: string;
    teamId?: string;
    infoPlist?: Record<string, AkanNativeValue>;
    entitlements?: Record<string, AkanNativeValue>;
    privacy?: AkanNativeConfig["privacy"];
    files?: Record<string, string>;
}

export interface AkanNativeSettings {
    basePath?: string;
    indexPath?: string;
    appName?: string;
    appId?: AkanNativeAppId;
    fileName?: string;
    version?: string;
    buildNum?: number;
    icon?: string | {
        image: string;
        backgroundColor?: string;
    };
    splash?: NonNullable<AkanNativeConfig["splash"]> | string;
    backgroundColor?: string | {
        light: string;
        dark: string;
    };
    permissions?: NativePermission[];
    plugins?: string[];
    deepLinks?: AkanNativeDeepLinks;
    updates?: Partial<AkanNativeUpdatesConfig>;
    devtools?: boolean;
    csp?: Record<string, string | string[]> | false | string;
    openUrls?: string[];
    ios?: AkanNativeIosConfig;
    android?: AkanNativeAndroidConfig;
    desktop?: AkanNativeDesktopConfig;
}

export interface AkanNativeTarget extends Omit<AkanNativeSettings, "appId" | "appName" | "buildNum" | "updates" | "version"> {
    name: string;
    appName: string;
    appId: AkanNativeAppId;
    version: string;
    buildNum: number;
    updates?: AkanNativeUpdatesConfig;
}

export interface AkanNativeUpdatesConfig {
    url: string;
    publicKeys?: string[];
    publicKey?: string;
    revokedKeys?: string[];
    channel?: string;
    readyTimeout?: number;
    report?: {
        url: string;
    };
    automatic?: boolean;
    windowsSigners?: string[];
    expiresIn?: number;
}

export type AkanNativeValue = AkanNativeValue[] | boolean | number | string | {
    [key: string]: AkanNativeValue;
};

export interface AkanPlugin {
    name: string;
    native?: AkanPluginNativeConfig;
    syncAssets?: (ctx: AkanSyncContext) => Promise<void>;
}

export interface AkanPluginNativeConfig {
    permission: NativePermission;
    plugins?: string[];
    usageDescriptions?: Record<string, string>;
    infoPlist?: Record<string, AkanNativeValue>;
    entitlements?: Record<string, AkanNativeValue>;
    androidPermissions?: string[];
    androidFeatures?: string[];
}

export interface AkanRouteConfig {
    basePath?: string;
    domains: AkanRouteDomains;
}

export interface AkanRouteDomains {
    main?: string[];
    develop?: string[];
    debug?: string[];
    [branch: string]: string[] | undefined;
}

export interface AkanScanInfo {
    getLibs(): string[];
    getDatabaseModules(): string[];
    getServiceModules(): string[];
    getScalarModules(): string[];
}

export interface AkanSyncContext {
    readonly appName: string;
    readonly appPath: string;
    readonly executor: AkanExecutor;
    getPath(rel: string): string;
    fileExists(rel: string): Promise<boolean>;
    readFile(rel: string): Promise<string>;
    writeFile(rel: string, content: string, opts?: {
        overwrite?: boolean;
    }): Promise<void>;
    readEnvClient(): Promise<Record<string, unknown> | null>;
}

export interface AkanWebConfig {
    ssr: boolean;
    csr: boolean;
}

export type AkanWebOption = boolean | {
    csr: boolean;
};

export type AppConfig = ((app: AppConfigContext) => AppConfigInput) | AppConfigInput;

export interface AppConfigContext {
    readonly name: string;
    readonly type: "app";
}

export type AppConfigInput = Omit<DeepPartial<AppConfigResult>, "bin" | "docker" | "native" | "web"> & {
    docker?: DockerOption;
    web?: AkanWebOption;
    bin?: AkanBinConfig;
    native?: AkanNativeAppConfig;
    plugins?: AkanPlugin[];
    pipeline?: AppPipelineConfig;
};

export interface AppConfigResult {
    docker: DockerConfig;
    database: AkanDatabaseConfig;
    api: AkanApiConfig;
    web: AkanWebConfig;
    routes?: AkanRouteConfig[];
    syncPageLibs?: boolean | string[];
    externalLibs: string[];
    trustedDependencies: string[];
    bin: AkanBinConfig;
    barrelImports: string[];
    optimizeImports: string[];
    images: AkanImageConfig;
    i18n: AkanI18nConfig;
    publicEnv: string[];
    native: AkanNativeAppResult;
    secrets: string[];
    assets: AkanAssetsConfig;
}

export interface AppInfo {
    readonly name: string;
    readonly type: "app";
    readonly database: Map<string, Set<string>>;
    readonly service: Map<string, Set<string>>;
    readonly scalar: Map<string, Set<string>>;
    readonly file: FileConventionScanSets;
    readonly migrations: readonly {
        id: string;
        checksum: string;
    }[];
    getLibs(): string[];
    getLibInfos(): Map<string, LibInfo>;
    getDatabaseModules(): string[];
    getScalarModules(): string[];
    getServiceModules(): string[];
}

export type AppPipelineConfig = ((ctx: AppPipelineContext) => AppPipelineInput) | AppPipelineInput;

export interface AppPipelineContext extends PipelineContext {
    readonly app: string;
}

export interface AppPipelineInput {
    schemaVersion?: 1;
    stages: readonly AppPipelineStageInput[];
    env?: Record<string, string>;
    after?: readonly string[];
}

export type AppPipelineStageInput = PipelineActionStageInput | PipelineOtaStageInput | PipelineShellStageInput;

export interface AppScanResult extends ScanResult {
    akanConfig: AppConfigResult;
    routes: string[];
}

export type Arch = (typeof archs)[number];

export type BinPlatform = (typeof binPlatforms)[number];

export type DatabaseMode = "cluster" | "multiple" | "single";

export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends unknown[] ? T[P] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DockerConfig = DockerImageConfig | string;

export interface DockerImageConfig {
    image: string | {
        [key in Arch]?: string;
    };
    preRuns: DockerRun[];
    postRuns: DockerRun[];
    command: string[];
}

export type DockerOption = Partial<DockerImageConfig> | string;

export type DockerRun = string | {
    [key in Arch]?: string;
};

export interface FileConventionScanResult {
    constant: {
        databases: string[];
        scalars: string[];
    };
    dictionary: {
        databases: string[];
        services: string[];
        scalars: string[];
    };
    document: {
        databases: string[];
        scalars: string[];
    };
    service: {
        databases: string[];
        services: string[];
    };
    signal: {
        databases: string[];
        services: string[];
    };
    store: {
        databases: string[];
        services: string[];
    };
    template: {
        databases: string[];
        services: string[];
        scalars: string[];
    };
    unit: {
        databases: string[];
        services: string[];
        scalars: string[];
    };
    util: {
        databases: string[];
        services: string[];
        scalars: string[];
    };
    view: {
        databases: string[];
        services: string[];
        scalars: string[];
    };
    zone: {
        databases: string[];
        services: string[];
        scalars: string[];
    };
}

export interface FileConventionScanSet {
    all: Set<string>;
    databases: Set<string>;
    services: Set<string>;
    scalars: Set<string>;
}

export type FileConventionScanSets = {
    [key in keyof FileConventionScanResult]: FileConventionScanSet;
};

export type LibAssetsConfig = Pick<AkanAssetsConfig, "keepFonts">;

export type LibConfig = ((lib: LibConfigContext) => LibConfigInput) | LibConfigInput;

export interface LibConfigContext {
    readonly name: string;
    readonly type: "lib";
}

export type LibConfigInput = Omit<DeepPartial<LibConfigResult>, "bin"> & {
    bin?: AkanBinConfig;
    plugins?: AkanPlugin[];
};

export interface LibConfigResult {
    externalLibs: string[];
    trustedDependencies: string[];
    bin: AkanBinConfig;
    docker: LibDockerConfig;
    assets: LibAssetsConfig;
}

export interface LibDockerConfig {
    preRuns: DockerRun[];
    postRuns: DockerRun[];
}

export interface LibInfo {
    readonly name: string;
    readonly type: "lib";
    readonly database: Map<string, Set<string>>;
    readonly service: Map<string, Set<string>>;
    readonly scalar: Map<string, Set<string>>;
    readonly file: FileConventionScanSets;
    getLibs(): string[];
    getLibInfos(): Map<string, LibInfo>;
    getLibInfo(libName: string): LibInfo | undefined;
    getDatabaseModules(): string[];
    getScalarModules(): string[];
    getServiceModules(): string[];
}

export interface LibScanResult extends ScanResult {
    akanConfig: LibConfigResult;
}

export type NativeEnv = "debug" | "develop" | "local" | "main";

export type NativePermission = "camera" | "contacts" | "location" | "push" | "speech";

export interface PipelineActionStageInput extends PipelineStageBase {
    use: Exclude<PipelineActionName, "ota">;
    name?: string;
    retry?: number;
    targets?: never;
    platforms?: never;
    sh?: never;
    steps?: never;
    parallel?: never;
    matrix?: never;
}

export interface PipelineContext extends Readonly<Omit<PipelinePlanContext, "apps">> {
    readonly apps: readonly string[];
    readonly workspaceApps: readonly string[];
}

export type PipelineDuration = `${number}h` | `${number}m` | `${number}s` | number;

export type PipelineGlob = readonly string[] | string;

export interface PipelineMatrixStageInput extends Omit<PipelineShellStageInput, "matrix" | "when"> {
    matrix: "apps";
    maxParallel?: number;
    when?: PipelineWhen & {
        app?: PipelineGlob;
    };
}

export interface PipelineOtaStageInput extends PipelineStageBase {
    use: "ota";
    name?: string;
    retry?: number;
    targets?: readonly string[];
    platforms?: readonly PipelineOtaPlatform[];
    sh?: never;
    steps?: never;
    parallel?: never;
    matrix?: never;
}

export interface PipelineParallelStageInput extends PipelineStageBase {
    name: string;
    parallel: readonly PipelineShellStageInput[];
    maxParallel?: number;
    failFast?: boolean;
    env?: Record<string, string>;
    secrets?: readonly string[];
    use?: never;
    sh?: never;
    steps?: never;
    matrix?: never;
}

export interface PipelinePostInput {
    success?: readonly PipelineStepLike[];
    failure?: readonly PipelineStepLike[];
    canceled?: readonly PipelineStepLike[];
    always?: readonly PipelineStepLike[];
}

export interface PipelineShellStageInput extends PipelineStageBase {
    name: string;
    sh?: string;
    steps?: readonly PipelineStepLike[];
    env?: Record<string, string>;
    secrets?: readonly string[];
    retry?: PipelineStepInput["retry"];
    use?: never;
    parallel?: never;
    matrix?: never;
}

export interface PipelineStageBase {
    id?: string;
    description?: string;
    milestone?: PipelineMilestone;
    when?: PipelineWhen;
    timeout?: PipelineDuration;
    allowFailure?: boolean;
}

export interface PipelineStepInput {
    sh: string;
    id?: string;
    name?: string;
    cwd?: string;
    env?: Record<string, string>;
    secrets?: readonly string[];
    timeout?: PipelineDuration;
    retry?: number | {
        attempts: number;
        delay?: PipelineDuration;
    };
    allowFailure?: boolean;
    skipExitCodes?: readonly number[];
}

export type PipelineStepLike = PipelineStepInput | string;

export interface PipelineWhen {
    branch?: PipelineGlob;
    trigger?: PipelineTrigger | readonly PipelineTrigger[];
    changed?: PipelineGlob;
}

export interface PkgScanResult {
    name: string;
    pkgDeps: string[];
    dependencies: string[];
}

export interface ScanResult {
    name: string;
    type: "app" | "lib";
    repoName: string;
    serveDomain: string;
    files: FileConventionScanResult;
    libDeps: string[];
    pkgDeps: string[];
    dependencies: string[];
    devDependencies: string[];
}

export interface SubspaceConfigInput {
    pushableBranches?: string[];
    exclude?: string[];
    subspaces: SubspaceDeclaration[];
}

export interface SubspaceDeclaration {
    name: string;
    repo: string;
    apps: string[];
    workspaceId?: string;
}

export interface WorkspaceCloudConfig {
    host?: string;
}

export interface WorkspaceConfig {
    subspace?: SubspaceConfigInput;
    pipeline?: WorkspacePipelineConfig;
    cloud?: WorkspaceCloudConfig;
}

export type WorkspacePipelineConfig = ((ctx: PipelineContext) => WorkspacePipelineInput) | WorkspacePipelineInput;

export interface WorkspacePipelineInput {
    schemaVersion?: 1;
    env?: Record<string, string>;
    timeout?: PipelineDuration;
    before?: readonly WorkspacePipelineStageInput[];
    after?: readonly WorkspacePipelineStageInput[];
    post?: PipelinePostInput;
}

export type WorkspacePipelineStageInput = PipelineMatrixStageInput | PipelineParallelStageInput | PipelineShellStageInput;

export interface WorkspaceScanResult {
    appNames: string[];
    libNames: string[];
    pkgNames: string[];
    apps: {
        [key: string]: AppScanResult;
    };
    libs: {
        [key: string]: LibScanResult;
    };
    pkgs: {
        [key: string]: PkgScanResult;
    };
}

export declare const archs: readonly [
    "amd64",
    "arm64"
];

export declare const binPlatforms: readonly [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "win32-arm64",
    "win32-x64"
];

export declare const defaultAppPipeline: {
    readonly stages: readonly [
        {
            readonly use: "build";
        },
        {
            readonly use: "docker";
        },
        {
            readonly use: "deploy";
        }
    ];
};
```
