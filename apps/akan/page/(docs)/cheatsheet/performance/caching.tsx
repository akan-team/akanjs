import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "Performance: 캐싱 | Akan.js" : "Performance: Caching | Akan.js";
    const description =
      lang === "ko"
        ? "잠시 재사용해도 안전한 값을 도큐먼트 캐시와 서비스 메모리 중에서 고릅니다."
        : "Pick between the document cache and service memory for values safe to reuse for a while.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const bulletList = "my-4 list-disc space-y-2 pl-5";
    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const termRows = [
      {
        name: <span className="font-sans">{l.trans({ en: "cache adaptor", ko: "캐시 어댑터" })}</span>,
        desc: l.trans({
          en: "The engine that holds cached values: a SQLite file or Redis, picked by the database mode.",
          ko: "캐시 값을 실제로 담는 엔진입니다. 데이터베이스 모드에 따라 SQLite 파일이나 Redis가 맡습니다.",
        }),
      },
      {
        name: "topic",
        desc: l.trans({
          en: "A namespace in front of the key, such as `previewTokens`. Topic plus key names one value.",
          ko: "key 앞에 붙는 이름 공간입니다(예: `previewTokens`). topic과 key가 합쳐져 값 하나를 가리킵니다.",
        }),
      },
      {
        name: ["expireAt", "ttl"],
        desc: l.trans({
          en: "`expireAt` is the moment a value disappears, as a Dayjs; `ttl` is its lifetime in milliseconds.",
          ko: "`expireAt`은 값이 사라지는 시각(Dayjs)이고, `ttl`은 같은 기한을 밀리초 단위 수명으로 나타낸 것입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "replica", ko: "레플리카" })}</span>,
        desc: l.trans({
          en: "One of several server processes running the same app.",
          ko: "같은 앱을 실행하는 여러 서버 프로세스 중 하나입니다.",
        }),
      },
    ];

    const tools = [
      {
        title: l.trans({ en: "Document Cache", ko: "Document 캐시" }),
        desc: l.trans({
          en: "A key–value store every model class carries. Reach for it when the key is a record id.",
          ko: "모든 model 클래스에 딸린 key-value 저장소입니다. key가 레코드 id일 때 씁니다.",
        }),
        code: "this.articleCache.set(topic, id, value)",
      },
      {
        title: l.trans({ en: "Service Memory", ko: "서비스 메모리" }),
        desc: l.trans({
          en: "A value or map a service keeps between calls, shared by every replica on the same cache.",
          ko: "service가 호출 사이에 들고 있는 값이나 map입니다. 같은 캐시를 쓰는 모든 레플리카가 공유합니다.",
        }),
        code: "memory(String) · memory(Map, { of })",
      },
      {
        title: l.trans({ en: "Local Memory", ko: "로컬 메모리" }),
        desc: l.trans({
          en: "A plain field on this process only. Fastest, but not shared, and gone after a restart.",
          ko: "이 프로세스에만 있는 일반 필드입니다. 가장 빠르지만 공유되지 않고, 재시작하면 사라집니다.",
        }),
        code: "memory(Int, { local: true, default: 0 })",
      },
      {
        title: l.trans({ en: "Endpoint Cache", ko: "Endpoint 캐시" }),
        desc: l.trans({
          en: "Reuses a query's whole answer for every caller for the milliseconds you declare, one day at most.",
          ko: "query의 응답 전체를 선언한 밀리초 동안, 최대 하루까지 모든 호출자에게 재사용합니다.",
        }),
        code: "query(T, { guards, cache: 1000 })",
      },
    ];

    const storageColumns = [
      { key: "mode", label: l.trans({ en: "Database mode", ko: "데이터베이스 모드" }) },
      { key: "engine", label: l.trans({ en: "Cache engine", ko: "캐시 엔진" }) },
      { key: "where", label: l.trans({ en: "Where it lives", ko: "저장 위치" }) },
    ];
    const storageRows = [
      {
        mode: l.trans({ en: "`single` (default)", ko: "`single` (기본값)" }),
        engine: l.trans({ en: "SQLite file", ko: "SQLite 파일" }),
        where: l.trans({
          en: "`local/apps/<app>/` in dev, `sqlite/` in production. `AKAN_SOLID_DB_PATH` sets the file.",
          ko: "개발 중에는 `local/apps/<app>/`, 운영에서는 `sqlite/`에 둡니다. `AKAN_SOLID_DB_PATH`로 파일을 지정합니다.",
        }),
      },
      {
        mode: "`multiple` · `cluster`",
        engine: "Redis",
        where: l.trans({
          en: "`REDIS_URI`, required once deployed. A developer machine uses localhost.",
          ko: "`REDIS_URI`로 정하며 배포에서는 꼭 필요합니다. 개발자 PC에서는 localhost를 씁니다.",
        }),
      },
    ];

    const cacheMethods = [
      {
        name: "set(topic, key, value, { expireAt }?)",
        desc: l.trans({
          en: "Stores text, a number, a boolean, bytes or an object. Without `expireAt` it stays until deleted.",
          ko: "문자열, 숫자, boolean, 바이트, 객체를 저장합니다. `expireAt`이 없으면 지울 때까지 남습니다.",
        }),
      },
      {
        name: "get<T>(topic, key)",
        desc: l.trans({
          en: "Reads the value back as stored. A missing or expired key reads `undefined`.",
          ko: "저장한 값을 그대로 다시 읽습니다. 없거나 만료된 key는 `undefined`로 읽힙니다.",
        }),
      },
      {
        name: "delete(topic, key)",
        desc: l.trans({
          en: "Removes the value right away.",
          ko: "값을 바로 지웁니다.",
        }),
      },
      {
        name: "getDel<T>(topic, key)",
        desc: l.trans({
          en: "Reads and removes in one step: of two callers racing for a one-time value, one gets it.",
          ko: "읽기와 삭제를 한 번에 합니다. 한 번만 쓸 값을 두고 다투는 두 호출자 중 하나만 받습니다.",
        }),
      },
      {
        name: "setIfAbsent(topic, key, value, { expireAt }?)",
        desc: l.trans({
          en: "Writes only if nothing live is stored, and answers whether this call wrote.",
          ko: "살아 있는 값이 없을 때만 쓰고, 이 호출이 썼는지를 돌려줍니다.",
        }),
      },
      {
        name: "incr(topic, key, by?, { expireAt }?)",
        desc: l.trans({
          en: "Adds `by` (1 by default) and answers the total; the expiry applies if this call creates it.",
          ko: "`by`(기본 1)를 더하고 합계를 돌려줍니다. 만료는 이 호출이 값을 처음 만들 때만 걸립니다.",
        }),
      },
      {
        name: ["hset", "hget", "hdelete"],
        desc: l.trans({
          en: "A hash under one key: each field is written, read and removed alone, and expires on its own.",
          ko: "key 하나 아래의 해시입니다. 필드마다 따로 쓰고 읽고 지우며, 만료도 필드마다 걸립니다.",
        }),
      },
      {
        name: ["hkeys", "hentries", "hclear"],
        desc: l.trans({
          en: "Lists the fields, lists them with their values, or empties the hash.",
          ko: "필드 이름을 나열하거나, 값과 함께 나열하거나, 해시를 비웁니다.",
        }),
      },
      {
        name: ["hgetDel", "hsetIfAbsent", "hincr"],
        desc: l.trans({
          en: "The one-step `getDel`, `setIfAbsent` and `incr`, for a single field.",
          ko: "필드 하나에 대한 한 번에 끝나는 `getDel`, `setIfAbsent`, `incr`입니다.",
        }),
      },
    ];

    const memoryShapes = [
      {
        name: "memory(ref)",
        desc: l.trans({
          en: "One shared value behind async methods; `getDel`, `setIfAbsent` and `incr` each act in one step.",
          ko: "async 메서드로 다루는 공유 값 하나입니다. `getDel`, `setIfAbsent`, `incr`는 각각 한 번에 끝납니다.",
        }),
        example: `get() · set(value, { expireAt }?) · delete()
getDel() · setIfAbsent(value) · incr(by?)`,
      },
      {
        name: "memory(Map, { of: ref })",
        desc: l.trans({
          en: "A shared async key–value map. `getOrInsert` keeps the first writer's value, across replicas too.",
          ko: "공유되는 async key-value map입니다. `getOrInsert`는 레플리카 사이에서도 먼저 쓴 값을 지킵니다.",
        }),
        example: `get(key) · set(key, value, { expireAt }?) · delete(key) · clear()
getDel(key) · setIfAbsent(key, value) · incr(key, by?)
getOrInsert(key, value) · getOrInsertComputed(key, fn)
keys() · entries() · forEach(fn)`,
      },
      {
        name: "memory(ref, { local: true })",
        desc: l.trans({
          en: "A plain field on this process, read and assigned directly; on a `Map`, a real `Map`.",
          ko: "이 프로세스에 있는 일반 필드로, 바로 읽고 대입합니다. `Map`이면 진짜 `Map`입니다.",
        }),
        example: "this.localHitCount += 1;",
      },
    ];

    const memoryOptions = [
      {
        key: "of",
        type: "scalar | model class",
        desc: l.trans({
          en: "The value type of a `Map` memory. Required when the first argument is `Map`.",
          ko: "`Map` memory의 값 타입입니다. 첫 인자가 `Map`이면 꼭 필요합니다.",
        }),
      },
      {
        key: "local",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "Keep a plain field on this process instead of in the cache adaptor.",
          ko: "캐시 어댑터 대신 이 프로세스의 일반 필드로 둡니다.",
        }),
      },
      {
        key: "default",
        type: l.trans({ en: "value of ref", ko: "ref 타입의 값" }),
        desc: l.trans({
          en: "What a single value reads before its first write; without one it reads `null`.",
          ko: "단일 값이 처음 쓰이기 전에 읽히는 값입니다. 없으면 `null`로 읽힙니다.",
        }),
      },
      {
        key: "ttl",
        type: "number (ms)",
        desc: l.trans({
          en: "How long each write lives, unless that `set` passes its own `{ expireAt }`.",
          ko: "쓴 값 하나하나가 살아 있는 시간입니다. `set`이 `{ expireAt }`를 직접 주면 그 값이 우선합니다.",
        }),
      },
      {
        key: "get",
        type: "(stored) => value",
        desc: l.trans({
          en: "Maps the stored value to what code reads. Give it with `set` or not at all; not with `local`.",
          ko: "저장된 값을 코드가 읽는 모양으로 바꿉니다. `set`과 함께만 주며, `local`과는 못 씁니다.",
        }),
      },
      {
        key: "set",
        type: "(value) => stored",
        desc: l.trans({
          en: "The inverse of `get`: turns what code writes back into the stored value.",
          ko: "`get`의 반대로, 코드가 쓰는 값을 저장할 값으로 되돌립니다.",
        }),
      },
    ];

    const chooseColumns = [
      { key: "when", label: l.trans({ en: "When", ko: "이럴 때" }) },
      { key: "seen", label: l.trans({ en: "Seen by", ko: "보이는 범위" }) },
      { key: "use", label: l.trans({ en: "Use", ko: "사용" }), code: true },
    ];
    const chooseRows = [
      {
        when: l.trans({ en: "The key is a model id.", ko: "key가 model id입니다." }),
        use: "this.articleCache",
        seen: l.trans({ en: "Every replica on the same cache", ko: "같은 캐시를 쓰는 모든 레플리카" }),
      },
      {
        when: l.trans({ en: "The value belongs to a service workflow.", ko: "값이 service 흐름에 속합니다." }),
        use: "memory(T) · memory(Map, { of })",
        seen: l.trans({ en: "Every replica on the same cache", ko: "같은 캐시를 쓰는 모든 레플리카" }),
      },
      {
        when: l.trans({
          en: "Each replica may keep its own copy.",
          ko: "레플리카마다 따로 들고 있어도 됩니다.",
        }),
        use: "memory(T, { local: true })",
        seen: l.trans({ en: "This process only", ko: "이 프로세스만" }),
      },
      {
        when: l.trans({
          en: "A query answers every caller the same.",
          ko: "query가 모든 호출자에게 같은 답을 줍니다.",
        }),
        use: "query(T, { guards, cache: ms })",
        seen: l.trans({
          en: "Every caller, one entry per argument set, kept a day at most",
          ko: "모든 호출자, 인자 조합마다 하나, 최대 하루 유지",
        }),
      },
    ];

    const pageCacheEnvColumns = [
      { key: "name", label: l.trans({ en: "Variable", ko: "변수" }), code: true },
      { key: "desc", label: l.trans({ en: "Effect", ko: "효과" }) },
    ];
    const pageCacheEnvRows = [
      {
        name: "AKAN_RSC_RESULT_CACHE · AKAN_HTML_RESULT_CACHE",
        desc: l.trans({
          en: "`1` turns the cache on outside production, `0` turns it off. On by default in production.",
          ko: "`1`이면 production 밖에서도 켜고, `0`이면 끕니다. production에서는 기본으로 켜져 있습니다.",
        }),
      },
      {
        name: "…_TTL",
        desc: l.trans({
          en: "Seconds an entry is kept, 30 by default. A page's own `revalidate` can only shorten it.",
          ko: "항목을 보관하는 초이며 기본 30초입니다. 페이지의 `revalidate`는 이를 줄이기만 합니다.",
        }),
      },
      {
        name: "…_PATHS · …_EXCLUDE_PATHS",
        desc: l.trans({
          en: "Comma-separated path prefixes the cache takes, and the ones it leaves out.",
          ko: "캐시할 경로 접두사와 뺄 경로 접두사를 쉼표로 나열합니다.",
        }),
      },
      {
        name: "AKAN_ROUTE_CACHE_TRACKING_PARAMS",
        desc: l.trans({
          en: "Query parameters left out of the key: comma-separated names, a trailing `*` for a prefix, `default` for the built-in list, `off` for none.",
          ko: "key에서 뺄 쿼리 파라미터입니다. 이름을 쉼표로 나열하고, 끝의 `*`는 접두사, `default`는 기본 목록, `off`는 없음을 뜻합니다.",
        }),
      },
    ];

    const renderSlotEnvRows = [
      {
        name: "AKAN_RSC_WORKER_MAX_CONCURRENCY",
        desc: l.trans({
          en: "Renders one render worker runs at a time. The rest wait in the order they came, and one whose client has gone leaves the queue. Unset, `0` or `off`, the default, starts every render as it arrives.",
          ko: "렌더 워커 하나가 동시에 실행하는 렌더 수입니다. 나머지는 온 순서대로 기다리고, 클라이언트가 떠난 렌더는 대기열에서 빠집니다. 기본값인 미설정, `0`, `off`에서는 렌더가 오는 대로 시작합니다.",
        }),
      },
      {
        name: "AKAN_RSC_WORKER_MAX_QUEUE",
        desc: l.trans({
          en: "Renders that may wait. One more is answered `503` with `Retry-After: 1` before it renders. The default is the cap times the idle timeout's seconds (120, so 960 for a cap of 8); `0` or `off` lets the queue grow.",
          ko: "기다릴 수 있는 렌더 수입니다. 이를 넘는 렌더는 렌더하기 전에 `Retry-After: 1`과 함께 `503`으로 답합니다. 기본값은 상한에 idle timeout의 초(120)를 곱한 값이라 상한이 8이면 960이고, `0`이나 `off`면 대기열에 한도를 두지 않습니다.",
        }),
      },
    ];

    const queryFormColumns = [
      { key: "a", label: l.trans({ en: "Request", ko: "요청" }), code: true },
      { key: "b", label: l.trans({ en: "Shares an entry with", ko: "같은 항목을 쓰는 요청" }), code: true },
    ];
    const queryFormRows = [
      { a: "?b=2&a=1", b: "?a=1&b=2" },
      { a: "?a=1&utm_source=news&gclid=x", b: "?a=1" },
      { a: "?a", b: "?a=" },
      { a: "?q=a+b", b: "?q=a%20b" },
      { a: "?p=%2f", b: "?p=/" },
      { a: "?a=1&&b=2&", b: "?a=1&b=2" },
    ];

    const moreLinks = [
      {
        href: "/conventions/module/service#injection-types",
        title: l.trans({ en: "Injection Types", ko: "주입 종류" }),
        desc: l.trans({
          en: "Every `serve()` injector, with `memory()` in detail.",
          ko: "`serve()`의 모든 주입자와 `memory()`를 자세히 다룹니다.",
        }),
      },
      {
        href: "/conventions/module/signal#endpoint-options",
        title: l.trans({ en: "The Options Object", ko: "옵션 객체" }),
        desc: l.trans({
          en: "The endpoint `cache` option next to `timeout` and `guards`.",
          ko: "`timeout`, `guards`와 함께 endpoint의 `cache` 옵션을 설명합니다.",
        }),
      },
      {
        href: "/conventions/applib/config#default-database-mode",
        title: "database.modes",
        desc: l.trans({
          en: "The setting that declares the database modes, and with them SQLite or Redis for the cache.",
          ko: "데이터베이스 모드를 선언하는 설정으로, 캐시를 SQLite에 둘지 Redis에 둘지도 이것으로 정해집니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Server Caching", ko: "서버 캐싱" })}>
          <Docs.Title>{l.trans({ en: "Server Caching", ko: "서버 캐싱" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A cache keeps a short-lived copy of a value so the server can skip expensive work. Use it for data that is safe to reuse for a while: verification codes, counters, summaries and computed options.",
                ko: "캐시는 값의 복사본을 잠깐 들고 있어서, 서버가 비싼 작업을 건너뛰게 해 줍니다. 인증 코드, 카운터, 요약, 계산해 둔 옵션처럼 잠시 재사용해도 안전한 데이터에 씁니다.",
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Four ways to cache", ko: "캐시하는 네 가지 방법" })}</Docs.SubSubTitle>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {tools.map((tool) => (
                <div key={tool.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="font-semibold text-primary">{tool.title}</div>
                  <div className="mt-1 text-foreground/70 text-sm">{tool.desc}</div>
                  <code className={chip}>{tool.code}</code>
                </div>
              ))}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Where cached values live", ko: "캐시 값이 저장되는 곳" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The engine follows the database mode the app runs in: <code>database.modes</code> in{" "}
                    <code>akan.config.ts</code> declares the modes, and <code>AKAN_DATABASE_MODE</code> picks one per
                    deployment. Your code is the same on either engine.
                  </span>
                ),
                ko: (
                  <span>
                    엔진은 앱이 도는 데이터베이스 모드를 따릅니다. <code>akan.config.ts</code>의{" "}
                    <code>database.modes</code>에 모드를 선언하고, 배포마다 <code>AKAN_DATABASE_MODE</code>로 그중
                    하나를 고릅니다. 어느 엔진이든 코드는 같습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table columns={storageColumns} rows={storageRows} stacked />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="document-cache" title={l.trans({ en: "Document Cache", ko: "Document 캐시" })}>
          <Docs.Title>{l.trans({ en: "Document Cache", ko: "Document 캐시" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every model class built with <code>into()</code> carries <code>this.&lt;model&gt;Cache</code>. Use
                    it when the cached value belongs to one record, such as a preview token or a verification code.
                  </span>
                ),
                ko: (
                  <span>
                    <code>into()</code>로 만든 model 클래스에는 모두 <code>this.&lt;model&gt;Cache</code>가 있습니다.
                    미리보기 토큰이나 인증 코드처럼 캐시 값이 레코드 하나에 속할 때 씁니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Save a preview token for ten minutes, then accept it once:",
                ko: "미리보기 토큰을 10분 동안 저장하고, 딱 한 번만 받아 주는 예입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/blog/lib/article/article.document.ts"
              code={`export class ArticleModel extends into(Article, ArticleFilter, cnst.article, () => ({})) {
  async savePreviewToken(articleId: string, token: string) {
    await this.articleCache.hset("previewTokens", articleId, token, true, {
      expireAt: dayjs().add(10, "minute"),
    });
  }

  async consumePreviewToken(articleId: string, token: string) {
    return !!(await this.articleCache.hgetDel("previewTokens", articleId, token));
  }
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One topic per purpose.</strong> <code>previewTokens</code> is the topic, the article id is
                      the key, and each token is a field under it with an expiry of its own. The model name is prefixed
                      for you, so topics never collide across models.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>용도마다 topic 하나.</strong> <code>previewTokens</code>가 topic, article id가 key이고,
                      토큰 하나하나가 그 아래 필드이며 필드마다 만료가 따로 걸립니다. model 이름이 앞에 자동으로
                      붙으므로, 다른 model의 topic과 겹치지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Consume in one step.</strong> <code>hgetDel</code> reads the field and removes it at once,
                      so of two requests racing with one token only one gets it. A wrong token names a field that does
                      not exist and consumes nothing. A read followed by a separate delete would let both racing
                      requests through.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>한 번에 꺼내 씁니다.</strong> <code>hgetDel</code>은 필드를 읽는 일과 지우는 일을 한 번에
                      하므로, 같은 토큰으로 동시에 들어온 두 요청 중 하나만 통과합니다. 틀린 토큰은 없는 필드를
                      가리키므로 아무것도 소비하지 않습니다. 읽은 뒤 따로 지우면 동시에 온 두 요청이 모두 통과합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Values keep their type.</strong> A number reads back as a number and bytes as bytes, on
                      SQLite and Redis alike.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>값은 타입을 그대로 지닙니다.</strong> 숫자는 숫자로, 바이트는 바이트로 읽히며 SQLite와
                      Redis 모두 같습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Methods", ko: "메서드" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={cacheMethods} />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>A class instance comes back as plain JSON.</strong> Objects and arrays are stored as JSON,
                    so a model read back has no methods and its dates are strings. For a model value, use a{" "}
                    <code>memory()</code> typed with the model instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>class 인스턴스는 평범한 JSON으로 돌아옵니다.</strong> 객체와 배열은 JSON으로 저장되므로,
                    다시 읽은 model에는 메서드가 없고 날짜는 문자열입니다. model 값은 model로 타입을 준{" "}
                    <code>memory()</code>를 대신 씁니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="service-memory" title={l.trans({ en: "Service Memory", ko: "서비스 메모리" })}>
          <Docs.Title>{l.trans({ en: "Service Memory", ko: "서비스 메모리" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>memory()</code> gives a service a value that outlives one call. Declare it in the{" "}
                    <code>serve()</code> injector next to <code>service()</code> and <code>plug()</code>; an{" "}
                    <code>adapt()</code> adaptor takes it too.
                  </span>
                ),
                ko: (
                  <span>
                    <code>memory()</code>는 호출이 끝나도 남는 값을 service에 줍니다. <code>serve()</code>의 주입자에서{" "}
                    <code>service()</code>, <code>plug()</code>와 나란히 선언하며, <code>adapt()</code> 어댑터에서도 쓸
                    수 있습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Here are all three kinds in one service:",
                ko: "세 가지 종류를 한 service에 모으면 이렇습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/blog/lib/article/article.service.ts"
              code={`export class ArticleService extends serve(db.article, ({ memory }) => ({
  latestArticleId: memory(String),
  articleSummaries: memory(Map, { of: String, ttl: 60 * 60 * 1000 }),
  localHitCount: memory(Int, { local: true, default: 0 }),
})) {
  async rememberSummary(articleId: string, summary: string) {
    await this.latestArticleId.set(articleId);
    await this.articleSummaries.set(articleId, summary);
    this.localHitCount += 1;
  }
}`}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    What <code>this.x</code> becomes depends on how it was declared:
                  </span>
                ),
                ko: (
                  <span>
                    <code>this.x</code>가 어떤 모양이 되는지는 선언 방식에 따라 다릅니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Declared as", ko: "선언" })}
              descLabel={l.trans({ en: "What you get", ko: "받는 것" })}
              items={memoryShapes}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Options", ko: "옵션" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={memoryOptions} />
            <Docs.SubSubTitle>{l.trans({ en: "Rules", ko: "규칙" })}</Docs.SubSubTitle>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Store a model, not hand-made JSON.</strong>{" "}
                      <code>{"memory(Map, { of: cnst.OauthClient })"}</code> serializes through the constant; never
                      encode JSON into a <code>String</code> memory yourself.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>JSON을 직접 만들지 말고 model을 저장하세요.</strong>{" "}
                      <code>{"memory(Map, { of: cnst.OauthClient })"}</code>는 constant를 거쳐 직렬화됩니다.{" "}
                      <code>String</code> memory에 JSON을 손으로 넣지 마세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Expect an empty read before the first write.</strong> A single value reads its{" "}
                      <code>default</code>, or <code>null</code> without one. A <code>Map</code>'s <code>get(key)</code>{" "}
                      reads <code>undefined</code>, so guard it with <code>??</code>, as in{" "}
                      <code>(await this.registrations.get(ip)) ?? 0</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>첫 쓰기 전에는 빈 값이 나올 수 있습니다.</strong> 단일 값은 <code>default</code>를, 없으면{" "}
                      <code>null</code>을 읽습니다. <code>Map</code>의 <code>get(key)</code>는 <code>undefined</code>를
                      읽으므로 <code>(await this.registrations.get(ip)) ?? 0</code>처럼 <code>??</code>로 감쌉니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A memory belongs to the service that declares it.</strong> Two services that both declare{" "}
                      <code>latestArticleId</code> each keep their own value, and so does an adaptor.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>memory는 선언한 service의 것입니다.</strong> 두 service가 모두{" "}
                      <code>latestArticleId</code>를 선언해도 값은 각자 따로 가지며, 어댑터도 마찬가지입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Each Map entry expires on its own.</strong> The declared <code>ttl</code> or a write's{" "}
                      <code>expireAt</code> bounds that entry only, on SQLite and Redis alike.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>Map 항목은 각자 만료됩니다.</strong> 선언한 <code>ttl</code>이나 쓰기에 준{" "}
                      <code>expireAt</code>은 그 항목에만 걸리며, SQLite와 Redis 모두 같습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Local memory is per process.</strong> Each replica keeps its own{" "}
                      <code>localHitCount</code>, and it starts over after a restart.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>로컬 메모리는 프로세스마다 따로입니다.</strong> 레플리카마다 자기{" "}
                      <code>localHitCount</code>를 가지며, 재시작하면 처음부터 다시 셉니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="page-cache" title={l.trans({ en: "Page Cache", ko: "페이지 캐시" })}>
          <Docs.Title>{l.trans({ en: "Page Cache", ko: "페이지 캐시" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "In production the server keeps a rendered page for a few seconds and answers the next anonymous request for it from memory: the render worker keeps its RSC payload, the web server its HTML. A response says which in `X-Akan-Cache` (HIT, MISS or BYPASS, with `X-Akan-Cache-Reason`).",
                ko: "production에서 서버는 렌더한 페이지를 몇 초 동안 들고 있다가, 같은 페이지의 다음 익명 요청에 메모리에서 답합니다. 렌더 워커는 RSC payload를, 웹 서버는 HTML을 보관합니다. 응답의 `X-Akan-Cache`(HIT, MISS, BYPASS와 `X-Akan-Cache-Reason`)가 어느 쪽인지 알려 줍니다.",
              })}
            </div>
            <Docs.Table columns={pageCacheEnvColumns} rows={pageCacheEnvRows} stacked />
            <Docs.SubSubTitle>{l.trans({ en: "What the key holds", ko: "key에 들어가는 것" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The origin, the base path, the locale the URL resolved to, the path, the query and the theme cookie, plus a crawler flag for HTML. The browser's `Accept-Language` is not in it: visitors asking for one locale's page share its entry. A page that reads a request header or cookie with `headers()` or `cookies()` is rendered for each request and never stored.",
                ko: "origin, base path, URL이 가리키는 locale, 경로, 쿼리, theme 쿠키이고, HTML에는 크롤러 여부가 더해집니다. 브라우저의 `Accept-Language`는 들어가지 않으므로 같은 locale 페이지를 요청한 방문자는 한 항목을 함께 씁니다. `headers()`나 `cookies()`로 요청 헤더나 쿠키를 읽는 페이지는 요청마다 렌더하고 저장하지 않습니다.",
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "The query in the key", ko: "key 속의 쿼리" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The key takes the query sorted by name, without the tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid` and the like), as the URL standard parses it. A name given twice keeps its values in their order, and names are case-sensitive. These pairs share an entry:",
                ko: "key는 쿼리를 이름순으로 정렬하고 추적 파라미터(`utm_*`, `gclid`, `fbclid`, `msclkid` 등)를 뺀 뒤, URL 표준이 해석한 그대로 씁니다. 두 번 나온 이름은 값의 순서를 지키고, 이름은 대소문자를 구분합니다. 다음 쌍은 같은 항목을 씁니다:",
              })}
            </div>
            <Docs.Table columns={queryFormColumns} rows={queryFormRows} stacked />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The page still reads the full query.</strong> Its <code>.search()</code> values come from
                      the URL as requested, and <code>window.location</code> keeps every parameter. Only the URL the
                      server renders the page with is the sorted one, so a server render never sees a tracking parameter
                      it did not declare. A guard's <code>request.path</code>, <code>usePathCtx().location</code> and{" "}
                      <code>usePageLocation()</code> carry that URL too, the hooks until the first navigation, so the
                      browser hydrates what the server rendered.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>페이지는 여전히 쿼리 전체를 읽습니다.</strong> <code>.search()</code> 값은 요청된 URL에서
                      오고, <code>window.location</code>에는 모든 파라미터가 남습니다. 서버가 페이지를 렌더할 때 쓰는
                      URL만 정렬된 것이라, 서버 렌더는 선언하지 않은 추적 파라미터를 보지 못합니다. guard의{" "}
                      <code>request.path</code>, <code>usePathCtx().location</code>, <code>usePageLocation()</code>도 그
                      URL을 따르고, 두 hook은 첫 이동 전까지 그대로라 브라우저가 서버가 렌더한 값으로 hydrate합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Some pages keep the query as requested.</strong> A page or layout with{" "}
                      <code>.config({"{ canonicalQuery: false }"})</code>, one that declares a tracking parameter with{" "}
                      <code>.search("utm_source", String)</code>, and a legacy default-function page, which receives
                      every value, each keep one entry per query exactly as it was asked.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>요청 그대로의 쿼리를 쓰는 페이지도 있습니다.</strong>{" "}
                      <code>.config({"{ canonicalQuery: false }"})</code>를 둔 페이지나 layout,{" "}
                      <code>.search("utm_source", String)</code>처럼 추적 파라미터를 선언한 페이지, 모든 값을 받는 예전
                      default 함수 페이지는 요청된 쿼리마다 항목을 따로 둡니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>
              {l.trans({ en: "When a page has to render", ko: "페이지를 렌더해야 할 때" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A stored page is replayed at once. Every other page is rendered, and by default the render worker starts each render as it arrives. Two variables make it run a set number at a time and keep the rest in line:",
                ko: "저장된 페이지는 바로 재생합니다. 그 밖의 페이지는 렌더해야 하고, 기본으로 렌더 워커는 렌더가 오는 대로 시작합니다. 두 변수로 한 번에 정한 수만 실행하고 나머지는 줄을 세울 수 있습니다:",
              })}
            </div>
            <Docs.Table columns={pageCacheEnvColumns} rows={renderSlotEnvRows} stacked />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A page that awaits data holds its slot while it waits.</strong> Measured on this site's
                      production build with 32 requests at once, pages that wait 20–200 ms on data served 151 requests a
                      second with no cap, 95 with a cap of 16 and 32 with a cap of 4, while pages that only use the CPU
                      served about 105 at every cap. Set the cap to the number of requests one replica is sized to hold
                      at once, so it only bounds a burst past that, and go lower only for pages that render without
                      waiting on data.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>데이터를 기다리는 페이지는 기다리는 동안에도 slot을 쥡니다.</strong> 이 사이트의
                      production 빌드에 요청 32개를 한꺼번에 보내 측정하면, 데이터를 20–200ms 기다리는 페이지는 상한이
                      없을 때 초당 151개, 상한 16에서 95개, 상한 4에서 32개를 처리했고, CPU만 쓰는 페이지는 어느
                      상한에서나 약 105개를 처리했습니다. 상한은 replica 하나가 동시에 받도록 잡은 요청 수로 두어 그
                      수를 넘는 몰림만 막게 하고, 데이터를 기다리지 않고 렌더하는 페이지일 때만 더 낮추세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A full queue answers 503, and so does a long wait.</strong> A render past{" "}
                      <code>AKAN_RSC_WORKER_MAX_QUEUE</code>, or one that has waited as long as{" "}
                      <code>AKAN_IDLE_TIMEOUT</code> (120 s), gets <code>503</code> with <code>Retry-After: 1</code> and{" "}
                      <code>Cache-Control: no-store</code> before any of it renders: for a browser a page that reloads
                      itself once, waiting longer after each refusal in a row; <code>base.error.serverUnavailable</code>{" "}
                      JSON for a JSON caller.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>대기열이 가득 차면 503으로 답하고, 너무 오래 기다려도 그렇습니다.</strong>{" "}
                      <code>AKAN_RSC_WORKER_MAX_QUEUE</code>를 넘은 렌더와 <code>AKAN_IDLE_TIMEOUT</code>(120초)만큼
                      기다린 렌더는 렌더를 시작하기 전에 <code>Retry-After: 1</code>,{" "}
                      <code>Cache-Control: no-store</code>와 함께 <code>503</code>을 받습니다. 브라우저에는 한 번만
                      스스로 새로고침하고 거절이 이어질수록 더 오래 기다리는 페이지로, JSON 호출자에는{" "}
                      <code>base.error.serverUnavailable</code> JSON으로 답합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The queue is in the metrics.</strong> <code>akan_rsc_renders_in_flight</code>,{" "}
                      <code>akan_rsc_render_queue_depth</code>, <code>akan_rsc_render_queue_wait_seconds</code> and{" "}
                      <code>akan_rsc_render_refusals_total</code> report it per process, and a page that waited carries{" "}
                      <code>queueMs</code> on its request line. The cap counts per render worker, so per replica.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>대기열은 metrics에 나옵니다.</strong> <code>akan_rsc_renders_in_flight</code>,{" "}
                      <code>akan_rsc_render_queue_depth</code>, <code>akan_rsc_render_queue_wait_seconds</code>,{" "}
                      <code>akan_rsc_render_refusals_total</code>이 프로세스별로 알려 주고, 기다린 페이지는 요청 줄에{" "}
                      <code>queueMs</code>가 붙습니다. 상한은 렌더 워커마다, 곧 replica마다 따로 셉니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The cap bounds the renders admitted, not the ones abandoned.</strong> A slot comes back
                      when its client leaves, and after the page has held it as long as <code>AKAN_IDLE_TIMEOUT</code>{" "}
                      (120 s), so a page stuck on its data cannot keep every other page out. The page itself runs on
                      until its own <code>await</code> settles; <code>akan_rsc_renders_abandoned</code> counts those, so
                      give a page's data calls their own timeout.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>상한은 받아들인 렌더 수를 묶을 뿐, 버려진 렌더는 묶지 않습니다.</strong> 클라이언트가
                      떠나거나 페이지가 slot을 <code>AKAN_IDLE_TIMEOUT</code>(120초)만큼 쥐면 slot을 돌려받으므로,
                      데이터에 막힌 페이지가 다른 페이지를 모두 막지는 못합니다. 그 페이지 자체는 자기{" "}
                      <code>await</code>가 끝날 때까지 계속 실행되고 <code>akan_rsc_renders_abandoned</code>가 그 수를
                      세므로, 페이지의 데이터 호출에는 따로 timeout을 두세요.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="choose" title={l.trans({ en: "Which One?", ko: "무엇을 쓸까?" })}>
          <Docs.Title>{l.trans({ en: "Which One?", ko: "무엇을 쓸까?" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Pick by who owns the value and who needs to see it.",
                ko: "값의 주인이 누구인지, 누가 그 값을 봐야 하는지로 고릅니다.",
              })}
            </div>
            <Docs.Table columns={chooseColumns} rows={chooseRows} stacked />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Local memory only for what need not be shared.</strong> A value another replica must see
                      belongs in <code>memory()</code> or the document cache.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>로컬 메모리는 공유할 필요가 없는 값에만 씁니다.</strong> 다른 레플리카도 봐야 하는 값은{" "}
                      <code>memory()</code>나 document 캐시에 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Endpoint cache is for shared answers only.</strong> It works on a <code>query</code> with
                      no internal argument such as <code>.with(Self)</code>. The lookup runs after the guards, so a hit
                      reaches only a caller they admitted.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>Endpoint 캐시는 모두에게 같은 답에만 씁니다.</strong> <code>.with(Self)</code> 같은 내부
                      인자가 없는 <code>query</code>에서만 동작합니다. 캐시 조회는 guard 다음에 일어나므로, 캐시된 답은
                      guard를 통과한 호출자에게만 갑니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "팁" })}>
          <Docs.Title>{l.trans({ en: "Tips", ko: "팁" })}</Docs.Title>
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Start with a short TTL.</strong> Lengthen it once the behavior is stable.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>TTL은 짧게 시작하세요.</strong> 동작이 안정되면 그때 늘립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Give every value that should expire a lifetime.</strong> Declare <code>ttl</code> on the
                      memory or pass <code>expireAt</code> to the write; a value with neither stays until you delete it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>만료돼야 하는 값에는 수명을 주세요.</strong> memory에 <code>ttl</code>을 선언하거나 쓸 때{" "}
                      <code>expireAt</code>을 줍니다. 둘 다 없는 값은 지울 때까지 남습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep keys boring.</strong> A topic plus an id is usually enough.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>key는 단순하게.</strong> 보통 topic과 id면 충분합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Invalidate right after the write.</strong> Delete or refresh the cached copy as soon as
                      the source data changes.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>원본을 바꾼 직후 캐시를 정리하세요.</strong> 원본 데이터가 바뀌면 바로 캐시를 지우거나
                      갱신합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A cache is never the source of truth.</strong> It is only a fast copy that can vanish at
                      any time.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>캐시를 원본으로 믿지 마세요.</strong> 언제든 사라질 수 있는 빠른 복사본일 뿐입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 볼 문서" })}</Docs.SubSubTitle>
            <Docs.LinkGrid items={moreLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
