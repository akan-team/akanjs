# `akanjs/client/native/app-state`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AppStateApi {
    getState(): Promise<{
        state: AppStateValue;
    }>;
}

export interface AppStateEvents {
    change: {
        state: AppStateValue;
    };
    memoryWarning: {
        level: MemoryWarningLevel;
    };
}

export type AppStateValue = "active" | "background" | "inactive";

export type MemoryWarningLevel = "critical" | "moderate";

export declare const appState: import("akanjs/client/native.ts").Plugin<AppStateApi, AppStateEvents>;

export declare function useAppState(): AppStateValue;
```
