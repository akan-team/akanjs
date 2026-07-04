import type { ENDPOINT_META, PromiseOrObject } from "akanjs/base";
import type { FetchPolicy } from "akanjs/common";
import type {
  EndpInfoArgs,
  EndpInfoClientReturns,
  EndpInfoNullable,
  EndpInfoReqType,
  EndpointCls,
  EndpointInfo,
  SlceCnstFull,
  SlceCnstInsight,
  SlceCnstLight,
  SliceCls,
} from "akanjs/signal";

type ExtendedEndpointReturn<ClientReturns, Full, Light, Insight> = ClientReturns extends (infer R)[]
  ? ExtendedEndpointReturn<R, Full, Light, Insight>[]
  : Full extends ClientReturns
    ? Full
    : Light extends ClientReturns
      ? Light
      : Insight extends ClientReturns
        ? Insight
        : ClientReturns;

type EndpointClientReturns<E, SlceCls extends SliceCls | never> = [SlceCls] extends [never]
  ? EndpInfoClientReturns<E>
  : ExtendedEndpointReturn<
      EndpInfoClientReturns<E>,
      SlceCnstFull<SlceCls>,
      SlceCnstLight<SlceCls>,
      SlceCnstInsight<SlceCls>
    >;

type EndpInfoReturns<E, SlceCls extends SliceCls | never> =
  | EndpointClientReturns<E, SlceCls>
  | (EndpInfoNullable<E> extends true ? null : never);

type QueryOrMutationFetchFn<E, SlceCls extends SliceCls | never> = (
  ...args: [...EndpInfoArgs<E>, fetchPolicy?: FetchPolicy]
) => Promise<EndpInfoReturns<E, SlceCls>>;

type MessageEmitFn<E> = (...args: EndpInfoArgs<E>) => void;

type MessageListenFn<E, SlceCls extends SliceCls | never> = (
  handleEvent: (data: EndpInfoReturns<E, SlceCls>) => PromiseOrObject<void>,
  options?: FetchPolicy,
) => () => void;

type PubsubSubscribeFn<E, SlceCls extends SliceCls | never> = (
  ...args: [
    ...EndpInfoArgs<E>,
    handleEvent: (data: EndpInfoReturns<E, SlceCls>) => PromiseOrObject<void>,
    options?: FetchPolicy,
  ]
) => () => void;

type PrimaryFetchFn<E, SlceCls extends SliceCls | never> =
  EndpInfoReqType<E> extends "query" | "mutation"
    ? QueryOrMutationFetchFn<E, SlceCls>
    : EndpInfoReqType<E> extends "message"
      ? MessageEmitFn<E>
      : never;

// Keys kept as-is: query / mutation / message (emit)
type PrimaryFetchType<EInfoObj extends { [key: string]: EndpointInfo }, SlceCls extends SliceCls | never> = {
  [K in keyof EInfoObj as EndpInfoReqType<EInfoObj[K]> extends "query" | "mutation" | "message"
    ? K
    : never]: PrimaryFetchFn<EInfoObj[K], SlceCls>;
};

// Keys remapped to `subscribe${Key}`
type PubsubFetchType<EInfoObj extends { [key: string]: EndpointInfo }, SlceCls extends SliceCls | never> = {
  [K in keyof EInfoObj as EndpInfoReqType<EInfoObj[K]> extends "pubsub"
    ? K extends string
      ? `subscribe${Capitalize<K>}`
      : never
    : never]: PubsubSubscribeFn<EInfoObj[K], SlceCls>;
};

// Keys remapped to `listen${Key}`
type MessageListenFetchType<EInfoObj extends { [key: string]: EndpointInfo }, SlceCls extends SliceCls | never> = {
  [K in keyof EInfoObj as EndpInfoReqType<EInfoObj[K]> extends "message"
    ? K extends string
      ? `listen${Capitalize<K>}`
      : never
    : never]: MessageListenFn<EInfoObj[K], SlceCls>;
};

export type GetFetchTypeFromEndpoint<
  EndpCls extends EndpointCls,
  SlceCls extends SliceCls | never = never,
  _EndpointInfoObj extends { [key: string]: EndpointInfo } = EndpCls[typeof ENDPOINT_META],
> = PrimaryFetchType<_EndpointInfoObj, SlceCls> &
  PubsubFetchType<_EndpointInfoObj, SlceCls> &
  MessageListenFetchType<_EndpointInfoObj, SlceCls>;
