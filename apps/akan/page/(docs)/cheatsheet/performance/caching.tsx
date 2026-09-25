import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Server Caching", ko: "서버 캐싱" })}>
        <Docs.Title>{l.trans({ en: "Server Caching", ko: "서버 캐싱" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Caching is a small key-value shortcut in front of expensive work. Use it for data that is safe to reuse for a short time, such as verification codes, counters, summaries, or computed options.",
              ko: "캐싱은 비용이 큰 작업 앞에 두는 작은 key-value 지름길입니다. 인증 코드, 카운터, 요약값, 계산된 옵션처럼 잠깐 재사용해도 되는 데이터에 사용하세요.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Document cache is close to one model.",
                ko: "Document cache는 특정 model에 가깝습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Service memory is useful for service-level state or shared helper values.",
                ko: "Service memory는 service 단위 상태나 공통 helper 값에 유용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "The provider can be sqlite/libsql or redis depending on runtime mode.",
                ko: "Provider는 실행 모드에 따라 sqlite/libsql 또는 redis가 될 수 있습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="document-cache" title={l.trans({ en: "Document Cache", ko: "Document cache" })}>
        <Docs.Title>{l.trans({ en: "Document Cache", ko: "Document cache" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use model cache inside the document layer when the cached value naturally belongs to that model. Keep the namespace small and delete it when the source changes.",
              ko: "캐시 값이 자연스럽게 특정 model에 속한다면 document layer에서 model cache를 사용하세요. namespace를 작게 유지하고 원본이 바뀌면 삭제하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Cache a short-lived code", ko: "짧게 사는 코드 캐싱" })}
          code={`export class ArticleModel extends into(Article, ArticleFilter, cnst.article, () => ({})) {
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
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service-memory" title={l.trans({ en: "Service Memory", ko: "Service memory" })}>
        <Docs.Title>{l.trans({ en: "Service Memory", ko: "Service memory" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `memory()` when a service needs a small value that survives across calls. It can be a single value, a map, or local process memory.",
              ko: "Service가 호출 사이에서 유지되는 작은 값이 필요하면 `memory()`를 사용합니다. 단일 값, map, local process memory로 쓸 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Service-level cache", ko: "Service 단위 cache" })}
          code={`export class ArticleService extends serve(db.article, ({ memory }) => ({
  latestArticleId: memory(String),
  articleSummaries: memory(Map, { of: String }),
  localHitCount: memory(Number, { local: true, default: 0 }),
})) {
  async rememberSummary(articleId: string, summary: string) {
    await this.latestArticleId.set(articleId);
    await this.articleSummaries.set(articleId, summary);
    this.localHitCount += 1;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="choose" title={l.trans({ en: "Which One?", ko: "무엇을 쓸까?" })}>
        <Docs.Title>{l.trans({ en: "Which One?", ko: "무엇을 쓸까?" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use document cache when the key is a model id.",
                ko: "Key가 model id라면 document cache를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use service memory when the value belongs to a service workflow.",
                ko: "값이 service workflow에 속한다면 service memory를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use local memory only for values that do not need to be shared between replicas.",
                ko: "Replica 사이에 공유될 필요가 없는 값에만 local memory를 사용하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Prefer short TTLs first. You can extend them after the behavior is stable.",
                ko: "처음에는 짧은 TTL을 선호하세요. 동작이 안정되면 늘려도 됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Make cache keys boring: namespace plus id is usually enough.",
                ko: "Cache key는 단순하게 만드세요. 보통 namespace와 id면 충분합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Delete or refresh cache right after updating the source data.",
                ko: "원본 데이터를 수정한 직후 cache를 삭제하거나 갱신하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Never treat cache as the source of truth. It is only a fast copy.",
                ko: "Cache를 원본으로 생각하지 마세요. 빠른 복사본일 뿐입니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
