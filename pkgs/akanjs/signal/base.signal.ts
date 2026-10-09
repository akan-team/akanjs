import { FetchClient } from "akanjs/fetch";
import { srv } from "akanjs/service";
import { agent } from "./agent.signal";
import { endpoint } from "./endpoint";
import { Public } from "./guards";
import { internal } from "./internal";
import { serverSignal } from "./serverSignal";
import { SignalRegistry } from "./signalRegistry";

export class BaseInternal extends internal(srv.base, ({ interval, cron }) => ({})) {}

export class BaseEndpoint extends endpoint(srv.base, ({ query, mutation, message, pubsub }) => ({
  ping: query(String, { cache: 3000, guards: [Public], mcp: false }).exec(() => "ping"),
  pingBody: mutation(String, { guards: [Public], mcp: false })
    .body("data", String)
    .exec((data) => `pingBody: ${data}`),
  pingParam: query(String, { cache: 10000, guards: [Public], mcp: false })
    .param("id", String)
    .exec((id) => `pingParam: ${id}`),
  pingQuery: query(String, { nullable: true, guards: [Public], mcp: false })
    .search("id", String)
    .exec((id) => `pingQuery: ${id}`),
  wsPing: message(String, { guards: [Public], mcp: false })
    .msg("data", String, { nullable: true })
    .exec((data) => `wsPing: ${data}`),
  pubsubPing: pubsub(String, { guards: [Public], mcp: false }).exec(() => {
    //
  }),
})) {}

export class Base extends serverSignal(BaseEndpoint, BaseInternal) {}
export const base = SignalRegistry.registerService("base" as const, BaseInternal, BaseEndpoint, Base, "akanjs");

const createBaseFetch = () => FetchClient.from(base, agent);
type BaseFetch = ReturnType<typeof createBaseFetch>;

let fetchCache: BaseFetch | undefined;
export const fetch = new Proxy({} as BaseFetch, {
  get(_target, prop, receiver) {
    fetchCache ??= createBaseFetch();
    return Reflect.get(fetchCache, prop, receiver);
  },
});
export const getSerializedSignal = () => fetch.serializedSignal;
