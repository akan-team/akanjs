# `akanjs/client/native/badge`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface BadgeApi {
    set(options: {
        count: number;
    }): Promise<void>;
    clear(): Promise<void>;
    checkPermission(): Promise<{
        badge: PermissionState;
    }>;
    requestPermission(): Promise<{
        badge: PermissionState;
    }>;
}

export declare const MAX_BADGE_COUNT = 2147483647;

export type PermissionState = "denied" | "granted" | "prompt";

export declare const badge: import("akanjs/client/native.ts").Plugin<BadgeApi, Record<never, never>>;

export declare function checkCount(count: unknown): number;
```
