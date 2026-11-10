# `akanjs/native/api`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const API_VERSION = "0.13.0";

export interface AkanNativeConfig {
    app: {
        id: string;
        name: string;
        fileName?: string;
        version: string;
        build?: number;
    };
    web: {
        dir: string;
        build?: string;
        base?: string;
        devEntry?: string;
    };
    plugins?: string[];
    capabilities?: Capability[];
    env?: {
        defaults?: Record<string, string>;
        platforms?: Partial<Record<"android" | "ios" | "linux" | "macos" | "web" | "windows", Record<string, string>>>;
    };
    shell?: {
        backgroundColor?: string;
        backgroundColorDark?: string;
        devtools?: boolean;
    };
    usageDescriptions?: Record<string, string>;
    privacy?: {
        tracking?: boolean;
        trackingDomains?: string[];
        collectedDataTypes?: Record<string, boolean | string | string[]>[];
        accessedApis?: Record<string, string[]>;
    };
    permissions?: {
        camera?: string | true;
        microphone?: string | true;
        location?: string | true;
    };
    updates?: {
        url: string;
        publicKey?: string;
        publicKeys?: string[];
        revokedKeys?: string[];
        channel?: string;
        readyTimeout?: number;
        report?: {
            url: string;
        };
        target?: string;
        automatic?: boolean;
        windowsSigners?: string[];
        expiresIn?: number;
    };
    deepLinks?: {
        schemes?: string[];
        domains?: (string | {
            host: string;
            pathPrefixes?: string[];
        })[];
    };
    native?: {
        ios?: {
            infoPlist?: Record<string, NativeValue>;
            entitlements?: Record<string, NativeValue>;
        };
        macos?: {
            entitlements?: Record<string, NativeValue>;
        };
        android?: {
            manifest?: string[];
            application?: string[];
            activity?: string[];
        };
        resources?: {
            from: string;
            to: string;
        }[];
    };
    security?: {
        csp?: "strict" | Record<string, string | string[]> | string;
        shell?: {
            externalSchemes?: string[];
        };
    };
    android?: {
        minWebViewVersion?: number;
        autoplay?: boolean;
        debugAppIdSuffix?: string;
        googleServices?: string;
    };
    push?: {
        android?: {
            channel?: {
                id: string;
                name: string;
                importance?: "default" | "high" | "low" | "min";
                description?: string;
            };
            smallIcon?: string;
            color?: string;
        };
    };
    keyboard?: {
        resize?: "none" | "resize";
    };
    ios?: {
        hideFormAccessoryBar?: boolean;
    };
    desktop?: {
        quitOnLastWindowClosed?: boolean;
        recovery?: "errorPage" | "reload";
        window?: {
            fullscreen?: boolean;
            skipTaskbar?: boolean;
            frameless?: boolean;
        };
        screenCapture?: "auto" | "picker";
        webview2?: "bootstrapper" | "standalone";
        publisher?: string;
        server?: {
            dir: string;
            entry: string;
            env?: Record<string, string>;
            restart?: "forever" | number;
            watchdog?: {
                intervalMs: number;
                failures: number;
            };
        };
        bin?: string;
        dmg?: DmgConfig;
    };
    icon?: string | {
        image: string;
        backgroundColor?: string;
    };
    splash?: {
        backgroundColor?: string | {
            light: string;
            dark: string;
        };
        image?: string;
        autoHide?: boolean;
        timeout?: number;
    };
}

export declare class AkanNativeError extends Error {
    readonly code: AkanNativeErrorCode;
    readonly details: {
        problems?: string[];
        hint?: string;
        logTail?: string[];
        cause?: unknown;
    };
    constructor(code: AkanNativeErrorCode, message: string, details?: {
        problems?: string[];
        hint?: string;
        logTail?: string[];
        cause?: unknown;
    });
    get problems(): string[] | undefined;
    get hint(): string | undefined;
    get logTail(): string[] | undefined;
}

export type AkanNativeErrorCode = "CANCELLED" | "CONFIG_INVALID" | "DEVICE_FAILED" | "INTERNAL" | "NATIVE_BUILD_FAILED" | "SIGNING_FAILED" | "TOOLCHAIN_MISSING" | "WEB_BUILD_FAILED" | "WEB_INPUT_INVALID";

export interface AndroidSigning {
    keystore: string;
    alias: string;
    storePassword: string;
    keyPassword?: string;
}

export interface Artifact {
    kind: "aab" | "apk" | "app" | "folder" | "installer" | "ipa" | "web";
    path: string;
    signing: "adhoc" | "debug" | "development" | "distribution" | "none";
    device?: "device" | "simulator";
}

export interface BuildResult {
    platform: TargetPlatform;
    profile: BuildProfile;
    outDir: string;
    artifacts: Artifact[];
    warnings: string[];
    durationMs: number;
    signing?: IosSigningResult;
    licenses?: string;
}

export interface BundleInfo {
    schema: 1;
    app: {
        id: string;
        version: string;
        build: number;
    };
    platform: Platform;
    runtimeVersion: string;
    nativeApi: {
        hash: string;
        inputs: NativeApi;
    };
    web: {
        hash: string;
        files: number;
        publicEnv?: Record<string, string>;
        publicEnvHash?: string;
    };
    updates?: {
        protocol: 2;
        url: string;
        channel: string;
        keyIds: string[];
        embeddedSequence: number;
        reportUrl?: string;
    };
}

export type DesktopArch = "arm64" | "x64";

export interface DevSession {
    gateway: string;
    build: BuildResult;
    readonly device?: Device;
    rebuild(config?: AkanNativeConfig): Promise<BuildResult>;
    reload(): Promise<void>;
    exited: Promise<number>;
    stop(): Promise<void>;
}

export interface Device {
    platform: "android" | "ios";
    id: string;
    name: string;
    kind: "device" | "emulator" | "simulator";
    os: string;
    state: "booted" | "connected" | "offline" | "shutdown" | "unauthorized" | "unavailable" | "unpaired";
}

export type DeviceSelector = string | {
    id: string;
} | {
    kind: Device["kind"];
} | {
    name: string;
};

export interface DoctorCheck {
    group: string;
    name: string;
    ok: boolean;
    warn: boolean;
    detail: string;
    hint?: string;
    fixable: boolean;
}

export interface DoctorReport {
    ok: boolean;
    checks: DoctorCheck[];
}

export interface IosBuild {
    device?: boolean;
    signing?: IosSigning;
    target?: {
        udid: string;
        name?: string;
    };
}

export interface IosSigning {
    identity?: string;
    provisioningProfile?: string;
    teamId?: string;
    distribution?: "ad-hoc" | "app-store";
}

export interface IosSigningResult {
    identity: string;
    identitySha1: string;
    profile: string;
    profileUuid: string;
    teamId: string;
    kind: string;
    expires: string;
}

export interface LinuxBuild {
    appImage?: boolean;
}

export interface LogEvent {
    level: LogLevel;
    message: string;
    tool?: string;
    time: number;
}

export declare const MAX_REVOKE_KEYS = 16;

export declare const MAX_UPDATE_MANIFEST: number;

export interface MacosBuild {
    signing?: MacosSigning;
    notarize?: MacosNotarization;
    dmg?: boolean;
}

export interface MacosNotarization {
    key?: string;
    keyId?: string;
    issuer?: string;
    profile?: string;
}

export interface MacosSigning {
    identity?: string;
    certificate?: {
        path: string;
        password: string;
    };
}

export interface NativeApi {
    protocol: 1;
    features: string[];
    runtime: string;
    platform: Platform;
    plugins: Record<string, {
        decl: PluginDecl;
        version?: string;
    }>;
    acl: ResolvedAcl | null;
    permissions: string[];
    deepLinks: string[];
}

export interface PublishCheckOptions extends Pick<TaskOptions, "appDir" | "config"> {
    platform: Exclude<TargetPlatform, "web">;
    channel?: string;
    out?: string;
    server?: boolean;
    arch?: DesktopArch;
    revoke?: string[];
    resetSequence?: boolean;
}

export interface PublishResult {
    build: BuildResult;
    dir: string;
    bundle: string;
    channel: string;
    files: number;
    size: number;
}

export interface RunningApp {
    build: BuildResult;
    device?: Device;
    exited: Promise<number>;
    stop(): Promise<void>;
}

export interface ServerPolicy {
    restart?: "forever" | number;
    watchdog?: {
        intervalMs: number;
        failures: number;
    };
}

export type TargetPlatform = "android" | "ios" | "linux" | "macos" | "web" | "windows";

export interface TaskOptions {
    appDir: string;
    config: AkanNativeConfig;
    platform: TargetPlatform;
    outDir?: string;
    mode?: string;
    envFiles?: boolean;
    env?: Record<string, string>;
    skipWebBuild?: boolean;
    resolveFrom?: string;
    log?: LogSink;
    signal?: AbortSignal;
}

export declare const UPDATE_REPORT_BATCH = 20;

export declare const UPDATE_REPORT_EVENTS: readonly [
    "downloaded",
    "applied",
    "confirmed",
    "rolledBack",
    "failed"
];

export declare const UPDATE_REPORT_LIMIT = 100;

export declare const UPDATE_REPORT_REASONS: readonly [
    "timeout",
    "relaunch",
    "hang",
    "verify",
    "download",
    "disk",
    "signature",
    "manifest"
];

export type UpdateDecision = {
    kind: "revoke-later" | "revoked" | "self-revoke" | "untrusted";
} | {
    kind: "stale" | "take";
    baseline: number;
    revoke: string[];
};

export interface UpdateDecisionInput {
    ring: readonly string[];
    revoked: readonly string[];
    signer: string;
    revokeKeys: readonly string[];
    resetSequence: boolean;
    sequence: number;
    embedded: number;
    running: null | {
        sequence: number;
        keyId: string;
    };
}

export interface UpdateEnvelope {
    manifest: string;
    keyId: string;
    signature: string;
}

export interface UpdateFile {
    path: string;
    sha256: string;
    size: number;
}

export interface UpdateManifest {
    schema: 1 | 2;
    kind: "app" | "web";
    app: string;
    platform: Platform;
    channel: string;
    nativeApi?: string;
    sequence: number;
    bundle: string;
    runtimeVersion: string;
    version: string;
    files: UpdateFile[];
    build?: number;
    arch?: DesktopArch;
    archive?: {
        sha256: string;
        url: string;
        size: number;
        gzSha256: string;
    };
    patches?: {
        from: string;
        url: string;
        sha256: string;
        size: number;
    }[];
    server?: boolean;
    target?: string;
    revokeKeys?: string[];
    resetSequence?: boolean;
    expiresAt?: number;
}

export interface UpdateReportBody {
    app: string;
    platform: string;
    channel: string;
    installId: string;
    nativeApi: string;
    appVersion: string;
    os: string;
    events: UpdateReportEntry[];
}

export interface UpdateReportEntry {
    id: number;
    event: UpdateReportEvent;
    bundle: string;
    sequence: null | number;
    reason: UpdateReportReason | null;
    at: string;
}

export type UpdateReportEvent = (typeof UPDATE_REPORT_EVENTS)[number];

export type UpdateReportOutcome = "dropped" | "kept" | "sent";

export type UpdateReportReason = (typeof UPDATE_REPORT_REASONS)[number];

export interface WindowsBuild {
    installer?: boolean;
    signing?: WindowsSigning;
}

export interface WindowsSigning {
    certificate?: {
        path: string;
        password: string;
    };
    thumbprint?: string;
    command?: string[];
    timestampUrl?: string;
}

export declare function build(options: TaskOptions & {
    profile?: BuildProfile;
    ios?: IosBuild;
    windows?: WindowsBuild;
    macos?: MacosBuild;
    linux?: LinuxBuild;
    arch?: DesktopArch;
}): Promise<BuildResult>;

export declare function checkPublishUpdate(options: PublishCheckOptions): {
    channel: string;
    out: string;
};

export declare function compareBundles(shipped: string, bundle: string): {
    compatible: boolean;
    problems: string[];
};

export declare function dev(options: TaskOptions & {
    upstream?: string;
    hmrPath?: string;
    startPath?: string;
    lan?: boolean;
    wsPaths?: string[];
    reversePorts?: number[];
    device?: DeviceSelector;
    headless?: boolean;
    runtimeEnv?: Record<string, string>;
    onLine?: (line: string) => void;
    ios?: {
        signing?: IosSigning;
    };
}): Promise<DevSession>;

export declare function devices(options: {
    platform: "android" | "ios";
    log?: LogSink;
    signal?: AbortSignal;
}): Promise<Device[]>;

export declare function doctor(options?: {
    platforms?: TargetPlatform[];
    fix?: boolean;
    log?: LogSink;
    signal?: AbortSignal;
}): Promise<DoctorReport>;

export declare const keyIdOf: (publicKey: string) => string;

export declare function macosDistributionFromEnv(env?: Record<string, string | undefined>): Pick<MacosBuild, "notarize" | "signing">;

export declare function openEnvelope(text: string, publicKeys: readonly string[], revoked?: readonly string[]): {
    manifest: Uint8Array;
    keyId: string;
};

export declare function packUpdate(options: TaskOptions & {
    platform: "android" | "ios";
    out: string;
}): Promise<{
    manifest: UpdateManifest;
    out: string;
}>;

export declare function publishUpdate(options: TaskOptions & {
    platform: Exclude<TargetPlatform, "web">;
    channel?: string;
    out?: string;
    macos?: Pick<MacosBuild, "notarize" | "signing">;
    windows?: Pick<WindowsBuild, "signing">;
    arch?: DesktopArch;
    revoke?: string[];
    resetSequence?: boolean;
}): Promise<PublishResult>;

export declare function release(options: TaskOptions & ({
    platform: "android";
    signing: AndroidSigning;
    formats?: ("aab" | "apk")[];
} | {
    platform: "ios";
    signing?: IosSigning;
})): Promise<BuildResult>;

export declare function requestedDistribution(platform: string, profile: "debug" | "release", { sign, notarize }: DistributionRequest, env?: Record<string, string | undefined>): Distribution;

export declare function run(options: TaskOptions & {
    profile?: BuildProfile;
    device?: DeviceSelector;
    headless?: boolean;
    runtimeEnv?: Record<string, string>;
    onLine?: (line: string) => void;
    ios?: {
        signing?: IosSigning;
    };
}): Promise<RunningApp>;

export declare function updateDecision(input: UpdateDecisionInput): UpdateDecision;

export declare function updateKeygen(options: {
    config: AkanNativeConfig;
}): {
    publicKey: string;
    keyId: string;
    keyPath: string;
    created: boolean;
};

export declare function updateReportOutcome(status: number): UpdateReportOutcome;

export declare function validateConfig(config: AkanNativeConfig, options: {
    appDir: string;
    resolveFrom?: string;
}): string[];

export declare function verifyManifest(bytes: Uint8Array, signature: string, publicKey: string): boolean;

export declare function windowsSigningFromEnv(env?: Record<string, string | undefined>): WindowsSigning | undefined;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface AclGrant {
    plugin: string;
    windows: "*" | number[];
    items: "*" | string[];
    allow?: ScopeEntry[];
    deny?: ScopeEntry[];
}

type BuildProfile = "debug" | "release";

interface Distribution {
    macos?: {
        signing?: MacosSigning;
        notarize?: MacosNotarization;
    };
    windows?: {
        signing?: WindowsSigning;
    };
    notice: null | string;
    unused: string[];
}

interface DistributionRequest {
    sign?: boolean;
    notarize?: boolean;
}

type LogLevel = "error" | "info" | "ok" | "step" | "tool" | "warn";

type LogSink = (event: LogEvent) => void;

type Platform = "android" | "ios" | "linux" | "macos" | "web" | "windows";

type PluginDecl = "web" | {
    methods: string[];
    events: string[];
    web?: true;
    coalesce?: string[];
};

interface ResolvedAcl {
    grants: AclGrant[];
    denied?: Record<string, string[]>;
}

type ScopeEntry = Record<string, string>;
```
