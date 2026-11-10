# `akanjs/server/tunnel`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class TunnelAgent {
    readonly logger: Logger;
    constructor(options: TunnelAgentOptions);
    get ready(): TunnelReadyFrame | null;
    start(): Promise<TunnelReadyFrame>;
    stop(reason?: string): Promise<void>;
}

export interface TunnelAgentOptions {
    gatewayUrl: string;
    allowInsecureGateway?: boolean;
    token: string;
    hostnames: string[];
    origin: string;
    tcpHost?: string;
    tcpPorts?: readonly number[];
    maxSockets?: number;
    name?: string;
    retryLimit?: number;
    onReady?: (ready: TunnelReadyFrame) => void;
    onLost?: (reason: string) => void;
    onFatal?: (error: Error) => void;
}

export declare class TunnelDataSocket {
    constructor(options: TunnelDataSocketOptions);
    get busy(): boolean;
    open(): void;
    close(): void;
}

export interface TunnelDataSocketOptions {
    gatewayUrl: string;
    token: string;
    sessionId: string;
    origin: string;
    tcpHost: string;
    tcpPorts: readonly number[];
    logger: Logger;
    onIdle: (socket: TunnelDataSocket) => void;
    onBusy: (socket: TunnelDataSocket) => void;
    onGone: (socket: TunnelDataSocket) => void;
}

export declare class TunnelHttpStream implements TunnelStream {
    constructor(open: TunnelOpenFrame, link: TunnelStreamLink, origin: string);
    run(): Promise<void>;
    push(data: Uint8Array): void;
    end(): void;
    reset(): void;
}

export interface TunnelStream {
    run: () => Promise<void>;
    push: (data: Uint8Array) => void;
    end: () => void;
    reset: () => void;
}

export interface TunnelStreamLink {
    sendFrame: (frame: TunnelDataFromAgent) => void;
    sendPayload: (data: Uint8Array) => Promise<void>;
    closeSocket: () => void;
}

export declare class TunnelTcpStream implements TunnelStream {
    constructor(open: TunnelOpenFrame, link: TunnelStreamLink, hostname: string, ports: readonly number[]);
    run(): Promise<void>;
    push(data: Uint8Array): void;
    end(): void;
    reset(): void;
}

export declare class TunnelWebsocketStream implements TunnelStream {
    constructor(open: TunnelOpenFrame, link: TunnelStreamLink, origin: string);
    run(): Promise<void>;
    push(data: Uint8Array): void;
    end(): void;
    reset(): void;
}

export declare const tunnelResetCodeOf: (error: unknown) => TunnelResetCode;

export declare const tunnelTargetUrl: (origin: string, path: string) => URL | null;

export declare const wsBytes: (data: Uint8Array) => Uint8Array<ArrayBuffer>;
```
