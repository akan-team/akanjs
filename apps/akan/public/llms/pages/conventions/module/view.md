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

## Code Examples

### Ticket.View.tsx

```ts
import { type cnst, usePage } from "@apps/myapp/client";
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
      <div>{l("ticket.status")}: {l(
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

