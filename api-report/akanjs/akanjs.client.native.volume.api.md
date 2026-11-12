# `akanjs/client/native/volume`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface VolumeApi {
    getVolume(): Promise<VolumeState>;
    setVolume(args: {
        level: number;
    }): Promise<VolumeState>;
    setMuted(args: {
        muted: boolean;
    }): Promise<VolumeState>;
}

export interface VolumeEvents {
    change: VolumeState;
}

export interface VolumeState {
    level: null | number;
    muted: boolean;
    settable: boolean;
}

export declare const volume: import("akanjs/client/native.ts").Plugin<VolumeApi, VolumeEvents>;
```
