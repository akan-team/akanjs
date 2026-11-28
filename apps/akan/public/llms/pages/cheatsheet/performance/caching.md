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
- Page Cache (#page-cache)
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

- Endpoint Cache — Reuses a query's whole answer for every caller for the milliseconds you declare, one day at most. — `query(T, { guards, cache: 1000 })`

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

Page Cache

In production the server keeps a rendered page for a few seconds, as RSC payload and as HTML, and answers the next anonymous request for it from memory. `X-Akan-Cache` on the response says HIT, MISS or BYPASS, with `X-Akan-Cache-Reason`.

Variable

Effect

- AKAN_RSC_RESULT_CACHE · AKAN_HTML_RESULT_CACHE: `1` turns the cache on outside production, `0` turns it off. On by default in production.

- …_TTL: Seconds an entry is kept, 30 by default. A page's own `revalidate` can only shorten it.

- …_PATHS · …_EXCLUDE_PATHS: Comma-separated path prefixes the cache takes, and the ones it leaves out.

- AKAN_ROUTE_CACHE_TRACKING_PARAMS: Query parameters left out of the key: comma-separated names, a trailing `*` for a prefix, `default` for the built-in list, `off` for none.

What the key holds

The origin, base path, the URL's locale, path, query and theme cookie, plus a crawler flag for HTML, not `Accept-Language`. A page whose render calls `headers()`, `cookies()` or `fetch.*` is never stored and, after one `MISS`, answers `BYPASS` with `X-Akan-Cache-Reason: dynamic-request-api`. Pass `{ forwardVisitor: false }` to a call whose endpoint answers every caller alike and the page is stored.

The query in the key

The key takes the query sorted by name, without the tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid` and the like), as the URL standard parses it. A name given twice keeps its values in their order, and names are case-sensitive. These pairs share an entry:

Request

Shares an entry with

- ?b=2&a=1 — ?a=1&b=2

- ?a=1&utm_source=news&gclid=x — ?a=1

- ?a — ?a=

- ?q=a+b — ?q=a%20b

- ?p=%2f — ?p=/

- ?a=1&&b=2& — ?a=1&b=2

**The page still reads the full query.** `.search()` reads the URL as requested and `window.location` keeps every parameter. A guard's `request.path`, `usePathCtx().location` and `usePageLocation()` carry the sorted URL the server renders with, the hooks until the first navigation.

**Some pages keep the query as requested.** A page or layout with `.config({ canonicalQuery: false })`, one that declares a tracking parameter with `.search("utm_source", String)`, and a legacy default-function page keep one entry per query as asked.

When a page has to render

A stored page is replayed at once. Every other page is rendered, and by default the render worker starts each render as it arrives. Two variables make it run a set number at a time and keep the rest in line:

- AKAN_RSC_WORKER_MAX_CONCURRENCY: Renders one render worker runs at a time. The rest wait in the order they came, and one whose client has gone leaves the queue. Unset, `0` or `off`, the default, starts every render as it arrives.

- AKAN_RSC_WORKER_MAX_QUEUE: Renders that may wait. One more is answered `503` with `Retry-After: 1` before it renders. The default is the cap times the idle timeout's seconds (120, so 960 for a cap of 8); `0` or `off` lets the queue grow.

**A page that awaits data holds its slot while it waits.** Set the cap to the requests one replica is sized to hold at once, and go lower only for pages that render without waiting on data.

**A full queue answers 503, and so does a long wait.** A render past `AKAN_RSC_WORKER_MAX_QUEUE` or one that waited `AKAN_IDLE_TIMEOUT` (120 s) gets `503`: a page that reloads itself for a browser, `base.error.serverUnavailable` JSON for a JSON caller.

**The queue is in the metrics.** `akan_rsc_renders_in_flight`, `akan_rsc_render_queue_depth`, `akan_rsc_render_queue_wait_seconds` and `akan_rsc_render_refusals_total` report it per process, and a page that waited carries `queueMs` on its request line. The cap counts per render worker, so per replica.

**The cap bounds the renders admitted, not the ones abandoned.** A slot comes back when its client leaves or `AKAN_IDLE_TIMEOUT` passes, but the page runs on until its `await` settles. `akan_rsc_renders_abandoned` counts those, so give data calls their own timeout.

Which One?

Pick by who owns the value and who needs to see it.

When

Seen by

Use

- The key is a model id. — this.articleCache — Every replica on the same cache

- The value belongs to a service workflow. — memory(T) · memory(Map, { of }) — Every replica on the same cache

- Each replica may keep its own copy. — memory(T, { local: true }) — This process only

- A query answers every caller the same. — query(T, { guards, cache: ms }) — Every caller, one entry per argument set, kept a day at most

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

