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
   the root one is `rootLayout()`), `[id]` is a dynamic segment, `(group)` groups without a segment. `page/` holds
   route modules only — no helpers, no `.ts` files.
2. Name every `[x]` segment with `.param("x", Type)` and read a query key only with `.search("k", Type)`. Values
   arrive typed; `lang` reaches every stage and is never declared.
3. Gate with `.guard(() => signedIn())` on the `_layout.tsx` (a real redirect before anything renders), and repeat
   a stricter guard on a page that needs more. The endpoint guards are still the real gate. `signedIn` comes from
   `@libs/shared/webkit`, and a new workspace has that lib only with `create-workspace --libs true`.
4. In `.render()`: `usePage()`, then fetch, then return. Hand `fetch.init*` / `view*` / `edit*` fields to sections
   unawaited; await only what the shell reads, in one `Promise.all`.
5. `.head()` takes JSX (or a function returning it), never a metadata object. A canonical link comes only from the
   page's own head.
6. Re-skin an `akanjs/ui` component for a subtree with `_overrides.tsx`:
   `export default override({ Slot: AppComponent })`, no logic.

## API at a glance

`page`, `layout` and `router` come from `akanjs/client`, `Link` from `akanjs/ui`, `usePageLocation` from
`akanjs/webkit`, and `fetch`, `usePage` and the model namespaces from `@apps/<app>/client`. A stage receives the
declared params and search keys plus `lang`.

- Data-driven title: `.head(async ({ id }) => <title>{((await fetch.book(id)) as Book | null)?.title}</title>)`,
  where `Book` is the `common/` interface for the query's `Any` return (`akan-service`).
- Async page: `.render(async ({ id }) => { const book = (await fetch.book(id)) as Book | null; if (!book) return router.notFound(); … })`;
  the same query in `.head()` and `.render()` is one request.
- `router.notFound()` from `.guard()`, `.head()` or `.render()` answers 404 with the nearest layout's `.notFound()`
  above it (an unmatched URL: the deepest layout covering it), else the built-in 404.
- A layout's own 404 and error views: `.notFound(({ pathname }) => …)` and `.error(({ error }) => …)` on `layout()`
  or `rootLayout()`.
- `<Link href="/books/OL45804W">`: write the path without the locale; Link adds it, or leaves it off for the default
  locale under `i18n.localePrefix: "as-needed"`. `activeClassName` marks the current one.
- From a handler: `router.push(href)` / `router.replace(href)`; in a server stage, `router.redirect(href)`.
- A client filter kept in the URL without reloading the page: ``router.replace(`/books?q=${q}`, { shallow: true,
  scrollToTop: false })`` in a `"use client"` component, read back with `usePageLocation().searchParams`. Shallow
  holds only while the path stays the same; a server `.search()` sees the value at the next full navigation.

## Never

- A `fetch.<mutation>()` while rendering — it throws `base.error.mutationInRender`, because opening a link would
  perform it. Send writes from a user action.
- `useState`, `useEffect`, comments, a named export beside the chain, or the legacy `export default async function`.
- Editing a lib page through its link in `page/(libs)/` — edit the lib's own `page/` source.

Full detail: `get_guideline` with `pageRule`, or `ssrRule` for what may render on the server; every stage's
signature, the router's methods, Link's props and every import path: `akanApi`.
