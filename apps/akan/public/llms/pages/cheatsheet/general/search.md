# Text Search

- Source: /cheatsheet/general/search
- Mirror: /llms/pages/cheatsheet/general/search.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- Text Search (#overview)
- 1. Mark The Fields (#declare)
- 2. Write The Filter (#filter)
- 3. Tune The Match (#options)
- Publishing To Clients (#publish)
- Operating It (#operations)
- Gotchas (#gotchas)

## Content

Text Search

Akan has built-in full-text search. There is no separate search server to run and no index to keep in sync by hand: you mark fields in constant.ts, write one filter, and the database does the rest.

Declare a text role on the fields you want searchable.

Write a filter that calls q.search(text).

Call the generated listBySearch and sort by "relevance".

1. Mark The Fields

Five roles exist. Pick one by what the value is, not by how badly you want it found: the roles carry different ranking weights.

The name a person searches for. Ranked well above everything else.

A keyword list. Above prose, below the title.

Prose. Matched, but it should not beat a name match.

A scoping value like status or owner. Weighted zero: searchable, never a reason to rank first.

Carried along so you can draw the result. Not indexed, so it never matches.

Secrets are refused

A secret, hidden, or resolved field with a text role fails at startup. The index stores plaintext, so this is the guard that keeps a password out of search results.

2. Write The Filter

q.search() is a query node like any other, so it combines with ordinary conditions. Nothing else is needed to make search work from a service.

3. Tune The Match

Three options cover almost everything: prefix for as-you-type boxes, columns to narrow where to look, weights to change what counts as relevant.

options

Raw user input is safe. Punctuation that would otherwise be search syntax is quoted for you.

Blank input matches nothing. An empty search box does not become a full listing.

Sorting by "relevance" gives best-match-first. Any other sort key wins over the score. Name it explicitly from a client: a slice endpoint fills "latest" when sort is left off, so it never falls through to the score.

Publishing To Clients

A filter is server-side. Adding a slice turns it into an endpoint anyone allowed by the slice guards can call, which on a publicly readable model means anyone can walk the table one query at a time.

So decide per model. A product catalog is meant to be searched. A user directory usually is not.

Operating It

The index keeps itself current through database triggers, so a write made by any path is reflected, including bulk query-level updates that fire no document hooks. Changing which fields carry a role rebuilds that model on the next boot.

A nightly job merges the index segments that writes leave behind, so search does not get slower over time. It does a bounded amount of work per run and only one process in a deployment performs it, so nothing needs to be scheduled by hand.

turn it off

Unset means on. Turning it off never deletes indexed data, and turning it back on reconciles every model.

Give every process in a deployment the same value. A process cannot clean up triggers for models it does not mount, so a mixed fleet leaves stale ones behind.

AKAN_SEARCH_TOKENIZER picks the fts5 tokenizer, defaulting to unicode61 remove_diacritics 2. Changing it rebuilds the index from the mirror on the next boot without re-reading any model table, so it is cheap to revisit. The rebuild takes no cross-process claim, so a fleet restarted at once repeats it in every process.

Search needs sqlite or libsql. On Postgres q.search() throws instead of quietly returning every row.

Gotchas

q.search() must sit at an AND position. Nesting it under q.any() or q.not() throws.

It cannot be used in updateOneByQuery or updateManyByQuery. Those writes take no join, and applying only the other conditions would hit rows you did not mean to touch.

schema.index() has nothing to do with search. It builds ordinary lookup indexes only.

Removing a document removes it from the index, including a soft delete.

## Code Examples

### product.constant.ts

```ts
export class ProductInput extends via((field) => ({
  name: field(String, { text: "title" }),
  summary: field(String, { default: "", text: "desc" }),
  keywords: field([String], { text: "tag" }),
  cover: field(File, { text: "thumb" }).optional(),
  status: field(ProductStatus, { default: "draft", text: "filter" }),
})) {}
```

### product.document.ts

```ts
export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.ProductStatus])
      .query((text, statuses, q) =>
        q.all(q.search(text, { prefix: true }), statuses?.length ? { status: q.oneOf(statuses) } : {}),
      ),
  },
  sort: {},
})) {}
```

### product.service.ts

```ts
const products = await this.listBySearch(text, statuses, { sort: "relevance", limit: 20 });
const count = await this.countBySearch(text, statuses);
```

### Code

```ts
q.search(text, { prefix: true })

q.search(text, { columns: ["title", "tag"] })

// title, desc, tag, filter order
q.search(text, { weights: [20, 1, 5, 0] })
```

### product.signal.ts

```ts
export class ProductSlice extends slice(
  srv.product,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    bySearch: init()
      .param("text", String)
      .search("statuses", [cnst.ProductStatus])
      .exec(function (text, statuses) {
        return this.productService.queryBySearch(text, statuses);
      }),
  }),
) {}
```

### Code

```ts
AKAN_SEARCH_ENABLED=0
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

