import { JSON } from "@akanjs/base";
import { getAllDictionary, getDictionary } from "@akanjs/dictionary";
import type { srv } from "@akanjs/service";

import { endpoint, internal, mergeSignals, serverSignalOf } from "./signalDecorators";
import { signalInfo } from "./signalInfo";

const srvBase = { refName: "base" } as unknown as typeof srv.base;
export class BaseInternal extends internal(srvBase, ({ interval }) => ({
  publishPing: interval(3000).exec(function () {
    this.baseService.publishPing();
  }),
})) {}

export class BaseEndpoint extends endpoint(srvBase, ({ query, mutation, message, pubsub }) => ({
  ping: query(String, { cache: 3000 }).exec(function () {
    return "ping";
  }),
  pingBody: query(String, { cache: 10000 })
    .body("data", String)
    .exec(function () {
      return "pingBody";
    }),
  pingParam: query(String, { cache: 10000 })
    .param("id", String)
    .exec(function () {
      return "pingParam";
    }),
  pingQuery: query(String, { nullable: true })
    .search("id", String)
    .exec(function (id) {
      return id;
    }),
  pingEvery: query(String).exec(function () {
    return "pingEvery";
  }),
  pingUser: query(String).exec(function () {
    return "pingUser";
  }),
  pingAdmin: query(String).exec(function () {
    return "pingAdmin";
  }),
  getDictionary: query(JSON)
    .param("lang", String)
    .exec(function (lang) {
      const dictionary = getDictionary(lang as "en") as Record<string, object>;
      return dictionary;
    }),
  getAllDictionary: query(JSON).exec(function () {
    const dictionary = getAllDictionary() as Record<string, Record<string, object>>;
    return dictionary;
  }),
  cleanup: mutation(Boolean).exec(async function () {
    if (process.env.NODE_ENV !== "test") throw new Error("cleanup is only available in test environment");
    await this.baseService.cleanup();
    return true;
  }),
  wsPing: message(String).exec(function () {
    return "wsPing";
  }),
  pubsubPing: pubsub(String).exec(function () {
    //
  }),
  getSignals: query(JSON).exec(function () {
    return signalInfo.serializedSignals;
  }),
})) {}
export class BaseSignal extends mergeSignals(BaseEndpoint, BaseInternal) {}
export class Base extends serverSignalOf(BaseSignal) {}
