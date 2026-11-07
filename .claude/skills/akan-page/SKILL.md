---
name: akan-page
description: "Add or change a route under page/: the one page()/layout() chain, typed params and search, guards, heads, loading and errors, overrides, and lib pages."
---

<!-- akan:generated -->

# Akan pages

A route file exports one chain and nothing else. Every setting is a stage of it.

```tsx
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
   a stricter guard on a page that needs more. The endpoint guards are still the real gate.
4. In `.render()`: `usePage()`, then fetch, then return. Hand `fetch.init*` / `view*` / `edit*` fields to sections
   unawaited; await only what the shell reads, in one `Promise.all`.
5. `.head()` takes JSX (or a function returning it), never a metadata object. A canonical link comes only from the
   page's own head.
6. Re-skin an `akanjs/ui` component for a subtree with `_overrides.tsx`:
   `export default override({ Slot: AppComponent })`, no logic.

## Never

- A `fetch.<mutation>()` while rendering — it throws `base.error.mutationInRender`, because opening a link would
  perform it. Send writes from a user action.
- `useState`, `useEffect`, comments, a named export beside the chain, or the legacy `export default async function`.
- Editing a lib page through its link in `page/(libs)/` — edit the lib's own `page/` source.

Full detail: `get_guideline` with `pageRule`, or `ssrRule` for what may render on the server.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-page/references/pageRule.md` — Route Files · The Route Chain · Route Guards — `.guard()` · MCP Apps — `.app()` · Heads · …
