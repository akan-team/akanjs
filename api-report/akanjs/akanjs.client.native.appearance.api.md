# `akanjs/client/native/appearance`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const APPEARANCE_SETTINGS: readonly AppearanceSetting[];

export interface AppearanceApi {
    get(): Promise<AppearanceState>;
    set(args: {
        mode: AppearanceSetting;
    }): Promise<void>;
    setThemeColor(args: {
        color: null | string;
    }): Promise<void>;
}

export interface AppearanceEvents {
    change: AppearanceState;
}

export type AppearanceSetting = "system" | ColorScheme;

export interface AppearanceState {
    mode: ColorScheme;
    setting: AppearanceSetting;
}

export type ColorScheme = "dark" | "light";

export declare const appearance: import("akanjs/client/native.ts").Plugin<AppearanceApi, AppearanceEvents>;

export declare function checkSetting(mode: unknown): AppearanceSetting;

export declare function useAppearance(): AppearanceState;
```
