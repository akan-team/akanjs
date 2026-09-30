# Documentation

- Source: /cheatsheet/dev/docs
- Mirror: /llms/pages/cheatsheet/dev/docs.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- API Documentation (#overview)
- Render A Zone (#zone)
- Try An Endpoint (#try-api)
- Auth And Guards (#auth)
- Tips (#tips)

## Content

Documentation

required

No arguments. Returns `"ping"`.

Takes a path parameter `id` and returns `pingParam: <id>`.

Takes a query-string `id` and returns `pingQuery: <id>`.

Takes a body field `data` and returns `pingBody: <data>`.

Press Listen, then Send. The reply `wsPing: <data>` appears in the stream.

A room to try Subscribe and Unsubscribe on.

API Documentation

Akan turns your app's `fetch` into an API explorer: every endpoint of a signal with its arguments, guards and return type. It is not just a list, because you can call each endpoint from the same screen.

Words used on this page

Term

- signal: The file that declares a module's endpoints. One signal becomes one API document.

- fetch: Your app's typed API client from `@apps/<app>/client`. The explorer reads endpoints from it.

- guard: A class that decides who may call an endpoint, such as `Public`, `User` or `Admin`.

- JWT: A sign-in token. Paste one to call guarded endpoints as that account.

- pubsub, message: The two WebSocket kinds: a subscription the server pushes to, and a message answered on a listener.

What one document shows

- Summary — Counts of all endpoints, REST, WebSocket, and those published as MCP tools. — `Endpoints · REST API · Web Socket · MCP Tools`

- Toolbar — Shows the Base URL and sets the guard filter, the JWT and an endpoint search. — `Signal.Doc.Setting`

- REST API — Every query and mutation, generated CRUD and slice reads included. Each row has Reference and Try it. — `GET · POST`

- Web Socket — A pubsub row subscribes and shows frames as they land. A message row listens and sends. — `Subscribe · Listen · Send`

Render A Zone

Put the explorer on an admin or developer-only page. Start with the `base` signal: every app has it, and its ping endpoints are simple.

Write a small client component in `ui/` that renders `Signal.Doc.Zone`.

Render that component from a route.

First, the client component:

- refName (string): The signal to document: `base`, or a module name such as `product`.

  - required

- fetch (FetchProxy): The app's own `fetch`. A signal the app does not mount shows as unregistered.

- openAll (boolean): Opens every endpoint row. Leave it off for a signal with many endpoints.

  - optional

**Why `"use client"`.** A server page cannot pass `fetch` as a prop, and `Signal.Doc.Zone` exists only on the client.

Then render it from a route:

**The route stays a server page.** The client boundary is `ApiDocs`, so only that component ships as JavaScript.

**`devOnly: true` keeps it out of production.** The route serves under `akan start`, and `akan build` leaves it out. For an admin tool in production, remove it and limit the route to admins instead.

Other parts

`Signal.Doc.Zone` is the usual choice. Reach for a smaller part when you need only a piece of it:

Component

- Signal.Doc.Zone: One signal's whole document: summary, toolbar, REST and WebSocket lists.

- Signal.Doc.Setting: The toolbar alone. Pass `search` and `onSearch` to add the search box.

- Signal.Doc.DocSignals: Every signal the app mounts, one collapsible row each, with REST endpoints only.

- Signal.RestApi.Endpoints: One signal's REST endpoints, or only those named in `endpoints`. The `ping` demo below uses it.

Try An Endpoint

Below is the real `ping` row from the `base` document, calling this docs server. It returns the string `"ping"`.

Press **Try it** in the row.

Press **Send Request**.

Check that the response pane shows `"ping"`.

**`ping` shows MCP refused on purpose.** It declares no guards, and MCP publishes only endpoints whose guards say who may call them.

Reading a row

Part

- GET, POST: The method badge: GET for a query, POST for a mutation.

- guard badges: The guards the endpoint declares. An endpoint with none shows no badge.

- MCP badge: Whether agents can call it as an MCP tool. A refused row says why underneath.

- Reference: The arguments (path, query, body, form data), the return type and an example response.

- Try it: Inputs filled with example values, the request path to copy, and a Send Request button.

The rest of the base signal

`base` has one simple endpoint of each kind. Render its whole document to try them all:

Endpoint · Kind

What to try

Auth And Guards

An endpoint behind a guard such as `User` or `Admin` needs a signed-in caller. Paste a JWT once, and every REST request you send from Try it carries it.

Press **Anonymous** in the toolbar's Auth field.

Paste a token into **Bearer token**. **Account decoded** below it shows the account inside, so you can check which roles you are testing with.

Press **Set Authorization**. The button now reads **Authorized**.

The toolbar

Field

- Base URL: The server the explorer calls. Click it to copy.

- Guards: Filters by any of the guards your signals declare. A guardless endpoint counts as `Public`.

- Auth: Reads Anonymous or Authorized, and opens the JWT window.

- Search endpoints: Filters the rows by endpoint name or path.

**The server checks the signature.** The window only reads the token's payload; the signature is checked when you send.

**One setting for the whole screen.** The guard filter and the JWT live in the store, so every endpoint list and every Try it request on the page follows them.

**REST only.** WebSocket tries run on the page's own socket connection, not with the pasted token.

**The JWT is for developer testing only.** Paste a test account's token, not a real user's.

Tips

**Show it to developers or admins only.** `devOnly: true` on the route is the simplest way.

**Start small.** Try `base` or a small module before documenting a large domain.

**Manual checks, not tests.** Use the explorer for a quick look; it does not replace automated tests.

Read next

- Signal Components — Every Signal part and its members.

- MCP Server — Why an endpoint is published to agents or refused.

- Authorization — The guards an endpoint can declare.

- Testing — Automated tests for your signals.

## Code Examples

### apps/myapp/ui/ApiDocs.tsx

```ts
"use client";
import { fetch } from "@apps/myapp/client";
import { Signal } from "akanjs/ui";

export const ApiDocs = () => {
  return <Signal.Doc.Zone refName="base" fetch={fetch} openAll />;
};
```

### apps/myapp/page/(admin)/api/_index.tsx

```ts
import { ApiDocs } from "@apps/myapp/ui";
import { page } from "akanjs/client";

export default page()
  .config({ devOnly: true })
  .render(() => <ApiDocs />);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

