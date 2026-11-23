# `akanjs/server/lifecycle/envProfile`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class EnvProfile {
    static readonly key = "AKAN_ENV_PROFILE";
    static readonly carriedKey = "AKAN_BUILD_ENV_PROFILES";
    static readonly namePattern: RegExp;
    static format(profiles: readonly string[]): string;
    static active(env?: NodeJS.ProcessEnv, carried?: string | undefined): null | string;
}
```
