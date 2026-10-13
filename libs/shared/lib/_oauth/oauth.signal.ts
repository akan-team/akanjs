import { Account, Every, Person } from "@libs/shared/srvkit";
import { Any } from "akanjs/base";
import { endpoint, Ip, internal, Public, Req } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class OauthInternal extends internal(srv.oauth, () => ({})) {}

export class OauthEndpoint extends endpoint(srv.oauth, ({ query, mutation }) => ({
  // The protocol endpoints live at the origin's root, where RFC 8414 and the clients look for them, and are `mcp: false`
  // because they are the way onto the shelf rather than anything on it. `[Public]` is the decision: a client holds no
  // credential yet, which is what it is here to obtain.
  oauthAuthorizationServerMetadata: query(Any, {
    guards: [Public],
    prefix: false,
    globalPrefix: false,
    mcp: false,
    path: ".well-known/oauth-authorization-server",
  }).exec(function () {
    return this.oauthService.metadata();
  }),

  authorizeOAuth: query(Any, {
    guards: [Public],
    prefix: false,
    globalPrefix: false,
    mcp: false,
    path: "oauth/authorize",
  })
    .with(Req)
    .with(Account, { nullable: true })
    .exec(async function (req, account) {
      return await this.oauthService.authorize(req, account);
    }),

  // Nullable: a child reached over a unix socket learns the caller only from the gateway's headers, and a
  // deployment that lost them should register under a shared, wider bucket rather than refuse every client.
  registerOAuthClient: mutation(Any, {
    guards: [Public],
    prefix: false,
    globalPrefix: false,
    mcp: false,
    path: "oauth/register",
  })
    .with(Req)
    .with(Ip, { nullable: true })
    .exec(async function (req, ip) {
      return await this.oauthService.register(await req.json().catch(() => null), ip);
    }),

  exchangeOAuthToken: mutation(Any, {
    guards: [Public],
    prefix: false,
    globalPrefix: false,
    mcp: false,
    path: "oauth/token",
  })
    .with(Req)
    .exec(async function (req) {
      return await this.oauthService.exchange(req);
    }),

  revokeOAuthToken: mutation(Any, {
    guards: [Public],
    prefix: false,
    globalPrefix: false,
    mcp: false,
    path: "oauth/revoke",
  })
    .with(Req)
    .exec(async function (req) {
      return await this.oauthService.revoke(req);
    }),

  // The account's own view of its grants, for a connected-apps page. `mcp: false` like the rest: an agent that could
  // list and cut every other connector from inside a tool call is exactly the lever this page exists to keep human.
  listOAuthConnections: query([cnst.OauthConnection], { guards: [Every], mcp: false })
    .with(Account)
    .exec(async function (account) {
      return await this.oauthService.listConnections(account);
    }),

  // `Person` too: an MCP App view relays its calls on the agent's token, and cutting a connector stays a person's act.
  revokeOAuthConnection: mutation(Boolean, { guards: [Every, Person], mcp: false })
    .param("sessionId", String)
    .with(Account)
    .exec(async function (sessionId, account) {
      return await this.oauthService.revokeConnection(sessionId, account);
    }),

  viewOAuthAuthorizationRequest: query(cnst.OauthRequest, { guards: [Every], mcp: false })
    .param("requestId", String)
    .with(Account)
    .exec(async function (requestId, account) {
      return await this.oauthService.viewRequest(requestId, account);
    }),

  // Both answer a plain browser form post with the redirect the client is waiting for, so the consent page needs no
  // script: the cookie session authenticates it and `CrossSiteGuard` holds the post to this origin.
  approveOAuthConsent: mutation(Any, { guards: [Every, Person], mcp: false })
    .param("requestId", String)
    .with(Req)
    .with(Account)
    .exec(async function (requestId, req, account) {
      return await this.oauthService.decide(requestId, account, true, req.headers.get("user-agent") ?? undefined);
    }),

  denyOAuthConsent: mutation(Any, { guards: [Every, Person], mcp: false })
    .param("requestId", String)
    .with(Account)
    .exec(async function (requestId, account) {
      return await this.oauthService.decide(requestId, account, false);
    }),
})) {}
