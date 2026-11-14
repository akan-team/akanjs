# `akanjs/client/native/share`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface ShareApi {
    share(options: ShareOptions): Promise<ShareResult>;
    canShare(options?: ShareOptions): Promise<{
        value: boolean;
    }>;
}

export interface ShareOptions {
    title?: string;
    text?: string;
    url?: string;
    files?: string[];
}

export interface ShareResult {
    completed: boolean;
    target?: string;
}

export interface UseShare {
    supported: boolean;
    pending: boolean;
    error: AkanNativeError | null;
    share(options: ShareOptions): Promise<ShareResult | null>;
}

export declare const share: import("akanjs/client/native.ts").Plugin<ShareApi, Record<never, never>>;

export declare function useShare(): UseShare;
```
