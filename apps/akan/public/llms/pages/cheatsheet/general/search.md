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

A field option that puts the field in the search index, written as `{ text: "title" }`.

A named query in `document.ts`. The service gets methods named after it, like `listBySearch`.

The query node that matches text against the index.

A filter published as an endpoint that a client store can load.

A built-in sort key that puts the best match first.

The name a person types into the search box. Ranked above everything else.

A keyword list. Ranked below the title and above prose.

Prose. It matches, but should not beat a name match.

A scoping value like status or owner. Searchable, never a reason to rank first.

Stored with the entry so you can draw the result. Not indexed, so it never matches.

The matching documents. A last `{ sort, skip, limit }` argument orders and pages them.

How many documents match.

The model's insight, computed over the matches only.

The query itself, for a slice's `exec` to return.

Lets the last word match as a prefix, for as-you-type boxes. Without it, `Ken` misses `Kenny`.

all four

Looks only in the named roles. `thumb` is not indexed, so it is not a column.

Replaces the ranking weights: four finite, non-negative numbers, in title, desc, tag, filter order.

Best match first.

Any other key, like `"latest"`

That key wins over the score.

Left off, in a service call

Best match first, because the query holds a search.

Left off, on a slice endpoint

`"latest"` is filled in, so the score is never used.

unset = on

Switches the index on or off. Off keeps indexed data; back on re-syncs every model.

Picks the fts5 tokenizer; Postgres reads only the two forms below.

Akan has full-text search built in. There is no search server to run and no index to keep in sync by hand.

It takes three steps:

Letting clients search as well is a separate decision, covered in Publishing To Clients.

Search works in every database mode. For the same text, SQLite, libSQL and Postgres match the same documents, but Postgres can order them differently because its ranking does not weigh how rare a word is. Postgres setup is covered in Operating It.

Words used on this page

Term

1. Mark The Fields

A product with all five roles in use:

Role

Weight

Use

2. Write The Filter

Declare the filter

A search that can also narrow by status:

Call it from the service

The filter gives the service a family of methods. These four are the ones a search uses:

Method

A service method that returns one page of results and the total:

3. Tune The Match

How input is matched

Ordering

When sort is

Order

Publishing To Clients

A filter runs on the server only. A slice turns it into an endpoint a client can call, and on a publicly readable model anyone can then walk the table one query at a time.

So decide per model:

Meant To Be Searched

A product catalog. Publishing a search slice is the point.

Usually Not

A user directory. Keep its search filter on the server.

A public catalog search, with its own guard:

Operating It

The index keeps itself current through database triggers. A write from any path is reflected, including bulk query-level updates that fire no document hooks.

On Postgres

Three things are specific to Postgres:

Gotchas

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

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

