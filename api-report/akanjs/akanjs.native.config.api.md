# `akanjs/native/config`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AkanNativeConfig {
    app: {
        id: string;
        name: string;
        fileName?: string;
        version: string;
        build?: number;
    };
    web: {
        dir: string;
        build?: string;
        base?: string;
        devEntry?: string;
    };
    plugins?: string[];
    capabilities?: Capability[];
    env?: {
        defaults?: Record<string, string>;
        platforms?: Partial<Record<"android" | "ios" | "linux" | "macos" | "web" | "windows", Record<string, string>>>;
    };
    shell?: {
        backgroundColor?: string;
        backgroundColorDark?: string;
        devtools?: boolean;
    };
    usageDescriptions?: Record<string, string>;
    privacy?: {
        tracking?: boolean;
        trackingDomains?: string[];
        collectedDataTypes?: Record<string, boolean | string | string[]>[];
        accessedApis?: Record<string, string[]>;
    };
    permissions?: {
        camera?: string | true;
        microphone?: string | true;
        location?: string | true;
    };
    updates?: {
        url: string;
        publicKey?: string;
        publicKeys?: string[];
        revokedKeys?: string[];
        channel?: string;
        readyTimeout?: number;
        report?: {
            url: string;
        };
        target?: string;
        automatic?: boolean;
        windowsSigners?: string[];
        expiresIn?: number;
    };
    deepLinks?: {
        schemes?: string[];
        domains?: (string | {
            host: string;
            pathPrefixes?: string[];
        })[];
    };
    native?: {
        ios?: {
            infoPlist?: Record<string, NativeValue>;
            entitlements?: Record<string, NativeValue>;
        };
        macos?: {
            entitlements?: Record<string, NativeValue>;
        };
        android?: {
            manifest?: string[];
            application?: string[];
            activity?: string[];
        };
        resources?: {
            from: string;
            to: string;
        }[];
    };
    security?: {
        csp?: "strict" | Record<string, string | string[]> | string;
        shell?: {
            externalSchemes?: string[];
        };
    };
    android?: {
        minWebViewVersion?: number;
        autoplay?: boolean;
        debugAppIdSuffix?: string;
        googleServices?: string;
    };
    push?: {
        android?: {
            channel?: {
                id: string;
                name: string;
                importance?: "default" | "high" | "low" | "min";
                description?: string;
            };
            smallIcon?: string;
            color?: string;
        };
    };
    keyboard?: {
        resize?: "none" | "resize";
    };
    ios?: {
        hideFormAccessoryBar?: boolean;
    };
    desktop?: {
        quitOnLastWindowClosed?: boolean;
        recovery?: "errorPage" | "reload";
        window?: {
            fullscreen?: boolean;
            skipTaskbar?: boolean;
            frameless?: boolean;
        };
        screenCapture?: "auto" | "picker";
        webview2?: "bootstrapper" | "standalone";
        publisher?: string;
        server?: {
            dir: string;
            entry: string;
            env?: Record<string, string>;
            restart?: "forever" | number;
            watchdog?: {
                intervalMs: number;
                failures: number;
            };
        };
        bin?: string;
        dmg?: DmgConfig;
    };
    icon?: string | {
        image: string;
        backgroundColor?: string;
    };
    splash?: {
        backgroundColor?: string | {
            light: string;
            dark: string;
        };
        image?: string;
        autoHide?: boolean;
        timeout?: number;
    };
}

export interface Capability {
    identifier: string;
    description?: string;
    windows?: ("*" | "main" | number)[];
    platforms?: ("android" | "ios" | "linux" | "macos" | "web" | "windows")[];
    permissions: (CapabilityPermission | string)[];
}

export interface CapabilityPermission {
    identifier: string;
    allow?: ScopeEntry[];
    deny?: ScopeEntry[];
}

export interface DmgConfig {
    background?: false | string;
    background2x?: string;
    window?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
    };
    iconSize?: number;
    textSize?: number;
    app?: {
        x: number;
        y: number;
    };
    applications?: {
        x: number;
        y: number;
    };
}

export type NativeValue = NativeValue[] | boolean | number | string | {
    [key: string]: NativeValue;
};

export type ScopeEntry = Record<string, string>;

export declare function defineConfig(config: AkanNativeConfig): AkanNativeConfig;
```
