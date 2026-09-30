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

Server Caching

A cache keeps a short-lived copy of a value so the server can skip expensive work. Use it for data that is safe to reuse for a while: verification codes, counters, summaries and computed options.

Words used on this page

Term

- cache adaptor: The engine that holds cached values: a SQLite file or Redis, picked by the database mode.

- topic: A namespace in front of the key, such as `previewTokens`. Topic plus key names one value.

- expireAt, ttl: `expireAt` is the moment a value disappears, as a Dayjs; `ttl` is its lifetime in milliseconds.

- replica: One of several server processes running the same app.

Four ways to cache

- Document Cache — A key–value store every model class carries. Reach for it when the key is a record id. — `this.articleCache.set(topic, id, value)`

- Service Memory — A value or map a service keeps between calls, shared by every replica on the same cache. — `memory(String) · memory(Map, { of })`

- Local Memory — A plain field on this process only. Fastest, but not shared, and gone after a restart. — `memory(Int, { local: true, default: 0 })`

- Endpoint Cache — Reuses a query's whole answer for every caller for the milliseconds you declare. — `query(T, { guards, cache: 1000 })`

Where cached values live

The engine follows the database mode the app runs in: `database.modes` in `akan.config.ts` declares the modes, and `AKAN_DATABASE_MODE` picks one per deployment. Your code is the same on either engine.

Database mode

Cache engine

Where it lives

- `single` (default) — SQLite file — `local/apps/<app>/` in dev, `sqlite/` in production. `AKAN_SOLID_DB_PATH` sets the file.

- `multiple` · `cluster` — Redis — `REDIS_URI`, required once deployed. A developer machine uses localhost.

Document Cache

Every model class built with `into()` carries `this.<model>Cache`. Use it when the cached value belongs to one record, such as a preview token or a verification code.

Save a preview token for ten minutes, then accept it once:

**One topic per purpose.** `previewTokens` is the topic, the article id is the key, and each token is a field under it with an expiry of its own. The model name is prefixed for you, so topics never collide across models.

**Consume in one step.** `hgetDel` reads the field and removes it at once, so of two requests racing with one token only one gets it. A wrong token names a field that does not exist and consumes nothing. A read followed by a separate delete would let both racing requests through.

**Values keep their type.** A number reads back as a number and bytes as bytes, on SQLite and Redis alike.

Methods

Method

- set(topic, key, value, { expireAt }?): Stores text, a number, a boolean, bytes or an object. Without `expireAt` it stays until deleted.

- get<T>(topic, key): Reads the value back as stored. A missing or expired key reads `undefined`.

- delete(topic, key): Removes the value right away.

- getDel<T>(topic, key): Reads and removes in one step: of two callers racing for a one-time value, one gets it.

- setIfAbsent(topic, key, value, { expireAt }?): Writes only if nothing live is stored, and answers whether this call wrote.

- incr(topic, key, by?, { expireAt }?): Adds `by` (1 by default) and answers the total; the expiry applies if this call creates it.

- hset, hget, hdelete: A hash under one key: each field is written, read and removed alone, and expires on its own.

- hkeys, hentries, hclear: Lists the fields, lists them with their values, or empties the hash.

- hgetDel, hsetIfAbsent, hincr: The one-step `getDel`, `setIfAbsent` and `incr`, for a single field.

**A class instance comes back as plain JSON.** Objects and arrays are stored as JSON, so a model read back has no methods and its dates are strings. For a model value, use a `memory()` typed with the model instead.

Service Memory

`memory()` gives a service a value that outlives one call. Declare it in the `serve()` injector next to `service()` and `plug()`; an `adapt()` adaptor takes it too.

Here are all three kinds in one service:

What `this.x` becomes depends on how it was declared:

Declared as

What you get

- memory(ref): One shared value behind async methods; `getDel`, `setIfAbsent` and `incr` each act in one step.

- memory(Map, { of: ref }): A shared async key–value map. `getOrInsert` keeps the first writer's value, across replicas too.

- memory(ref, { local: true }): A plain field on this process, read and assigned directly; on a `Map`, a real `Map`. — Example: `this.localHitCount += 1;`

Options

- of (scalar | model class): The value type of a `Map` memory. Required when the first argument is `Map`.

- local (boolean, default false): Keep a plain field on this process instead of in the cache adaptor.

- default (value of ref): What a single value reads before its first write; without one it reads `null`.

- ttl (number (ms)): How long each write lives, unless that `set` passes its own `{ expireAt }`.

- get ((stored) => value): Maps the stored value to what code reads. Give it with `set` or not at all; not with `local`.

- set ((value) => stored): The inverse of `get`: turns what code writes back into the stored value.

Rules

**Store a model, not hand-made JSON.** `memory(Map, { of: cnst.OauthClient })` serializes through the constant; never encode JSON into a `String` memory yourself.

**Expect an empty read before the first write.** A single value reads its `default`, or `null` without one. A `Map`'s `get(key)` reads `undefined`, so guard it with `??`, as in `(await this.registrations.get(ip)) ?? 0`.

**A memory belongs to the service that declares it.** Two services that both declare `latestArticleId` each keep their own value, and so does an adaptor.

**Each Map entry expires on its own.** The declared `ttl` or a write's `expireAt` bounds that entry only, on SQLite and Redis alike.

**Local memory is per process.** Each replica keeps its own `localHitCount`, and it starts over after a restart.

Which One?

Pick by who owns the value and who needs to see it.

When

Seen by

Use

- The key is a model id. — this.articleCache — Every replica on the same cache

- The value belongs to a service workflow. — memory(T) · memory(Map, { of }) — Every replica on the same cache

- Each replica may keep its own copy. — memory(T, { local: true }) — This process only

- A query answers every caller the same. — query(T, { guards, cache: ms }) — Every caller, one entry per argument set

**Local memory only for what need not be shared.** A value another replica must see belongs in `memory()` or the document cache.

**Endpoint cache is for shared answers only.** It works on a `query` with no internal argument such as `.with(Self)`. The lookup runs after the guards, so a hit reaches only a caller they admitted.

Tips

**Start with a short TTL.** Lengthen it once the behavior is stable.

**Give every value that should expire a lifetime.** Declare `ttl` on the memory or pass `expireAt` to the write; a value with neither stays until you delete it.

**Keep keys boring.** A topic plus an id is usually enough.

**Invalidate right after the write.** Delete or refresh the cached copy as soon as the source data changes.

**A cache is never the source of truth.** It is only a fast copy that can vanish at any time.

Read next

- Injection Types — Every `serve()` injector, with `memory()` in detail.

- The Options Object — The endpoint `cache` option next to `timeout` and `guards`.

- database.modes — The setting that declares the database modes, and with them SQLite or Redis for the cache.

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

### memory(ref)

```ts
get() · set(value, { expireAt }?) · delete()
getDel() · setIfAbsent(value) · incr(by?)
```

### memory(Map, { of: ref })

```ts
get(key) · set(key, value, { expireAt }?) · delete(key) · clear()
getDel(key) · setIfAbsent(key, value) · incr(key, by?)
getOrInsert(key, value) · getOrInsertComputed(key, fn)
keys() · entries() · forEach(fn)
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

