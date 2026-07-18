import { Any, Int } from "akanjs/base";
import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class MinimalInternal extends internal(srv.minimal, ({ cron }) => ({})) {}

export class MinimalEndpoint extends endpoint(srv.minimal, ({ query, message, pubsub }) => ({
  benchPing: query(String).exec(() => "ok"),
  benchEcho: query(String)
    .param("value", String)
    .exec((value) => value),
  benchFanout: pubsub(Any)
    .room("roomId", String)
    .exec(() => undefined),
  benchPublish: message(Boolean)
    .msg("roomId", String)
    .msg("seq", Int)
    .msg("sentAt", Int)
    .exec(async function (roomId, seq, sentAt) {
      return await this.minimalService.publishBenchFanout(roomId, seq, sentAt);
    }),
})) {}
