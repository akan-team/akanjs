import { Account, Every, Person } from "@libs/shared/srvkit";
import { endpoint, internal } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class RemoteInternal extends internal(srv.remote, () => ({})) {}

// Every one is `mcp: false` and takes `Person`: connecting a server hands this app's agent the account's access there,
// which is a person's decision and never a tool a model may call, least of all one reached through another connection.
export class RemoteEndpoint extends endpoint(srv.remote, ({ query, mutation }) => ({
  connectRemote: mutation(String, {
    guards: [Every, Person],
    mcp: false,
    rateLimit: { calls: 10, by: "account" },
    errors: {
      400: ["remote.error.urlRejected"],
      401: ["remote.error.notSignedIn"],
      404: ["remote.error.disabled"],
      502: ["remote.error.unreachable", "remote.error.signInRefused"],
    },
  })
    .body("url", String)
    .with(Account)
    .exec(async function (url, account) {
      return await this.remoteService.connect(account, url);
    }),

  completeRemoteConnection: mutation(cnst.RemoteConnection, {
    guards: [Every, Person],
    mcp: false,
    errors: {
      400: ["remote.error.authorizationNotFound", "remote.error.issuerMismatch", "remote.error.authorizationRefused"],
      403: ["remote.error.authorizationBoundToAnotherAccount"],
      502: ["remote.error.unreachable", "remote.error.signInRefused"],
    },
  })
    .body("state", String)
    .body("code", String)
    .body("iss", String, { nullable: true })
    .with(Account)
    .exec(async function (state, code, iss, account) {
      return await this.remoteService.complete(account, { state, code, iss });
    }),

  disconnectRemote: mutation(Boolean, { guards: [Every, Person], mcp: false })
    .body("url", String)
    .with(Account)
    .exec(async function (url, account) {
      return await this.remoteService.disconnect(account, url);
    }),

  listRemoteConnections: query([cnst.RemoteConnection], { guards: [Every, Person], mcp: false })
    .with(Account)
    .exec(async function (account) {
      return await this.remoteService.listConnections(account);
    }),
})) {}
