# `akanjs/server/routing/devSurfaces`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface DevSurface {
    readonly path: string;
    readonly gate: DevSurfaceGate;
    readonly tunnel: "refuse" | "share";
    readonly productionSetting?: string;
}

export type DevSurfaceGate = "devBuild" | "devtools";

export declare class DevSurfaces {
    static readonly all: readonly DevSurface[];
    static readonly reservedPrefixes: readonly string[];
    static readonly productionRoutes: readonly string[];
    static find(pathname: string): DevSurface | null;
    static isReserved(key: string): boolean;
    static isProductionRoute(key: string): boolean;
    static refusedThroughTunnel(pathname: string): boolean;
    static searchThroughTunnel(search: string): string;
}
```
