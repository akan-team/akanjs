import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
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
        en: "Reuses a query's whole answer for every caller for the milliseconds you declare.",
        ko: "query의 응답 전체를 선언한 밀리초 동안 모든 호출자에게 재사용합니다.",
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
      seen: l.trans({ en: "Every caller, one entry per argument set", ko: "모든 호출자, 인자 조합마다 하나" }),
    },
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
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
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
                  <code>database.modes</code>에 모드를 선언하고, 배포마다 <code>AKAN_DATABASE_MODE</code>로 그중 하나를
                  고릅니다. 어느 엔진이든 코드는 같습니다.
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
                  Every model class built with <code>into()</code> carries <code>this.&lt;model&gt;Cache</code>. Use it
                  when the cached value belongs to one record, such as a preview token or a verification code.
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
                    <strong>용도마다 topic 하나.</strong> <code>previewTokens</code>가 topic, article id가 key이고, 토큰
                    하나하나가 그 아래 필드이며 필드마다 만료가 따로 걸립니다. model 이름이 앞에 자동으로 붙으므로, 다른
                    model의 topic과 겹치지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Consume in one step.</strong> <code>hgetDel</code> reads the field and removes it at once,
                    so of two requests racing with one token only one gets it. A wrong token names a field that does not
                    exist and consumes nothing. A read followed by a separate delete would let both racing requests
                    through.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>한 번에 꺼내 씁니다.</strong> <code>hgetDel</code>은 필드를 읽는 일과 지우는 일을 한 번에
                    하므로, 같은 토큰으로 동시에 들어온 두 요청 중 하나만 통과합니다. 틀린 토큰은 없는 필드를 가리키므로
                    아무것도 소비하지 않습니다. 읽은 뒤 따로 지우면 동시에 온 두 요청이 모두 통과합니다.
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
                    <strong>값은 타입을 그대로 지닙니다.</strong> 숫자는 숫자로, 바이트는 바이트로 읽히며 SQLite와 Redis
                    모두 같습니다.
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
                  <strong>A class instance comes back as plain JSON.</strong> Objects and arrays are stored as JSON, so
                  a model read back has no methods and its dates are strings. For a model value, use a{" "}
                  <code>memory()</code> typed with the model instead.
                </span>
              ),
              ko: (
                <span>
                  <strong>class 인스턴스는 평범한 JSON으로 돌아옵니다.</strong> 객체와 배열은 JSON으로 저장되므로, 다시
                  읽은 model에는 메서드가 없고 날짜는 문자열입니다. model 값은 model로 타입을 준 <code>memory()</code>를
                  대신 씁니다.
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
                  <code>service()</code>, <code>plug()</code>와 나란히 선언하며, <code>adapt()</code> 어댑터에서도 쓸 수
                  있습니다.
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
                    <code>{"memory(Map, { of: cnst.OauthClient })"}</code> serializes through the constant; never encode
                    JSON into a <code>String</code> memory yourself.
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
                    <strong>memory는 선언한 service의 것입니다.</strong> 두 service가 모두 <code>latestArticleId</code>
                    를 선언해도 값은 각자 따로 가지며, 어댑터도 마찬가지입니다.
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
                    <strong>Local memory is per process.</strong> Each replica keeps its own <code>localHitCount</code>,
                    and it starts over after a restart.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>로컬 메모리는 프로세스마다 따로입니다.</strong> 레플리카마다 자기 <code>localHitCount</code>
                    를 가지며, 재시작하면 처음부터 다시 셉니다.
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
                    <strong>Endpoint cache is for shared answers only.</strong> It works on a <code>query</code> with no
                    internal argument such as <code>.with(Self)</code>. The lookup runs after the guards, so a hit
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
                    <strong>Invalidate right after the write.</strong> Delete or refresh the cached copy as soon as the
                    source data changes.
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
                    <strong>A cache is never the source of truth.</strong> It is only a fast copy that can vanish at any
                    time.
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
