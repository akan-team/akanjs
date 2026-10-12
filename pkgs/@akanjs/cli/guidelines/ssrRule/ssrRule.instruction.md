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
passes `xInitInY` / `xView` into a `Zone`; `Load.Units` / `Load.View` hydrate the store from it. A
`useEffect(…, [])` that fetches on mount renders an empty shell, hydrates, then round-trips for data the server
already had.

**④ Push the boundary down to the leaf that needs it.** A store-reading `Zone` should hold zero markup and delegate
to a server `View` — `User.Zone.Self` is one line, `st.use.self()` into `<User.View.General user={self} />`, so the
whole detail surface renders server-side wherever a route uses the `View` directly.

**⑤ Hand each promise across, not the awaited value.** `fetch.init<Model><Suffix>`, `fetch.view<Model>` and
`fetch.edit<Model>` are awaitable *and* destructurable, so a route can split one call into the promises its
sections actually need:

```tsx
export default page()
  .param("orgId", ID)
  .render(async ({ orgId }) => {
    const { taskInitInOrg, taskListInOrg } = fetch.initTaskInOrg(orgId);
    const { orgView } = fetch.viewOrg(orgId);
    return (
      <>
        <Org.Zone.Header view={orgView} />
        <Task.Zone.Card init={taskInitInOrg} />
        <Load.Stream of={taskListInOrg} fallback={<Loading.Skeleton active />}>
          {(taskList) => taskList.map((task) => <Task.Unit.Row key={task.id} task={task} />)}
        </Load.Stream>
      </>
    );
  });
```

Both queries leave immediately — splitting the result never serializes them — and each section renders behind its
own boundary as its own data lands, so one slow query no longer holds the page. `x<Slice>List` does not wait for
the aggregate the way `x<Slice>Init` must.

**`await` is still the right call for what the page needs immediately.** It returns the shape the helper always
gave and keeps that markup in the shell, which is what SEO snapshots, prerendering and pre-hydration E2E read; a
boundary moves its subtree out of the shell and into the stream. Independent awaited fetches still go through one
`Promise.all`.

Three rules the shape enforces:

- **`x<Slice>List` and `x<Slice>Insight` are server-only.** They hold hydrated model instances, which React Flight
  refuses as props to a client component. Consume them in a server component; `x<Slice>Init` (plain data) is the
  one that crosses into a `Zone`.
- **Never hand the whole handle to a component** — pass the field. `<Zone init={xInitInY} />`, not
  `<Zone init={fetch.initXInY(id)} />`.
- **Rendering the list on the server costs one extra hydration.** `Load.Stream` builds the model instances on the
  server and `Load.Units` builds them again after hydration, so a large list is still better off going through
  `x<Slice>Init` → `Zone` alone. Reach for `Load.Stream` when the markup is small and static enough that having
  it in the HTML is worth more than the second pass.

**A failure now surfaces where it happened.** One `Promise.all` in the page body reports nothing about which of
eight queries threw; per-section boundaries put each rejection at its own boundary.

**Know which redirects are real.** A streaming response starts while layout and page bodies still run, so a redirect
is a real 3xx only when it was raised before any I/O was awaited, the body's own or a layout's above it (a layout that
awaits `fetch.viewOrg` makes every page under it late); after one — `getSelf({ unauthorize: "/signin" })` fetches —
it reaches the browser as an HTTP 200 that navigates in the page, which a crawler or `curl` does not
follow. Either way no markup below the redirect is sent. A route that must answer a real 3xx after I/O — a gate an
external client hits, a moved URL — takes `.config({ ssr: "block" })`: the response waits for the whole render.
Never redirect from inside a streamed section.

**⑥ Use named `ReactNode` slots, not just `children`.** A client shell that takes one slot per region lets a
server component supply each of them, instead of absorbing the whole subtree into the bundle. `Layout.Navbar`
is the shape: `title` / `left` / `right` beside `back` and `children`, each filled by the server.

**⑦ Let the server do the derived work.** Display and predicate logic belongs on `Light<Model>` (`isNew()`,
`canWrite(user?)`, `formatTimes()`), and enum→class lookups belong in a module-scope `as const` map. Both sides call
the same method, so a client component that exists only to compute a label is markup in the wrong place.

**⑧ Gate auth on the server.** `getSelf({ unauthorize: "/signin" })` in `_layout.tsx` redirects before any of the
page's markup is rendered. A client-side check costs a hydration round-trip and flashes the wrong UI first.

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
