# `akanjs/server/logging/logTailClient`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class LogControlUnavailableError extends AkanError<"logControlUnavailable"> {
    readonly socketPath: string;
    constructor(socketPath: string, cause: unknown);
}

export declare class LogTailClient {
    static socketPath(runtimeDir: string): string;
    static connect(socketPath: string, handlers: LogTailHandlers): Promise<LogTailClient>;
    static describeCoverage(coverage: LogHubCoverage, now?: number): string;
    static formatDuration(ms: number): string;
    private constructor();
    get closed(): boolean;
    subscribe(query: Record<string, unknown>, { replay }?: {
        replay?: number;
    }): Promise<{
        type: "subscribed";
        id: string;
        query: import("./logQuery").LogQuery;
        coverage: LogHubCoverage;
    }>;
    unsubscribe(id: string): Promise<void>;
    history(query: Record<string, unknown>): Promise<{
        type: "history";
        entries: LogHubEntry[];
        coverage: LogHubCoverage;
    }>;
    coverage(): Promise<LogHubCoverage>;
    close(): void;
}

export interface LogTailHandlers {
    onRecord: (entry: LogHubEntry) => void;
    onEvent?: (response: LogControlResponse) => void;
    onClose?: () => void;
}
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type LogControlResponse = {
    type: "coverage";
    coverage: LogHubCoverage;
} | {
    type: "dropped";
    count: number;
} | {
    type: "error";
    message: string;
} | {
    type: "history";
    entries: LogHubEntry[];
    coverage: LogHubCoverage;
} | {
    type: "record";
    id?: string;
    seq: number;
    record: LogHubEntry["record"];
} | {
    type: "subscribed";
    id: string;
    query: LogQuery;
    coverage: LogHubCoverage;
} | {
    type: "unsubscribed";
    id: string;
};

interface LogHubCoverage {
    count: number;
    oldestSeq: null | number;
    newestSeq: null | number;
    from: null | number;
    to: null | number;
}

interface LogHubEntry {
    seq: number;
    record: LogRecord;
}
```
