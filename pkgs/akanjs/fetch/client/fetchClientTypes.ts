import type { PromiseOrObject } from "akanjs/base";
import type { DatabaseSignal, SerializedReturns } from "akanjs/signal";
import type { ClientSignal, SliceMeta } from "../fetchType";
import type { FetchClient } from "./fetchClient";

export type FetchHandler = (...args: unknown[]) => PromiseOrObject<unknown>;
export type FetchHandlerFactory = () => FetchHandler;
export type UnknownRecord = Record<string, unknown>;

export type FetchProxy<
  FetchType = unknown,
  SliceMetaObj extends Record<string, SliceMeta> = Record<never, never>,
> = typeof global.fetch &
  FetchClient &
  FetchType & { slice: SliceMetaObj; instance: FetchClient; _FetchType: FetchType; _SliceMetaObj: SliceMetaObj };

export interface SharedClientState {
  proxy: FetchProxy | null;
  origin: string | null;
}

export interface FetchBridgeCall {
  key: string;
  type: "query" | "mutation";
  args: UnknownRecord;
  returns: SerializedReturns;
  timeout?: number | false;
  /** A query's; the call rejects on abort whether or not the bridge stops what it relayed. */
  signal?: AbortSignal;
}

/** A transport that is not HTTP: a view inside an MCP host has no network, and reaches the server through the host. */
export interface FetchBridge {
  call(request: FetchBridgeCall): Promise<unknown>;
}

export interface FetchClaim {
  key: string;
  /** What in its module claims the key, phrased for a boot error: `the mutation "removeX"`, `the root slice`. */
  by: string;
}

export type ClientSignalMap<SigType extends { fetch: any }> = {
  [K in keyof SigType as SigType[K] extends DatabaseSignal<any, any, any, any>
    ? K
    : never]: SigType[K] extends DatabaseSignal<any, any, infer SlceCls, any>
    ? ClientSignal<SlceCls["baseName"], SlceCls, SlceCls["srv"]["cnst"]>
    : never;
};
