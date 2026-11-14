# `akanjs/client/native/geolocation`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface GeolocationApi {
    getCurrentPosition(options?: PositionOptions): Promise<Position>;
    checkPermission(): Promise<LocationPermission>;
    requestPermission(): Promise<LocationPermission>;
}

export interface GeolocationError {
    code: ErrorCode;
    message: string;
}

export interface GeolocationEvents {
    position: Position;
    highAccuracyPosition: Position;
    error: GeolocationError;
}

export interface GeolocationState {
    position: Position | null;
    error: AkanNativeError | null;
}

export interface LocationPermission {
    location: PermissionState;
    precise: boolean | null;
}

export type PermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

export interface Position {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: null | number;
    altitudeAccuracy: null | number;
    heading: null | number;
    speed: null | number;
    timestamp: number;
}

export interface PositionOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
}

export interface WatchOptions {
    enableHighAccuracy?: boolean;
    onError?: (error: AkanNativeError) => void;
}

export declare const geolocation: import("akanjs/client/native.ts").Plugin<GeolocationApi, GeolocationEvents>;

export declare function useGeolocation(options?: {
    enableHighAccuracy?: boolean;
}): GeolocationState;

export declare function watchPosition(onPosition: (position: Position) => void, options?: WatchOptions): () => void;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
declare const ERROR_CODES: readonly [
    "UNSUPPORTED",
    "PERMISSION_DENIED",
    "CANCELLED",
    "TIMEOUT",
    "INVALID_ARGS",
    "NOT_FOUND",
    "NOT_ALLOWED",
    "INTERNAL"
];

type ErrorCode = (typeof CONTRACT_ERROR_CODES)[number];
```
