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

Akan has full-text search built in. There is no search server to run and no index to keep in sync by hand.

It takes three steps:

**Mark the fields.** Give each searchable field a `text` role in `constant.ts`.

**Write the filter.** Call `q.search(text)` from a filter in `document.ts`.

**Call it.** Use the generated `listBySearch`, sorted by `"relevance"`.

Letting clients search as well is a separate decision, covered in Publishing To Clients.

Search works in every database mode. For the same text, SQLite, libSQL and Postgres match the same documents, but Postgres can order them differently because its ranking does not weigh how rare a word is. Postgres setup is covered in Operating It.

Words used on this page

Term

- text: A field option that puts the field in the search index, written as `{ text: "title" }`.

- filter: A named query in `document.ts`. The service gets methods named after it, like `listBySearch`.

- q.search(): The query node that matches text against the index.

- slice: A filter published as an endpoint that a client store can load.

- relevance: A built-in sort key that puts the best match first.

1. Mark The Fields

Name a role in the field's options, as in `{ text: "title" }`. Pick the role by what the value is, not by how badly you want it found: each role carries its own ranking weight.

A product with all five roles in use:

Role

Weight

Use

- title — 10 — The name a person types into the search box. Ranked above everything else.

- tag — 3 — A keyword list. Ranked below the title and above prose.

- desc — 1 — Prose. It matches, but should not beat a name match.

- filter — 0 — A scoping value like status or owner. Searchable, never a reason to rank first.

- thumb — — — Stored with the entry so you can draw the result. Not indexed, so it never matches.

**`title`, `tag` and `desc` take a `String`.** `filter` and `thumb` also take an `ID` or a relation such as `field(File)`, and a string enum counts as a `String`.

**Arrays and embedded scalars work.** `[String]` indexes every item, and a role inside an embedded scalar is indexed through its parent. A field inside a `Map` indexes nothing.

**Declaring roles is all the wiring.** There is no per-model switch; the index follows the roles you declare.

**`field.secret`, `field.hidden` and `resolve()` take no text role.** The index stores plain text, so an indexed secret would leak through search. The type check refuses it.

2. Write The Filter

`q.search()` is a query node like any other, so it combines with ordinary conditions inside `q.all()`. You do not need a slice to search from a service.

Declare the filter

A search that can also narrow by status:

**`.arg()` is required, `.opt()` may be left out and comes after every `.arg()`.** Both reach `.query()` in the order declared, followed by `q`.

**An empty `{}` adds no condition.** With no statuses given, only the search narrows the results.

Like every filter, it needs an entry under `.query()` in the dictionary, arguments included:

Call it from the service

The filter gives the service a family of methods. These four are the ones a search uses:

Method

- listBySearch: The matching documents. A last `{ sort, skip, limit }` argument orders and pages them.

- countBySearch: How many documents match.

- insightBySearch: The model's insight, computed over the matches only.

- queryBySearch: The query itself, for a slice's `exec` to return.

A service method that returns one page of results and the total:

3. Tune The Match

Three options cover almost everything, all passed as the second argument of `q.search()`.

- prefix (boolean, default false): Lets the last word match as a prefix, for as-you-type boxes. Without it, `Ken` misses `Kenny`. — Example: `q.search(text, { prefix: true })`

- columns (("title" | "desc" | "tag" | "filter")[], default all four): Looks only in the named roles. `thumb` is not indexed, so it is not a column. — Example: `q.search(text, { columns: ["title", "tag"] })`

- weights ([title, desc, tag, filter], default [10, 1, 3, 0]): Replaces the ranking weights: four finite, non-negative numbers, in title, desc, tag, filter order. — Example: `q.search(text, { weights: [20, 1, 5, 0] })`

How input is matched

**Raw user input is safe.** Nothing in it is read as search syntax. Punctuation splits a word into pieces that must appear side by side, so `follow-up` finds “follow-up” and “follow up”.

**Every word must match,** in any order. The default tokenizer ignores case and accents.

**Blank input matches nothing.** An empty search box never turns into a full listing.

Ordering

When sort is

Order

- `"relevance"` — Best match first.

- Any other key, like `"latest"` — That key wins over the score.

- Left off, in a service call — Best match first, because the query holds a search.

- Left off, on a slice endpoint — `"latest"` is filled in, so the score is never used.

**From a client, ask for `"relevance"` by name.** A slice endpoint fills in `"latest"` when sort is left off, so it never falls through to the score.

Publishing To Clients

A filter runs on the server only. A slice turns it into an endpoint a client can call, and on a publicly readable model anyone can then walk the table one query at a time.

So decide per model:

Meant To Be Searched

A product catalog. Publishing a search slice is the point.

Usually Not

A user directory. Keep its search filter on the server.

A public catalog search, with its own guard:

**Name the slice in the dictionary too,** under `.slice()` with a `.desc()`. An MCP agent picks the tool by that description.

**Load it with the order named:** `st.do.initProductBySearch(text, statuses, { sort: "relevance" })`.

**A live search slice refetches.** A search cannot be matched in memory, so a `.live()` slice holding one declares `{ fallback: "invalidate" }`.

**A named slice is guarded only by its own `init({ guards })`.** The `slice()` map covers the root slice and generated CRUD. With no guards of its own, the search is open to anyone over HTTP and left out of MCP.

Operating It

The index keeps itself current through database triggers. A write from any path is reflected, including bulk query-level updates that fire no document hooks.

- AKAN_SEARCH_ENABLED (1 | true | 0 | false, default unset = on): Switches the index on or off. Off keeps indexed data; back on re-syncs every model. — Example: `AKAN_SEARCH_ENABLED=0`

- AKAN_SEARCH_TOKENIZER (string, default unicode61 remove_diacritics 2): Picks the fts5 tokenizer; Postgres reads only the two forms below.

**Give every process in a deployment the same value.** A process cannot clean up triggers for models it does not mount, so a mixed fleet leaves stale ones behind.

**While search is off, `q.search()` throws.** Filters that declare it still build; only a query that reaches it fails.

**A tokenizer change is cheap.** The next boot rebuilds the index from its own copy of the text without re-reading any model table, so the setting is safe to revisit.

**A fleet restarted at once rebuilds once.** The first process rebuilds and the rest wait for it. On SQLite a process waits only up to its busy timeout (5 seconds by default), so stagger restarts when the index is large.

On Postgres

Three things are specific to Postgres:

**The tokenizer needs an extension.** `unicode61` needs `unaccent` unless it is `remove_diacritics 0`, and `trigram` needs `pg_trgm`. Akan creates it if its database role has the privilege; otherwise run `CREATE EXTENSION unaccent` (or `pg_trgm`) as a role that has it.

**Create the database with a UTF-8 `LC_CTYPE`,** such as `en_US.UTF-8` or `C.UTF-8`. Otherwise case is ignored for ASCII letters only, where SQLite ignores it for every letter.

**Only the start of a very long text is indexed.** With `unicode61`, Postgres indexes the first 20,000 characters of a document's `title`, `tag` and `filter` text and the first 200,000 of its `desc`.

Gotchas

Where `q.search()` cannot go, and what else tends to surprise people:

**`q.search()` sits at an AND position only.** Under `q.any()` or `q.not()` the query throws.

**Not in query-level writes.** The model's `updateOne` / `updateMany` / `removeOne` / `removeMany` and the generated `updateBySearch` / `removeBySearch` family refuse it (the error names `updateOneByQuery` or `updateManyByQuery`), because a bulk write cannot join the index.

**`schema.index()` has nothing to do with search.** Even `schema.index({ name: "text" })` builds an ordinary lookup index.

**Removed documents leave the index,** soft deletes included, and a restored one comes back.

## Code Examples

### apps/shop/lib/product/product.constant.ts

```ts
export class ProductStatus extends enumOf("productStatus", [
  "draft",
  "active",
] as const) {}

export class ProductInput extends via((field) => ({
  name: field(String, { text: "title" }),
  summary: field(String, { default: "", text: "desc" }),
  keywords: field([String], { text: "tag" }),
  cover: field(File, { text: "thumb" }).optional(),
})) {}

export class ProductObject extends via(ProductInput, (field) => ({
  status: field(ProductStatus, { default: "draft", text: "filter" }),
})) {}
```

### apps/shop/lib/product/product.document.ts

```ts
export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.ProductStatus])
      .query((text, statuses, q) =>
        q.all(
          q.search(text, { prefix: true }),
          statuses?.length ? { status: q.oneOf(statuses) } : {},
        ),
      ),
  },
  sort: {},
})) {}
```

### apps/shop/lib/product/product.dictionary.ts

```ts
.query<ProductFilter>((fn) => ({
  bySearch: fn(["By Search", "검색어별 조회"]).arg((t) => ({
    text: t(["Text", "검색어"]).desc(["Words to search for", "찾을 검색어"]),
    statuses: t(["Statuses", "상태"]).desc(["Statuses to keep", "남길 상태"]),
  })),
}))
```

### apps/shop/lib/product/product.service.ts

```ts
export class ProductService extends serve(db.product, () => ({})) {
  async searchProducts(
    text: string,
    statuses?: cnst.ProductStatus["value"][],
  ) {
    const [products, total] = await Promise.all([
      this.listBySearch(text, statuses, { sort: "relevance", limit: 20 }),
      this.countBySearch(text, statuses),
    ]);
    return { products, total };
  }
}
```

### apps/shop/lib/product/product.signal.ts

```ts
export class ProductSlice extends slice(
  srv.product,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    bySearch: init({ guards: [Public] })
      .param("text", String)
      .search("statuses", [cnst.ProductStatus])
      .exec(function (text, statuses) {
        return this.productService.queryBySearch(text, statuses);
      }),
  }),
) {}
```

### AKAN_SEARCH_TOKENIZER

```ts
unicode61 [remove_diacritics 0|1|2]
trigram [case_sensitive 0|1]
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

