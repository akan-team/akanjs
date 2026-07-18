import {
  type Cls,
  DataList,
  DEFAULT_VALUE,
  type EnumInstance,
  getEnv,
  getNonArrayModel,
  isEnum,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import { ConstantRegistry } from "akanjs/constant";

export type StateInitializer = () => unknown;
export type StateInitializerMap = Record<string, StateInitializer>;
export type SearchParamsState = Record<string, string | string[]>;

export interface PersistSessionMeta {
  kind: "persist" | "session";
  key: string;
  storageKey: string;
  parse: (value: unknown) => unknown;
  serialize: (value: unknown) => unknown;
  getDefault: () => unknown;
}

export interface SearchMeta {
  kind: "search";
  key: string;
  paramKey: string;
  parseSearch: (searchParams: SearchParamsState) => unknown;
  getDefault: () => unknown;
}

export interface ComputedMeta {
  kind: "computed";
  key: string;
  deps: readonly string[];
  selector: (...values: any[]) => any;
  equals: (a: any, b: any) => boolean;
}

export interface StateDerivedMeta {
  persistSession: Record<string, PersistSessionMeta>;
  search: Record<string, SearchMeta>;
  computed: Record<string, ComputedMeta>;
  derivedKeys: Set<string>;
}

const STATE_BUILDER_MARK = Symbol.for("akanjs.store.builder.marker");

type Marker =
  | { [STATE_BUILDER_MARK]: true; kind: "persist" | "session"; type: any; options: PersistSessionOptions<any> }
  | { [STATE_BUILDER_MARK]: true; kind: "search"; paramKey: string; type: any; options: SearchOptions<any> }
  | {
      [STATE_BUILDER_MARK]: true;
      kind: "computed";
      deps: readonly string[];
      selector: (...values: any[]) => any;
      options: ComputedOptions<any>;
    };

export interface PersistSessionOptions<T> {
  default?: T | (() => T);
  key?: string;
  nullable?: boolean;
}

export interface SearchOptions<T> {
  default?: T | (() => T);
  nullable?: boolean;
}

export interface ComputedOptions<T> {
  equals?: (a: T, b: T) => boolean;
}

type PrimitiveInput = typeof PrimitiveScalar | StringConstructor | BooleanConstructor | DateConstructor;
type FieldTypeInput = PrimitiveInput | Cls | EnumInstance | FieldTypeInput[];

type ValueOfType<T> = T extends readonly (infer V)[]
  ? ValueOfType<V>[]
  : T extends { [DEFAULT_VALUE]: infer V }
    ? V
    : T extends EnumInstance<any, infer V>
      ? V
      : T extends new (
            ...args: any[]
          ) => infer V
        ? V
        : any;

type NullableValue<Value, Options> = Options extends { nullable: true } ? Value | null : Value;

export type WritableStateOf<State> = {
  [K in keyof State]: State[K] extends Marker ? MarkerValue<State[K]> : State[K];
};

type MarkerValue<M> = M extends { kind: "persist" | "session"; type: infer T; options: infer O }
  ? NullableValue<ValueOfType<T>, O>
  : M extends { kind: "search"; type: infer T; options: infer O }
    ? NullableValue<ValueOfType<T>, O>
    : M extends { kind: "computed"; selector: (...args: any[]) => infer R }
      ? R
      : never;

export type DerivedStateOf<State> = {
  [K in keyof State]: State[K] extends Marker ? MarkerValue<State[K]> : never;
};

export type DepValues<State, Keys extends readonly (keyof State)[]> = {
  [I in keyof Keys]: Keys[I] extends keyof State ? State[Keys[I]] : never;
};

export interface WritableStateBuilder {
  persist<T extends FieldTypeInput, Options extends PersistSessionOptions<any>>(
    type: T,
    options?: Options,
  ): { [STATE_BUILDER_MARK]: true; kind: "persist"; type: T; options: Options };
  session<T extends FieldTypeInput, Options extends PersistSessionOptions<any>>(
    type: T,
    options?: Options,
  ): { [STATE_BUILDER_MARK]: true; kind: "session"; type: T; options: Options };
}

export interface DerivedStateBuilder<WritableState> {
  search<T extends FieldTypeInput, Options extends SearchOptions<any>>(
    paramKey: string,
    type: T,
    options?: Options,
  ): { [STATE_BUILDER_MARK]: true; kind: "search"; paramKey: string; type: T; options: Options };
  computed<const Keys extends readonly (keyof WritableState & string)[], Result>(
    deps: Keys,
    selector: (...values: DepValues<WritableState, Keys>) => Result,
    options?: ComputedOptions<Result>,
  ): {
    [STATE_BUILDER_MARK]: true;
    kind: "computed";
    deps: Keys;
    selector: (...values: any[]) => Result;
    options: ComputedOptions<Result>;
  };
}

export const createEmptyDerivedMeta = (): StateDerivedMeta => ({
  persistSession: {},
  search: {},
  computed: {},
  derivedKeys: new Set(),
});

export const mergeDerivedMeta = (...metas: (StateDerivedMeta | undefined)[]): StateDerivedMeta => {
  const merged = createEmptyDerivedMeta();
  for (const meta of metas) {
    if (!meta) continue;
    mergeMetaRecord(merged.persistSession, meta.persistSession);
    mergeMetaRecord(merged.search, meta.search);
    mergeMetaRecord(merged.computed, meta.computed);
    for (const key of meta.derivedKeys) {
      if (merged.derivedKeys.has(key)) throw new Error(`Duplicate derived state key: ${key}`);
      merged.derivedKeys.add(key);
    }
  }
  return merged;
};

const mergeMetaRecord = <T>(target: Record<string, T>, source: Record<string, T>) => {
  for (const [key, value] of Object.entries(source)) {
    if (key in target) throw new Error(`Duplicate state metadata key: ${key}`);
    target[key] = value;
  }
};

export const createWritableStateBuilder = (): WritableStateBuilder => ({
  persist: (type, options) => ({ [STATE_BUILDER_MARK]: true, kind: "persist", type, options: options ?? {} }) as any,
  session: (type, options) => ({ [STATE_BUILDER_MARK]: true, kind: "session", type, options: options ?? {} }) as any,
});

export const createDerivedStateBuilder = <WritableState>(): DerivedStateBuilder<WritableState> => ({
  search: (paramKey, type, options) =>
    ({ [STATE_BUILDER_MARK]: true, kind: "search", paramKey, type, options: options ?? {} }) as any,
  computed: (deps, selector, options) =>
    ({ [STATE_BUILDER_MARK]: true, kind: "computed", deps, selector, options: options ?? {} }) as any,
});

export const isStateBuilderMarker = (value: unknown): value is Marker =>
  Boolean(value && typeof value === "object" && (value as { [STATE_BUILDER_MARK]?: boolean })[STATE_BUILDER_MARK]);

export const createStateInitializerMap = (state: Record<string, unknown>): StateInitializerMap =>
  Object.fromEntries(Object.entries(state).map(([key, value]) => [key, makeDefaultFactory(value)]));

export const evaluateInitializers = (initializers: StateInitializerMap): Record<string, unknown> =>
  Object.fromEntries(Object.entries(initializers).map(([key, init]) => [key, init()]));

export const resolveWritableState = (
  refName: string,
  state: Record<string, unknown>,
): { shape: Record<string, unknown>; initializers: StateInitializerMap; meta: StateDerivedMeta } => {
  const shape: Record<string, unknown> = {};
  const initializers: StateInitializerMap = {};
  const meta = createEmptyDerivedMeta();

  for (const [key, value] of Object.entries(state)) {
    if (isStateBuilderMarker(value)) {
      if (value.kind !== "persist" && value.kind !== "session") throw new Error(`${value.kind} is not writable state`);
      const codec = createCodec(value.type, value.options);
      const defaultFactory = createTypedDefaultFactory(value.type, value.options);
      const storageKey = createStorageKey(refName, value.options.key ?? key);
      shape[key] = defaultFactory();
      initializers[key] = defaultFactory;
      meta.persistSession[key] = {
        kind: value.kind,
        key,
        storageKey,
        parse: codec.parse,
        serialize: codec.serialize,
        getDefault: defaultFactory,
      };
    } else {
      shape[key] = value;
      initializers[key] = makeDefaultFactory(value);
    }
  }
  return { shape, initializers, meta };
};

export const resolveDerivedState = <WritableState>(
  state: Record<string, unknown>,
  writableKeys: Set<string>,
): { shape: Record<string, unknown>; meta: StateDerivedMeta } => {
  const shape: Record<string, unknown> = {};
  const meta = createEmptyDerivedMeta();

  for (const [key, value] of Object.entries(state)) {
    if (!isStateBuilderMarker(value))
      throw new Error(`Derived state ${key} must be declared with search() or computed()`);
    if (writableKeys.has(key)) throw new Error(`Derived state key conflicts with writable state: ${key}`);
    meta.derivedKeys.add(key);
    if (value.kind === "search") {
      const defaultFactory = createTypedDefaultFactory(value.type, value.options);
      shape[key] = defaultFactory();
      meta.search[key] = {
        kind: "search",
        key,
        paramKey: value.paramKey,
        getDefault: defaultFactory,
        parseSearch: createSearchParser(value.type, value.options, value.paramKey),
      };
    } else if (value.kind === "computed") {
      const invalidDeps = value.deps.filter((dep) => !writableKeys.has(dep));
      if (invalidDeps.length) throw new Error(`Computed ${key} has invalid deps: ${invalidDeps.join(", ")}`);
      shape[key] = undefined;
      meta.computed[key] = {
        kind: "computed",
        key,
        deps: value.deps,
        selector: value.selector,
        equals: value.options.equals ?? Object.is,
      };
    } else throw new Error(`${value.kind} is not derived state`);
  }
  return { shape, meta };
};

export const makeDefaultFactory = (value: unknown): StateInitializer => {
  if (typeof value === "function") return value as StateInitializer;
  if (value === null || value === undefined) return () => value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return () => value;
  if (value instanceof Date) return () => new Date(value);
  if (Array.isArray(value)) return () => value.map((v) => makeDefaultFactory(v)());
  if (value instanceof Map) return () => new Map(value);
  if (value instanceof DataList) return () => new DataList(value);
  if (typeof value === "object") {
    if (isConstantInstance(value)) return () => new (value.constructor as new (arg: unknown) => object)(value);
    if (!isPlainObject(value)) return () => value;
    return () => {
      if (typeof structuredClone === "function") {
        try {
          return structuredClone(value);
        } catch {
          // Fall back to recursive clone for class-like plain data.
        }
      }
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, makeDefaultFactory(val)()]));
    };
  }
  return () => value;
};

const isConstantInstance = (value: object) => ConstantRegistry.has(value.constructor as Cls);

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const createTypedDefaultFactory = (type: any, options: { default?: any; nullable?: boolean }): StateInitializer => {
  if (options.default !== undefined) return makeDefaultFactory(options.default);
  if (options.nullable) return () => null;
  const [modelRef, arrDepth] = getNonArrayModel(type);
  if (arrDepth > 0) return () => [];
  if (isEnum(modelRef)) return () => (modelRef as EnumInstance).values[0];
  if (PrimitiveRegistry.has(modelRef as Cls)) {
    const defaultValue = (modelRef as typeof PrimitiveScalar)[DEFAULT_VALUE];
    return makeDefaultFactory(defaultValue);
  }
  if (ConstantRegistry.has(modelRef as Cls)) return () => new (modelRef as Cls)();
  throw new Error(`Invalid state type: ${String(modelRef)}`);
};

const createCodec = (type: any, options: { nullable?: boolean }) => {
  const parse = (value: unknown) => {
    if (options.nullable && (value === null || value === undefined)) return null;
    return parseTypedValue(type, value, options);
  };
  const serialize = (value: unknown) => {
    if (options.nullable && (value === null || value === undefined)) return null;
    return serializeTypedValue(type, value, options);
  };
  return { parse, serialize };
};

const parseTypedValue = (type: any, value: any, options: { nullable?: boolean }): any => {
  const [modelRef, arrDepth] = getNonArrayModel(type);
  if (arrDepth > 0) {
    if (!Array.isArray(value)) throw new Error("Expected array value");
    return value.map((v) => parseTypedValue(modelRef, v, options));
  }
  if (isEnum(modelRef)) {
    const enumRef = modelRef as EnumInstance;
    const parsed = parseTypedValue(enumRef.type, value, options);
    if (!enumRef.has(parsed)) throw new Error(`Invalid enum value: ${parsed}`);
    return parsed;
  }
  if (PrimitiveRegistry.has(modelRef as Cls))
    return (modelRef as typeof PrimitiveScalar)._parse(value, { optional: options.nullable });
  if (ConstantRegistry.has(modelRef as Cls))
    return ConstantRegistry.deserialize(modelRef as Cls, value, Boolean(options.nullable));
  throw new Error(`Invalid state type: ${String(modelRef)}`);
};

const serializeTypedValue = (type: any, value: any, options: { nullable?: boolean }): any => {
  const [modelRef, arrDepth] = getNonArrayModel(type);
  if (arrDepth > 0) {
    if (!Array.isArray(value)) throw new Error("Expected array value");
    return value.map((v) => serializeTypedValue(modelRef, v, options));
  }
  if (isEnum(modelRef)) return serializeTypedValue((modelRef as EnumInstance).type, value, options);
  if (PrimitiveRegistry.has(modelRef as Cls))
    return (modelRef as typeof PrimitiveScalar)._serialize(value, { optional: options.nullable });
  if (ConstantRegistry.has(modelRef as Cls))
    return ConstantRegistry.serialize(modelRef as Cls, value, Boolean(options.nullable));
  throw new Error(`Invalid state type: ${String(modelRef)}`);
};

const createSearchParser =
  (type: any, options: SearchOptions<any>, paramKey: string) => (searchParams: SearchParamsState) => {
    const raw = searchParams[paramKey];
    if (raw === undefined || raw === "") return createTypedDefaultFactory(type, options)();
    try {
      return parseSearchValue(type, raw, options);
    } catch (error) {
      warnDev(`Failed to parse search param ${paramKey}: ${error instanceof Error ? error.message : String(error)}`);
      return createTypedDefaultFactory(type, options)();
    }
  };

const parseSearchValue = (type: any, raw: string | string[], options: SearchOptions<any>): any => {
  const [modelRef, arrDepth] = getNonArrayModel(type);
  if (arrDepth > 0) {
    if (isPrimitiveOrEnum(modelRef)) {
      const values = Array.isArray(raw) ? raw : tryParseSearchArray(raw);
      return values.map((value) => parseSearchValue(modelRef, value, options));
    }
    const parsed = JSON.parse(firstSearchParam(raw) ?? "[]");
    return parseTypedValue(type, parsed, options);
  }
  if (isEnum(modelRef)) return parseSearchValue((modelRef as EnumInstance).type, raw, options);
  if (modelRef === Boolean) {
    const value = firstSearchParam(raw);
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`Invalid boolean search value: ${value}`);
  }
  if (PrimitiveRegistry.has(modelRef as Cls)) return parseTypedValue(modelRef, firstSearchParam(raw), options);
  const parsed = JSON.parse(firstSearchParam(raw) ?? "{}");
  return parseTypedValue(type, parsed, options);
};

const isPrimitiveOrEnum = (modelRef: any) => PrimitiveRegistry.has(modelRef as Cls) || isEnum(modelRef);

const tryParseSearchArray = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
};

export const getSearchParam = (searchParams: SearchParamsState, key: string): string | undefined =>
  firstSearchParam(searchParams[key]);

const firstSearchParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

let memorySessionKey: string | undefined;
const getSessionKey = () => {
  const key = "akanjs.sessionKey";
  if (typeof sessionStorage !== "undefined") {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) return stored;
      const next = Math.random().toString(36).slice(2);
      sessionStorage.setItem(key, next);
      return next;
    } catch {
      // fall through
    }
  }
  memorySessionKey ??= Math.random().toString(36).slice(2);
  return memorySessionKey;
};

const createStorageKey = (refName: string, key: string) =>
  `${getEnv().appName}.${getEnv().environment}.${getSessionKey()}.${refName}.${key}`;

const warnDev = (message: string) => {
  if (getEnv().environment === "main") return;
  console.warn(message);
};
