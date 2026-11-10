# `akanjs/server/artifact/routesManifestStore`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface RoutesManifest {
    routeIds: string[];
    clientManifest: ClientManifest;
    ssrManifest: SsrManifest;
    knownEntries: string[];
}

export declare class RoutesManifestStore {
    static serialize(manifest: RoutesManifest, artifactDir: string): RoutesManifest;
    static read(artifactDir: string): Promise<RoutesManifest | null>;
    static normalize(manifest: SerializedRoutesManifest, artifactDir: string): RoutesManifest;
}
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type SerializedRoutesManifest = Omit<RoutesManifest, "knownEntries"> & Partial<Pick<RoutesManifest, "knownEntries">>;
```
