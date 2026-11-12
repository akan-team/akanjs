# `akanjs/client/native/sqlite`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface ExecuteResult {
    changes: number;
    lastInsertId: number;
}

export interface QueryResult<T extends SqlRow = SqlRow> {
    columns: string[];
    rows: T[];
}

export interface SqlBlob {
    base64: string;
}

export type SqlRow = Record<string, SqlValue>;

export interface SqlStatement {
    db: string;
    sql: string;
    params?: SqlValue[];
}

export type SqlValue = SqlBlob | boolean | null | number | string;

export interface SqliteApi {
    open(args: {
        name: string;
    }): Promise<{
        db: string;
    }>;
    execute(args: SqlStatement): Promise<ExecuteResult>;
    query<T extends SqlRow = SqlRow>(args: SqlStatement): Promise<QueryResult<T>>;
    close(args: {
        db: string;
    }): Promise<void>;
}

export interface SqliteSpec {
    open(args: {
        name: string;
    }): Promise<{
        db: string;
    }>;
    execute(args: StatementArgs): Promise<ExecuteResult>;
    query(args: StatementArgs): Promise<{
        columns: string[];
        rows: Record<string, unknown>[];
    }>;
    close(args: {
        db: string;
    }): Promise<void>;
}

export interface StatementArgs {
    db: string;
    sql: string;
    params?: unknown[];
}

export declare const sqlite: Plugin<SqliteApi>;
```
