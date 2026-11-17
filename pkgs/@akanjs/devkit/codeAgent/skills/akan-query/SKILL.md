---
name: akan-query
description: "Write filters, slices and list loading: query descriptors, init paging and loadMoreOf, soft removal and hookless writes, q.search text search, and the cascade direction."
---

# Akan queries and slices

The `module` rule, loaded with every `lib/` file, holds the musts: a slice returns a query, at most 500 rows, soft
removal and `purge`, the hookless `updateById` / `removeById`, secret projections, the cascade direction and when a
search slice is safe. This skill adds what it does not say.

## Filters and slices

- A filter in `<model>.document.ts` declares its args; a slice in `<model>.signal.ts` serves it to stores. The
  `query<Filter>(…)` descriptor a slice returns takes no chained sort or limit.
- Page through the store: `initX(…, { sort, page, limit })`, then `st.do.loadMoreOf<Model>()` while
  `hasMoreOf<Model>`. Never compare `count > page * limit`.
- The root slice takes a filter name and its args, never a raw query.
- No value is `q.empty`, never `q.missing`.

## Writes

- A filter's `update*` runs no hooks and no cascade, like its `remove*`.
- `create<Model>Many(rows)` runs every row's `_preCreate` before writing any, so a check there does not see the
  batch's own rows.

## Search

- `q.search(text, { prefix: true })` sits in a filter at an AND position, over fields with the `text` role. Blank
  input matches nothing — never a passthrough.

Full detail: `get_guideline` with `queryRule`, and `workspaceRecipes` for a worked slice.
