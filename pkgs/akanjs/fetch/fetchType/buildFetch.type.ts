import type { DatabaseSignal, EndpointCls, SerializedSignal, ServiceSignal, SliceCls } from "akanjs/signal";
import type { FetchProxy } from "../client";
import type { GetSliceMetaObjFromDatabaseSignals } from "../types";
import type { SliceMeta } from "./appliedReturn.type";
import type { GetFetchTypeFromEndpoint } from "./endpointFetch.type";
import type { GetFetchTypeFromSlice } from "./sliceFetch.type";

export type FetchProxySignalInput<
  FetchType = unknown,
  SliceMetaObj extends Record<string, SliceMeta> = Record<never, never>,
> = {
  handler: Record<string, unknown>;
  serializedSignal: Record<string, SerializedSignal>;
  _FetchType: FetchType;
  _SliceMetaObj: SliceMetaObj;
};

export type FetchSignalInput = FetchProxySignalInput | DatabaseSignal | ServiceSignal;

export type FetchTypeOfSignal<Signal extends FetchSignalInput> = Signal extends { _FetchType: infer FetchType }
  ? FetchType
  : Signal extends { endpoint: infer EndpCls extends EndpointCls; slice: infer SlceCls extends SliceCls }
    ? GetFetchTypeFromEndpoint<EndpCls, SlceCls> & GetFetchTypeFromSlice<SlceCls>
    : Signal extends { endpoint: infer EndpCls extends EndpointCls }
      ? GetFetchTypeFromEndpoint<EndpCls>
      : unknown;

type FetchKeysOfProxySignal<Signal> = Signal extends { _FetchType: infer FetchType } ? keyof FetchType : never;
type FetchKeysOfProxySignals<Signals extends readonly FetchSignalInput[]> = FetchKeysOfProxySignal<Signals[number]>;

type LastProxyFetchValue<
  Signals extends readonly FetchSignalInput[],
  Key extends PropertyKey,
  Current = never,
> = Signals extends readonly [infer First extends FetchSignalInput, ...infer Rest extends readonly FetchSignalInput[]]
  ? First extends { _FetchType: infer FetchType }
    ? Key extends keyof FetchType
      ? LastProxyFetchValue<Rest, Key, FetchType[Key]>
      : LastProxyFetchValue<Rest, Key, Current>
    : LastProxyFetchValue<Rest, Key, Current>
  : Current;

type MergeProxyFetchTypes<Signals extends readonly FetchSignalInput[]> = [FetchKeysOfProxySignals<Signals>] extends [
  never,
]
  ? Record<never, never>
  : {
      [Key in FetchKeysOfProxySignals<Signals>]: LastProxyFetchValue<Signals, Key>;
    };

type MergeDirectFetchTypes<
  Signals extends readonly FetchSignalInput[],
  Acc = Record<never, never>,
> = Signals extends readonly [infer First extends FetchSignalInput, ...infer Rest extends readonly FetchSignalInput[]]
  ? First extends { _FetchType: unknown }
    ? MergeDirectFetchTypes<Rest, Acc>
    : MergeDirectFetchTypes<Rest, Acc & FetchTypeOfSignal<First>>
  : Acc;

export type MergeAllFetchTypes<Signals extends readonly FetchSignalInput[]> =
  MergeProxyFetchTypes<Signals> extends infer ProxyFetch
    ? MergeDirectFetchTypes<Signals> extends infer DirectFetch
      ? Omit<ProxyFetch, keyof DirectFetch> & DirectFetch
      : never
    : never;

export type FetchClientType<Signals extends readonly FetchSignalInput[]> = FetchProxy<
  MergeAllFetchTypes<Signals>,
  GetSliceMetaObjFromDatabaseSignals<Signals>
>;
