# `akanjs/client/native/preferences`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type PreferenceSetter = (value: null | string) => Promise<void>;

export interface PreferencesApi {
    get(args: {
        key: string;
    }): Promise<{
        value: null | string;
    }>;
    set(args: {
        key: string;
        value: string;
    }): Promise<void>;
    remove(args: {
        key: string;
    }): Promise<void>;
    keys(): Promise<{
        keys: string[];
    }>;
    clear(): Promise<void>;
}

export declare const preferences: import("akanjs/client/native.ts").Plugin<PreferencesApi, Record<never, never>>;

export declare function usePreference(key: string): [
    value: null | string,
    set: PreferenceSetter,
    ready: boolean
];
```
