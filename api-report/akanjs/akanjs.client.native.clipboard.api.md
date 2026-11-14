# `akanjs/client/native/clipboard`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface ClipboardApi {
    writeText(args: {
        text: string;
    }): Promise<void>;
    readText(): Promise<{
        text: string;
    }>;
}

export interface UseClipboard {
    supported: boolean;
    copied: boolean;
    error: AkanNativeError | null;
    copy(text: string): Promise<boolean>;
}

export declare const clipboard: import("akanjs/client/native.ts").Plugin<ClipboardApi, Record<never, never>>;

export declare function useClipboard(options?: {
    resetAfter?: number;
}): UseClipboard;
```
