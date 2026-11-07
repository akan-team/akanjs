---
name: akan-query
description: "Write filters, slices and list loading: query descriptors, init paging and loadMoreOf, soft removal and hookless writes, q.search text search, and the cascade direction."
---

# Akan queries and slices

## Filters and slices

- A filter in `<model>.document.ts` declares its args; a slice in `<model>.signal.ts` serves it to stores. A slice
  `exec` returns a `query<Filter>(…)` descriptor — never a `list<Filter>` array — and you cannot chain sort or
  limit on it.
- Page through the store: `initX(…, { sort, page, limit })`, then `st.do.loadMoreOf<Model>()` while
  `hasMoreOf<Model>`. Never compare `count > page * limit`.
- Never ask for more than 500 rows: the server serves at most 500 per request and drops the rest silently.
  A figure over the whole set belongs in an insight or an endpoint.
- The root slice takes a filter name and its args, never a raw query, and its `root:` guard is always `Admin`.
- No value is `q.empty`, never `q.missing`.
- A projection is bare on the facade (`pickById(id, { secret: true })`) and under `select` on a filter accessor —
  the only way to read a `field.secret` value.

## Writes and removal

- Removal is soft: reads see live rows unless `{ withRemoved: true }`. The one hard delete is `purge<Filter>` /
  `purgeMany`, for data past retention.
- A filter's `remove*` / `update*`, `updateById` and `removeById` run no hooks and no cascade. A model with a
  cascade or `_postRemove` removes through `remove<Model>(id)`.
- Load a set once (`load<Model>Many`, one filter query) instead of one call per item in a loop — lint fails a
  per-item service call an endpoint reaches.

## Search and cascade

- `q.search(text, { prefix: true })` sits in a filter at an AND position, over fields with the `text` role. Blank
  input matches nothing — never a passthrough. A search slice only over data safe to enumerate.
- `cascade` names a direction, and the wrong one loses data: `removeRef` on the owner's relation, `removeWith` on
  the child's reference to its owner.

Full detail: `get_guideline` with `queryRule`, and `workspaceRecipes` for a worked slice.
