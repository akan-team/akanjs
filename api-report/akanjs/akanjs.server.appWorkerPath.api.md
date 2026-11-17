# `akanjs/server/appWorkerPath`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class AppWorkerPath {
    static readonly dir = "workers";
    static readonly envKey = "AKAN_WORKERS";
    static readonly validName: RegExp;
    static built(appDir: string, name: string): string;
    static sources(env?: NodeJS.ProcessEnv): {
        [name: string]: string;
    };
}
```
