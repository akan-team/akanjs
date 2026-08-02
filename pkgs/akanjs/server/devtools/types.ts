/**
 * Payload contracts for the local-dev metadata endpoints consumed by developer tools.
 *
 *   GET /_akan/devtools    -> DevtoolsIndex
 *   GET /_akan/constant    -> DevtoolsEnvelope<"constant",   ConstantData>
 *   GET /_akan/signal      -> DevtoolsEnvelope<"signal",     SignalData>
 *   GET /_akan/dictionary  -> DevtoolsEnvelope<"dictionary", DictionaryData>
 *   GET /_akan/deps        -> DevtoolsEnvelope<"deps",       DepsData>
 */

import type { ConstantType, TextFieldRole } from "akanjs/constant";
import type { RootDictionary } from "akanjs/dictionary";
import type { ArgType, SerializedArg, SerializedReturns } from "akanjs/signal";

// * ==================== Envelope ==================== * //

export interface DevtoolsIndex {
  version: 1;
  endpoints: { kind: string; path: string }[];
}

export interface DevtoolsApp {
  name: string;
  repoName: string;
  serveDomain: string;
  environment: string;
  operationMode: string;
  serverMode: "federation" | "batch" | "all";
  pid: number;
  replicaIdx: number;
}

export interface DevtoolsEnvelope<Kind extends string, Data> {
  kind: Kind;
  /** Payload contract version. Bump on any breaking shape change. */
  version: 1;
  generatedAt: string;
  app: DevtoolsApp;
  data: Data;
}

/** Emitted in place of anything JSON cannot represent. */
export interface Unserializable {
  __akan: "unserializable";
  type: "function" | "class" | "symbol" | "bigint" | "circular" | "depth-limit";
  name?: string;
}

// * ==================== /_akan/constant ==================== * //

export type ConstantFieldKind = "property" | "hidden" | "secret" | "resolve";

export type FieldType =
  | { kind: "primitive"; refName: string }
  | { kind: "enum"; refName: string; values: (string | number)[] }
  | { kind: "model"; refName: string; modelType: ConstantType; modelName: string }
  | { kind: "map"; value: FieldType; valueArrDepth: number }
  | { kind: "unknown"; refName: string };

export interface ConstantFieldNode {
  name: string;
  fieldKind: ConstantFieldKind;
  type: FieldType;
  arrDepth: number;
  nullable: boolean;
  immutable: boolean;
  select: boolean;
  /** `"function"` for `default: () => dayjs()` — the factory is never invoked. */
  defaultKind: "value" | "function" | "none";
  default?: unknown;
  ref?: string;
  refPath?: string;
  refType?: "child" | "parent" | "relation";
  min?: number;
  max?: number;
  minlength?: number;
  maxlength?: number;
  /** `ConstantFieldProps["type"]`: "email" | "password" | "url". */
  preset?: string;
  text?: TextFieldRole;
  accumulate?: unknown;
  example?: unknown;
  meta?: Record<string, unknown>;
  hasValidate: boolean;
}

export interface ConstantModelView {
  modelName: string;
  modelType: ConstantType;
  fields: Record<string, ConstantFieldNode>;
}

export interface FilterArg {
  name: string;
  type: FieldType;
  arrDepth: number;
  nullable: boolean;
  ref?: string;
  default?: unknown;
}

export type ConstantModelViewKey = "input" | "object" | "full" | "light" | "insight";

export interface ConstantModelNode {
  refName: string;
  modelNames: Record<ConstantModelViewKey, string>;
  views: Record<ConstantModelViewKey, ConstantModelView>;
  filter?: { query: Record<string, FilterArg[]>; sort: string[] };
}

export interface EnumNode {
  /** `ConstantRegistry.enum` map key — `lowerlize(exportName)`, not always `refName`. */
  key: string;
  refName: string;
  values: (string | number)[];
}

export interface RelationEdge {
  from: string;
  fromView: ConstantType;
  field: string;
  to: string;
  toView: ConstantType;
  arrDepth: number;
  nullable: boolean;
  refType?: "child" | "parent" | "relation";
}

export interface ConstantData {
  models: Record<string, ConstantModelNode>;
  scalars: Record<string, ConstantModelView>;
  enums: Record<string, EnumNode>;
  values: Record<string, unknown>;
  primitives: string[];
  relations: RelationEdge[];
}

// * ==================== /_akan/signal ==================== * //

export type { ArgType, SerializedArg, SerializedReturns };

export interface EndpointNode {
  type: "query" | "mutation" | "pubsub" | "message";
  args: SerializedArg[];
  returns: SerializedReturns;
  path?: string;
  prefix?: false | string;
  globalPrefix?: false;
  guards?: string[];
  fileUpload?: boolean;
  cache?: number;
  timeout?: number;
}

export interface SliceNode {
  args: SerializedArg[];
  path?: string;
  guards?: string[];
}

export type InternalType = "init" | "destroy" | "cron" | "interval" | "timeout" | "process" | "resolveField";

export interface InternalNode {
  key: string;
  type: InternalType;
  enabled: boolean;
  lock?: boolean;
  serverMode?: "federation" | "batch" | "all";
  operationMode?: string[];
  schedule?: { cron?: string; everyMs?: number };
  args: SerializedArg[];
  /** `InternalArgCls` refNames from `InternalInfo.internalArgs`. */
  internalArgs: string[];
  returns?: SerializedReturns;
  /** Mirrors the resolver's schedule placement rules for this process's serverMode. */
  scheduledHere: boolean;
  skipReason?: string;
}

export interface SignalNode {
  refName: string;
  kind: "database" | "service";
  cnstRefName?: string;
  classNames: { internal?: string; endpoint: string; slice?: string; server?: string };
  guards: { get?: string[]; cru?: string[]; create?: string[]; update?: string[]; remove?: string[] };
  internal: Record<string, InternalNode>;
  slice: Record<string, SliceNode>;
  /** Endpoints declared in `.signal.ts`. */
  endpoint: Record<string, EndpointNode>;
  /** Framework-synthesized endpoints — absent from `SerializedSignal.endpoint`. */
  generated: {
    crud: Record<string, EndpointNode>;
    slice: Record<string, EndpointNode>;
  };
}

export interface RouteRow {
  signal: string;
  key: string;
  source: "declared" | "crud" | "slice";
  type: "query" | "mutation" | "message" | "pubsub";
  transport: "http" | "ws";
  method: "GET" | "POST" | null;
  /** Fully prefixed, `:param` placeholders intact — e.g. `/api/user/:userId`. */
  path: string;
  guards: string[];
  cache?: number;
  timeout?: number;
  fileUpload?: boolean;
}

export interface SignalData {
  prefix: string;
  websocketPrefix: string;
  signals: Record<string, SignalNode>;
  routes: RouteRow[];
  guards: string[];
  middlewares: string[];
}

// * ==================== /_akan/dictionary ==================== * //

export interface DictionaryModuleNode {
  kind: "model" | "scalar" | "service";
  languages: string[];
}

export interface DictionaryData {
  languages: string[];
  modules: Record<string, DictionaryModuleNode>;
  /** `{ [lang]: { [refName]: node } }` — already plain JSON, no coercion applied. */
  dictionary: RootDictionary;
  /** Flattened dotted paths, e.g. `"user.signal.createUser.arg.data"`. */
  keys: string[];
}

// * ==================== /_akan/deps ==================== * //

export type DepNodeKind =
  | "service"
  | "adaptor"
  | "serverSignal"
  | "internal"
  | "endpoint"
  | "slice"
  | "use"
  | "middleware"
  | "webProxy"
  | "env";

export interface DepNode {
  /** Kind-prefixed so ids never collide across kinds — e.g. `"service:user"`. */
  id: string;
  kind: DepNodeKind;
  refName: string;
  className?: string;
  /** Index into `stages.service` / `stages.adaptor` — use as graph rank. */
  stage?: number;
  enabled?: boolean;
  serviceType?: "database" | "plain";
  cnstRefName?: string;
  role?: string;
}

export type DepEdgeKind = "database" | "service" | "use" | "signal" | "plug" | "env" | "memory";

export interface DepEdge {
  from: string;
  to: string;
  kind: DepEdgeKind;
  /** Injected field name on the source class. */
  prop: string;
  /** `plug` only: the concrete adaptor a role resolved to. */
  resolvedTo?: string;
  detail?: Record<string, unknown>;
}

export interface DepsData {
  app: {
    name: string;
    status: string;
    serverMode: "federation" | "batch" | "all";
    prefix: string;
    websocketPrefix: string;
    openapi: boolean;
  };
  nodes: DepNode[];
  edges: DepEdge[];
  /** `registry.adaptorRole`, roleCls.refName → adaptorCls.refName. */
  roles: { role: string; impl: string }[];
  /** Topologically-resolved init batches from `DiLifecycle.hierarchy`. */
  stages: { adaptor: string[][]; service: string[][] };
  /** `public` carries values for `AKAN_PUBLIC_*` only; every other key contributes a name to `keys`. */
  env: { public: Record<string, string>; keys: string[] };
  disabledModules: { refName: string; reason: string }[];
}
