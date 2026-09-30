# Model.View.tsx

- Source: /conventions/module/view
- Mirror: /llms/pages/conventions/module/view.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- Model.View.tsx (#overview)
- View vs Unit (#comparison)
- Standard View Shape (#standard-view-shape)
- Full Model Detail Patterns (#detail-patterns)
- Using View In Pages (#using-view-pages)
- Load.View And Store Hydration (#load-view)
- Practical Rules (#practical-rules)

## Content

Model.View.tsx

Model

Export

Props

Drawn by

A View file draws one record in full: the body of a detail page or a detail section. It takes the full model as a prop and only draws it.

- Takes the full model — `ticket: cnst.Ticket` — Every field is there, including long text and nested data that a list leaves out.

- Only draws — `Ticket.Util.* · Ticket.Unit.*` — It may render Units, Utils, Zones and its own subcomponents. Saving and deciding happen elsewhere.

- Exports General — `Ticket.View.General` — `General` is the main export. A long screen adds named sections beside it.

- Drawn through a Zone — `renderView={(ticket) => …}` — A detail Zone hands the model from the server to it through `Load.View`.

Words used on this page

Term

- full model: The complete model class, such as `cnst.Ticket`, with every field the constant declares.

- light model: A slimmer class, such as `cnst.LightTicket`, holding only the fields a list needs.

- view payload: What `fetch.viewTicket(id)` returns as `ticketView`: one record as plain data.

- hydrate: Filling the client store with data the server already fetched, so no second request is sent.

View vs Unit

Both files only draw a model. They differ in how much of the model they get and in the role they play on the page.

- View: For one detail page or detail section. — one record in full

  - `cnst.Ticket`

  - `Ticket.View.General`

  - `GeneralProps`

  - `Load.View → renderView`

- Unit: For list rows, cards and compact summaries. — one item of many

  - `cnst.LightTicket`

  - `Ticket.Unit.Card`

  - `ModelProps<"ticket", cnst.LightTicket>`

  - `Load.Units → renderItem`

**One record in detail is a View.** It needs fields such as a long body, so it takes the full model.

**The same shape repeated is a Unit.** A list sends many records at once, so each row gets the light model.

Standard View Shape

Every View file starts from the same skeleton. Here is the whole file for a ticket:

**The main export is `General`.** Pages and Zones reach it as `Ticket.View.General`.

**Props are the full model plus a class name.** `GeneralProps` sits right above the component, `className` first, then `ticket: cnst.Ticket`.

**The caller's class goes last.** `cn("…", className)` lets the page or Zone adjust width and spacing.

**Every label goes through the dictionary.** A field name is `l("ticket.status")`. An enum value is keyed by the enum's name, so `"active"` reads `l("ticketStatus.active")`.

Full Model Detail Patterns

A View receives the full model, not the light summary, so it can draw any field the constant declares on it. Plain text fields go straight into the markup:

An enum goes through its dictionary label, and a number is formatted where it is drawn:

**Shared display logic goes on the Light model.** A one-off `toLocaleString()` stays in the View. A format a Unit needs too becomes a method on `LightOrder`, which the full model inherits.

**A long screen gets named sections.** `User.View` in `libs/shared` exports `General` and `Discord` instead of one giant component.

**A button inside is a Util.** `User.View.General` renders `User.Util.ChangePassword`; the View places it, the Util owns the click.

Using View In Pages

A detail page starts the request with `fetch.view<Model>(id)` and gives the view payload to a Zone. Whether you await the call decides when the section arrives:

Destructure — streamed

The page markup is sent while the query runs. The section fills in behind its own boundary.

await — part of the shell

For when the page itself reads the model: a title, an id for a link, or a redirect decision.

Streamed

The usual detail page does not await, and hands the promise across as it is:

**No `async`, no `await`.** The render callback is `async` only when its body awaits.

**The Zone takes the promise.** `ClientView` accepts a payload or its promise, and `Load.View` shows a skeleton until it lands.

Awaited

When the page needs the record itself, await the call. It resolves to an object holding `ticket` and `ticketView`:

**`ticketView` still goes to the Zone.** Already resolved, it renders in the first HTML with no loading state.

**`ticket` stays in the page.** It is the hydrated model, for the link, a title or a redirect.

**The page does not call `Load.View` itself.** `renderView` is a function, and a server page cannot pass a function to a client component. The Zone sits between them for that reason.

**Pass `ticketView` to a Zone, never `ticket`.** `ticket` is a class instance, and React Flight refuses a class instance as a client prop.

Load.View And Store Hydration

`Load.View` puts the record from the view payload into the client store, then calls your `renderView` with the full model. A detail Zone is little more than this one call:

**Use it wherever server-fetched view data meets the store.** A detail Zone, a tab layout or a reusable section all wrap the View this way.

**Waiting and empty states are built in.** A pending promise shows `loading`, a skeleton by default; an empty payload shows `empty`, an `<Empty />` by default.

What it writes to the store

Before the View renders, `Load.View` sets four keys for the model:

Store key

- <model>: The full model instance, built from the payload's `<model>Obj`. — Example: `ticket: new cnst.Ticket().set(ticketObj)`

- <model>Loading: Set to `false`, so the View draws right away with no loading state. — Example: `ticketLoading: false`

- <model>Modal: Set to `"view"`, so a modal wrapper opens the record to read, not its edit form. — Example: `ticketModal: "view"`

- <model>ViewAt: The `Date` the server stamped on the payload, used to compare it with the store. — Example: `ticketViewAt: ticketView.ticketViewAt`

**Newer store data wins.** If the store already holds this record with a later `<model>ViewAt`, `Load.View` keeps the store's copy instead of the older payload.

**Going back after a save loads the record again.** If the navigation cache replays a payload from before the save, `Load.View` fetches the record again with `st.do.view<Model>(id)`.

Practical Rules

What belongs in a View, and which file takes everything else:

The work

View — *.View.tsx

Util — *.Util.tsx

Zone — *.Zone.tsx

page — page/**

- Drawing — the View's job

  - fields and markup: Titles, body text, nested data and formatted numbers from the full model.

  - l() · l.trans(): Field names, enum values and headings come from the dictionary.

  - General · Discord: A large View splits into named sections, as `User.View` does, not one giant `General`.

  - <Model>.Unit · <Model>.Util: A View may render Units, Utils and Zones; each keeps its own job.

- Behaviour — another file

  - onClick · submit: A button or action is a Util the View renders, such as `User.Util.ChangePassword`.

  - useState · useEffect: Hooks need the browser, so they live in a Util or a Zone.

  - st.use · st.do: Store reads and writes. The store, signal and service do the actual mutation.

  - Load.View: Hydrates the store from the view payload and hands the model to the View.

  - fetch.view<Model>: Called in the route, so the query starts before the first byte is sent.

Belongs here

Not here

**A View is a server file, and lint checks it.** In a `*.View.tsx`, a `"use client"` line, a React hook import such as `useState`, or an `st` import each fail `akan lint`.

Related pages

- Model.Unit.tsx — The light-model counterpart, for list rows and cards.

- Model.Util.tsx — Where the buttons and actions inside a View live.

- Model.Zone.tsx — The detail Zone, with every prop of Load.View.

- UI Architecture — Why each UI file role runs on the server or the client.

## Code Examples

### apps/koyo/lib/ticket/Ticket.View.tsx

```ts
import { type cnst, usePage } from "@apps/koyo/client";
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  ticket: cnst.Ticket;
}

export const General = ({ className, ticket }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      <h1>{ticket.title}</h1>
      <div>
        {l("ticket.status")}: {l(`ticketStatus.${ticket.status}`)}
      </div>
      <p>{ticket.content}</p>
    </div>
  );
};
```

### apps/blog/lib/article/Article.View.tsx

```ts
import type { cnst } from "@apps/blog/client";
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  article: cnst.Article;
}

export const General = ({ className, article }: GeneralProps) => {
  return (
    <article className={cn("flex flex-col gap-2", className)}>
      <h1>{article.title}</h1>
      <p>{article.description}</p>
    </article>
  );
};
```

### apps/koyo/lib/order/Order.View.tsx

```ts
import { type cnst, usePage } from "@apps/koyo/client";

interface GeneralProps {
  className?: string;
  order: cnst.Order;
}

export const General = ({ className, order }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={className}>
      <span>{l(`orderStatus.${order.status}`)}</span>
      <div>{order.totalPrice.toLocaleString()}</div>
    </div>
  );
};
```

### apps/koyo/page/ticket/[ticketId]/_index.tsx

```ts
import { fetch, Ticket } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("ticketId", ID)
  .render(({ ticketId }) => {
    const { ticketView } = fetch.viewTicket(ticketId);
    return <Ticket.Zone.View view={ticketView} />;
  });
```

### apps/koyo/page/ticket/[ticketId]/_index.tsx

```ts
import { fetch, Ticket, usePage } from "@apps/koyo/client"; // [!code collapse:4]
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { buttonRecipe, Link } from "akanjs/ui";

export default page()
  .param("ticketId", ID)
  .render(async ({ ticketId }) => {
    const { l } = usePage();
    const [{ ticket, ticketView }] = await Promise.all([
      fetch.viewTicket(ticketId),
    ]);
    return (
      <div className="flex flex-col gap-4">
        <Ticket.Zone.View view={ticketView} />
        <Link className={buttonRecipe()} href={`/ticket/${ticket.id}/edit`}>
          {l("base.updateModel", { model: l("ticket.modelName") })}
        </Link>
      </div>
    );
  });
```

### apps/koyo/lib/ticket/Ticket.Zone.tsx

```ts
"use client"; // [!code collapse:4]
import { type cnst, Ticket } from "@apps/koyo/client";
import type { ClientView } from "akanjs/fetch";
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
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

