# `akanjs/client/native/keep-awake`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface KeepAwakeApi {
    keepAwake(): Promise<void>;
    allowSleep(): Promise<void>;
    isKeptAwake(): Promise<{
        value: boolean;
    }>;
}

export declare function holdKeepAwake(): () => Promise<void>;

export declare const keepAwake: import("akanjs/client/native.ts").Plugin<KeepAwakeApi, Record<never, never>>;

export declare function useKeepAwake(enabled?: boolean): void;
```
