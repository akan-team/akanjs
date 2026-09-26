# Caching

- Source: /cheatsheet/performance/caching
- Mirror: /llms/pages/cheatsheet/performance/caching.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Server Caching (#overview)
- Document Cache (#document-cache)
- Service Memory (#service-memory)
- Which One? (#choose)
- Tips (#tips)

## Content

Caching

cache adaptor

The engine that holds cached values: a SQLite file or Redis, picked by the database mode.

A namespace in front of the key, such as `previewTokens`. Topic plus key names one value.

`expireAt` is the moment a value disappears, as a Dayjs; `ttl` is its lifetime in milliseconds.

replica

One of several server processes running the same app.

Document Cache

A key–value store every model class carries. Reach for it when the key is a record id.

Service Memory

A value or map a service keeps between calls, shared by every replica on the same cache.

Local Memory

A plain field on this process only. Fastest, but not shared, and gone after a restart.

Endpoint Cache

Reuses a query's whole answer for every caller for the milliseconds you declare.

Database mode

Cache engine

Where it lives

`single` (default)

SQLite file

`local/apps/<app>/` in dev, `sqlite/` in production. `AKAN_SOLID_DB_PATH` sets the file.

`REDIS_URI`, required once deployed. A developer machine uses localhost.

Stores text, a number, a boolean, bytes or an object. Without `expireAt` it stays until deleted.

Reads the value back as stored. A missing or expired key reads `undefined`.

Removes the value right away.

Reads and removes in one step: of two callers racing for a one-time value, one gets it.

Writes only if nothing live is stored, and answers whether this call wrote.

Adds `by` (1 by default) and answers the total; the expiry applies if this call creates it.

A hash under one key: each field is written, read and removed alone, and expires on its own.

Lists the fields, lists them with their values, or empties the hash.

The one-step `getDel`, `setIfAbsent` and `incr`, for a single field.

One shared value behind async methods; `getDel`, `setIfAbsent` and `incr` each act in one step.

A shared async key–value map. `getOrInsert` keeps the first writer's value, across replicas too.

A plain field on this process, read and assigned directly; on a `Map`, a real `Map`.

The value type of a `Map` memory. Required when the first argument is `Map`.

Keep a plain field on this process instead of in the cache adaptor.

value of ref

What a single value reads before its first write; without one it reads `null`.

How long each write lives, unless that `set` passes its own `{ expireAt }`.

Maps the stored value to what code reads. Give it with `set` or not at all; not with `local`.

The inverse of `get`: turns what code writes back into the stored value.

When

Seen by

Use

The key is a model id.

Every replica on the same cache

The value belongs to a service workflow.

Each replica may keep its own copy.

This process only

A query answers every caller the same.

Every caller, one entry per argument set

Injection Types

Every `serve()` injector, with `memory()` in detail.

The Options Object

The endpoint `cache` option next to `timeout` and `guards`.

The setting that declares the database modes, and with them SQLite or Redis for the cache.

Server Caching

A cache keeps a short-lived copy of a value so the server can skip expensive work. Use it for data that is safe to reuse for a while: verification codes, counters, summaries and computed options.

Words used on this page

Term

Four ways to cache

Where cached values live

Save a preview token for ten minutes, then accept it once:

Methods

Method

Here are all three kinds in one service:

Declared as

What you get

Options

Rules

Which One?

Pick by who owns the value and who needs to see it.

Tips

Read next

## Code Examples

### apps/blog/lib/article/article.document.ts

```ts
export class ArticleModel extends into(Article, ArticleFilter, cnst.article, () => ({})) {
  async savePreviewToken(articleId: string, token: string) {
    await this.articleCache.hset("previewTokens", articleId, token, true, {
      expireAt: dayjs().add(10, "minute"),
    });
  }

  async consumePreviewToken(articleId: string, token: string) {
    return !!(await this.articleCache.hgetDel("previewTokens", articleId, token));
  }
}
```

### apps/blog/lib/article/article.service.ts

```ts
export class ArticleService extends serve(db.article, ({ memory }) => ({
  latestArticleId: memory(String),
  articleSummaries: memory(Map, { of: String, ttl: 60 * 60 * 1000 }),
  localHitCount: memory(Int, { local: true, default: 0 }),
})) {
  async rememberSummary(articleId: string, summary: string) {
    await this.latestArticleId.set(articleId);
    await this.articleSummaries.set(articleId, summary);
    this.localHitCount += 1;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

