# `akanjs/client/native/toast`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const MAX_QUEUED = 5;

export declare const TOAST_DURATION_MS: Readonly<Record<ToastDuration, number>>;

export interface ToastApi {
    show(options: ToastShowOptions): Promise<void>;
}

export type ToastDuration = "long" | "short";

export interface ToastItem {
    text: string;
    duration: ToastDuration;
    position: ToastPosition;
    ms: number;
}

export type ToastPosition = "bottom" | "center" | "top";

export interface ToastShowOptions {
    text: string;
    duration?: ToastDuration;
    position?: ToastPosition;
}

export declare function checkShow(options: unknown): ToastItem;

export declare function createToastQueue(display: (item: ToastItem) => Promise<void>, max?: number): {
    push(item: ToastItem): boolean;
    readonly size: number;
};

export declare const toast: import("akanjs/client/native.ts").Plugin<ToastApi, Record<never, never>>;
```
