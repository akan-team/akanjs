# `akanjs/client/native/autostart`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AutostartApi {
    enable(): Promise<AutostartState>;
    disable(): Promise<AutostartState>;
    isEnabled(): Promise<AutostartState>;
    openSettings(): Promise<void>;
}

export interface AutostartState {
    enabled: boolean;
    status: AutostartStatus;
}

export type AutostartStatus = "enabled" | "notFound" | "notRegistered" | "requiresApproval";

export declare const autostart: import("akanjs/client/native.ts").Plugin<AutostartApi, Record<never, never>>;
```
