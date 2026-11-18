---
name: akan-page
description: "Add or change a route under page/: the one page()/layout() chain, typed params and search, guards, heads, loading and errors, overrides, and lib pages."
---

# Akan pages

A route file exports one chain and nothing else. Every setting is a stage of it.

```tsx
import { fetch, Task, usePage } from "@apps/<app>/client";
import { signedIn } from "@libs/shared/webkit";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("orgId", ID)
  .guard(() => signedIn())
  .render(({ orgId }) => {
    const { l } = usePage();
    const { taskInitInOrg } = fetch.initTaskInOrg(orgId);
    return <Task.Zone.Card init={taskInitInOrg} prefix={`/org/${orgId}`} />;
  });
```

## Steps

1. Place the file: `<route>.tsx` or `<dir>/_index.tsx` serves the path, `_layout.tsx` nests a layout (`layout()`;
   the root one is `rootLayout()`), `[id]` is a dynamic segment, `(group)` groups without a segment.
2. Name every `[x]` segment with `.param("x", Type)` and read a query key only with `.search("k", Type)`. Values
   arrive typed: `ID` / `String` → string, `Int` / `Float` → number, `Boolean`, `Date` → Dayjs, an `enumOf` class →
   its union, `[T]` → array. A path value the type refuses answers not-found, and a search value that fails is
   dropped. `lang` reaches every stage and is never declared.
3. Gate in the `_layout.tsx`'s `.guard()` (below).
4. In `.render()`: `usePage()`, then fetch, then return.
5. Re-skin an `akanjs/ui` component for a subtree with `_overrides.tsx`:
   `export default override({ Slot: AppComponent })`, no logic. Nested ones merge slot by slot, the closest winning;
   `componentRule` lists the slots.

## Guards

- `.guard(fn)` runs before any of the route renders, once per chain (a second throws when the module loads). `fn`
  may be `async` and gets the typed arguments and `lang` (a layout's without `children`), then `{ path }`. It refuses
  with `router.redirect(href)`, `router.notFound()` or `getSelf({ unauthorize })`. Call `signedIn()` inside an arrow:
  `.guard(signedIn)` would take the route's arguments as its option.
- `path` is where the visitor was going, in-app with its search (`undefined` while MCP lists the screen):
  `.guard((_, { path }) => signedIn({ path }))` sends a refused visitor to `/signin?redirect=<path>`. It is a
  redirect target, never an admission rule (CSR asks a guard again only when the route or an argument it declared
  moves), handed only to `router.push` / `router.redirect`: a raw `//host` in it would take `window.location` off
  the site.
- On the server every guard of the chain runs, root layout first, before any layout body and before the arguments
  are checked, so a not-found is a 404 even after an awaited query. A guard's query the server refuses with 403 or
  404 (an owner check) answers not-found, so the page never confirms the record exists.
- Keeping a person on a page (an unsaved form) is `useNavigationGuard(() => !isDirty)` from `akanjs/webkit`, not
  `.guard()`.

## API at a glance

- Data-driven title: `.head(async ({ id }) => <title>{((await fetch.book(id)) as Book | null)?.title}</title>)`,
  where `Book` is the `common/` interface for the query's `Any` return (`akan-service`).
- Async page: `.render(async ({ id }) => { const book = (await fetch.book(id)) as Book | null; if (!book) return router.notFound(); … })`;
  the same query in `.head()` and `.render()` is one request.
- Loading: `.loading(() => <Skeleton />)` on a page or layout is what that level shows until its `.render()` and the
  levels below it resolve; the levels above it stream first.
- `router.notFound()` from `.guard()`, `.head()` or `.render()` answers 404 with the nearest layout's `.notFound()`
  above it (an unmatched URL: the deepest layout covering it), else the built-in 404.
- A layout's own 404 and error views: `.notFound(({ pathname }) => …)` and `.error(({ error }) => …)` on `layout()`
  or `rootLayout()`. A `<title>` and `<meta>` at the top of what they return replace the page's head:
  `.notFound(() => <><title>Not found</title>…</>)`, except below a `.loading()`, where the head is already out.
- `<Link href="/books/OL45804W">`: write the path without the locale; Link adds it, or leaves it off for the default
  locale under `i18n.localePrefix: "as-needed"`. It renders an `<a>` and takes its attributes; `activeClassName`
  marks the current one.
- From a handler: `router.push(href)` / `router.replace(href)`; in a server stage, `router.redirect(href)`.
- A client filter kept in the URL without reloading the page: ``router.replace(`/books?q=${q}`, { shallow: true,
  scrollToTop: false })`` in a `"use client"` component, read back with `usePageLocation().searchParams`. Shallow
  holds only while the path stays the same; a server `.search()` sees the value at the next full navigation.
- On a web page's first render `st.use.searchParams()` is still the server's empty snapshot, synced right after
  hydration, so an effect that needs the query on its first run takes the page's `.search()` value as a prop.
- A `Link` renders its page ahead of the click, guards included: on hover, on keyboard focus, or as it shows with
  `prefetch="viewport"` (production only). A page whose render should happen once per visit (a view counted through
  `duringRender`, an expensive report) sets `.config({ prefetch: false })`; on a `_layout.tsx` it covers every page
  below, and a page there opts back in with `prefetch: true`.

What a route file must never do — write while rendering, hooks, a second export — is the `page` rule, loaded with
any `page/` file. `pageRule` holds what neither says: client-navigation and navigation guards, head merging, the
script policy, CSR root layouts, lib pages, `devOnly`, the legacy shape. `ssrRule`: what may render on the server;
`akan-mcp`: `.prompt()` and `.app()`. Stage signatures, router methods, Link props and import paths are in the
`akanApi-*` references below.
