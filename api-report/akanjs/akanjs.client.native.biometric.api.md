# `akanjs/client/native/biometric`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AuthenticateOptions {
    reason: string;
    title?: string;
    cancelTitle?: string;
    allowDeviceCredential?: boolean;
}

export interface BiometricApi {
    isAvailable(): Promise<BiometricStatus>;
    authenticate(options: AuthenticateOptions): Promise<void>;
}

export interface BiometricStatus {
    available: boolean;
    type: BiometryType;
    reason?: BiometricUnavailableReason;
    deviceCredential: boolean;
}

export type BiometricUnavailableReason = "denied" | "lockedOut" | "noHardware" | "notConfigured" | "notEnrolled" | "unavailable";

export type BiometryType = "face" | "fingerprint" | "iris" | "none";

export declare const biometric: import("akanjs/client/native.ts").Plugin<BiometricApi, Record<never, never>>;

export declare function useBiometricStatus(): BiometricStatus | null;
```
