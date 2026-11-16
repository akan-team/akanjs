# `akanjs/client/native/dock`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface DockApi {
    setBadge(args: {
        label: null | string;
    }): Promise<DockState>;
    setProgress(args: {
        progress: null | number;
        state?: DockProgressState;
    }): Promise<DockState>;
    setVisible(args: {
        visible: boolean;
    }): Promise<DockState>;
    getState(): Promise<DockState>;
}

export type DockProgressState = "error" | "normal" | "paused";

export interface DockState {
    visible: boolean;
    policy: "accessory" | "prohibited" | "regular";
    badge: null | string;
    progress: null | number;
    progressState: DockProgressState | null;
}

export declare const dock: import("akanjs/client/native.ts").Plugin<DockApi, Record<never, never>>;
```
