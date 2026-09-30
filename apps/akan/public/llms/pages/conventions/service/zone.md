# Service.Zone.tsx

- Source: /conventions/service/zone
- Mirror: /llms/pages/conventions/service/zone.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service.Zone.tsx (#service-zone)
- Hold No Markup (#no-markup)
- Seed It From The Route (#seed-from-route)
- Or Just Write The Page (#or-a-page)

## Content

Service.Zone.tsx

A Zone is a section a page drops in whole, such as a search console, an upload panel or a device dashboard. Most service modules never need one: of the eight in this workspace, none has a Zone, and none has a Util either.

The reason is that a service module has no records to list. Its UI is usually a screen of its own or one button inside another screen, not a section.

Words used on this page

Term

- service module: A `lib/_<name>` folder with no model: a service, a signal, a dictionary and often a store.

- Zone: The file role for a section a page drops in whole. It is always a client component.

- server component: A file without "use client". It runs on the server and arrives as HTML.

- client component: A file that starts with "use client". It arrives as HTML, then again as JS the browser re-runs.

- slot: A `ReactNode` prop such as `header`. The page renders its content on the server and passes it in.

Where each kind of UI goes

The UI is

page/

ui/

.Zone.tsx

- Not a Zone

  - A screen of its own: A route, like the OAuth consent screen in `libs/shared/page/oauth`.

  - One button in another screen: A `ui/` component the service store drives, or rarely a `Service.Util.tsx`.

  - A section on exactly one route: It is that route. Write it in the page itself.

- A Zone

  - A section reused on several routes: Several controls that share store state, laid out together.

Goes here

Not here

A section earns a Zone only when all three of these hold:

**Several controls.** More than one control, all reading the same store state.

**Laid out together.** They form one block of the screen, not scattered pieces.

**Reused on two or more routes.** If it appears on exactly one route, it is that route.

**A Zone is always a client component.** Every `.Zone.tsx` has `"use client"` on line 1. That is a cost, not a licence: every JSX element left inside ships twice, as HTML and again as bundled JS the browser re-runs.

Hold No Markup

A model module's Zone reads the store and leaves the drawing to its View, a server component in the same folder. A service module has no View, so the component it hands off to lives in `ui/`.

The Zone below does both things a Zone can do: it hands store state to a `ui/` component as props, and takes server content back as a slot:

**Two store reads, one wrapper element.** The Zone itself draws only a `<section>`. What the user sees is in `ReceiptPreview` and the `header` slot.

**Only a slot stays out of the bundle.** The page renders `header` on the server and passes it in finished. `ReceiptPreview` has no `"use client"`, but because the Zone imports it, its code ships in the Zone's JS chunk.

**Prefer named slots to children.** A slot lets the page put server content in a named place instead of one anonymous one. That is why `Layout.Navbar` takes five: `title`, `back`, `left`, `right` and `children`.

Keep the boundary small

**Wrap the interaction, not the UI.** The smallest useful client component adds one behaviour and renders `children` untouched, so the markup inside never reaches the bundle.

**Push the boundary down to the leaf.** A Zone that reads three keys and renders forty elements should become a Zone that reads three keys and a server component that renders forty.

**Take an id, not a model.** A `cnst` model on a Zone prop loses its methods crossing the boundary and arrives as a plain object wearing the model's type. Take `orderId: string` and read the model from the store.

Seed It From The Route

Resist loading on mount. A `useEffect(…, [])` renders an empty shell, hydrates, and only then asks the server a question it could have answered before the first byte. `akan quality ssr` reports it as `akan.ssr.client-mount-load`.

Instead, the page fetches and awaits, and the Zone takes the result as a prop:

**The page does the loading.** `fetch.listReceiptTemplates()` finishes before the first byte, so the console arrives already filled.

**A client component does not call**`fetch.*`**.** It reads with `st.use.*` and writes with `st.do.*`.

**Least of all**`fetch.init*`**.** It is a hydration snapshot that only a `Load.*` `init` prop reads. Called from the client, it costs two extra round-trips for a value nothing reads.

Where the data comes from

Data

How it reaches the Zone

- Server data needed at once: Await it in the page and pass it down as a prop.

- Server data the section can wait for: Hand the unawaited promise to `<Load.Stream of={…}>`. It resolves behind its own boundary.

- Anything a click asks for: A store action, called through `st.do.*`.

Or Just Write The Page

`_oauth` in `libs/shared` is the example to copy. It needed a consent screen, approve and deny buttons and a connected-apps list, yet it has neither a Util nor a Zone.

What _oauth needed

How it got it

- Consent screen: A route: `libs/shared/page/oauth/consent/_index.tsx`.

- Approve and deny buttons: A plain `<form method="post">` that the cookie session authenticates.

- Connected-apps list: An endpoint, `listOAuthConnections`, for the app's own page to call.

- What the module ships: Ten endpoints and zero components.

**A form post needs no script.** The consent page ships as HTML and works before any bundle arrives.

**For this screen, that is the point.** It authorizes another application to act as you, so working without any script is the goal, not an optimization.

**The argument rides in the path.** Both endpoints take `.param("requestId", String)`. Each form posts under the API prefix to `approveOAuthConsent/<requestId>` or `denyOAuthConsent/<requestId>`.

Routes can live in a lib

A lib may own routes as well as modules. `libs/<lib>/page` follows the same rules as an app's `page/`, and an app opts in with `syncPageLibs` in `akan.config.ts`:

syncPageLibs value

Brings in

- true: Every lib the app depends on that ships a `page` folder.

- ["shared"]: Exactly the libs listed.

- false: The default. No lib routes.

A lib route keeps its own path: `libs/shared/page/oauth/consent/_index.tsx` serves `/oauth/consent` in every app that brings it in.

## Code Examples

### apps/koyo/lib/_receipt/Receipt.Zone.tsx

```ts
"use client";

import { st } from "@apps/koyo/client";
import { ReceiptPreview } from "@apps/koyo/ui";
import type { ReactNode } from "react";

interface ConsoleProps {
  className?: string;
  header: ReactNode;
  templates: string[];
}
export const Console = ({ className, header, templates }: ConsoleProps) => {
  const preview = st.use.receiptPreview();
  const printing = st.use.printing();
  return (
    <section className={className}>
      {header}
      <ReceiptPreview
        preview={preview}
        templates={templates}
        disabled={printing}
      />
    </section>
  );
};
```

### apps/koyo/page/receipt/_index.tsx

```ts
import { fetch, Receipt, usePage } from "@apps/koyo/client";
import { getSelf } from "@libs/shared/webkit";
import { page } from "akanjs/client";

export default page().render(async () => {
  const { l } = usePage();
  getSelf({ unauthorize: "/signin" });
  const [templates] = await Promise.all([fetch.listReceiptTemplates()]);
  return (
    <Receipt.Zone.Console
      header={<h1 className="font-bold text-2xl">{l("receipt.console")}</h1>}
      templates={templates}
    />
  );
});
```

### apps/koyo/akan.config.ts

```typescript
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  syncPageLibs: ["shared"],
};

export default config;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

