# `akanjs/client/native/updates`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
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

export interface UpdatesApi {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateCheck>;
    download(): Promise<{
        bundle: string;
    }>;
    apply(): Promise<void>;
    notifyReady(): Promise<void>;
    reset(): Promise<void>;
    setChannel(args: {
        channel: null | string;
    }): Promise<void>;
}

export interface UpdatesEvents {
    progress: UpdateProgress;
}

export declare function markReady(): Promise<void>;

export declare const updates: import("akanjs/client/native.ts").Plugin<UpdatesApi, UpdatesEvents>;

export declare function useUpdateState(): {
    state: UpdateState | null;
    refresh: () => Promise<void>;
};
```
