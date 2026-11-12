# `akanjs/client/native/haptics`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface HapticsApi {
    impact(options?: {
        style?: ImpactStyle;
    }): Promise<void>;
    notification(options?: {
        type?: NotificationType;
    }): Promise<void>;
    selection(): Promise<void>;
    vibrate(options?: {
        duration?: number;
    }): Promise<void>;
}

export type ImpactStyle = "heavy" | "light" | "medium" | "rigid" | "soft";

export type NotificationType = "error" | "success" | "warning";

export declare const haptics: import("akanjs/client/native.ts").Plugin<HapticsApi, Record<never, never>>;
```
