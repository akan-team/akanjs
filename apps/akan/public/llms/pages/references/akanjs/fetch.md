# akanjs/fetch

- Source: /references/akanjs/fetch
- Mirror: /llms/pages/references/akanjs/fetch.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/fetch (#akanjs-fetch)
- InitHandle / ViewHandle / EditHandle (#InitHandle / ViewHandle / EditHandle)
- ClientInit (#ClientInit)
- ClientView / ClientEdit (#ClientView / ClientEdit)
- SliceMeta (#SliceMeta)
- FetchInitForm (#FetchInitForm)
- Account (#Account)
- FetchClient (#FetchClient)
- getRequest / headers / cookies (#getRequest / headers / cookies)

## Content

akanjs/fetch

`akanjs/fetch` holds the types that carry fetched data from a route to its components, and the client that sends those calls. Zone files import its types with `import type`.

Words Used On This Page

Term

- handle: What `fetch.init*`, `fetch.view*` and `fetch.edit*` return. Await it, or read one field off it.

- payload: Plain data a Zone receives, such as `userInitInOrg`. It can cross from server to client.

- hydrated instance: A model class instance such as `cnst.User` or a `DataList`. It stays in server components.

- slice: A named list query of one model. The `inOrg` slice of `user` gives `fetch.initUserInOrg`.

- Zone: A module's client component. It fills the store from a payload and renders it.

Exports

- InitHandle, ViewHandle, EditHandle: What `fetch.init*`, `fetch.view*` and `fetch.edit*` return: awaitable, or split per field.

- ClientInit: Type of a Zone's `init` prop: a list payload or its promise.

- ClientView, ClientEdit: Types of a Zone's `view` and `edit` props for one record.

- ServerInit, ServerView, ServerEdit: The same three payloads, already resolved instead of a promise.

- SliceMeta: Names the slice a component works on: `refName`, `sliceName` and `argLength`.

- FetchInitForm: Options for loading a list: page, limit, sort, insight, default values and invalidate.

- QuerySetting: `{ queryKey, args }`: the filter a root-slice list component runs.

- Account: The account data a sign-in token carries.

- FetchClient: The runtime client behind every app's `fetch`.

- getRequest, headers, cookies: Read the request a page is being rendered for. Server only.

- Everything else: `HttpClient`, `WsClient`, `AgentTurn`, request helpers like `getRequestTheme`, and client types.

InitHandle / ViewHandle / EditHandle

A route's `fetch.init*`, `fetch.view*` and `fetch.edit*` calls return a handle. Await it and you get the same object these helpers always gave; read a field off it and you get that field's own promise.

So each section renders as soon as its own data lands, and the page never waits for the slowest query.

Three Handles

Handle

Returned by

Fields

- `InitHandle` — fetch.init<Model><Suffix>(...args, option?) — <model>Init<Suffix> · <model>List<Suffix> · <model>Insight<Suffix>

- `ViewHandle` — fetch.view<Model>(id, option?) — <model> · <model>View

- `EditHandle` — fetch.edit<Model>(id, option?) — <model> · <model>Edit

Splitting A Page

Destructure the handle instead of awaiting it, and hand each field to the section that renders it:

**Every request leaves at call time.** Splitting the result never makes the queries run one after another.

**The list lands first.** `<model>List<Suffix>` resolves when the rows arrive. `<model>Init<Suffix>` also waits for the count, because it carries `lastPageOf<Model>`.

**Await what the first HTML needs.** `await` still returns the whole object and keeps that section in the shell, which SEO snapshots and prerendering read.

**Just the payload?** `fetch.get<Model>Init<Suffix>`, `fetch.get<Model>View` and `fetch.get<Model>Edit` return it as a plain promise.

Where Each Field Goes

Field

Zone — init · view · edit

Server — Unit · View · Load.Stream

- Plain payload

  - <model>Init<Suffix>: The list payload. Pass it to the Zone's `init` prop.

  - <model>View · <model>Edit: One record's payload. Pass it to the Zone's `view` or `edit` prop.

- Hydrated instances

  - <model>List<Suffix>: A `DataList` of Light models, such as a list to count.

  - <model>Insight<Suffix>: The aggregate as an Insight model instance.

  - <model>: The full model instance of one record.

hand it here

not here

**Never pass a hydrated instance to a Zone.** React Flight refuses class instances as client-component props, so `<model>List<Suffix>`, `<model>Insight<Suffix>` and `<model>` stay in server components.

The Load Shells

How `Load.Units`, `Load.View` and `Load.Stream` render a handle's fields.

Zone Props

How a Zone takes `init`, `view` and `slice`.

ClientInit

`ClientInit` is the type of a Zone's `init` prop. It takes the resolved list payload or the `<model>Init<Suffix>` promise from the init handle; a pending promise renders behind the Zone's own Suspense boundary.

A list Zone declares it like this:

Type Parameters

Two are usually enough: the ref name and the Light model. The other three default to `any`.

- RefName (string): The model's ref name, such as `"user"`. The payload's keys are named after it.

- Light: The Light model each row is, such as `cnst.LightUser`.

- Insight (default any): The Insight model of the aggregate.

- QueryArgs (default any): The slice's argument tuple.

- Filter (default any): The model's filter class. It types the sort key.

What The Payload Holds

Every key but the first three is named after the model. For `user`, the rows are `userObjList`:

- refName, sliceName, argLength: Which slice the list came from: the same three fields as `SliceMeta`.

- <model>ObjList: The rows, as plain objects.

- <model>ObjInsight: The aggregate as a plain object. `null` when loaded with `insight: false`.

- pageOf<Model>, limitOf<Model>, lastPageOf<Model>: The current page, the page size, and the last page worked out from the count.

- hasMoreOf<Model>: Whether another batch exists, read off the batch size rather than the count.

- queryArgsOf<Model>, sortOf<Model>: The arguments and the sort key the list was loaded with.

- <model>InitAt: When the list was loaded.

ClientView / ClientEdit

`ClientView` and `ClientEdit` are the Zone prop types for one record. Each takes the resolved payload or the promise the view or edit handle hands out.

Type

Handle field

Consumed by

- `ClientView` — fetch.view<Model>(id) → <model>View — The `view` prop of `Load.View`.

- `ClientEdit` — fetch.edit<Model>(id) → <model>Edit — The `edit` prop of `Load.Edit`.

Both payloads have the same three keys:

- refName: The model's ref name.

- <model>Obj: The record, as a plain object.

- <model>ViewAt: When the record was loaded. The edit payload uses this same key.

A Zone that shows a ticket and edits it:

**A new record needs no request.** The `edit` prop of `Load.Edit` and `Model.EditModal` also takes a partial model, so a new-record page passes default values instead of a payload.

**The full model is a separate field.** `<model>` on the same handle is a hydrated instance for server components; the Zone takes only the payload.

SliceMeta

`SliceMeta` names the slice a component works on. `Model.*` and `Data.*` components take it as their `slice` prop, to know which store and which list to update after a save.

- refName: The model's ref name, such as `"ticket"`.

- sliceName: Ref name plus slice suffix, such as `ticketInProject`. The root slice's is the ref name itself.

- argLength: How many query arguments the slice takes.

Read one off `fetch.slice`, and let a component take it as an optional prop:

**`fetch.slice` holds one per slice,** keyed by `sliceName` and typed from the app's signals.

**Every list payload carries the same three fields,** so `Load.Units` finds its slice from `init` alone.

FetchInitForm

`FetchInitForm` is the option object for loading a list: which page, how many rows, what order, and whether to count. It is the last argument of `fetch.init<Model><Suffix>()` and `st.do.init<Model><Suffix>()`.

- page (number, default 1): The page to load, counted from 1.

- limit (number, default 20): Rows per page.

- sort (ExtractSort<Filter>, default "latest"): One of the filter's sort keys. `latest`, `oldest` and `relevance` always exist.

- insight (boolean, default true): `false` skips the aggregate query, so `<model>ObjInsight` is `null` and there is no total.

- default (Partial<DefaultOf<Input>>, st.do.init*): Values the slice's form starts from, and returns to after each save.

- invalidate (boolean, default false, st.do.init*): `false` reuses a list already loaded with the same arguments, page, limit and sort.

Its type arguments, `Input` and `Filter`, type `default` and `sort`. Fields tagged `st.do.init*` are read by the store only. The defaults above apply to `fetch.init*`; `st.do.init*` keeps the list's current `page`, `limit` and `sort` when you leave them out.

A member list that shows no total loads without the count:

**Pass `insight: false` when the screen shows no total and no pagination.** The rows in hand are then the whole count there is.

**The same object takes per-call options.** `fetch.init*` also accepts `token`, `timeout` and the other `FetchPolicy` fields in it.

**List components take it as their init prop.** `Data.CardList`, `Data.TableList` and `Data.ListContainer` pass it on to `st.do.init*`.

Account

`Account` is the account data a sign-in token carries. It always has `appName` and `environment`, and its type argument adds the app's own claims.

Read the current account with `getAccount()` from `akanjs/client`, in a page render or in the browser:

**A token for another app reads as signed out.** `getAccount()` returns only `{ appName, environment }` when the token was issued for another app or environment.

**`getDefaultAccount()` is that signed-out value,** built from the current env's `appName` and `environment`.

**The server decodes the same shape.** `AccountMiddleware` in `libs/shared` puts it on each call, and guards read it with `context.get("account")`.

FetchClient

`FetchClient` turns the app's signal metadata into typed HTTP and WebSocket functions. The `fetch` an app imports is a proxy around one instance, so its instance methods are callable on `fetch` itself.

Member

- new FetchClient(origin): Builds a client for an API origin such as `getEnv().serverHttpUri`, prefix included.

- setJwt(jwt): Sends this token with every later call, over HTTP and WebSocket. `null` clears it.

- clone({ origin, jwt, connect }): A copy with the same endpoints, for another origin or user. `connect` defaults to `true`.

- setTimeout(ms): Budget for calls whose endpoint and caller name none: 30 seconds by default, `false` for no limit.

- connect(), disconnect(): Open or close the WebSocket that `pubsub` and `message` endpoints use.

- fetch.instance: The `FetchClient` inside an app's `fetch` proxy.

- FetchClient.from, FetchClient.build: Build an app's `fetch` in the generated `lib/sig.ts` and `lib/useClient.ts`.

Signal tests use `clone` to call the server as a signed-in user:

**One clone per user.** Each clone carries its own token, so two users can call the same server side by side.

**`connect: false` skips the WebSocket** for a copy that only makes HTTP calls. The API explorer clones this way.

**Never write the API prefix by hand.** `getEnv().serverHttpUri` from `akanjs/base` already ends with it.

getRequest / headers / cookies

These read the request a page is being rendered for. `akanjs/fetch` pulls in no client code, so a server component can import them freely.

- getRequest() (Request | undefined): The request being rendered.

- headers() (Map<string, string>): The request headers, keys in lower case. A new Map on every call.

- cookies() (Map<string, { name, value }>): The parsed `Cookie` header. A `j:` value is decoded as JSON.

- getRequestStore() (AkanRequestStore | undefined): The whole per-request store: the request, its theme and its query cache.

A page can read them while it renders:

**They see a request only while a page renders.** Anywhere else the maps are empty and `getRequest()` is `undefined`.

**Endpoints read the caller another way:** `.with(Self)` in the signal, or `context.get("account")` in a guard.

**Code that runs on both sides uses `akanjs/client`.** Its `getCookie(key)` reads the request on the server and `document.cookie` in the browser.

## Code Examples

### apps/myapp/page/org/[orgId]/_index.tsx

```tsx
import { fetch, Org, User } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("orgId", ID)
  .render(({ orgId }) => {
    const { userInitInOrg, userListInOrg } = fetch.initUserInOrg(orgId);
    const { orgView } = fetch.viewOrg(orgId);
    return (
      <>
        <Org.Zone.View view={orgView} />
        <Load.Stream of={userListInOrg}>
          {(userList) => <User.Unit.Total count={userList.length} />}
        </Load.Stream>
        <User.Zone.Card init={userInitInOrg} />
      </>
    );
  });
```

### apps/myapp/lib/user/User.Zone.tsx

```tsx
"use client";
import { type cnst, User } from "@apps/myapp/client";
import type { ClientInit } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"user", cnst.LightUser>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(user) => <User.Unit.Card key={user.id} user={user} />}
    />
  );
};
```

### apps/myapp/lib/ticket/Ticket.Zone.tsx

```tsx
"use client";
import { type cnst, fetch, Ticket } from "@apps/myapp/client";
import type { ClientEdit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface ViewProps {
  className?: string;
  view: ClientView<"ticket", cnst.Ticket>;
}
export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(ticket) => <Ticket.View.General ticket={ticket} />}
    />
  );
};

interface EditProps {
  className?: string;
  edit: ClientEdit<"ticket", cnst.Ticket>;
}
export const Edit = ({ className, edit }: EditProps) => {
  return (
    <Load.Edit
      className={className}
      slice={fetch.slice.ticket}
      edit={edit}
      type="form"
    >
      <Ticket.Template.General />
    </Load.Edit>
  );
};
```

### apps/myapp/lib/ticket/Ticket.Util.tsx

```tsx
"use client";
import { fetch, Ticket } from "@apps/myapp/client";
import type { SliceMeta } from "akanjs/fetch";
import { Model } from "akanjs/ui";

interface EditProps {
  ticketId: string;
  slice?: SliceMeta;
}
export const Edit = ({
  ticketId,
  slice = fetch.slice.ticketInProject,
}: EditProps) => {
  return (
    <Model.Edit slice={slice} modelId={ticketId}>
      <Ticket.Template.General />
    </Model.Edit>
  );
};
```

### apps/myapp/page/org/[orgId]/member.tsx

```tsx
import { fetch, User } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("orgId", ID)
  .render(({ orgId }) => {
    const { userInitInOrg } = fetch.initUserInOrg(orgId, {
      limit: 50,
      sort: "oldest",
      insight: false,
    });
    return <User.Zone.Card init={userInitInOrg} />;
  });
```

### apps/myapp/webkit/cookie.ts

```ts
import { getAccount } from "akanjs/client";
import type { Account } from "akanjs/fetch";

interface SelfClaim {
  self?: { id: string };
}

export const getSelfId = () => {
  const account: Account<SelfClaim> = getAccount<SelfClaim>();
  return account.self?.id;
};
```

### apps/myapp/lib/user/user.signal.spec.ts

```ts
import { getOrSetupSignalTestFetch } from "akanjs/test";

import type { fetch as appFetch } from "../useServer";

type AppFetch = typeof appFetch;

export const getUserFetch = async (jwt: string): Promise<AppFetch> => {
  const fetch = await getOrSetupSignalTestFetch<AppFetch>();
  return fetch.clone({ jwt }) as AppFetch;
};
```

### apps/myapp/page/_index.tsx

```tsx
import { Promo } from "@apps/myapp/client";
import { page } from "akanjs/client";
import { cookies, getRequest, headers } from "akanjs/fetch";

export default page().render(() => {
  const referer = headers().get("referer") ?? getRequest()?.url;
  const campaign = cookies().get("campaign")?.value;
  return <Promo.Zone.Banner referer={referer} campaign={campaign} />;
});
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

