# `akanjs/native/desktop`

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

export interface DesktopContext {
    app: AppInfo;
    readonly dev: boolean;
    readonly window?: number;
    readonly scope?: CallScope;
    readonly signal?: AbortSignal;
    readonly document?: DocumentScope;
    readonly appDataDir: string;
    readonly appLocalDataDir: string;
    readonly binDir: null | string;
    readonly server: DesktopServerStatus | null;
    emit(event: string, data?: unknown, target?: EmitTarget): number[];
    registerFile(path: string, mime: string): FileRef;
    shell(op: string, args?: Record<string, unknown>): Promise<unknown>;
    onNativeEvent(type: string, listener: (event: NativeEvent) => void): () => void;
    readonly deepLinkSchemes: readonly string[];
    readonly externalSchemes: readonly string[];
    openLinks(args: readonly string[]): void;
    quit(code?: number): void;
    onQuit(fn: () => Promise<void> | void): () => void;
    onDocumentEnd(fn: (doc: DocumentInfo) => void): () => void;
    onBeforeQuit(fn: Veto<{
        reason: QuitReason;
    }>): () => void;
    onCloseRequested(fn: Veto<{
        window: number;
    }>): () => void;
    closeWindow(window?: number): void;
    readonly launch: {
        setWindow(bounds: LaunchWindow): void;
        exit(code?: number): void;
    };
}

export interface DesktopPlugin<Api = any, Events = any> {
    id: string;
    setup?(ctx: DesktopContext): Promise<void> | void;
    launchPhase?: "gate";
    onDocumentEnd?(doc: DocumentInfo, ctx: DesktopContext): void;
    methods: {
        [K in keyof Api]?: MethodImpl<Api[K]>;
    };
    events?: {
        [E in keyof Events]?: (emit: (data: Events[E], target?: EmitTarget) => number[] | void, ctx: DesktopContext) => () => void;
    };
}

export interface NativeEvent {
    type: string;
    [key: string]: unknown;
}

export declare function createPageVeto<D extends object = Record<never, never>>(ackTimeout?: number): PageVeto<D>;

export declare function defineDesktopPlugin<Api, Events = Record<never, never>>(plugin: DesktopPlugin<Api, Events>): DesktopPlugin<Api, Events>;

export declare function externalOpenAllowed(now?: number): boolean;

export declare function mimeFor(name: string): string;
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

interface AppInfo {
    id: string;
    name: string;
    version: string;
    build?: number;
}

interface BridgeErrorBody {
    code: ErrorCode;
    message: string;
    data?: unknown;
    retryable?: boolean;
}

interface CallScope {
    allow: ScopeEntry[] | null;
    deny: ScopeEntry[];
}

type DesktopServerState = "gaveUp" | "restarting" | "starting" | "stopped" | "up";

interface DesktopServerStatus {
    readonly ready: Promise<boolean>;
    readonly state: DesktopServerState;
    onState(listener: (state: DesktopServerState) => void): () => void;
}

interface DocumentInfo {
    window: number;
    id: string;
}

interface DocumentScope extends DocumentInfo {
    readonly ended: boolean;
    own(dispose: () => unknown): () => void;
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

type EmitTarget = "focused" | {
    window: number;
};

type ErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

interface FileRef {
    url: string;
    mime: string;
    size: number;
}

interface LaunchWindow {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    maximized?: boolean;
    fullscreen?: boolean;
    skipTaskbar?: boolean;
    frameless?: boolean;
}

type MethodImpl<F> = F extends (args: infer A) => Promise<infer R> ? (args: A, ctx: DesktopContext) => Promise<R> | R : F extends () => Promise<infer R> ? (args: undefined, ctx: DesktopContext) => Promise<R> | R : never;

interface PageVeto<D> {
    readonly listening: boolean;
    source(emit: (data: D & {
        id: number;
    }, target?: EmitTarget) => number[] | unknown, ctx?: DesktopContext): () => void;
    ask(data: D, target?: EmitTarget): Promise<boolean>;
    answer(args: unknown, window?: number): void;
}

type QuitReason = "lastWindowClosed" | "session" | "user";

type ScopeEntry = Record<string, string>;

type Veto<E> = (event: E) => Promise<boolean | void> | boolean | void;
```
