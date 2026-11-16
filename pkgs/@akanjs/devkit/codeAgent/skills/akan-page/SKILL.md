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
3. Gate with `.guard(() => signedIn())` on the `_layout.tsx`, and repeat a stricter guard on a page that needs more.
   `.guard((_, { path }) => signedIn({ path }))` sends a refused visitor to `/signin?redirect=<path>`.
4. In `.render()`: `usePage()`, then fetch, then return.
5. Re-skin an `akanjs/ui` component for a subtree with `_overrides.tsx`:
   `export default override({ Slot: AppComponent })`, no logic. Nested ones merge slot by slot, the closest winning;
   `componentRule` lists the slots.

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

What a route file must never do — write while rendering, hooks, a second export — is the `page` rule, loaded with
any `page/` file.

Full detail: `get_guideline` with `pageRule` (guards in depth, heads, MCP apps, CSR root layouts, lib pages), or
`ssrRule` for what may render on the server. Every stage's signature, the router's methods, Link's props and every
import path are in the `akanApi-*` references below.
