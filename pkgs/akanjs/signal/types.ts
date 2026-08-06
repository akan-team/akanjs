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
export type CnstFull<S extends ServiceModel> = UnCls<CnstOf<S>["full"]> & CnstOf<S>["_Full"];
export type CnstLight<S extends ServiceModel> = UnCls<CnstOf<S>["light"]> & CnstOf<S>["_Light"];
export type CnstInsight<S extends ServiceModel> = UnCls<CnstOf<S>["insight"]> & CnstOf<S>["_Insight"];
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
}

interface TimerOption {
  serverMode?: "federation" | "batch" | "all";
  operationMode?: ("cloud" | "edge" | "local" | (string & {}))[];
  lock?: boolean;
  enabled?: boolean;
}

export interface SignalOption<Response = any, Nullable extends boolean = false, _Key = keyof UnCls<Response>>
  extends InitOption,
    TimerOption {
  nullable?: Nullable;
  name?: string;
  default?: boolean;
  path?: string;
  serverMode?: "federation" | "batch" | "all";
  timeout?: number;
  partial?: _Key[] | readonly _Key[];
  cache?: number;
  guards?: GuardCls[];
  middlewares?: MiddlewareCls[];
  prefix?: false | string;
  globalPrefix?: false;
  /** Marks this mutation as the framework file-upload endpoint (see resolveFileUploadCapability). */
  fileUpload?: boolean;

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
  fileUpload?: boolean;
}
export interface SerializedSlice extends SerializedSignalOption {}

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
}
export interface SerializedEndpoint extends SerializedSignalOption {
  type: "query" | "mutation" | "pubsub" | "message";
  returns: SerializedReturns;
}
export interface SerializedFilter {
  filter: { [key: string]: SerializedArg[] };
  sortKeys: string[];
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
}

export type SignalType = "restapi" | "websocket";

export type WebsocketReqData = { key: string; data: unknown[]; subscribe?: boolean };
export type WebsocketMessageData = { type: "msg"; key: string; data: object | object[] };
export type WebsocketSubscribeAck = { type: "sub"; roomId: string; subscribe: boolean };
export type WebsocketPublishData = { type: "pub"; roomId: string; data: object | object[] };
export type WebsocketAuthAck = { type: "auth"; revokedRooms: string[] };
export type WebsocketResData = WebsocketMessageData | WebsocketSubscribeAck | WebsocketPublishData | WebsocketAuthAck;
