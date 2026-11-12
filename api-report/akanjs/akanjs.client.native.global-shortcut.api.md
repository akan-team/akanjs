# `akanjs/client/native/global-shortcut`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface GlobalShortcutApi {
    register(args: {
        accelerator: string;
    }): Promise<{
        accelerator: string;
    }>;
    unregister(args: {
        accelerator: string;
    }): Promise<{
        removed: boolean;
    }>;
    unregisterAll(): Promise<void>;
    isRegistered(args: {
        accelerator: string;
    }): Promise<{
        registered: boolean;
    }>;
    list(): Promise<string[]>;
}

export interface GlobalShortcutEvents {
    pressed: {
        accelerator: string;
    };
}

export declare const globalShortcut: import("akanjs/client/native.ts").Plugin<GlobalShortcutApi, GlobalShortcutEvents>;

export declare function onShortcut(accelerator: string, handler: () => void): Promise<() => Promise<void>>;
```
