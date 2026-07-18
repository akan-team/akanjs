import { FetchClient } from "akanjs/fetch";
import { srv } from "akanjs/service";
import { endpoint } from "./endpoint";
import { internal } from "./internal";
import { serverSignal } from "./serverSignal";
import { SignalRegistry } from "./signalRegistry";

export class BaseInternal extends internal(srv.base, ({ interval, cron }) => ({})) {}

export class BaseEndpoint extends endpoint(srv.base, ({ query, mutation, message, pubsub }) => ({
  ping: query(String, { cache: 3000 }).exec(() => "ping"),
  pingBody: mutation(String)
    .body("data", String)
    .exec((data) => `pingBody: ${data}`),
  pingParam: query(String, { cache: 10000 })
    .param("id", String)
    .exec((id) => `pingParam: ${id}`),
  pingQuery: query(String, { nullable: true })
    .search("id", String)
    .exec((id) => `pingQuery: ${id}`),
  wsPing: message(String)
    .msg("data", String, { nullable: true })
    .exec((data) => `wsPing: ${data}`),
  pubsubPing: pubsub(String).exec(() => {
    //
  }),
})) {}

export class Base extends serverSignal(BaseEndpoint, BaseInternal) {}
export const base = SignalRegistry.registerService("base" as const, BaseInternal, BaseEndpoint, Base);

const createBaseFetch = () => FetchClient.from(base);
type BaseFetch = ReturnType<typeof createBaseFetch>;

let fetchCache: BaseFetch | undefined;
export const fetch = new Proxy({} as BaseFetch, {
  get(_target, prop, receiver) {
    fetchCache ??= createBaseFetch();
    return Reflect.get(fetchCache, prop, receiver);
  },
});
export const getSerializedSignal = () => fetch.serializedSignal;
