# `akanjs/client/native/network`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type ConnectionType = "cellular" | "ethernet" | "none" | "unknown" | "wifi";

export interface NetworkApi {
    getStatus(): Promise<NetworkStatus>;
}

export interface NetworkEvents {
    change: NetworkStatus;
}

export interface NetworkStatus {
    connected: boolean;
    type: ConnectionType;
}

export declare const network: import("akanjs/client/native.ts").Plugin<NetworkApi, NetworkEvents>;

export declare function useNetwork(): NetworkStatus;
```
