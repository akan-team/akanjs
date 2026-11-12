# `akanjs/client/native/opener`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const OPENER_SCHEMES: readonly string[];

export interface OpenerApi {
    openUrl(args: {
        url: string;
    }): Promise<void>;
    canOpenUrl(args: {
        url: string;
    }): Promise<{
        value: boolean;
    }>;
    openSettings(): Promise<void>;
}

export declare const opener: import("akanjs/client/native.ts").Plugin<OpenerApi, Record<never, never>>;
```
