# `akanjs/server/lifecycle/secretEnv`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class SecretEnv {
    static readonly listKey = "AKAN_ENV_NAMES";
    static read(name: string): string | undefined;
    static json(name: string): unknown;
    static format(entries: readonly SecretEnvEntry[]): string;
    static parse(list: string | undefined): SecretEnvEntry[];
    static check(logger: SecretEnvLogger, env?: NodeJS.ProcessEnv): void;
}

export interface SecretEnvEntry {
    name: string;
    kind: SecretEnvKind;
    ahead?: string[];
}

export type SecretEnvKind = "json" | "multiline" | "string";
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface SecretEnvLogger {
    warn: (message: string) => void;
}
```
