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

model.Zone.tsx

A Zone file contains client section components for pages. Zones compose server-fetched init/view data with Load wrappers, Unit/View display components, Util actions, and small section-level UI state.

Pages should usually pass route params and server data into Zones. Zones handle section composition, while Unit/View render display, Template renders forms, Util handles small actions, and Store owns state/actions.

File Convention And Props

Zone files usually use client hooks and Load wrappers, so they start with the use client directive. Their props commonly receive server-prepared ClientInit or ClientView values.

List Zone With Load.Units

Use Load.Units when a Zone receives ClientInit list data from a server page. It hydrates initial list state, handles loading and empty states, and delegates each item to Unit components.

Render one item, usually by delegating to Unit.Card or Unit.Abstract.

Render the whole list when the layout needs grouping, tabs, boards, or custom ordering.

Render empty states, often with Model.NewWrapper or a link-style call to action.

View Zone With Load.View

Use Load.View when a Zone receives ClientView detail data. Load.View hydrates the selected model into store state, then passes the full model to View components.

Section Orchestration Zones

Some Zones compose more than a simple list. They may combine local UI state, store state, Unit components, Util controls, and Model wrappers for a complete page section.

Live And Dashboard Zones

A Zone can also be a dashboard or a live section when the whole section depends on store state, subscriptions, or client-only layout behavior.

When To Use Zone

Route shell, params, and server fetch.

Page section composition and Load wrappers.

Model display and detail rendering.

Form fields and form fragments.

Small actions, toolboxes, and helpers.

Practical Rules

Keep pages thin by passing server init or view data into Zone components.

Use Load.Units for list sections and Load.View for detail sections.

Delegate item display to Unit components and full detail display to View components.

Use Util components for action controls inside Zones.

Keep core business rules in service, document, store, or constants instead of Zone render code.

## Code Examples

### DbBackup.Zone.tsx

```ts
export const Card = ({ className, init, devAppId }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderEmpty={() => (
        <Model.NewWrapper partial={{ devAppId }} slice={fetch.slice.dbBackupInDevApp}>
          <button className="btn btn-secondary">+ New</button>
        </Model.NewWrapper>
      )}
      renderItem={(dbBackup) => <DbBackup.Unit.Card key={dbBackup.id} dbBackup={dbBackup} />}
    />
  );
};
```

### Ticket.Zone.tsx

```ts
export const View = ({ className, view, self }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(ticket) => <Ticket.View.General ticket={ticket} self={self} />}
    />
  );
};
```

### Ticket.Zone.tsx

```ts
export const Kanban = ({ init, slice = fetch.slice.ticket }: KanbanProps) => {
  const [tab, setTab] = useState("open");
  return (
    <Load.Units
      init={init}
      renderList={(ticketList) => (
        <>
          <Ticket.Util.QueryMakerInSelf slice={slice} />
          <Ticket.Unit.Card ticket={ticketList.values[0]} />
          <Model.NewWrapper slice={fetch.slice.ticketInProject}>+ New</Model.NewWrapper>
        </>
      )}
    />
  );
};
```

### Dessert.Zone.tsx

```ts
export const Card = ({ init }: CardProps) => {
  return (
    <>
      <Load.Units
        init={init}
        renderItem={(dessert) => (
          <Model.ViewWrapper modelId={dessert.id} slice={fetch.slice.dessert}>
            <Dessert.Unit.Card dessert={dessert} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal slice={fetch.slice.dessert} renderView={(dessert) => <Dessert.View.General dessert={dessert} />} />
    </>
  );
};
```

### Summary.Zone.tsx

```ts
export const Dashboard = () => {
  const summary = st.use.summary();
  const summaryLoading = st.use.summaryLoading();
  if (summaryLoading || !summary) return <Loading.Skeleton active />;
  return <Summary.View.General summary={summary} />;
};
```

### ChatRoom.Zone.tsx

```ts
useEffect(() => {
  st.do.readChat(root);
  const unsubscribe = fetch.subscribeChatAdded(root, (chat) => {
    st.do.chatAdded(root, chat);
  });
  return () => unsubscribe();
}, []);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

