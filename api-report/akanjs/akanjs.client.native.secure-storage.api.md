# `akanjs/client/native/secure-storage`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface SecureStorageApi {
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

export declare const secureStorage: import("akanjs/client/native.ts").Plugin<SecureStorageApi, Record<never, never>>;
```
