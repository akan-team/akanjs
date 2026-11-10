# `akanjs/server/hmr/csrDevManifest`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const CSR_DEV_APP_FILE = "app.js";

export declare const CSR_DEV_DIRNAME = "csr-dev";

export declare const CSR_DEV_KEPT_PATCHES = 40;

export declare const CSR_DEV_MANIFEST_FILE = "manifest.json";

export declare const CSR_DEV_PATCHING_MARKER = ".patching";

export declare const CSR_DEV_ROUTE_PREFIX = "/_akan/csr-dev/";

export interface CsrDevLayout {
    lineCount: number;
    modules: [
        id: string,
        line: number
    ][];
}

export interface CsrDevManifest {
    version: 1;
    generation: number;
    appGeneration?: number;
    vendorFile: string;
    entries: Record<string, string>;
    epoch?: number;
}

export type DevCsrMode = "artifact" | "registry";

export declare const SSR_DEV_CHUNK = "ssr-dev";

export declare const SSR_DEV_DIRNAME = "ssr-dev";

export declare const SSR_DEV_ID_PREFIX = "ssr-dev:";

export declare const SSR_DEV_ROUTE_PREFIX = "/_akan/ssr-dev/";

export declare const appGenerationOf: (manifest: CsrDevManifest) => number;

export declare const csrDevModuleFile: (id: string, extension: ".js" | ".js.map") => string;

export declare const resolveDevCsrMode: (env?: Record<string, string | undefined>) => DevCsrMode;
```
