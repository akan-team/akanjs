# OAuth For Agents

- Source: /cheatsheet/general/mcp-auth
- Mirror: /llms/pages/cheatsheet/general/mcp-auth.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- The Agent Has No Cookie (#overview)
- What The App Serves (#endpoints)
- What The Token Is (#token)
- How A Client Becomes Known (#clients)
- Configure It Per App (#configure)
- Revocation Is Whole-Grant (#revoke)
- A Person May, A Model May Not (#person)

## Content

OAuth For Agents

The Agent Has No Cookie

You pointed Claude Code at your app's `/mcp`, and every call comes back 401. Your browser is signed in with a session cookie; a CLI agent has neither a browser nor that cookie, and `/mcp` deletes the `cookie` header anyway.

So the agent needs a token, and no sign-in form hands one out. An app that uses `libs/shared` already serves an OAuth 2.1 server that issues one, in the same process as `/mcp`. One deployment plays two roles:

- Resource Server — /mcp — Spends tokens. A call without one gets a 401 that tells the client where to sign in.

- Authorization Server — /oauth/* — Mints tokens. It is your own app, in the same process, and it names itself as the issuer.

Words used on this page

Term

- MCP client: The agent program that calls `/mcp`, such as Claude Code, claude.ai or Cursor.

- issuer (iss): The authorization server's public origin. Clients compare it byte for byte.

- aud: The token claim naming the resource it was issued for; here, the `/mcp` URL.

- grant: One client's permission to act as one account: a refresh lineage and every token minted from it.

- PKCE: A one-time secret proving that whoever exchanges a code is who asked for it. S256 only.

- consent page: The screen where the signed-in user approves or denies a client.

What is yours to do

Your part is small: which clients may start the flow, where the consent page lives, and one secret. In order:

**Start from an app that uses `libs/shared`.** The OAuth routes, and the 401 on `/mcp` that starts the flow, come with it.

**Sync the consent page.** It lives in `libs/shared/page`, so the app opts in with `syncPageLibs` in `akan.config.ts` and runs `akan sync`.

**Set `JWT_SECRET`** in every deployment outside `local`.

**Add an `oauth` key only where a default is wrong:** which clients may start the flow, or where the consent page lives.

**Point the MCP client at `https://<host>/mcp`.** It registers, opens the browser for sign-in and consent, and receives a token.

Step 2 is one line in the app's config:

Cutting a grant off later is covered in **Revocation Is Whole-Grant** below.

The whole handshake

Once step 5 connects the client, it and your app run every step below on their own. You write none of it.

One handshake, start to finish

MCP client

Browser

Your app

POST /mcp with no token

authorization_servers names this same app

open /oauth/authorize with code_challenge

302 to the sign-in page, then to consent

302 to redirect_uri with code and iss

code on the loopback redirect

POST /oauth/token with code_verifier

access token and refresh token

POST /mcp with Bearer

What The App Serves

These routes sit at the origin root, where RFC 8414 and every MCP client look for them. They come with `libs/shared` and `/mcp`; you write none of them.

Route

- /.well-known/oauth-protected-resource/mcp: RFC 9728 metadata from `/mcp` itself, also served without the suffix; it names this app.

- /.well-known/oauth-authorization-server: RFC 8414 metadata: S256-only PKCE, metadata-document client ids, and the `iss` parameter.

- /oauth/authorize: Checks the client, redirect URI and PKCE challenge, then sends the browser to consent.

- /oauth/consent: The consent page from `libs/shared/page/oauth/consent`, served once the app syncs it.

- /oauth/token: Exchanges an authorization code or a refresh token for a new token pair.

- /oauth/register: RFC 7591 dynamic registration, on by default; Claude Code and claude.ai register here.

- /oauth/revoke: RFC 7009: the client hands a token back and the whole grant closes.

How they are declared

The protocol routes are ordinary signal endpoints in `libs/shared/lib/_oauth`. Each spreads the same four options:

Option

- guards: [Public]: A client holds no credential yet; a credential is what it came for.

- prefix: false: Drops the service prefix from the path.

- globalPrefix: false: Drops the global API prefix too, so the route sits at the origin root.

- mcp: false: Keeps it off the MCP list: these routes are the way onto the shelf, not a tool on it.

Safety built in

**The consent page shows the redirect host.** It is the one thing that tells a real client from an impostor, and a loopback redirect adds a "runs on your computer" warning.

**A request is short-lived.** An authorization request lives ten minutes and binds to the first signed-in account that opens it.

**A code works once.** It lives sixty seconds and is consumed on first use, even by a failed exchange.

**Revoking never tells.** `/oauth/revoke` answers 200 whether or not the token was live, so it cannot double as a token oracle.

What The Token Is

The access token is your app's own access JWT: the claims a browser session carries, plus four OAuth ones. So `AccountMiddleware` and the guards judge the call unchanged, and no service or signal needs to know it came over OAuth.

Claim

- self, me: The same identity a browser session carries; `AccountMiddleware` reads it as before.

- iss: The issuer: your app's public origin.

- aud: The MCP endpoint's URL (`oauth.resource`); `/mcp` refuses a token without one.

- client_id: The client the grant was issued to.

- sub: `user:<id>` or `admin:<id>`, the account the token acts as.

- sid: The grant's lineage id; revoking the grant denylists it.

**No scope.** Guards already decide what a caller may do, so a scope would only be a second, weaker copy. Neither the metadata nor the token carries one, and the consent page says so to the user. `AKAN_MCP_SCOPES` is for tokens another issuer mints; set on an app that runs this server, it refuses every token the server issues.

**Minted from the live account.** Not from a snapshot, so a role change reaches the next token.

What /mcp checks

Without a token, `/mcp` answers 401 and points the client at its metadata. With one, the token rides the `Authorization` header:

**Header only.** `/mcp` deletes the `cookie` header before the account middleware runs. Otherwise a same-site page could drive `tools/call` on a visitor's session, and this route never passes through `CrossSiteGuard`.

**No `aud`, no entry.** Once an issuer is named it mints tokens for its other resources too, so a token with no audience is the confused-deputy case RFC 8707 exists for. A token issued for another resource is refused as well.

**An hour, then rotate.** The access token lives `accessTokenSeconds`, an hour by default. The refresh token rotates on every use and lasts thirty days.

**`JWT_SECRET` is required outside `local`.** Set it, or `security.jwtSecret`, in every deployment. Without either, the secret would be derived from the app name, the environment and the repo name, three strings anyone can read off a URL, and every token on this page would be forgeable, admin sessions included.

How A Client Becomes Known

Before anything is authorized, the server has to recognise the `client_id`. It tries three sources in this order, and a client that matches none gets an error page instead of a redirect: nothing is sent to an unverified destination.

Source, in the order tried

- static: Listed by you in `oauth.clients`; a `clientSecret` makes it confidential.

- dynamic: Registered itself at `/oauth/register` (RFC 7591), as Claude Code and claude.ai do.

- metadataDocument: Its `client_id` is an HTTPS URL that hosts its own registration.

**Secrets are hashed.** A static `clientSecret` is plaintext in configuration and hashed before the server holds it. Omit it for a public client.

**Registration is open, but bounded.** Anyone may register, 20 times an hour per address, and a registration is kept for 90 days.

**The server cannot be aimed inward.** A metadata document's host is resolved before the fetch, and one pointing into a private range is refused.

Redirect URI rules

A redirect URI decides where a code can land, so it is checked hard. A dynamic or metadata-document client may register only these:

Redirect URI

- https://…: Always accepted, and must match exactly.

- http://127.0.0.1, http://[::1], http://localhost: Loopback: always accepted, and only the port may differ.

- cursor://…, <scheme>://…: Accepted only when `allowedRedirectSchemes` names the scheme, then matched exactly.

- http://<other host>: Never accepted.

**`localhost` counts as loopback.** RFC 8252 discourages it, but Claude Code redirects there.

**Why the port may vary.** A native client binds whichever port is free, and Claude Code picks a new one each session.

**Why `cursor` is the default scheme.** Cursor's desktop client registers `cursor://…/oauth/callback`, and a server that refuses it cannot be used from Cursor at all.

**No fragments.** A redirect URI carrying a `#fragment` is refused at registration.

**A static client skips the scheme check.** Its `redirectUris` come from your own config, so only the exact match applies, with the same loopback port exception.

**PKCE is S256 only.** A request that omits `code_challenge_method` is refused even when the challenge itself is well formed.

Configure It Per App

Everything lives under one `oauth` key in the app's server env, beside the other module options. Leave it out, and the defaults already make a working server on the app's own domain.

An app that ships its own desktop client, with its own URL scheme, adds this:

- enabled (boolean, default true): Off removes the authorization server and `/mcp`'s credential check, so `/mcp` goes anonymous.

- issuer (string, default the app's host): The public origin clients compare byte for byte; set it behind a tunnel or a host-renaming edge.

- resource (string, default <issuer>/mcp): The MCP endpoint's canonical URL and every token's `aud`; set it if MCP moved off `/mcp`.

- consentPath (string, default /oauth/consent): Route of the consent page, basePath included: `/office/oauth/consent`.

- signinPath (string, default /signin): Where an anonymous browser goes first, with `?redirect=` back to consent; basePath included.

- clients (OAuthStaticClient[], default []): Clients you declare yourself; the fields are listed below.

- dynamicRegistration (boolean, default true): RFC 7591 self-registration; off answers 404, leaving static and metadata-document clients.

- allowedRedirectSchemes (string[], default ["cursor"]): Private-use redirect schemes accepted besides HTTPS and loopback.

- accessTokenSeconds (number, default 3600): Access token lifetime, and how long a revoked grant's id stays denylisted.

- clientIdMetadata.enabled (boolean, default true): Reads an HTTPS `client_id` as a metadata document; off also stops advertising it.

- clientIdMetadata.refusePrivateAddresses (boolean, default true): Resolves the document's host before fetching; off trusts the host name alone.

**The default issuer** is `http://localhost:<port>` in `local`, and `https://<host>` elsewhere, where the host is `HOST_NAME`, then `hostname`, then `<app>-<environment>.<serveDomain>`.

**Paths carry the basePath.** An app served under `/office` writes `/office/oauth/consent` and `/office/signin`.

**`koyo://` above needs no `allowedRedirectSchemes` entry.** A static client's `redirectUris` skip the scheme check; the option only widens what dynamic and metadata-document clients may register.

**Turn `refusePrivateAddresses` off only behind an egress policy.** Unless the network already closes the private range, a `client_id` URL can aim the server at its own network.

A static client

Each entry of `clients` is an `OAuthStaticClient`:

- clientId (string): The `client_id` this client presents.

  - required

- redirectUris (string[]): Every redirect URI it may use; a request must name one exactly, a loopback one on any port.

- clientName (string): The name the consent page shows the user.

- clientSecret (string): Makes the client confidential; omit it for a public client.

- tokenEndpointAuthMethod ("none" | "client_secret_post" | "client_secret_basic", default client_secret_post): How a confidential client sends its secret; a client without one is always `none`.

Revocation Is Whole-Grant

There is no revoking one token. The unit is the grant: its refresh lineage plus every access token minted from it. Two parties can close one: the client that holds it, and the account it acts as.

From the client

The client hands either token back over RFC 7009, and the grant it names closes:

From the account

A connected-apps page needs two ordinary fetches:

Call

- fetch.listOAuthConnections(): Lists the applications holding a grant for the signed-in account, one row per grant.

- fetch.revokeOAuthConnection(sessionId): Closes one application's grant; `false` when the id names no live grant of this account.

**Each row** carries the client name, the user agent it connected from, when it started and expires, and `isCurrent` for the connection making the call. Browser sessions are not listed.

**Nothing else is touched.** Revoking one grant leaves the account's other grants and its browser session alone.

**Guarded by `Every`, kept off MCP.** Both are `mcp: false`: an agent that could list and cut every other connector from inside a tool call is exactly the lever a connected-apps page exists to keep human.

What a revoked grant means

**Access tokens die at their next call.** An access token is stateless and cannot be deleted, so the grant's lineage id, the `sid` each token carries, is denylisted for `accessTokenSeconds`.

**A quick reuse is forgiven.** A refresh token reused within thirty seconds of its rotation is answered with a rotation of its own: a client that holds it twice is not a thief.

**A late reuse revokes the lineage.** Reused later, it revokes that grant's lineage and nothing else.

**Another client's refresh token is refused** outright.

A Person May, A Model May Not

Once agents hold real tokens, some acts need a distinction the guards were never asked for. Refunding an order is fine when the shop owner clicks it, and not when a model decides to.

The server tells the two apart by three facts, and that is the whole signal:

**A call through `/mcp`** is marked at the door: `context.origin` is `"mcp"`.

**A token this server minted** names its `client_id` and the MCP resource as `aud`, over any transport.

**A browser session** names neither, so it reads as a person.

Two levers read that signal, and they answer different questions:

Lever

Refuses

Listed

Branches

- What each lever does to an agent's call

  - guards: [Every, Person]: Refuses the call, and takes the endpoint out of the MCP catalogue.

  - .with(AgentCall): Hands the handler the verdict as a boolean to branch on.

Yes

No

**`Person` makes the act absent, not hidden.** It declares `static agents = false`, so the MCP catalogue refuses every endpoint it guards instead of hiding it per caller.

**`AgentCall` narrows the side effects, not the endpoint.** The endpoint stays callable and listed; what changes is what the call sets in motion: no customer mail, no push, no irreversible side effect.

**Read the verdict through `isAgentCall(context)`.** Both levers call it from `@libs/shared/srvkit`: `context.origin === "mcp"`, or a token naming a `client_id` or an `aud`. Never sniff those claims through a cast; an absent one means different things on different transports, and a hand-rolled check drifts from the answer the guards give.

Related pages

Authorization

What each guard publishes to an agent, and how a refusal is worded.

MCP Server

The catalogue, resource URIs and rate limits.

## Code Examples

### apps/koyo/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  syncPageLibs: ["shared"], // [!code highlight]
};

export default config;
```

### libs/shared/lib/_oauth/oauth.signal.ts

```ts
import { Any } from "akanjs/base";
import { endpoint, Public, Req } from "akanjs/signal";

import * as srv from "../srv";

// [Public] is the decision: a client holds no credential yet,
// which is what it is here to obtain.
const protocolRoute = { // [!code highlight:6]
  guards: [Public],
  prefix: false as const,
  globalPrefix: false as const,
  mcp: false as const,
};

export class OauthEndpoint extends endpoint(srv.oauth, ({ query, mutation }) => ({
  oauthAuthorizationServerMetadata: query(Any, {
    ...protocolRoute,
    path: ".well-known/oauth-authorization-server",
  }).exec(function () {
    return this.oauthService.metadata();
  }),

  exchangeOAuthToken: mutation(Any, { ...protocolRoute, path: "oauth/token" })
    .with(Req)
    .exec(async function (req) {
      return await this.oauthService.exchange(req);
    }),
})) {}
```

### Terminal

```bash
curl -i -X POST https://koyo.com/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer
#   resource_metadata="https://koyo.com/.well-known/oauth-protected-resource/mcp"

curl -X POST https://koyo.com/mcp \
  -H "Authorization: Bearer <access token>" ...
```

### apps/koyo/env/env.server.main.ts

```ts
import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  oauth: { // [!code ++:11]
    issuer: "https://koyo.com",
    consentPath: "/oauth/consent",
    clients: [
      {
        clientId: "koyo-desktop",
        clientName: "Ko-yo Desktop",
        redirectUris: ["koyo://oauth/callback"],
      },
    ],
  },
};
```

### Terminal

```bash
# RFC 7009 - either token names the grant, and the grant is what closes
curl -X POST https://koyo.com/oauth/revoke \
  -d token=<access or refresh token> \
  -d client_id=koyo-desktop
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
import { AgentCall, Every, Person, Self } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ mutation }) => ({
  refundIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every, Person] }) // [!code highlight]
    .param("icecreamOrderId", ID)
    .with(Self)
    .exec(async function (icecreamOrderId, self) {
      return await this.icecreamOrderService.refund(icecreamOrderId, self.id);
    }),

  serveIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every] })
    .param("icecreamOrderId", ID)
    .with(Self)
    .with(AgentCall) // [!code highlight]
    .exec(async function (icecreamOrderId, self, isAgentCall) {
      return await this.icecreamOrderService.serve(icecreamOrderId, self.id, {
        notifyCustomer: !isAgentCall,
      });
    }),
})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

