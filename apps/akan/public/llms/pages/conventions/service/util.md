# Service.Util.tsx

- Source: /conventions/service/util
- Mirror: /llms/pages/conventions/service/util.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service.Util.tsx (#service-util)
- The Shape, If You Write One (#shape)
- Two Component Roles (#allowlist)

## Content

Service.Util.tsx

`Service.Util.tsx` holds a small client control, such as a button, that runs one of a service module's endpoints. Not one of the eight service modules in this workspace has this file, and that is by design, not a gap waiting to be filled.

This page explains why the file is rare, where the control goes instead, and what it takes for yours to be the exception.

Words used on this page

Term

- service module: A `lib/_<name>` folder with no model: a service, a signal, a dictionary and often a store.

- model module: A `lib/<model>` folder built around one stored model. Its Util acts on that model's records.

- Util: The file role for a small control, such as a button, that runs an endpoint.

- client component: A file that starts with "use client". It arrives as HTML, then again as JS the browser re-runs.

- ui/: The app or lib folder for components that render JSX and are not bound to one model.

Why it is rare

- Model Module: Verb And Noun — A Util is named for the endpoint verb minus the noun: Serve, Refund, Complete. The button runs the module's own endpoint on the module's own record, so it belongs there.

- Service Module: Verb Only — It has endpoints but no model, so there is no record for the control to belong to. The control usually belongs to the screen that offers it, not to the capability behind it.

Where the control goes

Start from what the control is bound to. Most controls land in `ui/` or `page/`, and only the last row earns a Util:

The control is

ui/

page/

.Util.tsx

- Usually

  - Not bound to one model: A disconnect button, a permission prompt, a map control. The service store only drives it.

  - A screen of its own: The OAuth consent screen is a route in `libs/shared/page/oauth`, not a component.

- Rarely

  - Meaningless outside this module: It reads this store and calls this endpoint. In `ui/` it would import the module back in.

Goes here

Not here

**`ui/` is the default.** Rendering JSX without being bound to one model is the `ui/` admission test, word for word. The map in `libs/util/ui/MapView` reads the `_util` store this way.

**A screen of its own is a route.** `_oauth` ships ten endpoints and zero components, because its one screen is the consent route.

**A Util only when all three hold.** It reads this store, calls this endpoint, and moving it to `ui/` would mean importing the module back in.

The Shape, If You Write One

A Util is always a client component, so `"use client"` goes on line 1, above the imports. Its export is a role name, and in a service module that role is the endpoint's verb.

A receipt module's print button, which runs the `printReceipt` endpoint:

The rules in the file

Part

- "use client": Line 1, above the imports, in every `.Util.tsx`. A Util is always a client component.

- Print: The endpoint `printReceipt` minus its noun. Callers write `<Receipt.Util.Print>`.

- interface PrintProps: Sits right above the component with `className` first, and is not exported.

- icecreamOrderId: string: An id, not the order. A `cnst` model prop arrives on the client as a plain object, methods stripped.

- st.tool("printReceipt"): Publishes the button to the in-page agent, so a click and the agent run one handler.

- l("receipt.print"): The label comes from the module's dictionary, never from a string literal.

**Keep a Util to the control and the one line of text it needs.** Markup in a client file ships twice, as HTML and again as bundled JS the browser re-runs. A panel, a layout or a list is server work: put it in a server component and take it as `children`.

Two Component Roles

A service module folder has exactly two component roles: `Service.Util.tsx` and `Service.Zone.tsx`. There is no Template, no Unit and no View.

Role

model module — lib/<model>

service module — lib/_<name>

- Roles that need a model

  - .Template.tsx: Binds to a model's form state.

  - .Unit.tsx: Renders one light model, such as a list card.

  - .View.tsx: Renders one full model, such as a detail screen.

- Roles that need no model

  - .Util.tsx: One client control.

  - .Zone.tsx: One client section a page drops in whole.

Allowed

Not allowed

**The missing three all need a model.** A service module has no form state to bind and no light or full model to render.

**Both remaining roles are client components.** What is left is one client control and one client section, each with `"use client"` on line 1.

Related pages

- Service.Zone.tsx — The other component role, for a whole section.

- Model.Util.tsx — The common case: a control bound to one model's records.

- ui/ — Where most service-driven controls actually live.

- service.store.ts — The store keys and actions a Util reads and calls.

## Code Examples

### apps/koyo/lib/_receipt/Receipt.Util.tsx

```ts
"use client";

import { st, usePage } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { Button } from "akanjs/ui";

interface PrintProps {
  className?: string;
  icecreamOrderId: string;
}
export const Print = ({ className, icecreamOrderId }: PrintProps) => {
  const { l } = usePage();
  const isPrinting = st.use.isPrinting();
  const print = st
    .tool("printReceipt")
    .desc("Print the receipt of one ice cream order.")
    .arg("icecreamOrderId", ID)
    .exec((id) => st.do.printReceipt(id));
  return (
    <Button
      className={className}
      disabled={isPrinting}
      onClick={() => print(icecreamOrderId)}
    >
      {l("receipt.print")}
    </Button>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

