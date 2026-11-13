# `akanjs/server/migration/migrationCommand`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type MigrationAction = (typeof migrationActions)[number];

export interface MigrationArgs {
    action: MigrationAction;
    target: string;
    params: Record<string, string>;
    expect: null | string;
    actor: null | string;
    items: number | undefined;
    json: boolean;
}

export declare class MigrationCommand {
    static usageOf(invokedAs?: string): string;
    static jsonOf(argv: string[]): boolean;
    static parse(argv: string[], invokedAs?: string): MigrationArgs;
    static run(runner: MigrationRunner, args: MigrationArgs): Promise<MigrationCommandResult>;
    static failure(action: MigrationAction | null, error: unknown): MigrationCommandResult;
    static exitCode(result: MigrationCommandResult): 0 | 1 | 2 | 3;
    static print(result: MigrationCommandResult, json: boolean): Promise<0 | 1 | 2 | 3>;
    static render(result: MigrationCommandResult, json: boolean): string;
}

export interface MigrationCommandResult {
    ok: boolean;
    action: MigrationAction | null;
    code?: MigrationErrorCode;
    error?: string;
    runId?: null | string;
    [key: string]: unknown;
}

export declare const migrationActions: readonly [
    "list",
    "plan",
    "apply",
    "verify",
    "rollback",
    "indexes",
    "prune-indexes"
];
```
