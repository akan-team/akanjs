# `akanjs/client/native/external-view`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface ExternalViewApi {
    open(args: ExternalViewOpenOptions): Promise<ExternalViewState>;
    navigate(args: {
        id: string;
        url: string;
    }): Promise<void>;
    reload(args: {
        id: string;
    }): Promise<void>;
    close(args: {
        id: string;
    }): Promise<void>;
    list(): Promise<ExternalViewState[]>;
    setVisible(args: {
        id: string;
        visible: boolean;
    }): Promise<void>;
    setBounds(args: {
        id: string;
        bounds: ExternalViewBounds;
    }): Promise<void>;
    evaluate(args: {
        id: string;
        script: string;
    }): Promise<{
        value: unknown;
    }>;
    sendKey(args: {
        id: string;
        key: string;
        code: string;
    }): Promise<void>;
    setMuted(args: {
        id: string;
        muted: boolean;
    }): Promise<void>;
    clearData(args: {
        id: string;
    }): Promise<void>;
    capture(args: {
        id: string;
    }): Promise<FileRef & {
        width?: number;
        height?: number;
    }>;
}

export type ExternalViewBounds = "fill" | {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ExternalViewConsoleLevel = "debug" | "error" | "info" | "warn";

export interface ExternalViewEvents {
    load: {
        id: string;
        state: "finished" | "started";
        url: string;
    };
    loadFailed: {
        id: string;
        url: string;
        errorCode: string;
    };
    gone: {
        id: string;
        reason: string;
        restarts: number;
    };
    consoleMessage: {
        id: string;
        level: ExternalViewConsoleLevel;
        text: string;
        url?: string;
        line?: number;
        dropped?: number;
    };
}

export interface ExternalViewOpenOptions {
    id: string;
    url: string;
    allowOrigins: string[];
    bounds?: ExternalViewBounds;
    initScript?: string;
    muted?: boolean;
    autoplay?: boolean;
    console?: ExternalViewConsoleLevel | boolean;
    window?: number;
}

export interface ExternalViewState {
    id: string;
    window: number;
    url: string;
    visible: boolean;
    restarts: number;
}

export declare const externalView: import("akanjs/client/native.ts").Plugin<ExternalViewApi, ExternalViewEvents>;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface FileRef {
    url: string;
    mime: string;
    size: number;
}
```
