# `akanjs/client/native/screen`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface Display {
    id: number;
    name: string;
    bounds: ScreenRect;
    workArea: ScreenRect;
    scale: number;
    primary: boolean;
}

export interface ScreenApi {
    getDisplays(): Promise<Display[]>;
    getCursorPoint(): Promise<{
        x: number;
        y: number;
    }>;
}

export interface ScreenEvents {
    change: {
        displays: Display[];
    };
}

export interface ScreenRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export declare function displayAt(point: {
    x: number;
    y: number;
}, displays: Display[]): Display | undefined;

export declare function sameDisplays(a: Display[], b: Display[]): boolean;

export declare const screen: import("akanjs/client/native.ts").Plugin<ScreenApi, ScreenEvents>;

export declare function useDisplays(): Display[];
```
