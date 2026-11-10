# `akanjs/base`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const ACTION_META: unique symbol;

export declare const ACTION_OWNER_META: unique symbol;

export declare const ACTION_TAG: unique symbol;

export declare class AkanError<Code extends string = string, Data = unknown> extends Error {
    readonly code: Code;
    readonly statusCode: number;
    readonly data?: Data;
    constructor(code: Code, message: string, { statusCode, cause, data }?: AkanErrorOptions<Data>);
    get forwarded(): boolean;
    toJSON(): AkanErrorPayload;
    static codeOfStatus(statusCode: number): string;
    static reasonOf(statusCode: number): string;
    static is<E extends AkanError>(this: abstract new (...args: never[]) => E, error: unknown, ...codes: E["code"][]): error is E;
}

export interface AkanErrorOptions<Data = unknown> {
    statusCode?: number;
    cause?: unknown;
    data?: Data;
}

export interface AkanErrorPayload {
    error: string;
    statusCode: number;
    code?: string;
    data?: unknown;
}

export declare class Any extends PrimitiveScalar {
    static refName: "Any";
    static [DEFAULT_VALUE]: null | object;
    static [EXAMPLE_VALUE]: object;
}

export type ApplyFnToArrayObjectsResult<Input, Output> = Input extends readonly (infer Item)[] ? ApplyFnToArrayObjectsResult<Item, Output>[] : Output;

export type Assign<A, B> = Omit<A, keyof B> & B;

export type BackendEnv = {
    hostname?: null | readonly string[] | string;
    port?: number;
    database?: {
        sqlite?: {
            filePath?: string;
            journalMode?: string;
            busyTimeoutMs?: number;
            synchronous?: string;
            foreignKeys?: boolean;
            cacheSize?: number;
            tempStore?: string;
        };
        postgres?: {
            url?: string;
            host?: string;
            port?: number;
            database?: string;
            user?: string;
            password?: string;
            insightUrl?: string;
        };
    };
    solid?: {
        filePath?: string;
        journalMode?: string;
        busyTimeoutMs?: number;
        synchronous?: string;
        cleanupIntervalMs?: number;
        queuePollIntervalMs?: number;
        queueLeaseMs?: number;
        queueFailedRetentionMs?: number;
    };
    onCleanup?: () => Promise<void>;
};

export interface BaseEnv {
    repoName: string;
    serveDomain: string;
    appName: string;
    environment: Environment;
    operationMode: "cloud" | "edge" | "local" | "module";
    databaseMode?: DatabaseMode;
}

export declare class Binary extends PrimitiveScalar {
    static refName: "Binary";
    static [SERVER_VALUE]: Uint8Array;
    static [CLIENT_VALUE]: Uint8Array;
    static [DEFAULT_VALUE]: Uint8Array | null;
    static [PURIFIED_VALUE]: Uint8Array | null;
    static [EXAMPLE_VALUE]: string;
    static validate(value: Uint8Array | string): boolean;
    static parseValue(input: Uint8Array | string): Uint8Array;
    static serializeValue(value: Uint8Array | string): string;
    static toBase64(bytes: Uint8Array): string;
    static fromBase64(text: string): Uint8Array<ArrayBuffer>;
}

export type BufferLike = ArrayBuffer | ArrayBufferView | Buffer | DataView | SharedArrayBuffer | Uint8Array | number | readonly number[] | readonly unknown[] | string;

export declare const CLIENT_VALUE: unique symbol;

export type ClientEnv = BaseEnv & {
    side: "client" | "server";
    renderMode: "csr" | "ssr";
    websocket: boolean;
    apiPrefix: string;
    wsPrefix: string;
    clientHost: string;
    clientPort: number;
    clientHttpProtocol: "http:" | "https:";
    clientHttpUri: string;
    serverHost: string;
    serverPort: number;
    serverHttpProtocol: "http:" | "https:";
    serverHttpUri: string;
    serverWsProtocol: "ws:" | "wss:";
    serverWsUri: string;
};

export type Cls<T = unknown, Statics = unknown> = (new (...args: never[]) => T) & Statics;

export declare const DEFAULT_VALUE: unique symbol;

export declare class DataList<Light extends {
    id: string;
}> {
    length: number;
    values: Light[];
    constructor(data?: DataList<Light> | Light[]);
    indexOf(id: string): number;
    set(value: Light): this;
    delete(id: string): this;
    get(id: string): Light | undefined;
    at(idx: number): Light | undefined;
    pickAt(idx: number): Light;
    pick(id: string): Light;
    has(id: string): boolean;
    find(fn: (value: Light, idx: number) => boolean): Light | undefined;
    findIndex(fn: (value: Light, idx: number) => boolean): number;
    some(fn: (value: Light, idx: number) => boolean): boolean;
    every(fn: (value: Light, idx: number) => boolean): boolean;
    forEach(fn: (value: Light, idx: number) => void): void;
    map<T>(fn: (value: Light, idx: number) => T): T[];
    flatMap<T>(fn: (value: Light, idx: number, array: Light[]) => T | readonly T[]): T[];
    sort(fn: (a: Light, b: Light) => number): DataList<Light>;
    filter(fn: (value: Light, idx: number) => boolean): DataList<Light>;
    reduce<T>(fn: (acc: T, value: Light, idx: number) => T, initialValue: T): T;
    slice(start: number, end?: number): DataList<Light>;
    save(): DataList<Light>;
    [Symbol.iterator](): ArrayIterator<Light>;
}

export type DatabaseMode = "cluster" | "multiple" | "single";

export interface DatabaseModeRequest {
    requested: string | undefined;
    declared: string | undefined;
    local: boolean;
}

export declare class DatabaseModes {
    static readonly all: readonly [
        "single",
        "multiple",
        "cluster"
    ];
    static readonly drivers: {
        [mode in DatabaseMode]: readonly string[];
    };
    static describe(mode: DatabaseMode): string;
    static parse(value: string, source: string): DatabaseMode;
    static parseList(value: string, source: string): DatabaseMode[];
    static resolve({ requested, declared, local }: DatabaseModeRequest): DatabaseMode;
    static settle(request: DatabaseModeRequest): DatabaseMode | undefined;
}

export { Dayjs } from "dayjs";

export type DefaultPrimitiveName = "Any" | "Binary" | "Boolean" | "Date" | "Float" | "ID" | "ImageResult" | "Int" | "String" | "Upload";

export declare const ENDPOINT_DICT_SHAPE: unique symbol;

export declare const ENDPOINT_META: unique symbol;

export declare const EXAMPLE_VALUE: unique symbol;

export type EnumInstance<RefName extends string = string, T = number | string> = Cls<{
    refName: RefName;
    value: T;
}, {
    refName: RefName;
    [SERVER_VALUE]: T;
    [CLIENT_VALUE]: T;
    [DEFAULT_VALUE]: T;
    [PURIFIED_VALUE]: T;
    type: StringConstructor | typeof Float | typeof Int;
    values: readonly T[];
    valueMap: Map<T, number>;
    has: (value: T) => boolean;
    indexOf: (value: T) => number;
    find: (callback: (value: T, index: number, array: readonly T[]) => boolean) => T;
    findIndex: (callback: (value: T, index: number, array: readonly T[]) => boolean) => number;
    filter: (callback: (value: T, index: number, array: readonly T[]) => boolean) => T[];
    map: <R>(callback: (value: T, index: number, array: readonly T[]) => R) => R[];
    forEach: (callback: (value: T, index: number, array: readonly T[]) => void) => void;
}>;

export type Environment = "debug" | "develop" | "local" | "main" | "testing";

export declare const FIELD_META: unique symbol;

export declare const FILTER_DICT_SHAPE: unique symbol;

export declare const FILTER_META: unique symbol;

export declare class Float extends PrimitiveScalar {
    static refName: "Float";
    static [SERVER_VALUE]: number;
    static [CLIENT_VALUE]: number;
    static [DEFAULT_VALUE]: number;
    static [PURIFIED_VALUE]: number;
    static [EXAMPLE_VALUE]: number;
    static validate(value: number | string): boolean;
    static parseValue(input: number | string): number;
    static serializeValue(value: number): number;
}

export type GetActionObject<T> = {
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? (K extends "prototype" ? never : K) : never]: T[K];
};

export type GetObject<T> = {
    [K in keyof T as K extends "prototype" ? never : K]: T[K];
};

export type GetStateObject<T> = {
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K extends "prototype" ? never : K]: T[K];
};

export type GetValueOfKey<Model, Key extends string, Fallback = never> = Model extends {
    [key in Key]: unknown;
} ? Model[Key] : Fallback;

export declare class ID extends PrimitiveScalar {
    static refName: "ID";
    static [SERVER_VALUE]: string;
    static [CLIENT_VALUE]: string;
    static [DEFAULT_VALUE]: string;
    static [PURIFIED_VALUE]: string;
    static [EXAMPLE_VALUE]: string;
    static validate(value: string): boolean;
    static parseValue(input: string): string;
    static serializeValue(value: string): string;
    static _checkValue(value: PrimitiveValue, options?: {
        optional?: boolean;
    }): void;
}

export declare const INJECT_META: unique symbol;

export declare const INTERNAL_META: unique symbol;

export declare class ImageResult extends PrimitiveScalar {
    static refName: "ImageResult";
    static [SERVER_VALUE]: ImageResultValue;
    static [CLIENT_VALUE]: ImageResultValue;
    static [DEFAULT_VALUE]: ImageResultValue | null;
    static [PURIFIED_VALUE]: ImageResultValue | null;
    static [EXAMPLE_VALUE]: ImageResultValue;
    static readonly mimeTypes: readonly [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif"
    ];
    static jsonSchema: PrimitiveJsonSchema;
    static agent: PrimitiveAgentFace<ImageResultValue>;
    static validate(value: ImageResultValue): boolean;
}

export type ImageResultMimeType = (typeof ImageResult.mimeTypes)[number];

export interface ImageResultValue {
    data: string;
    mimeType: ImageResultMimeType;
    caption?: null | string;
}

export declare class Int extends PrimitiveScalar {
    static refName: "Int";
    static [SERVER_VALUE]: number;
    static [CLIENT_VALUE]: number;
    static [DEFAULT_VALUE]: number;
    static [PURIFIED_VALUE]: number;
    static [EXAMPLE_VALUE]: number;
    static validate(value: number | string): boolean;
    static parseValue(input: number | string): number;
    static serializeValue(value: number): number;
}

export declare const LIBS_REMOVE_HOOK: unique symbol;

export declare const LOADER_META: unique symbol;

export type MergeAll<T extends object[], Acc = unknown> = T extends [
    infer First extends object,
    ...infer Rest extends object[]
] ? MergeAll<Rest, Acc & First> : Acc;

export type MergeAllActionTypes<T extends Cls[], OmitKey extends string = never, Acc = unknown> = T extends [
    infer First extends Cls,
    ...infer Rest extends Cls[]
] ? Rest extends [
] ? Acc & Omit<GetActionObject<UnCls<First>>, OmitKey> : MergeAllActionTypes<Rest, OmitKey, Acc & Omit<UnCls<First>, OmitKey>> : Acc;

export type MergeAllDoubleKeyOfObjects<T extends object[], Key extends PropertyKey, SubKey extends PropertyKey, Acc = unknown> = T extends [
    infer First extends object,
    ...infer Rest extends object[]
] ? Key extends keyof First ? First[Key] extends object ? SubKey extends keyof First[Key] ? MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc & First[Key][SubKey]> : MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc> : MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc> : MergeAllDoubleKeyOfObjects<Rest, Key, SubKey, Acc> : Acc;

export type MergeAllKeyOfObjects<T extends object[], Key extends PropertyKey, Acc = unknown> = T extends [
    infer First extends object,
    ...infer Rest extends object[]
] ? Key extends keyof First ? MergeAllKeyOfObjects<Rest, Key, Acc & First[Key]> : MergeAllKeyOfObjects<Rest, Key, Acc> : Acc;

export type MergeAllKeyOfTypes<T extends Cls<object>[], Key extends PropertyKey, Acc = unknown> = T extends [
    infer First extends Cls<object>,
    ...infer Rest extends Cls<object>[]
] ? Key extends keyof UnCls<First> ? MergeAllKeyOfTypes<Rest, Key, Acc & UnCls<First>[Key]> : MergeAllKeyOfTypes<Rest, Key, Acc> : Acc;

export type MergeAllTypes<T extends Cls[], OmitKey extends string = never, Acc = unknown> = T extends [
    infer First extends Cls,
    ...infer Rest extends Cls[]
] ? MergeAllTypes<Rest, OmitKey, Acc & Omit<UnCls<First>, OmitKey>> : Acc;

export type MergedValues<T> = UnionToIntersection<MergeObjectValues<T>>;

export type NestedKeysWithAllowed<T, Allowed = Primitive> = T extends Primitive ? never : T extends unknown[] ? never : T extends (...args: never[]) => unknown ? never : {
    [K in keyof T & string]: T[K] extends Allowed ? K : T[K] extends Dayjs ? never : T[K] extends readonly unknown[] ? never : T[K] extends (...args: never[]) => unknown ? never : T[K] extends object ? K | `${K}.${NestedKeysWithAllowed<T[K], Allowed>}` : never;
}[keyof T & string];

export type ObjectAssign<Objects extends object[], Acc = unknown> = Objects extends [
    infer First extends object,
    ...infer Rest extends object[]
] ? ObjectAssign<Rest, Assign<Acc, First>> : Acc;

export type ObjectAssignKeyOfObjects<T extends object[], Key extends PropertyKey, Acc = Record<never, never>> = T extends [
    infer First extends object,
    ...infer Rest extends object[]
] ? Key extends keyof First ? First[Key] extends object ? ObjectAssignKeyOfObjects<Rest, Key, Assign<Acc, First[Key]>> : ObjectAssignKeyOfObjects<Rest, Key, Acc> : ObjectAssignKeyOfObjects<Rest, Key, Acc> : Acc;

export type OptionOf<Obj> = Partial<{
    [K in keyof Obj]: Obj[K] | null;
}>;

export declare const PURIFIED_VALUE: unique symbol;

export type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export type Primitive = boolean | null | number | string | undefined;

export interface PrimitiveAgentFace<Value = unknown> {
    schema: PrimitiveJsonSchema;
    read(value: Value): unknown;
}

export interface PrimitiveJsonSchema {
    [key: string]: unknown;
}

export declare class PrimitiveRegistry {
    static register(scalar: typeof PrimitiveScalar): void;
    static get(name: string): typeof PrimitiveScalar;
    static getName(scalar: typeof PrimitiveScalar): string;
    static has(modelRef: Cls): boolean;
    static hasName(name: string): boolean;
    static getNames(): string[];
    static getAll(): (typeof PrimitiveScalar)[];
    static agentOf(modelRef: unknown): PrimitiveAgentFace | null;
}

export declare class PrimitiveScalar {
    static refName: string;
    static [SERVER_VALUE]: unknown;
    static [CLIENT_VALUE]: unknown;
    static [DEFAULT_VALUE]: unknown;
    static [PURIFIED_VALUE]: unknown;
    static [EXAMPLE_VALUE]: unknown;
    static jsonSchema?: PrimitiveJsonSchema;
    static agent?: PrimitiveAgentFace;
    static validate(value: PrimitiveValue): boolean;
    static parseValue(value: PrimitiveValue): PrimitiveValue;
    static serializeValue(value: PrimitiveValue): PrimitiveValue;
    static _parse(this: typeof PrimitiveScalar, input: PrimitiveValue, { optional }?: {
        optional?: boolean;
    }): PrimitiveValue;
    static _serialize(this: typeof PrimitiveScalar, value: PrimitiveValue, { optional }?: {
        optional?: boolean;
    }): PrimitiveValue;
    static _checkValue(this: typeof PrimitiveScalar, value: PrimitiveValue, { optional }?: {
        optional?: boolean;
    }): void;
}

export type PrimitiveValue = Date | Dayjs | Uint8Array | boolean | null | number | object | string | undefined;

export type PromiseOrObject<T> = Promise<T> | T;

export declare const SERVER_VALUE: unique symbol;

export declare const SLICE_DICT_SHAPE: unique symbol;

export declare const SLICE_META: unique symbol;

export declare const STATE_DERIVED_META: unique symbol;

export declare const STATE_INIT_META: unique symbol;

export declare const STATE_META: unique symbol;

export type SingleValue<Value> = Value extends (infer V)[] ? SingleValue<V> : Value;

export type SshOptions = {
    host: string;
    port: number;
    username: string;
    password: string;
    dstPort?: number;
};

export type StrArrToObject<Arr, Value> = Arr extends [
    infer First,
    ...infer Rest
] ? {
    [K in First & string]: Value;
} & StrArrToObject<Rest, Value> : unknown;

export type UnCls<T> = T extends new (...args: infer _Args) => infer U ? U : never;

export declare class Upload extends PrimitiveScalar {
    static refName: "Upload";
    static [SERVER_VALUE]: File;
    static [CLIENT_VALUE]: File;
    static [DEFAULT_VALUE]: File | null;
    static [PURIFIED_VALUE]: File;
    static [EXAMPLE_VALUE]: string;
    __TEMP_TYPE__: "Upload";
}

export declare const applyFnToArrayObjects: <Input, Fn extends (arg: never) => unknown>(arraiedData: Input, fn: Fn) => ApplyFnToArrayObjectsResult<Input, ReturnType<Fn>>;

export declare const arraiedModel: <T = unknown>(modelRef: T, arrDepth?: number) => T | T[];

export declare const dayjs: typeof dayjsLib;

export declare const enumOf: <RefName extends string, const T = number | string>(refName: RefName, values: readonly T[]) => EnumInstance<RefName, T>;

export declare const getApiPrefix: () => string;

export declare const getEnv: () => ClientEnv;

export declare const getNonArrayModel: <T>(arraiedModel: T | T[]) => [
    T,
    number
];

export declare const getServerOrigin: () => string;

export declare const getWsPrefix: () => string;

export declare const isEnum: (enumRef: Cls) => boolean;

export declare const logo = "\n     _    _                  _     \n    / \\  | | ____ _ _ __    (_)___ \n   / _ \\ | |/ / _' | '_ \\   | / __|\n  / ___ \\|   < (_| | | | |_ | \\__ \\\n /_/   \\_\\_|\\_\\__,_|_| |_(_)/ |___/\n                          |__/      \n? See more details on docs  https://www.akanjs.com/docs\n\u2605 Star Akanjs on GitHub     https://github.com/akan-team/akanjs\n\n";

export declare const normalizeRoutePrefix: (value: null | string | undefined) => string | undefined;

export declare const resetEnvCache: () => void;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type MergeObjectValues<T> = T extends Record<string, infer V> ? (V extends object ? V : never) : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
```
