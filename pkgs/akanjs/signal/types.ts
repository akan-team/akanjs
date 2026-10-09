import type { DefaultPrimitiveName, UnCls } from "akanjs/base";
import type { ServiceModel } from "akanjs/service";
import type { RateLimitBudget } from "./endpointRateLimit";
import type { GuardCls } from "./guard";
import type { MiddlewareCls } from "./middleware";
import type { SliceCls } from "./slice";

export type CnstOf<S extends ServiceModel> = NonNullable<S["cnst"]>;
export type DbOf<S extends ServiceModel> = NonNullable<S["db"]>;
export type SrvOf<S extends ServiceModel> = S["srv"];
export type SrvRefName<S extends ServiceModel> = SrvOf<S>["refName"];
export type SrvMap<S extends ServiceModel> = S["srvMap"];

export type CnstRefName<S extends ServiceModel> = CnstOf<S>["refName"];
export type CnstInput<S extends ServiceModel> = CnstOf<S>["_Input"];
export type CnstFull<S extends ServiceModel> = CnstOf<S>["_Full"];
export type CnstLight<S extends ServiceModel> = CnstOf<S>["_Light"];
export type CnstInsight<S extends ServiceModel> = CnstOf<S>["_Insight"];
export type CnstDefault<S extends ServiceModel> = CnstOf<S>["_Default"];
export type CnstDefaultInput<S extends ServiceModel> = CnstOf<S>["_DefaultInput"];
export type CnstDefaultState<S extends ServiceModel> = CnstOf<S>["_DefaultState"];
export type CnstStateLight<S extends ServiceModel> = CnstOf<S>["_StateLight"];
export type CnstStateInsight<S extends ServiceModel> = CnstOf<S>["_StateInsight"];
export type CnstPurifiedInput<S extends ServiceModel> = CnstOf<S>["_PurifiedInput"];
export type CnstCapitalizedRefName<S extends ServiceModel> = CnstOf<S>["_CapitalizedRefName"];

export type DbFilter<S extends ServiceModel> = DbOf<S>["_Filter"];
export type DbDoc<S extends ServiceModel> = DbOf<S>["_Doc"];
export type DbQuery<S extends ServiceModel> = DbOf<S>["_Query"];
export type DbSort<S extends ServiceModel> = DbOf<S>["_Sort"];

export type SlceSrv<S extends SliceCls> = S["srv"];
export type SlceCnstRefName<S extends SliceCls> = CnstRefName<SlceSrv<S>>;
export type SlceCnstInput<S extends SliceCls> = CnstInput<SlceSrv<S>>;
export type SlceCnstFull<S extends SliceCls> = CnstFull<SlceSrv<S>>;
export type SlceCnstLight<S extends SliceCls> = CnstLight<SlceSrv<S>>;
export type SlceCnstInsight<S extends SliceCls> = CnstInsight<SlceSrv<S>>;
export type SlceCnstDefault<S extends SliceCls> = CnstDefault<SlceSrv<S>>;
export type SlceCnstDefaultInput<S extends SliceCls> = CnstDefaultInput<SlceSrv<S>>;
export type SlceCnstDefaultState<S extends SliceCls> = CnstDefaultState<SlceSrv<S>>;
export type SlceCnstPurifiedInput<S extends SliceCls> = CnstPurifiedInput<SlceSrv<S>>;
export type SlceCnstCapitalizedRefName<S extends SliceCls> = CnstCapitalizedRefName<SlceSrv<S>>;
export type SlceCnstStateLight<S extends SliceCls> = CnstStateLight<SlceSrv<S>>;
export type SlceCnstStateInsight<S extends SliceCls> = CnstStateInsight<SlceSrv<S>>;
export type SlceDbFilter<S extends SliceCls> = DbFilter<SlceSrv<S>>;
export type SlceDbQuery<S extends SliceCls> = DbQuery<SlceSrv<S>>;
export type SlceDbSort<S extends SliceCls> = DbSort<SlceSrv<S>>;

export const argTypes = ["body", "param", "search", "upload", "msg", "room"] as const;
export type ArgType = (typeof argTypes)[number];

interface InitOption {
  serverMode?: "federation" | "batch" | "all";
  operationMode?: ("cloud" | "edge" | "local" | (string & {}))[];
  enabled?: boolean;
  /** Instances booting together take turns and one that waited skips its own run; unset, every instance runs it. */
  once?: boolean;
}

interface TimerOption {
  serverMode?: "federation" | "batch" | "all";
  operationMode?: ("cloud" | "edge" | "local" | (string & {}))[];
  lock?: boolean;
  enabled?: boolean;
}

export type HttpMutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export interface LiveEndpointOption {
  refName: string;
  sliceKey: string;
  sort: string[];
  fallback: "invalidate" | null;
  payload: "light" | "id";
  /** Room arguments that must be empty for the room to exist at all. Enforced here as well as in the client. */
  pauseOn: string[];
}

export interface SignalOption<Response = any, Nullable extends boolean = false, _Key = keyof UnCls<Response>>
  extends InitOption,
    TimerOption {
  nullable?: Nullable;
  name?: string;
  default?: boolean;
  path?: string;
  serverMode?: "federation" | "batch" | "all";
  /**
   * Milliseconds; the server rejects with `base.error.gatewayTimeout` and the client sizes its request budget from
   * it. Losing the race does not stop the handler, which runs to completion with nobody holding its result.
   */
  timeout?: number;
  partial?: _Key[] | readonly _Key[];
  /**
   * Milliseconds to reuse the answer, keyed by endpoint and arguments; unset caches nothing. Only a `query` with no
   * internal argument may carry one (those answer per caller), and the lookup runs after the guards.
   */
  cache?: number;
  /**
   * Calls per caller per window, refused with 429 `base.error.tooManyRequests`. `by: "ip"` is counted before the body
   * is read, `by: "account"` after the middlewares and before the guards; `false` exempts it from the app's default.
   */
  rateLimit?: RateLimitBudget | false;
  guards?: GuardCls[];
  middlewares?: MiddlewareCls[];
  prefix?: false | string;
  globalPrefix?: false;
  /** HTTP verb of a `mutation`, `POST` unless named; every other endpoint type ignores it. */
  method?: HttpMutationMethod;
  fileUpload?: boolean;
  /** `false` keeps it out of the MCP catalogue (default `true`); curation, not authorization — HTTP still serves it. */
  mcp?: boolean;
  /**
   * A slow subscriber of a `pubsub(Binary)`: `"coalesce"` (default) keeps only the newest frame per room, `"queue"`
   * delivers every frame and grows the send buffer with the slowest subscriber.
   */
  backpressure?: "coalesce" | "queue";
  /** Set by the resolver on the pubsub endpoint it generates for a `.live()` slice, never by hand. */
  live?: LiveEndpointOption;

  scheduleType?: "init" | "destroy" | "cron" | "interval" | "timeout";
  scheduleCron?: string;
  scheduleTime?: number;
  lock?: boolean;
  enabled?: boolean;
}

interface SerializedSignalOption {
  args: SerializedArg[];
  path?: string;
  prefix?: false | string;
  globalPrefix?: false;
  guards?: string[];
  method?: HttpMutationMethod;
  fileUpload?: boolean;
  /** Only ever `false`, when declared. Resolved here because the API explorer holds guard names, not classes. */
  mcp?: false;
  /** Only ever `false`, when a guard declares `static agents = false` (a person-only act). */
  agents?: false;
}
export interface SerializedSlice extends SerializedSignalOption {
  /** `sort`: keys a subscriber may place a new row under itself (others refetch); `pauseOn` travels only when set. */
  live?: { sort: string[]; pauseOn?: string[] };
}

export interface SerializedReturns {
  refName: Exclude<DefaultPrimitiveName, "Map" | "Upload"> | (string & {});
  modelType?: "input" | "full" | "light" | "insight" | "scalar"; // undefined when primitive
  arrDepth?: number;
  partial?: string[];
  nullable?: boolean;
}
export interface SerializedArg {
  type: ArgType;
  refName: Exclude<DefaultPrimitiveName, "Map"> | (string & {});
  name: string;
  modelType?: "input" | "object" | "insight" | "scalar"; // undefined when primitive
  arrDepth?: number;
  nullable?: boolean;
  example?: string | number | boolean | Date;
  enum?: string;
  oneOf?: (string | number)[];
  /** The model a filter's id argument points at, so a UI can offer a picker. */
  ref?: string;
}
export interface SerializedEndpoint extends SerializedSignalOption {
  type: "query" | "mutation" | "pubsub" | "message";
  returns: SerializedReturns;
  /** Milliseconds; the client sizes its request budget from it. */
  timeout?: number;
}
export interface SerializedFilter {
  filter: { [key: string]: SerializedArg[] };
  sortKeys: string[];
  /** The field map behind each sort key, which a live subscriber needs to place a new row itself. */
  sorts?: { [key: string]: { [path: string]: 1 | -1 } };
}

export interface SerializedSignal {
  prefix?: string;
  slice?: { [key: string]: SerializedSlice };
  endpoint: { [key: string]: SerializedEndpoint };
  filter?: SerializedFilter;
  getGuards?: string[];
  cruGuards?: string[];
  createGuards?: string[];
  updateGuards?: string[];
  removeGuards?: string[];
  /** Generated CRUD verbs kept off the agent shelf, carried here because `FetchClient.getBaseEndpoint` synthesizes them. */
  mcp?: SerializedSignalMcp;
  /** Generated CRUD verbs the server does not mount at all, so no client synthesizes them. */
  crud?: SerializedSignalMcp;
  /** Which generated CRUD verbs a person-only guard protects, by the same verb map; only the `false` keys travel. */
  agents?: SerializedSignalMcp;
  /** The app or lib that registered the signal, first registrant first: an app extending a lib module reads `["shared", "sceny"]`. */
  origin?: string[];
}

/** Keyed by generated verb, mirroring the `guards` map `slice()` takes. The root slice's own flag rides on `slice[""]`. */
export interface SerializedSignalMcp {
  get?: false;
  create?: false;
  update?: false;
  remove?: false;
}

export type SignalType = "restapi" | "websocket";

export type WebsocketReqData = { key: string; data: unknown[]; subscribe?: boolean };
export type WebsocketMessageData = { type: "msg"; key: string; data: object | object[] };
/**
 * `op` is relative to the room, not the database: a row edited out of a filter is `leave` there and `enter` where it
 * joined, a soft delete is `leave` everywhere, and `invalidate` (no document) means refetch.
 */
export interface LiveEventPayload {
  op: "enter" | "update" | "leave" | "invalidate";
  id: string;
  light?: object | null;
}

/**
 * `roomId` is the room the server joined, `requestRoomId` the one the client built; they differ only for a live room,
 * whose id also carries the caller's internal arguments. The client re-keys on the pair.
 */
export type WebsocketSubscribeAck = {
  type: "sub";
  roomId: string;
  requestRoomId: string;
  subscribe: boolean;
};
export type WebsocketPublishData = { type: "pub"; roomId: string; data: object | object[] };
export type WebsocketAuthAck = { type: "auth"; revokedRooms: string[] };
export type WebsocketResData = WebsocketMessageData | WebsocketSubscribeAck | WebsocketPublishData | WebsocketAuthAck;
