# `akanjs/client/native/auth-session`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AuthSessionApi {
    start(args: {
        url: string;
        callbackScheme: string;
        ephemeral?: boolean;
    }): Promise<{
        url: string;
    }>;
}

export declare const authSession: import("akanjs/client/native.ts").Plugin<AuthSessionApi, Record<never, never>>;

export declare function checkStart(args: unknown): StartArgs;

export declare function isCallback(url: string, scheme: string): boolean;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface StartArgs {
    url: URL;
    callbackScheme: string;
    ephemeral: boolean;
}
```
