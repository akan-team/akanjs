# `akanjs/client/native/push`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface PushAction {
    actionId: string;
    message: PushMessage;
}

export interface PushApi {
    checkPermission(): Promise<{
        display: PushPermissionState;
    }>;
    requestPermission(): Promise<{
        display: PushPermissionState;
    }>;
    register(): Promise<PushToken>;
    unregister(): Promise<void>;
    setForegroundPresentation(args: PushPresentation): Promise<void>;
}

export interface PushEvents {
    token: PushToken;
    received: PushMessage;
    action: PushAction;
}

export interface PushMessage {
    id?: string;
    title?: string;
    body?: string;
    data: Record<string, unknown>;
}

export type PushPermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

export interface PushPresentation {
    banner?: boolean;
    list?: boolean;
    sound?: boolean;
    badge?: boolean;
    except?: PushPresentationExcept;
}

export interface PushPresentationExcept {
    key: string;
    values: string[];
}

export type PushProvider = "apns" | "fcm";

export interface PushToken {
    token: string;
    provider: PushProvider;
    platform: "android" | "ios";
}

export declare const push: import("akanjs/client/native.ts").Plugin<PushApi, PushEvents>;

export declare function usePushEvent<E extends keyof PushEvents & string>(event: E, handler: (data: PushEvents[E]) => void): void;
```
