import { ENDPOINT_META, INJECT_META, INTERNAL_META } from "akanjs/base";
import type { DocumentModel } from "akanjs/constant";
import {
  type Adaptor,
  type AdaptorCls,
  type AkanJob,
  type AkanJobOptions,
  adapt,
  type QueueAdaptor,
  QueueAdaptorRole,
} from "akanjs/service";
import type { ServerWebSocket } from "bun";
import type { EndpointCls } from "./endpoint";
import type { EndpInfoClientReturns, EndpInfoReqType, EndpInfoServerArgs, EndpointInfo } from "./endpointInfo";
import type { InternalCls } from "./internal";
import type { InternalInfo, InternalInfoReqType, InternalInfoServerArgs } from "./internalInfo";

type EndpointPubsubPayload<E> = EndpInfoClientReturns<E> | DocumentModel<EndpInfoClientReturns<E>>;

export interface ServerSignal extends Adaptor {
  readonly websocket: ServerWebSocket;
  readonly queue: QueueAdaptor;
}

type EndpointServerSignalMethods<EnpCls> = [EnpCls] extends [{ [ENDPOINT_META]: infer EndpointInfoObj }]
  ? {
      [K in keyof EndpointInfoObj as EndpInfoReqType<EndpointInfoObj[K]> extends "pubsub" ? K : never]: (
        ...args: [...EndpInfoServerArgs<EndpointInfoObj[K]>, data: EndpointPubsubPayload<EndpointInfoObj[K]>]
      ) => void;
    }
  : Record<never, never>;

type InternalServerSignalMethods<IntCls> = [IntCls] extends [{ [INTERNAL_META]: infer InternalInfoObj }]
  ? {
      [K in keyof InternalInfoObj as InternalInfoReqType<InternalInfoObj[K]> extends "process" ? K : never]: (
        ...args: [...args: InternalInfoServerArgs<InternalInfoObj[K]>, jobOptions?: AkanJobOptions]
      ) => Promise<AkanJob<unknown, unknown>>;
    }
  : Record<never, never>;

export type ServerSignalClsStatics = {
  readonly refName: string;
  readonly [INJECT_META]: { queue: QueueAdaptor };
  readonly [ENDPOINT_META]: { [key: string]: EndpointInfo };
  readonly [INTERNAL_META]: { [key: string]: InternalInfo };
};

export type ServerSignalMethods<EnpCls, IntCls> = EndpointServerSignalMethods<EnpCls> &
  InternalServerSignalMethods<IntCls>;

export type TypedServerSignalCls<EnpCls, IntCls> = AdaptorCls<ServerSignalMethods<EnpCls, IntCls> & ServerSignal> &
  ServerSignalClsStatics;

export type ServerSignalCls<EnpCls = unknown, IntCls = unknown> = AdaptorCls<
  ServerSignalMethods<EnpCls, IntCls> & ServerSignal
> &
  ServerSignalClsStatics;

/** Composes endpoint and internal classes into a server-side signal class. */
export const serverSignal = <EnpCls, IntCls>(
  endpointRef: EnpCls,
  internalRef: IntCls,
): ServerSignalCls<EnpCls, IntCls> => {
  const refName = (endpointRef as unknown as EndpointCls).refName.slice(0, -8);
  return class ServerSignal extends adapt(`${refName}Signal`, ({ plug }) => ({
    // websocket: use<ServerWebSocket>(),
    queue: plug(QueueAdaptorRole),
  })) {
    static readonly [ENDPOINT_META] = Object.fromEntries(
      Object.entries((endpointRef as unknown as EndpointCls)[ENDPOINT_META])
        .filter(([key, endpointInfo]) => endpointInfo.type === "pubsub")
        .map(([key, value]) => [key, value]),
    );
    static readonly [INTERNAL_META] = Object.fromEntries(
      Object.entries((internalRef as unknown as InternalCls)[INTERNAL_META])
        .filter(([key, internalInfo]) => internalInfo.type === "process")
        .map(([key, value]) => [key, value]),
    );
  } as unknown as ServerSignalCls<EnpCls, IntCls>;
};
