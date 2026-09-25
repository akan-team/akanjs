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

Renders the full model. Use it for detail pages and sections that need body content, histories, logs, or full nested data.

Renders the light model. Use it for list rows, cards, table items, and compact summaries.

Stores the hydrated full model instance from the server view object.

Marks the full model as ready so the View can render without showing loading UI.

Marks the current model state as view mode. Other model wrappers can distinguish view/edit/new flows.

Stores the server view timestamp so Load.View can avoid replacing newer client state with older view data.

A View file renders full-model detail UI. It is usually used by detail pages or Zone wrappers that already have full view data from the server.

View components are presentation components. They may compose Unit, Util, Zone, and local subcomponents, but mutation and business decisions should stay outside the View.

View vs Unit

The main distinction is data size and page role. View is for full detail, while Unit is for repeated summary UI.

Standard View Shape

A standard View exports General, accepts className and a full model prop, then uses dictionary labels for field names and statuses.

Full Model Detail Patterns

A View can render every field defined on the constant full model because it receives the full model shape, not the light summary shape.

Using View In Pages

A server page usually fetches full view data, then passes the view object to a Zone wrapper or directly into Load.View.

Load.View And Store Hydration

Load.View safely hydrates server-provided full model data into the client store. It sets the model, loading state, modal state, and view timestamp before rendering your View.

Use this wrapper when rendering server-fetched view data inside client Zones, tab layouts, or reusable sections.

Practical Rules

Accept full model props in View components. Use Unit for light list or card summaries.

Use dictionary labels for field names, statuses, and headings.

Split large Views into named section components instead of one giant General component.

Keep mutations in Util, Store, Signal, or Service. View should mostly render the current full model.

Use Load.View when server-fetched view data must hydrate into client store state.

## Code Examples

### Ticket.View.tsx

```ts
import { type cnst, usePage } from "@apps/myapp/client";
import { clsx } from "akanjs/client";

interface GeneralProps {
  className?: string;
  ticket: cnst.Ticket;
}

export const General = ({ className, ticket }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex w-full flex-col gap-4", className)}>
      <h1>{ticket.title}</h1>
      <div>{l("ticket.status")}: {l(`ticketStatus.${ticket.status}`)}</div>
    </div>
  );
};
```

### Article.View.tsx

```ts
interface ArticleViewProps {
  article: cnst.Article;
}

export const General = ({ article }: ArticleViewProps) => (
  <article>
    <h1>{article.title}</h1>
    <p>{article.description}</p>
  </article>
);
```

### Order.View.tsx

```ts
interface OrderViewProps {
  order: cnst.Order;
}

export const General = ({ order }: OrderViewProps) => {
  const { l } = usePage();
  return (
    <div>
      <span>{l(`orderStatus.${order.status}`)}</span>
      <div>{order.totalPrice.toLocaleString()}</div>
    </div>
  );
};
```

### detail page

```ts
export default async function Page({ params }: PageProps) {
  const { releaseView } = await fetch.viewRelease(params.releaseId);
  return <Release.Zone.View view={releaseView} />;
}
```

### Release.Zone.tsx

```ts
interface ViewProps {
  view: ClientView<"release", cnst.Release>;
}

export const View = ({ view }: ViewProps) => {
  return <Load.View view={view} renderView={(release) => <Release.View.General release={release} />} />;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

