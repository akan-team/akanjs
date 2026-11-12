# `akanjs/client/native/device`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface BatteryInfo {
    level: null | number;
    charging: boolean | null;
}

export interface DeviceApi {
    getInfo(): Promise<DeviceInfo>;
    getId(): Promise<{
        identifier: string;
    }>;
    getLanguage(): Promise<{
        tag: string;
        code: string;
    }>;
    getBattery(): Promise<BatteryInfo>;
}

export interface DeviceInfo {
    platform: Platform;
    model: string;
    manufacturer: string;
    osName: string;
    osVersion: string;
    isVirtual: boolean;
    webViewVersion: null | string;
}

export declare const device: import("akanjs/client/native.ts").Plugin<DeviceApi, Record<never, never>>;

export declare function useDeviceInfo(): DeviceInfo | null;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type Platform = "android" | "ios" | "linux" | "macos" | "web" | "windows";
```
