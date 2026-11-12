# `akanjs/client/native/window-state`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface SavedWindowState {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
}

export interface WindowStateApi {
    getSaved(): Promise<{
        state: SavedWindowState | null;
    }>;
    save(): Promise<{
        state: SavedWindowState | null;
    }>;
    clear(): Promise<void>;
}

export declare const windowState: import("akanjs/client/native.ts").Plugin<WindowStateApi, Record<never, never>>;
```
