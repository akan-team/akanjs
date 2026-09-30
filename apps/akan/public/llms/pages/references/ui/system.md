# System

- Source: /references/ui/system
- Mirror: /llms/pages/references/ui/system.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- System UI (#system-ui)

## Content

System

System UI

The parts around your screens rather than feature widgets: the app shell, theme and language switches, an API explorer, tabs, and animation. They go in root layouts, admin pages, signal dashboards, tabbed detail views, and animated UI, and all come from `akanjs/ui`.

Words used on this page

Term

- app shell: The frame every page renders inside, holding the theme, fonts, locale, toasts and socket.

- Suspense: A React boundary that shows a fallback until the content inside it is ready.

- serialized signal: Every endpoint with its arguments, guards and return model, shipped as `fetch.serializedSignal`.

- agent tool: An action a control publishes so the in-page agent can do what the user's click does.

Pick a component

Component

Auto

Server — no "use client"

Tool — st.tool

- App shell

  - System.Provider: The app frame Akan wraps around your root `_layout.tsx`.

  - System.Reconnect: The connection-lost overlay `Provider` mounts after `.reconnect()`.

- Controls you place

  - System.ThemeToggle: Switches the color theme and publishes `applyTheme`.

  - System.SelectLanguage: Switches the URL's language and publishes `setLanguage`.

  - System.DevModeToggle: Turns developer-only UI on and off.

  - Tab: Tabs whose panels stay on the server, published as a tool only with a `namespace`.

- Developer tools and primitives

  - Signal.*: The API explorer, for an admin or docs screen.

  - ClientSide: A `Suspense` boundary with a `loading` fallback.

  - animated: react-spring's animated `div`, `g` and `progress`.

Yes

No

**Auto means you never write it.** `Provider` wraps every page, and it mounts `Reconnect` when the root layout calls `.reconnect()`.

**Server means you add no `"use client"` yourself.** A page, layout or View renders these directly; the parts that need the browser carry their own. `Signal` parts and `animated` need a file that starts with `"use client"`.

**Tool means the in-page agent can use it too.** Placing `ThemeToggle` or `SelectLanguage` is enough for the agent to switch the theme or the language the same way the user does.

Related pages

- Root Layout Stages — `.theme()`, `.fonts()`, `.reconnect()` and the rest that fill `System.Provider`.

- Override Slots — Restyle the toast stack through the `Toast` and `ToastItem` slots.

- Constant Schema Docs — `Constant.Doc`, the model explorer that sits beside `Signal`.

- In-Page Agent — How the tools a control publishes let the agent drive the screen.

- System: The app shell. Akan mounts `Provider` for you, and `Provider` mounts `Reconnect` when you turn it on. `ThemeToggle`, `SelectLanguage` and `DevModeToggle` are controls you place yourself.

  - System.Provider ({ appName, params, of, children, className?, env?, theme?, prefix?, manifest?, head?, fonts?, layoutStyle?, reconnect?, wsConnect?, dictionary?, allDictionary? }): The frame around your root `_layout.tsx`, filled from its `rootLayout()` stages.

  - System.Root ({ st, children }): Deprecated: it renders `children` and ignores `st`, so render the children directly.

  - System.ThemeToggle ({ themes?: string[] }): Sets `data-theme` to one of `themes`: a switch for two, a dropdown for three or more.

  - System.SelectLanguage ({ className?, languages?: string[] }): A dropdown that swaps the `/:lang` segment of the current URL and keeps the rest.

  - System.Reconnect ({}): When the socket drops and a ping fails, it covers the screen, then reloads once reconnected.

  - System.DevModeToggle ({}): A switch for the store's `devMode` flag, kept in `localStorage` across reloads.

  - **Set the frame from the root layout.** `.theme()`, `.fonts()`, `.manifest()`, `.layoutStyle()`, `.reconnect()` and `.wsConnect()` become `Provider`'s props, and `env` comes from `env/env.client.ts`.

  - **`Reconnect` is a local-development aid.** It stays off until the root layout calls `.reconnect()`, and it renders only when `AKAN_PUBLIC_ENV` is `local`.

  - **`ThemeToggle` needs at least two themes.** With `themes` left out or holding one entry it renders nothing. The choice is kept in the `theme` cookie.

  - **`languages` defaults to the app's locales.** A code the app does not serve is dropped from the menu, because choosing it would lead to a 404.

  - **`devMode` is what developer-only UI reads.** Admin screens check it before showing developer affordances, and `Only.Dev` from `@libs/shared/ui` renders its children only while it is on.

  - **The toast stack is not a member on purpose.** `Provider` mounts it and keeps the `msg.*` wiring, the store read, the body-level portal and the dismiss timers. That is why the override slots are the surface, `Toast` and `ToastItem`, not the part that decides when a toast appears and goes away.

- ClientSide: A small React `Suspense` boundary. It shows `loading` while anything inside it suspends, such as a `lazy()` component still fetching its chunk.

  - children (ReactNode): The content that may suspend.

  - loading (ReactNode): The fallback shown meanwhile; nothing is shown when it is left out.

  - **It does not make its children client-only.** It is a plain `Suspense` with no `"use client"`, so children that can render on the server still do.

  - **In the example, `StoreMap` is a `lazy()` export.** It comes from a `ui/StoreMap/index_.tsx` boundary, so `loading` covers the chunk download.

- Signal: The API explorer, split into parts. It reads the serialized signal the server ships with the app — every endpoint, its arguments, guards and return model — and renders a document you can also call endpoints from.

  - Signal.Doc (.Zone · .Setting · .AuthModal · .DocSignals · .DocSignal): The explorer; `Doc.Zone({ refName, fetch, openAll? })` renders one signal's whole document.

  - Signal.RestApi (.Endpoints · .Endpoint · .Interface · .Try): The HTTP side: `Endpoints` lists queries and mutations, or only the ones named in `endpoints`.

  - Signal.WebSocket (.Endpoints): The same list for websocket endpoints, each row handed to `PubSub` or `Message`.

  - Signal.PubSub (.Endpoint · .Interface · .Try): One subscription: its room, its payload shape, and a Try that shows frames as they land.

  - Signal.Message (.Endpoint · .Interface · .Try): The same three parts for a one-way message endpoint.

  - Signal.Listener (.Result): `Result` is the live pane a Try writes into, showing byte payloads as a short hex preview.

  - Signal.Object (.Type · .Detail · .Schema): A model from its constant class: a type chip, its field table, or a titled schema.

  - Signal.Arg (component · .Table · .Param · .Query · .FormData · .ID · .Int · .Float · .String · .Boolean · .Date · .Json · .Upload): The one real component: `Arg({ argType, value, onChange })` renders one scalar's input.

  - **Reach for a member, never a root.** `Signal.Doc` and its siblings render an empty `div` on their own, so write `Signal.Doc.Zone` or `Signal.RestApi.Endpoints`. Only `Signal.Arg` is a component itself.

  - **Render it from a `"use client"` file.** It takes the app's `fetch`, which a server component cannot hand over as a prop, and its members exist only on the client.

  - **`fetch` is the app's own fetch proxy.** The explorer reads `fetch.serializedSignal` from it, so a signal the app did not mount is reported as unregistered instead of rendering empty.

  - **One setting for the whole screen.** The guard filter and the JWT chosen in `Doc.Setting` live in the store, so every endpoint list and every REST Try on the page follows them.

  - **Each REST row shows its guards and its MCP status.** A badge says whether the endpoint is published as an MCP tool, and a refused one says why.

- Tab: A tab set split into parts so the panels stay on the server. Only the provider and the menu hold state, and `Tab.Panel` renders what it is given, so the markup inside a panel never reaches the bundle.

  - Tab ({ className?, defaultMenu?, namespace?, children? }): The provider holding the selected menu, which starts at `defaultMenu` or, left out, at none.

  - Tab.Menus ({ className?, children }): The `role="tablist"` row the menu buttons sit in.

  - Tab.Menu ({ menu, children, className?, activeClassName?, disabledClassName?, disabled?, tooltip?, scrollToTop? }): One tab button, keyed by `menu` rather than `value`.

  - Tab.Panel ({ menu, children?, className?, loading?: "eager" | "lazy" | "every" }): The body shown while its `menu` is selected; `loading` decides when it mounts.

  - **`loading` decides when a panel mounts.** `"eager"`, the default, renders every panel up front and hides the others. `"lazy"` mounts a panel on its first selection and keeps it; `"every"` mounts it on each selection and unmounts it on leave.

  - **`namespace` publishes the tab to the in-page agent.** `namespace="product"` adds the `tabsInProduct` state and the `switchTabInProduct` tool. Without it the tab set publishes nothing.

  - **A disabled menu cannot stay selected.** Disabling the active `Tab.Menu` moves the selection to the first other enabled menu, and `scrollToTop` scrolls the window up on click.

  - **Copy this shape.** Never write one `"use client"` file with a mode `useState` and every panel inlined in it: every panel's markup then ships as JavaScript.

- animated: A small re-export of react-spring's animated elements, the ones Akan UI components animate with. Drive them with a spring hook in your own animated surfaces.

  - animated.div (react-spring animated div): An animated `div`.

  - animated.g (react-spring animated g): An animated SVG group, `g`.

  - animated.progress (react-spring animated progress): An animated `progress` element.

  - **Use it in a `"use client"` file.** The spring hooks that drive it run only in the browser, and its members are not available to a server component.

  - **Only `div`, `g` and `progress` are wrapped.** For another tag, use react-spring's own `animated` in a `ui/` file, the same way you import `useSpring`.

## Code Examples

### System

```ts
import { System } from "akanjs/ui";

export const AppSettings = () => {
  return (
    <div className="flex items-center gap-4">
      <System.SelectLanguage languages={["en", "ko"]} />
      <System.ThemeToggle themes={["light", "dark"]} />
    </div>
  );
};
```

### ClientSide

```ts
import { ClientSide, Loading } from "akanjs/ui";
import { StoreMap } from "./StoreMap";

export const StoreLocation = () => {
  return (
    <ClientSide loading={<Loading.Skeleton className="h-64 w-full" />}>
      <StoreMap />
    </ClientSide>
  );
};
```

### Signal

```ts
"use client";
import { fetch } from "@apps/shop/client";
import { Signal } from "akanjs/ui";

export const ProductApi = () => {
  return <Signal.Doc.Zone refName="product" fetch={fetch} />;
};

export const PingTester = () => {
  return (
    <Signal.RestApi.Endpoints
      refName="base"
      fetch={fetch}
      endpoints={["ping"]}
      openAll
    />
  );
};
```

### Tab

```ts
import { cnst, usePage } from "@apps/shop/client";
import { Tab } from "akanjs/ui";

interface DetailProps {
  className?: string;
  product: cnst.Product;
}
export const Detail = ({ className, product }: DetailProps) => {
  const { l } = usePage();
  return (
    <Tab className={className} defaultMenu="info" namespace="product">
      <Tab.Menus>
        <Tab.Menu menu="info">
          {l.trans({ en: "Info", ko: "정보" })}
        </Tab.Menu>
        <Tab.Menu menu="history">
          {l.trans({ en: "History", ko: "이력" })}
        </Tab.Menu>
      </Tab.Menus>
      <Tab.Panel menu="info">
        <General product={product} />
      </Tab.Panel>
      <Tab.Panel menu="history" loading="lazy">
        <History product={product} />
      </Tab.Panel>
    </Tab>
  );
};
```

### animated

```ts
"use client";
import { useSpring } from "@react-spring/web";
import { animated } from "akanjs/ui";
import type { ReactNode } from "react";

interface FadeInProps {
  className?: string;
  children: ReactNode;
}
export const FadeIn = ({ className, children }: FadeInProps) => {
  const style = useSpring({ opacity: 1, from: { opacity: 0 } });
  return (
    <animated.div className={className} style={style}>
      {children}
    </animated.div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

