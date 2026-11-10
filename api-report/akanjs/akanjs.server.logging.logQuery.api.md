# `akanjs/server/logging/logQuery`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface LogQuery {
    minSev?: number;
    text?: string;
    name?: string[];
    endpoint?: string[];
    origin?: string[];
    traceId?: string;
    child?: number[];
    role?: string[];
    stream?: ("stderr" | "stdout")[];
    since?: number;
    limit?: number;
}

export declare class LogQueryMatcher {
    readonly query: LogQuery;
    constructor(query: LogQuery);
    matches(record: LogRecord): boolean;
    static compileGlob(pattern: string): RegExp;
    static parseSince(value: string, now?: number): number | undefined;
    static parseMinSev(value: string | undefined): number | undefined;
    static parse(input: Record<string, unknown> | URLSearchParams, now?: number): LogQuery;
}
```
