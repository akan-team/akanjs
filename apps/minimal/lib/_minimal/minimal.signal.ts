import { LocalOrEdge } from "@apps/minimal/srvkit";
import { Any, Int } from "akanjs/base";
import { endpoint, internal, Public } from "akanjs/signal";

import * as srv from "../srv";

export class MinimalInternal extends internal(srv.minimal, ({ cron }) => ({})) {}

export class MinimalEndpoint extends endpoint(srv.minimal, ({ query, mutation, message, pubsub }) => ({
  benchPing: query(String, { guards: [Public], mcp: false }).exec(() => "ok"),
  benchEcho: query(String, { guards: [Public], mcp: false })
    .param("value", String)
    .exec((value) => value),
  benchFanout: pubsub(Any, { guards: [Public], mcp: false })
    .room("roomId", String)
    .exec(() => undefined),
  benchPublish: message(Boolean, { guards: [Public], mcp: false })
    .msg("roomId", String)
    .msg("seq", Int)
    .msg("sentAt", Int)
    .exec(async function (roomId, seq, sentAt) {
      return await this.minimalService.publishBenchFanout(roomId, seq, sentAt);
    }),
  holdProbeTool: mutation(Int, { guards: [LocalOrEdge], mcp: false }).exec(function () {
    return this.minimalService.holdProbeTool();
  }),
})) {}
