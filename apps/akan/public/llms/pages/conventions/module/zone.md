# Model.Zone.tsx

- Source: /conventions/module/zone
- Mirror: /llms/pages/conventions/module/zone.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.Zone.tsx (#zone-overview)
- File Convention And Props (#file-convention)
- List Zone With Load.Units (#load-units-zone)
- View Zone With Load.View (#load-view-zone)
- Section Orchestration Zones (#orchestration-zones)
- Live And Dashboard Zones (#live-dashboard-zones)
- When To Use Zone (#when-to-use)
- Practical Rules (#practical-rules)

## Content

Model.Zone.tsx

required

model.Zone.tsx

A Zone is the client part of a page section. The page fetches the data; the Zone puts it into the store and hands each record to a Unit or View that draws it.

Open this file when a page gets a new list or detail section, or when a section needs a modal or live updates. One section comes together in four steps:

**The page starts the fetch.** `fetch.init<Model><Suffix>()` loads a list and `fetch.view<Model>(id)` loads one record. The result goes down as `init` or `view`.

**The Zone hands it to `Load.Units` or `Load.View`.** They fill the store and draw the loading and empty states.

**Each record goes to a server component.** A row goes to a `Unit`, the detail to a `View`.

**Actions and forms live in their own files.** A button is a `Util`, a form is a `Template`, and state and actions live in the store.

Words used on this page

Term

- init: The `<model>Init<Suffix>` field of `fetch.init<Model><Suffix>()`: a `ClientInit`, awaited or not.

- view: The `<model>View` field of `fetch.view<Model>(id)`: one record as a `ClientView`, awaited or not.

- hydrate: Copy a server payload into the client store, so the screen and the store hold the same data.

- fetch.slice.<name>: Tells a wrapper or control which model and which list it works with.

- Suspense boundary: A spot that shows a fallback until its promise lands, without holding up the rest of the page.

File Convention And Props

A Zone file always starts with `"use client"`. Its props must be able to cross from server to client: an `init` or `view` payload, ids, and a `className`.

- Path — `apps/<app>/lib/<model>/<Model>.Zone.tsx` — Database and service modules may have one. Scalar modules may not.

- First Line — `"use client";` — Always, on line 1 above the imports.

- List Props — `className · init · slice · <parent>Id` — `init` is a `ClientInit`. `slice` goes to the wrappers and controls inside.

- View Props — `className · view · <parent>Id` — `view` is a `ClientView`. The signed-in user comes from `st.use.self()`, not a prop.

A new module starts with this Zone: one list export, `Card`, and one detail export, `View`:

**Exports are role names.** The model comes from the namespace, so a page writes `<IcecreamOrder.Zone.Card />`, never `IcecreamOrderCard`.

**`ClientInit`, `ClientView` and `ClientEdit` take either shape.** The page may pass the resolved payload or the promise its fetch handed out, and the Zone stays the same.

**Declare `interface <Name>Props` right above the component,** with `className?` first.

**Never type a Zone prop as a `cnst` model.** A Zone is a client component, so a `cnst.IcecreamOrder` prop is a class instance crossing the server boundary, and lint (`no-model-type-in-util-zone`) rejects it. Take an id, or a `ClientInit` / `ClientView`, and read the model from the store.

List Zone With Load.Units

A list section hands its `init` to `Load.Units`. It fills the store with the rows, draws the loading and empty states, and calls your render function for each row.

The page starts the query and passes the promise down without awaiting it:

The Zone gives `Load.Units` a row renderer and an empty state:

**`renderItem` draws one row,** usually by handing it to `Unit.Card` or `Unit.Abstract`.

**`renderEmpty` is the empty state,** often a `Model.NewWrapper` or a link-style call to action. `Model.NewWrapper` draws only the trigger, so the `Model.EditModal` beside it draws the form.

**An unawaited promise streams.** `Load.Units` shows `loading` behind a Suspense boundary of its own, and the rest of the page is sent without waiting.

Load.Units props

- init (ClientInit<"model", LightModel>): The list payload or its promise, handed down from the page.

  - required

- renderItem ((item, idx) => ReactNode): Draws one row; required unless you pass `renderList`.

- renderList ((list: DataList) => ReactNode): Draws the whole list, for grouping, tabs, boards or a custom order.

- renderEmpty ((() => ReactNode) | false, default <Empty />): Draws the no-rows state; `false` with `renderList` draws the empty list instead.

- empty (ReactNode): A ready-made no-rows placeholder that wins over `renderEmpty`.

- loading (ReactNode, default Loading.Skeleton): Shown while a promised `init` is pending and while the list reloads.

- pagination (boolean, default true): Adds a pager on desktop and infinite scroll on mobile.

- className (string): Classes for the wrapping div, such as a grid layout.

View Zone With Load.View

A detail section hands its `view` to `Load.View`. It puts the record into the store, then passes the full model to your `renderView`.

A pending view promise gets its own boundary, so a slow detail never holds up the layout around it:

**The page passes `ticketView`.** `fetch.viewTicket(ticketId)` hands out `ticketView` and `ticket`. Keep `ticket`, a model instance, on the server.

**The signed-in user comes from the store.** `st.use.self()` replaces a `self` prop, which would be a `cnst` model crossing the boundary.

Load.View props

- view (ClientView<"model", Model>): The detail payload or its promise, handed down from the page.

- renderView ((model) => ReactNode): Draws the full model, usually as `<Model>.View.General`.

- loading (ReactNode, default Loading.Skeleton): Shown while a promised `view` is pending.

- empty (ReactNode, default <Empty />): Shown when the record came back empty.

- className (string): Classes for the wrapping div.

- noDiv (boolean): Renders `renderView` without the wrapping div.

Section Orchestration Zones

Some Zones assemble a whole section: a filter, the list, a create button and a modal. The Zone only wires them together; each piece still lives in its own file.

A board with renderList

`renderList` receives the whole list, so the Zone can group rows into columns and put controls around them:

**The filter is a Util.** `Ticket.Util.QueryMakerInSelf` owns the control; the Zone only places it.

**`Model.New` is the create button and its form in one.** `partial` seeds the new ticket with the current project.

**`renderEmpty={false}` keeps the board up.** With no tickets yet, the empty columns and the create button still render.

Cards that open a modal

`Model.ViewWrapper` makes each card open its record, and one `Model.ViewEditModal` shows it with an edit button:

**One modal serves every card.** `Model.ViewWrapper` only opens a record by id; the single `Model.ViewEditModal` for that slice draws it.

**`renderTemplate` is required.** The modal's edit button swaps the View for this form.

**Keep local UI state small.** `useState` is for modal-open, draft input or drag state, never server data.

**Switch modes with `Tab` from `akanjs/ui`,** placed in the page or a View. `Tab.Panel` renders its children as-is, so a server `View` passed in stays server-rendered.

Live And Dashboard Zones

A Zone can also be a dashboard or a live section, when the whole section follows store state, a subscription or a client-only layout.

A dashboard is a `Load.View` over a summary model:

A live section subscribes in an effect and unsubscribes in the effect's cleanup:

**A live list needs no effect.** Declare `.live()` on the slice, and `Load.Units` opens the room and applies each change by itself.

**`useEffect` is for subscribe-with-cleanup.** An effect that loads data on mount repeats a round trip the server already made; `akan quality ssr` reports it as `client-mount-load`.

**Never hand-roll a loading branch.** `Load.View` and `Load.Units` already draw the pending and empty states, and the route fetched the data before the first byte.

When To Use Zone

Every piece of a screen has one home. Reach for a Zone when a section needs the store; anything that only draws stays on the server.

File

Server

Client — "use client"

- Fetches or draws

  - page/**/*.tsx: The route shell that reads params, starts `fetch.*` and passes the results down.

  - <Model>.Unit.tsx: Draws one row or card from a light model.

  - <Model>.View.tsx: Draws the full detail of one record.

- Holds state or an action

  - <Model>.Zone.tsx: Composes a page section: Load wrappers, store reads and modals.

  - <Model>.Template.tsx: Form fields and form fragments, each bound to the store.

  - <Model>.Util.tsx: Small actions, toolboxes and helpers, such as a filter or a remove button.

  - <model>.store.ts: State and actions, shipped only in the client bundle.

Runs here

Not here

Practical Rules

Five rules keep a Zone small:

**Keep pages thin.** Pass server `init` or `view` data into a Zone instead of building the section in the page.

**Lists use `Load.Units`, details use `Load.View`.**

**Drawing goes to Unit and View.** A row is a `Unit` and the full detail is a `View`, so a Zone holds almost no markup of its own.

**Actions go to Util.** Buttons and controls inside a Zone are `Util` components.

**Business rules stay out of render code.** They belong in service, document, store or constant.

Common mistakes

Mistake, then the fix

Do this

- useEffect(() => { fetch… }, []) — Fetch in the route and pass the result down as `init` or `view`.

- fetch.initXInY() — Lint rejects it in a client file; reload with `st.do.initXInY()` instead.

- init={fetch.initXInY(id)} — Pass the field, not the whole handle: `init={xInitInY}`.

- <X.Zone.Card list={xListInY} /> — `xListInY` holds model instances a client prop refuses, so pass `xInitInY`.

- self: cnst.User — Lint rejects a model prop, so read it with `st.use.self()` or take an id.

- useState<Mode>(…) — Switch modes with `Tab` in the page or a View, so each panel stays server-rendered.

- isLoading ? <Spinner /> : … — Use the `loading` and `empty` props of `Load.Units` and `Load.View`.

## Code Examples

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx

```ts
"use client";
import { type cnst, IcecreamOrder } from "@apps/koyo/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"icecreamOrder", cnst.LightIcecreamOrder>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(icecreamOrder) => (
        <IcecreamOrder.Unit.Card
          key={icecreamOrder.id}
          icecreamOrder={icecreamOrder}
        />
      )}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"icecreamOrder", cnst.IcecreamOrder>;
}
export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(icecreamOrder) => (
        <IcecreamOrder.View.General icecreamOrder={icecreamOrder} />
      )}
    />
  );
};
```

### apps/koyo/page/devApp/[devAppId]/dbBackup.tsx

```ts
import { DbBackup, fetch } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("devAppId", ID)
  .render(({ devAppId }) => {
    const { dbBackupInitInDevApp } = fetch.initDbBackupInDevApp(devAppId);
    return (
      <DbBackup.Zone.Card init={dbBackupInitInDevApp} devAppId={devAppId} />
    );
  });
```

### apps/koyo/lib/dbBackup/DbBackup.Zone.tsx

```ts
"use client"; // [!code collapse:4]
import { type cnst, DbBackup, fetch, usePage } from "@apps/koyo/client";
import type { ClientInit } from "akanjs/fetch";
import { buttonRecipe, Load, Model } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"dbBackup", cnst.LightDbBackup>;
  devAppId: string;
}
export const Card = ({ className, init, devAppId }: CardProps) => {
  const { l } = usePage();
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderEmpty={() => (
          <Model.NewWrapper
            partial={{ devAppId }}
            slice={fetch.slice.dbBackupInDevApp}
          >
            <button className={buttonRecipe({ variant: "secondary" })}>
              {l("base.new")}
            </button>
          </Model.NewWrapper>
        )}
        renderItem={(dbBackup) => (
          <DbBackup.Unit.Card key={dbBackup.id} dbBackup={dbBackup} />
        )}
      />
      <Model.EditModal slice={fetch.slice.dbBackupInDevApp}>
        <DbBackup.Template.General />
      </Model.EditModal>
    </>
  );
};
```

### apps/koyo/lib/ticket/Ticket.Zone.tsx

```ts
"use client"; // [!code collapse:4]
import { type cnst, st, Ticket } from "@apps/koyo/client";
import type { ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface ViewProps {
  className?: string;
  view: ClientView<"ticket", cnst.Ticket>;
}
export const View = ({ className, view }: ViewProps) => {
  const self = st.use.self();
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(ticket) => (
        <Ticket.View.General ticket={ticket} self={self} />
      )}
    />
  );
};
```

### apps/koyo/lib/ticket/Ticket.Zone.tsx

```ts
export const Kanban = ({
  className,
  init,
  projectId,
  slice = fetch.slice.ticketInProject,
}: KanbanProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderEmpty={false}
      renderList={(ticketList) => (
        <>
          <Ticket.Util.QueryMakerInSelf slice={slice} />
          <div className="grid grid-cols-3 gap-4">
            {cnst.TicketStatus.values.map((status) => (
              <div key={status} className="flex flex-col gap-2">
                {ticketList
                  .filter((ticket) => ticket.status === status)
                  .map((ticket) => (
                    <Ticket.Unit.Card key={ticket.id} ticket={ticket} />
                  ))}
              </div>
            ))}
          </div>
          <Model.New slice={slice} partial={{ project: projectId }}>
            <Ticket.Template.General />
          </Model.New>
        </>
      )}
    />
  );
};
```

### apps/koyo/lib/dessert/Dessert.Zone.tsx

```ts
export const Card = ({ className, init }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderItem={(dessert) => (
          <Model.ViewWrapper
            key={dessert.id}
            modelId={dessert.id}
            slice={fetch.slice.dessert}
          >
            <Dessert.Unit.Card dessert={dessert} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal
        slice={fetch.slice.dessert}
        renderView={(dessert) => <Dessert.View.General dessert={dessert} />}
        renderTemplate={() => <Dessert.Template.General />}
      />
    </>
  );
};
```

### apps/koyo/lib/summary/Summary.Zone.tsx

```ts
export const Dashboard = ({ view }: DashboardProps) => {
  return (
    <Load.View
      view={view}
      renderView={(summary) => <Summary.View.General summary={summary} />}
    />
  );
};
```

### apps/koyo/lib/chatRoom/ChatRoom.Zone.tsx

```ts
export const Room = ({ className, roomId, init }: RoomProps) => {
  useEffect(() => {
    st.do.readChat(roomId);
    const unsubscribe = fetch.subscribeChatAdded(roomId, (chat) => {
      st.do.chatAdded(roomId, chat);
    });
    return () => unsubscribe();
  }, [roomId]);
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(chat) => <Chat.Unit.Card key={chat.id} chat={chat} />}
    />
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

