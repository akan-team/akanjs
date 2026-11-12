# `akanjs/client/native/app`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AppApi {
    getInfo(): Promise<AppInfoResult>;
    getLaunchUrl(): Promise<{
        url: null | string;
    }>;
    exit(): Promise<void>;
    relaunch(): Promise<void>;
    minimize(): Promise<void>;
    answerBeforeQuit(args: {
        id: number;
        allow?: boolean;
    }): Promise<void>;
    setBackEnabled(args: {
        enabled: boolean;
    }): Promise<void>;
}

export interface AppEvents {
    urlOpen: {
        url: string;
    };
    backButton: {
        canGoBack: boolean;
    };
    beforeQuit: {
        id: number;
        reason: QuitReason;
    };
    backProgress: {
        phase: BackProgressPhase;
        progress: number;
        swipeEdge: "left" | "right";
    };
    serverState: {
        state: "gaveUp" | "restarting" | "starting" | "stopped" | "up";
    };
}

export interface AppInfoResult {
    id: string;
    name: string;
    version: string;
    build: number;
}

export type BackProgressPhase = "cancelled" | "progressed" | "started";

export type QuitReason = "lastWindowClosed" | "session" | "user";

export declare const app: import("akanjs/client/native.ts").Plugin<AppApi, AppEvents>;

export declare const onBeforeQuit: (handler: VetoHandler<{
    reason: QuitReason;
}>) => () => void;

export declare function useBackButton(handler: (event: {
    canGoBack: boolean;
}) => void): void;

export declare function useBeforeQuit(handler: VetoHandler<{
    reason: QuitReason;
}>): void;

export declare function useUrlOpen(handler: (url: string) => void): void;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface VetoEvent {
    preventDefault(): void;
    readonly defaultPrevented: boolean;
}

type VetoHandler<E> = (event: E & VetoEvent) => Promise<void> | void;
```
