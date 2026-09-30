# Overview

- Source: /conventions/service/overview
- Mirror: /llms/pages/conventions/service/overview.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service Module Overview (#service-module)
- The Eight That Exist (#real-modules)
- The Two Poles (#two-poles)
- Service File Map (#file-map)
- Ship The Empty Files (#empty-scaffolds)
- Model Module Or Service Module (#which-one)

## Content

Overview

The store is the empty scaffold.

Service Module Overview

Signing a token, streaming a stored file back to a browser, running an OAuth handshake to its end: none of these is a record. A folder built around a stored model would give you five files to leave empty and one to fill.

A service module is that folder without the model.

- Where It Lives — In `lib/_<service>`, with a leading underscore. The files inside drop it. — `libs/util/lib/_security/security.service.ts`

- What It Owns — An action or a capability instead of a table. Nothing to list, edit, or keep until tomorrow. — `sign · encrypt · stream · authorize`

- What It Leaves Out — No document file, no filters, no slices, no generated CRUD: there is no table behind it. — `no *.document.ts · no slice()`

- How It Is Called — The same path a model module uses, minus the document layer. — `fetch → signal → service → srvkit/`

Here is one call through a service module, using `_oauth` as the example:

One call through a service module

A page, a store, an MCP client

The runtime itself

the workflow

Another module's service

An adapter in srvkit/

The outside world

**Two ways in.** A caller reaches an `Endpoint` through `fetch`, and the runtime fires an `Internal` on a schedule, a queue job, or startup.

**The service does the work.** It asks another module through `service<srv.X>()` and the outside world through a `srvkit/` adapter.

The Eight That Exist

This workspace has eight service modules, and reading them is faster than reading a description. They range from a server-only primitive to a whole authorization server, plus the empty root container each app and lib carries.

Module

- _security: JWT signing and verification, AES encryption, refresh-token minting. Server-only: no store, no UI. — Example: `libs/util/lib/_security`

- _oauth: The OAuth 2.1 authorization server that issues the tokens `/mcp` accepts. — Example: `libs/shared/lib/_oauth`

- _doc: Serves the Akan.js docs to agents over MCP. It reads a generated folder and writes nothing. — Example: `apps/akan/lib/_doc`

- _localFile: Streams a public blob back as an HTTP `Response` from a custom path. Four files, one endpoint. — Example: `libs/util/lib/_localFile`

- _util, _shared: A library's root container: an empty batch service and a client store other modules share.

- _akan, _minimal: An app's root container. `_akan` is still the empty scaffold; `_minimal` adds four bench endpoints.

Only four files are in every one of them. Here is which of the eight carry the optional ones:

store — *.store.ts

test — *.test.ts

Util — *.Util.tsx

Zone — *.Zone.tsx

- Feature modules

  - _security

  - _oauth

  - _doc: Tests its service: `doc.service.test.ts`.

  - _localFile

- Root containers

  - _util

  - _shared

  - _akan: The store is the empty scaffold.

  - _minimal: The store is the empty scaffold.

Has the file

No file

**Not one of the eight has a Util or a Zone.** That is not an accident of this workspace; the two UI pages explain why the files are rare and what goes there instead.

Why the control usually belongs in ui/ or the page instead.

When a capability earns a section of its own, and when it is just a page.

The Two Poles

Put a small feature module, `_security`, beside the largest, `_oauth`: both have the same five kinds of file. What changes is how much each file holds:

- _security: Its service holds two secrets and hands back signed or encrypted strings. Nothing on screen renders it, so there is no store and no component. — The Floor

  - abstract.md — What it owns, and four rules

  - dictionary.ts — Endpoint labels

  - service.ts — About 75 lines holding two secrets

  - signal.ts — One mutation, `encrypt`

  - signal.test.ts — Boots the barrel and calls it

- _oauth: A whole authorization server, and still no store: every screen it needs is a route in `libs/shared/page/oauth`, not a section of another screen. — The Ceiling

  - abstract.md — Eight rules and a workflow chain

  - dictionary.ts — Labels in `.endpoint()`, error keys in `.error()`, consent-page phrases in `.translate()`

  - service.ts — About 500 lines: PKCE, rotation, revocation

  - signal.ts — 10 endpoints, 5 of them at the origin root

  - signal.test.ts — The protocol, end to end

**A service module with state does not grow a table for it.** `_oauth` keeps every client, request and grant in `memory(Map, &#123; of: cnst.OauthGrant &#125;)` caches, and each shape is a scalar under `libs/shared/lib/__scalar/`. A scalar travels as JSON text, so the same declaration round-trips through the Redis and sqlite caches unchanged.

Service File Map

Four files are always there. The rest arrive when the feature earns them, and both lists follow the order of this section's pages.

Always There

File

- <service>.abstract.md: A title, one sentence on what it owns, and `## Rules`: invariants the code cannot show. — Example: `libs/shared/lib/_oauth/oauth.abstract.md`

- <service>.dictionary.ts: Built with `serviceDictionary`: endpoint labels, error keys and UI phrases. — Example: `libs/shared/lib/_oauth/oauth.dictionary.ts`

- <service>.service.ts: The workflow itself, built with `serve()` naming the module, even when the body is empty.

- <service>.signal.ts: Two classes, `<X>Internal` and `<X>Endpoint`. No Slice, because there is no table to page through. — Example: `libs/util/lib/_security/security.signal.ts`

Only When Needed

- <service>.store.ts: Only when the feature has client state. Four of the eight have one; two are empty scaffolds. — Example: `libs/util/lib/_util/util.store.ts`

- <service>.signal.test.ts: Boots the barrel and calls the endpoints through `fetch`. `_security` and `_oauth` have one. — Example: `libs/shared/lib/_oauth/oauth.signal.test.ts`

- <Service>.Util.tsx, <Service>.Zone.tsx: Rare: none of the eight has one. The two UI pages of this section explain why.

Ship The Empty Files

The rule that most often looks like a mistake: a scaffold file stays in the tree even when it holds nothing. Here is `libs/util/lib/_util/util.signal.ts` in full, unedited:

**Two exported classes, zero methods.** That is the whole file, and it stays.

**Deleting it does not shrink the workspace, it changes it.** The next developer first has to decide where an endpoint goes, instead of where it goes in the file already open.

**The first endpoint stays a one-line diff.** Without the file, it would be a new file.

The Empty Forms You Will Meet

- signal.ts: The builder callback returns an empty object, not nothing. — Example: `export class XInternal extends internal(srv.x, () => ({})) {}`

- service.ts: A root container with no methods still declares its service. — Example: `export class UtilService extends serve("util" as const, { serverMode: "batch" }, () => ({})) {}`

- store.ts: Exactly two comments, `// state` and `// action`, mark where each half goes.

`apps/akan/lib/_akan` is in exactly this state: its service, signal and store are all empty. `apps/minimal/lib/_minimal` keeps the same empty store beside its bench endpoints, and neither is waiting to be cleaned up.

Model Module Or Service Module

One question decides it: is there a row you would want to list, filter, and still find next week?

**Yes: a model module** at `lib/<model>`. The service module you were about to write is one of its service methods.

**No: a service module** at `lib/_<service>`.

- Model Module — lib/<model> — A stored table with a document file, filters, slices, generated CRUD and the five UI roles. — user · file · banner · notification

- Service Module — lib/_<service> — No table, no document file, no slice. An action, a protocol, an integration, or a library's own root. — security · oauth · localFile · doc

- Scalar Module — lib/__scalar/<scalar> — A value embedded in something else and never stored on its own. A service module's state takes this shape. — oauthClient · oauthGrant · oauthRequest

The next page is the abstract file, where the rules you just decided on are written down. After that the pages follow the call path:

What the module owns, and its rules.

Endpoint labels, errors and phrases.

The workflow and what it injects.

Internal and Endpoint, without a Slice.

Client state, only when the feature has any.

## Code Examples

### _util, _shared

```ts
libs/util/lib/_util
libs/shared/lib/_shared
```

### _akan, _minimal

```ts
apps/akan/lib/_akan
apps/minimal/lib/_minimal
```

### <service>.service.ts

```ts
export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
  aeskey: use<string>(),
})) {}
```

### libs/util/lib/_util/util.signal.ts

```ts
import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class UtilInternal extends internal(srv.util, () => ({})) {}

export class UtilEndpoint extends endpoint(srv.util, () => ({})) {}
```

### store.ts

```ts
export class AkanStore extends store("akan" as const, () => ({
  // state
})) {
  // action
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

