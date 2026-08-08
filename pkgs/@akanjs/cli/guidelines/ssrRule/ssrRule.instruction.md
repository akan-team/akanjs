# Akan SSR Rule Guideline

## Purpose
Use this when writing or reviewing any `.tsx` file. Akan is SSR-first: an element rendered on the server ships as
HTML and costs nothing to hydrate, while an element behind `"use client"` ships twice — as markup and as bundled JS
that re-runs in the browser. The boundary question is never "may this file be client", it is **how little ends up
on the client side**.

## When A Client Boundary Is Earned
- A component earns `"use client"` only by using a client-only capability: a React hook, a JSX event handler, the
  store (`st.use.*` / `st.do.*`), a browser global (`window`, `document`, `navigator`, `localStorage`, …), or a
  client-only third-party package.
- Rendering markup, mapping over data, reading a route param, and calling `l()` are server work. `usePage()` and
  `getSelf()` are legal in server components and never force a boundary.
- In domain UI the file role fixes the directive: `Template`, `Zone`, and `Util` are client; `Unit` and `View` are
  server. That decides *where* the boundary sits, not how much markup sits behind it — a `Zone` that hoards markup
  is still an SSR regression.
- Measure with `akan quality ssr` (`--format json` for tooling). It reports the server render share per app and
  lib as server-rendered JSX elements over total. Treat **50% server share as the floor** and a falling share as a
  regression to justify or revert.

## Quality Rules
- `akan.ssr.unnecessary-use-client` — the directive is present but nothing in the file needs it. Delete it. If the
  file exists only to wrap one client child, drop the wrapper and use the child directly.
- `akan.ssr.client-static-component` — a component inside a client file renders real markup with zero client-only
  capability. Move it to a server file: a `<Model>.Unit.tsx` / `<Model>.View.tsx` for a module, or a `ui/` file with
  no directive.
- `akan.ssr.client-static-markup` — a large subtree wraps one or two interactive touches. Keep the interactive
  element in the client component and hoist the static subtree into a server component received as `children`.
- `akan.ssr.client-mount-load` — a `useEffect(…, [])` loads server data. Fetch it in the route and pass the
  init/view object down.
- `akan.ssr.module-missing-server-view` — a module renders only from `Template`/`Zone`/`Util` and declares no
  `Unit`/`View`. Add them and have the `Zone` delegate.
- `akan.ssr.template-client-state` — a `Template` holds form state in `useState`. Bind to the store instead:
  `value={xForm.field}` with `onChange={st.do.setFieldOnX}`.

A third-party client package and the `ui/<Folder>/index_.tsx` + `lazy()` boundary both justify the directive and are
not flagged. Interaction-driven `fetch.*` inside an `onClick` is not flagged either — only mount-time loads are,
because those are the ones the server could have performed.

## Implementation Playbook

**① Wrap the interaction, not the UI.** The smallest useful client component adds one behaviour and renders
`children` untouched, so the markup inside never reaches the bundle.

```tsx
"use client";
export const ClickWrapper = ({ children, onPick }: ClickWrapperProps) => <div onClick={onPick}>{children}</div>;
```

`libs/shared/ui/Only/User.tsx` is the same shape: it reads auth state on the client and returns `{children}`.

**② Split compound components so panels stay on the server.** A tab, accordion, or disclosure needs client state
only for *which* part is visible, never for what the parts contain. `Tab` / `Tab.Menus` / `Tab.Menu` / `Tab.Panel`
in `akanjs/ui` is the reference: only the provider and menu hold state, and `<Tab.Panel>` renders its children
as-is, so a server `Unit`/`View` passed in stays server-rendered.

```tsx
<Tab defaultMenu="detail">
  <Tab.Menus>
    <Tab.Menu menu="detail">{l("post.detail")}</Tab.Menu>
    <Tab.Menu menu="history">{l("post.history")}</Tab.Menu>
  </Tab.Menus>
  <Tab.Panel menu="detail">
    <Post.View.General post={post} />
  </Tab.Panel>
</Tab>
```

Never collapse this into one client file with a mode `useState` and every panel body inlined.

**③ Sync state instead of fetching it.** A server component cannot hold state, so render the initial data on the
server and hand it across as a serializable object. The route calls `fetch.initXInY(...)` / `fetch.viewX(...)` and
passes the result into a `Zone`; `Load.Units` / `Load.View` hydrate the store from it. A `useEffect(…, [])` that
fetches on mount renders an empty shell, hydrates, then round-trips for data the server already had.

**④ Push the boundary down to the leaf that needs it.** A store-reading `Zone` should hold zero markup and delegate
to a server `View` — `User.Zone.Self` is one line, `st.use.self()` into `<User.View.General user={self} />`, so the
whole detail surface renders server-side wherever a route uses the `View` directly.

**⑤ Hand the promise across, not the awaited value.** `ClientInit` / `ClientView` are `PromiseOrObject<T>`, so a
route may pass an unawaited `fetch.initX(...)` and `Load.*` resolves it behind a skeleton. `await` blocks the shell
for data the page needs immediately; the promise streams the rest. Independent fetches still go through one
`Promise.all`.

**⑥ Use named `ReactNode` slots, not just `children`.** `Layout.Navbar` accepts `title`, `back`, `left`, `right`,
and `children`, so a client shell composes server-rendered content in five places instead of absorbing it.

**⑦ Let the server do the derived work.** Display and predicate logic belongs on `Light<Model>` (`isNew()`,
`canWrite(user?)`, `formatTimes()`), and enum→class lookups belong in a module-scope `as const` map. Both sides call
the same method, so a client component that exists only to compute a label is markup in the wrong place.

**⑧ Gate auth on the server.** `getSelf({ unauthorize: "/signin" })` in `_layout.tsx` redirects before any HTML is
sent. A client-side check costs a hydration round-trip and flashes the wrong UI first.

**⑨ Prefer CSS over client state for pure visibility.** A `data-*` attribute plus `group-data-[…]` variants (see
`libs/util/ui/Grid/*`) or `<details>`/`<summary>` keeps both branches server-rendered. Reach for `useState` when the
state is real, not when a Tailwind variant would do.

**⑩ Keep the heavy island out of the first load.** A large client-only widget goes behind the
`ui/<Folder>/index_.tsx` + `lazy()` pair so the server renders the page around it.

## Review Checklist
- Does every `"use client"` in the diff name a capability that requires it?
- Does each client component hold only interaction, with markup delegated to `children`, a slot prop, or a
  `Unit`/`View`?
- Is initial data fetched in the route and passed as `init`/`view`, with no mount-only load effect?
- Did `akan quality ssr` hold or improve the server share for every touched app and lib?
