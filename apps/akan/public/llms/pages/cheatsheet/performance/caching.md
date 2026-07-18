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

Caching is a small key-value shortcut in front of expensive work. Use it for data that is safe to reuse for a short time, such as verification codes, counters, summaries, or computed options.

Document cache is close to one model.

Service memory is useful for service-level state or shared helper values.

The provider can be sqlite/libsql or redis depending on runtime mode.

Document Cache

Use model cache inside the document layer when the cached value naturally belongs to that model. Keep the namespace small and delete it when the source changes.

Cache a short-lived code

Service Memory

Use `memory()` when a service needs a small value that survives across calls. It can be a single value, a map, or local process memory.

Service-level cache

Which One?

Use document cache when the key is a model id.

Use service memory when the value belongs to a service workflow.

Use local memory only for values that do not need to be shared between replicas.

Tips

Prefer short TTLs first. You can extend them after the behavior is stable.

Make cache keys boring: namespace plus id is usually enough.

Delete or refresh cache right after updating the source data.

Never treat cache as the source of truth. It is only a fast copy.

## Code Examples

### Code

```ts
export class ArticleModel extends into(Article, ArticleFilter, cnst.article, () => ({})) {
  async savePreviewToken(articleId: string, token: string) {
    await this.articleCache.set("previewTokens", articleId, token, {
      expireAt: dayjs().add(10, "minute"),
    });
  }

  async consumePreviewToken(articleId: string, token: string) {
    const saved = await this.articleCache.get<string>("previewTokens", articleId);
    if (saved !== token) return false;
    await this.articleCache.delete("previewTokens", articleId);
    return true;
  }
}
```

### Code

```ts
export class ArticleService extends serve(db.article, ({ memory }) => ({
  latestArticleId: memory(String),
  articleSummaries: memory(Map, { of: String }),
  localHitCount: memory(Number, { local: true, default: 0 }),
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

