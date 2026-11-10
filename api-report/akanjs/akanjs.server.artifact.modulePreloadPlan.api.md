# `akanjs/server/artifact/modulePreloadPlan`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class ModulePreloadPlan {
    constructor(table: ModulePreloadTable, clientManifest?: ClientManifest);
    knows(url: string): boolean;
    urlsOf(chunkUrls: Iterable<string>): string[];
}

export interface ModulePreloadTable {
    runtime: string[];
    vendors: Record<string, string[]>;
    chunkVendors: Record<string, string[]>;
}
```
