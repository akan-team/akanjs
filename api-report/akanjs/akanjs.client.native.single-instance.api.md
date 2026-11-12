# `akanjs/client/native/single-instance`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface SecondInstance {
    args: string[];
    cwd: string;
}

export interface SingleInstanceEvents {
    secondInstance: SecondInstance;
}

export declare const singleInstance: import("akanjs/client/native.ts").Plugin<{}, SingleInstanceEvents>;
```
