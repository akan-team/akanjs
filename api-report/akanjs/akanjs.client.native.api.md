# `akanjs/client/native`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class AkanNativeError extends Error {
    readonly code: ErrorCode;
    readonly data?: unknown;
    readonly retryable: boolean;
    constructor(code: ErrorCode, message: string, options?: AkanNativeErrorOptions);
    static fromBody(body: BridgeErrorBody | undefined, cause?: unknown): AkanNativeError;
    static from(error: unknown): AkanNativeError;
    toBody(): BridgeErrorBody;
}

export interface AuthSessionApi {
    start(args: {
        url: string;
        callbackScheme: string;
        ephemeral?: boolean;
    }): Promise<{
        url: string;
    }>;
}

export interface Contact {
    id: string;
    name: null | string;
    phones: ContactPhone[];
}

export interface DeviceInfo {
    platform: Platform;
    model: string;
    manufacturer: string;
    osName: string;
    osVersion: string;
    isVirtual: boolean;
    webViewVersion: null | string;
}

export interface DirectoryFile extends PickedFile {
    path: string;
}

export interface IapProduct {
    id: string;
    type: IapProductType;
    title: string;
    description: string;
    displayPrice: string;
    price: number;
    currency: string;
    subscriptionPeriod?: IapPeriod;
    subscriptionGroupId?: string;
    introOfferEligible?: boolean;
    offers: IapOffer[];
}

export interface IapTransaction {
    id: string;
    productId: string;
    state: IapTransactionState;
    purchaseDate: number;
    quantity: number;
    originalId?: string;
    expirationDate?: number;
    revocationDate?: number;
    autoRenewing?: boolean;
    acknowledged?: boolean;
    accountId?: string;
    environment?: string;
    verified?: boolean;
    verification: IapVerification;
}

export interface LiveValue<T> {
    get(): T;
    set(value: T): void;
    subscribe(onChange: () => void): () => void;
}

export interface NativePushToken {
    token: string;
    provider: PushProvider;
    platform: "android" | "ios";
}

export interface Photo extends FileRef {
    width?: number;
    height?: number;
}

export interface PickDirectoryOptions {
    limit?: number;
    forServer?: boolean;
}

export interface PickDirectoryResult {
    name: null | string;
    files: DirectoryFile[];
    truncated: boolean;
    grant?: string;
}

export interface PickFilesOptions {
    types?: string[];
    multiple?: boolean;
    forServer?: boolean;
}

export interface PickedFile extends FileRef {
    name: string;
    grant?: string;
}

export type Plugin<Api, Events = Record<never, never>> = PluginMethods<Api> & PluginHandle<Api, Events>;

export interface Position {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: null | number;
    altitudeAccuracy: null | number;
    heading: null | number;
    speed: null | number;
    timestamp: number;
}

export interface PushAction {
    actionId: string;
    message: PushMessage;
}

export interface PushMessage {
    id?: string;
    title?: string;
    body?: string;
    data: Record<string, unknown>;
}

export type PushPermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

export interface SaveFileOptions {
    name: string;
    data?: string;
    encoding?: "base64" | "utf8";
    url?: string;
    mime?: string;
    forServer?: boolean;
}

export interface SaveFileResult {
    saved: boolean;
    name?: string;
    grant?: string;
}

export interface UpdateCheck {
    available: boolean;
    bundle: null | string;
    version: null | string;
    sequence: null | number;
    downloadSize: null | number;
}

export interface UpdateProgress {
    received: number;
    total: number;
}

export interface UpdateState {
    bundle: null | string;
    sequence: number;
    pending: null | string;
    trial: boolean;
    rolledBack: null | string;
    channel: string;
    nativeApi: null | string;
}

export interface VolumeState {
    level: null | number;
    muted: boolean;
    settable: boolean;
}

export declare const app: import("akanjs/client/native.ts").Plugin<AppApi, AppEvents>;

export declare const appState: import("akanjs/client/native.ts").Plugin<AppStateApi, AppStateEvents>;

export declare const authSession: import("akanjs/client/native.ts").Plugin<AuthSessionApi, Record<never, never>>;

export declare const browser: import("akanjs/client/native.ts").Plugin<BrowserApi, BrowserEvents>;

export declare function createLiveValue<T>(initial: T, start?: (set: (value: T) => void) => (() => void) | void, equals?: (a: T, b: T) => boolean): LiveValue<T>;

export declare function definePlugin<Api extends object, Events extends object = Record<never, never>>(id: string, options: PluginOptions<Api, Events>): Plugin<Api, Events>;

export declare function defineWebPlugin<Api, Events = Record<never, never>>(impl: WebPlugin<Api, Events>): WebPlugin<Api, Events>;

export declare const desktopPlatform: () => "linux" | "macos" | "windows" | null;

export declare const device: import("akanjs/client/native.ts").Plugin<DeviceApi, Record<never, never>>;

export declare const dialog: import("akanjs/client/native.ts").Plugin<DialogApi, Record<never, never>>;

export declare function fileBlob(file: FileRef | string, options?: FileReadOptions): Promise<Blob>;

export declare const filePicker: FilePicker;

export declare const haptics: import("akanjs/client/native.ts").Plugin<HapticsApi, Record<never, never>>;

export declare function isAkanNativeError(error: unknown, code?: ErrorCode): error is AkanNativeError;

export declare const isNativeApp: () => boolean;

export declare const isNativeShell: () => boolean;

export declare const keyboard: import("akanjs/client/native.ts").Plugin<KeyboardApi, KeyboardEvents>;

export declare const loadCamera: () => Promise<typeof import("@akanjs/native/plugins/camera")>;

export declare const loadContacts: () => Promise<typeof import("@akanjs/native/plugins/contacts")>;

export declare const loadGeolocation: () => Promise<typeof import("@akanjs/native/plugins/geolocation")>;

export declare const loadIap: () => Promise<typeof import("@akanjs/native/plugins/iap")>;

export declare function markReady(): Promise<void>;

export declare const nativePlatform: () => "android" | "ios" | null;

export declare const openExternalUrl: (url: string) => Promise<void>;

export declare const opener: import("akanjs/client/native.ts").Plugin<OpenerApi, Record<never, never>>;

export declare const preferences: import("akanjs/client/native.ts").Plugin<PreferencesApi, Record<never, never>>;

export declare const push: import("akanjs/client/native.ts").Plugin<PushApi, PushEvents>;

export declare function releaseFile(file: FileRef | string): Promise<boolean>;

export declare const secureStorage: import("akanjs/client/native.ts").Plugin<SecureStorageApi, Record<never, never>>;

export declare function shallowEqual<T extends object>(a: T, b: T): boolean;

export declare const updates: import("akanjs/client/native.ts").Plugin<UpdatesApi, UpdatesEvents>;

export declare function useLiveValue<T>(value: LiveValue<T>): T;

export declare function usePluginEvent<Events, E extends keyof Events & string>(plugin: PluginHandle<any, Events>, event: E, handler: (data: Events[E]) => void): void;

export declare function useUpdateState(): {
    state: UpdateState | null;
    refresh: () => Promise<void>;
};

export declare const volume: import("akanjs/client/native.ts").Plugin<VolumeApi, VolumeEvents>;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface AkanNativeErrorOptions {
    cause?: unknown;
    data?: unknown;
    retryable?: boolean;
    name?: string;
}

interface BridgeErrorBody {
    code: ErrorCode;
    message: string;
    data?: unknown;
    retryable?: boolean;
}

interface CallOptions {
    signal?: AbortSignal;
}

declare const ERROR_CODES: readonly [
    "UNSUPPORTED",
    "PERMISSION_DENIED",
    "CANCELLED",
    "TIMEOUT",
    "INVALID_ARGS",
    "NOT_FOUND",
    "NOT_ALLOWED",
    "INTERNAL"
];

type Emit<T> = (data: T) => void;

type ErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

interface FileReadOptions {
    chunkSize?: number;
    signal?: AbortSignal;
}

interface FileRef {
    url: string;
    mime: string;
    size: number;
}

type Implementation = "native" | "none" | "web";

interface ListenOptions {
    signal?: AbortSignal;
    once?: boolean;
}

type Platform = "android" | "ios" | "linux" | "macos" | "web" | "windows";

interface PluginHandle<Api, Events> {
    readonly id: string;
    readonly methods: readonly (keyof Api & string)[];
    readonly events: readonly (keyof Events & string)[];
    implementation(method: keyof Api & string): Implementation;
    isSupported(method: keyof Api & string): boolean;
    isAllowed(method: keyof Api & string): boolean;
    eventImplementation(event: keyof Events & string): Implementation;
    listen<E extends keyof Events & string>(event: E, listener: (data: Events[E]) => void, options?: ListenOptions): Unsubscribe;
}

type PluginMethods<Api> = {
    [K in keyof Api]: Api[K] & WithOptions<Api[K]>;
};

interface PluginOptions<Api, Events> {
    methods: readonly (keyof Api & string)[];
    events?: readonly (keyof Events & string)[];
    web?: WebPlugin<Api, Events>;
}

type Unsubscribe = () => void;

interface WebPlugin<Api, Events> {
    methods: {
        [K in keyof Api]?: Api[K];
    };
    events?: {
        [E in keyof Events]?: (emit: Emit<Events[E]>) => Unsubscribe;
    };
}

type WithOptions<F> = F extends (...args: infer P) => infer R ? (...args: P extends [
] ? [
    args: undefined,
    options: CallOptions
] : [
    ...P,
    options: CallOptions
]) => R : never;
```
