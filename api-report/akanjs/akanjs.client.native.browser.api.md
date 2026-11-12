# `akanjs/client/native/browser`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface BrowserApi {
    open(args: {
        url: string;
        toolbarColor?: string;
    }): Promise<void>;
    close(): Promise<void>;
}

export interface BrowserEvents {
    finished: Record<string, never>;
}

export declare const browser: import("akanjs/client/native.ts").Plugin<BrowserApi, BrowserEvents>;

export declare function checkColor(color: unknown): string | undefined;

export declare function checkUrl(url: unknown): URL;

export declare function useBrowserFinished(handler: () => void): void;
```
