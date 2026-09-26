import type { DefaultPrimitiveName, UnCls } from "akanjs/base";
import type { ServiceModel } from "akanjs/service";
import type { GuardCls } from "./guard";
import type { MiddlewareCls } from "./middleware";
import type { SliceCls } from "./slice";

// --- ServiceModel projection helpers (D1) ---
// Use these instead of re-typing `NonNullable<SrvModule["cnst"]>["_Full"]` /
// `SlceCls["srv"]["cnst"]["_Full"]` everywhere. Centralizing the path keeps
// type derivations consistent and dramatically reduces the amount of text
// TypeScript has to re-evaluate at each callsite.
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

// Slice-cls shortcuts (common in store/state/action). The branches that
// include `SlceCls extends SliceCls` preserve `ServiceModel` inference.
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
  /**
   * For an `initialize` that must not run on two instances at once — a find-or-create would create twice. Instances
   * booting together take turns, and one that waited for another's run skips its own; an instance booting later still
   * runs it. Every instance runs it at once when unset, which suits per-process work such as warming a cache.
   */
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
   * How long this endpoint may take, in milliseconds. It bounds both ends: the `Timeout` middleware — registered
   * by default — rejects the call with `base.error.gatewayTimeout` once it is spent, and the value is serialized
   * to the client, where it becomes that call's request budget in place of the client default. Declared nowhere,
   * neither side imposes one beyond the client's own default.
   *
   * Losing the race does not stop the work: the handler runs to completion with nobody holding its result.
   */
  timeout?: number;
  partial?: _Key[] | readonly _Key[];
  /**
   * How long this endpoint's answer may be reused, in milliseconds. The call keeps the handler's result under the
   * endpoint's key and its arguments and serves it until it expires; declared nowhere, nothing is cached.
   *
   * **Only a `query` that takes no internal argument may carry one.** Internal arguments are how a call learns
   * who is asking (`.with(Self)`), so an endpoint that has them answers per caller, and one shared entry would be
   * one caller's answer handed to the next; such an endpoint is named in the log and left uncached. The lookup
   * runs after the guards, so a hit reaches only a caller they admitted — a shared answer is not a public one.
   */
  cache?: number;
  guards?: GuardCls[];
  middlewares?: MiddlewareCls[];
  prefix?: false | string;
  globalPrefix?: false;
  /**
   * HTTP verb for a `mutation`, `POST` unless named. Only a foreign wire protocol needs the others — a client
   * that cannot be changed and sends `PATCH /rest/v1/<table>`. Every other endpoint type ignores it.
   */
  method?: HttpMutationMethod;
  /** Marks this mutation as the framework file-upload endpoint (see resolveFileUploadCapability). */
  fileUpload?: boolean;
  /**
   * Whether this endpoint belongs on an agent's shelf. `true` — the default — publishes it to MCP subject to the
   * guard and shape rules; `false` keeps it out of the catalogue entirely.
   *
   * This is curation, not authorization: HTTP serves the endpoint exactly as before, and the guards are still the
   * only thing deciding who may call it. Write it where an endpoint is perfectly guarded and still has no business
   * on a shelf — a step of a UI-driven state machine (`requestPhoneCodeForSignin`), or a read a model would only
   * ever call by mistake. Every catalogue entry carries the model schemas it mentions, so one endpoint dropped
   * here is kilobytes off every `tools/list`.
   */
  mcp?: boolean;
  /**
   * What a `pubsub(Binary)` does when a subscriber cannot keep up. `"coalesce"` (the default) keeps only the
   * newest frame per room, which is what a telemetry or video stream wants — an old frame is worthless once a
   * newer one exists. Name `"queue"` when the frames are a sequence a subscriber has to see in full, such as
   * deltas against a base it already holds; the send buffer then grows with the slowest subscriber.
   */
  backpressure?: "coalesce" | "queue";
  /**
   * Set by the resolver on the pubsub endpoint it generates for a `.live()` slice, never by hand. It carries what
   * the room needs to route a change — which model, and how the slice asked to be treated.
   */
  live?: LiveEndpointOption;

  // * ==================== Schedule ==================== * //
  scheduleType?: "init" | "destroy" | "cron" | "interval" | "timeout";
  scheduleCron?: string;
  scheduleTime?: number;
  lock?: boolean;
  enabled?: boolean;
  // * ==================== Schedule ==================== * //
}

interface SerializedSignalOption {
  args: SerializedArg[];
  path?: string;
  prefix?: false | string;
  globalPrefix?: false;
  guards?: string[];
  method?: HttpMutationMethod;
  fileUpload?: boolean;
  /**
   * Only ever `false`, and only when something declared it: `true` is the default, so serializing it would ship a
   * field per endpoint that says nothing. Resolved here rather than left to the reader because the browser API
   * explorer has guard *names* and no classes, and a second implementation of the rule would eventually disagree
   * with the catalogue.
   */
  mcp?: false;
  /**
   * Only ever `false`, and only when one of the guards declares `static agents = false`: a person-only act. Resolved
   * here for the same reason `mcp` is — the reader holds guard names, not classes.
   */
  agents?: false;
}
export interface SerializedSlice extends SerializedSignalOption {
  /**
   * Present when the slice declared `.live()`. `sort` is the allowlist of sort keys a subscriber may place a new
   * row under itself; on any other sort an insertion refetches instead of guessing where the row goes. `pauseOn`
   * names the arguments that switch the room off while they carry a value, and travels only when there are any.
   */
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
  /** The values this arg accepts, when they are a fixed list the caller has to pick from. */
  oneOf?: (string | number)[];
  /** For an id a filter declared against a model: the model it points at, so a UI can offer a picker. */
  ref?: string;
}
export interface SerializedEndpoint extends SerializedSignalOption {
  type: "query" | "mutation" | "pubsub" | "message";
  returns: SerializedReturns;
  /**
   * The deadline the endpoint declared, in milliseconds. It travels because the client has to size its own
   * request budget from it: a call the server is allowed to spend five minutes on is one the browser must not
   * abandon after the client default.
   */
  timeout?: number;
}
export interface SerializedFilter {
  /** Every filter query the model declares, by key, with the args each one takes. */
  filter: { [key: string]: SerializedArg[] };
  sortKeys: string[];
  /**
   * The field map behind each sort key, which a live subscriber needs to place a new row without asking the server
   * where it goes. Only the keys a `.live({ sort })` allowlist names are ever compared against it.
   */
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
  /**
   * Which generated CRUD verbs this model keeps off the agent shelf. Carried on the signal because the endpoints
   * it names do not exist until `FetchClient.getBaseEndpoint` synthesizes them. Only the `false` keys travel.
   */
  mcp?: SerializedSignalMcp;
  /** Which generated CRUD verbs a person-only guard protects, by the same verb map; only the `false` keys travel. */
  agents?: SerializedSignalMcp;
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
 * One document change, as one live room sees it.
 *
 * The verb is relative to the room and not to the database: a row edited out of a filter arrives as `leave` in the
 * list it left and `enter` in the one it joined, and a soft delete is a `leave` everywhere. `invalidate` carries no
 * document at all — it is what a room that cannot be routed in memory sends instead, and it means refetch.
 */
export interface LiveEventPayload {
  op: "enter" | "update" | "leave" | "invalidate";
  id: string;
  light?: object | null;
}

/**
 * `roomId` is the room the server actually joined; `requestRoomId` is the one the client built from the arguments
 * it sent. They differ only for a live room, whose id also carries the caller's resolved internal arguments so
 * that two subscribers of the same `inSelf` slice do not share one room. The client re-keys on the pair.
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
