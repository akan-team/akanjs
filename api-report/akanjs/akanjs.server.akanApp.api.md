# `akanjs/server/akanApp`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class AkanApp {
    readonly logger: Logger;
    constructor(serverPathOrOptions?: AkanAppOptions | string, options?: AkanAppOptions);
    start(): Promise<void>;
    stop(signal?: string): Promise<void>;
}

export interface AkanAppOptions {
    replica?: number | string;
    serverPath?: string;
    runtimeDir?: string;
    port?: number;
    wsBasePort?: number;
    openapi?: boolean;
    prefix?: string;
    websocketPrefix?: string;
    modules?: string[];
    disableModules?: string[];
    disableLibs?: string[];
    solo?: boolean;
}
```
