# `akanjs/client/native/screen-orientation`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const ORIENTATION_LOCKS: readonly OrientationLock[];

export declare const ORIENTATION_TYPES: readonly OrientationType[];

export type OrientationLock = "any" | "landscape" | "portrait" | OrientationType;

export interface OrientationState {
    type: OrientationType;
}

export type OrientationType = "landscape-primary" | "landscape-secondary" | "portrait-primary" | "portrait-secondary";

export interface ScreenOrientationApi {
    get(): Promise<OrientationState>;
    lock(args: {
        orientation: OrientationLock;
    }): Promise<void>;
    unlock(): Promise<void>;
}

export interface ScreenOrientationEvents {
    change: OrientationState;
}

export declare function checkLock(orientation: unknown): OrientationLock;

export declare const screenOrientation: import("akanjs/client/native.ts").Plugin<ScreenOrientationApi, ScreenOrientationEvents>;

export declare function useScreenOrientation(): OrientationState;
```
