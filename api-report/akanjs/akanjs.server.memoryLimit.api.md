# `akanjs/server/memoryLimit`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class MemoryLimit {
    static parsePositiveIntEnv(name: string): null | number;
    static parseBytesEnv(name: string): null | number;
    static readCgroupBytes(): null | number;
    static resolveMaxRssBytes({ megabytesEnv, bytesEnv, limitFraction, fallbackBytes, }: {
        megabytesEnv: string;
        bytesEnv: string;
        limitFraction: number;
        fallbackBytes: null | number;
    }): null | number;
}
```
