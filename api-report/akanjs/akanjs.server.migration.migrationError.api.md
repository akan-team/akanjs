# `akanjs/server/migration/migrationError`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class MigrationError extends AkanError<MigrationErrorCode> {
    runId: null | string;
    constructor(code: MigrationErrorCode, message: string, options?: {
        cause?: unknown;
    });
    static codeOf(error: unknown): MigrationErrorCode;
    static messageOf(error: unknown): string;
    static remaining(problemNum: number): string;
    static recorded(error: unknown, runId: string): MigrationError;
}

export type MigrationErrorCode = "alreadyApplied" | "failed" | "invalidParam" | "locked" | "notApplied" | "notFound" | "planChanged" | "usage" | "verifyFailed";
```
