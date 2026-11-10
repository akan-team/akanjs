# `akanjs/server/artifact/routeSeedIndexStore`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface MatchedRoute {
    entry: RouteSeedEntry;
    params: Record<string, string>;
}

export declare const ROUTE_SEED_INDEX_JSON = "route-seed-index.json";

export interface RouteSeedEntry {
    routeId: string;
    pattern: string;
    seeds: string[];
}

export interface RouteSeedIndex {
    entries: RouteSeedEntry[];
    globalLayoutFiles: string[];
}

export declare class RouteSeedIndexStore {
    static load(artifactDir: string): Promise<RouteSeedIndex>;
    static normalize(index: SerializedRouteSeedIndex, artifactDir: string): RouteSeedIndex;
    static match(pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null;
    static matchPrefix(pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null;
}
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type SerializedRouteSeedEntry = Pick<RouteSeedEntry, "routeId"> & Partial<Pick<RouteSeedEntry, "pattern" | "seeds">>;

interface SerializedRouteSeedIndex {
    entries: SerializedRouteSeedEntry[];
    globalLayoutFiles?: string[];
}
```
