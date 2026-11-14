# `akanjs/client/native/keyboard`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface KeyboardApi {
    getState(): Promise<KeyboardState>;
    hide(): Promise<void>;
    setResizeMode(args: {
        mode: KeyboardResizeMode;
    }): Promise<void>;
}

export interface KeyboardEvents {
    change: KeyboardState;
    willShow: KeyboardTransition;
    didShow: KeyboardTransition;
    willHide: KeyboardTransition;
    didHide: KeyboardTransition;
}

export type KeyboardResizeMode = "none" | "resize";

export interface KeyboardState {
    visible: boolean;
    height: number;
}

export interface KeyboardTransition {
    height: number;
    duration: number;
}

export interface UseKeyboard extends KeyboardState {
    supported: boolean;
    hide(): Promise<void>;
}

export declare const keyboard: import("akanjs/client/native.ts").Plugin<KeyboardApi, KeyboardEvents>;

export declare function useKeyboard(): UseKeyboard;
```
