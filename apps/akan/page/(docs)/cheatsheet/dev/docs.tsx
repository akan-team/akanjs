import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, PingTester, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const stepList = "my-4 list-decimal space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const required = l.trans({ en: "required", ko: "필수" });

  const termRows = [
    {
      name: "signal",
      desc: l.trans({
        en: "The file that declares a module's endpoints. One signal becomes one API document.",
        ko: "모듈의 엔드포인트를 선언하는 파일입니다. signal 하나가 API 문서 한 장이 됩니다.",
      }),
    },
    {
      name: "fetch",
      desc: l.trans({
        en: "Your app's typed API client from `@apps/<app>/client`. The explorer reads endpoints from it.",
        ko: "`@apps/<app>/client`에서 가져오는 앱의 API 클라이언트입니다. 탐색기는 여기서 엔드포인트를 읽습니다.",
      }),
    },
    {
      name: "guard",
      desc: l.trans({
        en: "A class that decides who may call an endpoint, such as `Public`, `User` or `Admin`.",
        ko: "누가 엔드포인트를 호출할 수 있는지 정하는 클래스입니다. `Public`, `User`, `Admin` 같은 것이 있습니다.",
      }),
    },
    {
      name: "JWT",
      desc: l.trans({
        en: "A sign-in token. Paste one to call guarded endpoints as that account.",
        ko: "로그인 토큰입니다. 붙여넣으면 가드가 걸린 엔드포인트를 그 계정으로 호출할 수 있습니다.",
      }),
    },
    {
      name: ["pubsub", "message"],
      desc: l.trans({
        en: "The two WebSocket kinds: a subscription the server pushes to, and a message answered on a listener.",
        ko: "WebSocket 엔드포인트의 두 종류입니다. 서버가 밀어 주는 구독과, 답이 리스너로 돌아오는 메시지입니다.",
      }),
    },
  ];

  const sectionCards = [
    {
      title: l.trans({ en: "Summary", ko: "요약" }),
      desc: l.trans({
        en: "Counts of all endpoints, REST, WebSocket, and those published as MCP tools.",
        ko: "전체 엔드포인트, REST, WebSocket, MCP 툴로 공개된 엔드포인트의 개수입니다.",
      }),
      code: "Endpoints · REST API · Web Socket · MCP Tools",
    },
    {
      title: l.trans({ en: "Toolbar", ko: "도구 모음" }),
      desc: l.trans({
        en: "Shows the Base URL and sets the guard filter, the JWT and an endpoint search.",
        ko: "Base URL을 보여 주고, 가드 필터와 JWT, 엔드포인트 검색을 설정합니다.",
      }),
      code: "Signal.Doc.Setting",
    },
    {
      title: "REST API",
      desc: l.trans({
        en: "Every query and mutation, generated CRUD and slice reads included. Each row has Reference and Try it.",
        ko: "모든 query와 mutation을, 자동 생성된 CRUD와 slice 조회까지 포함해 보여 줍니다. 행마다 Reference와 Try it이 있습니다.",
      }),
      code: "GET · POST",
    },
    {
      title: "Web Socket",
      desc: l.trans({
        en: "A pubsub row subscribes and shows frames as they land. A message row listens and sends.",
        ko: "pubsub 행은 구독해서 도착하는 프레임을 바로 보여 줍니다. message 행은 Listen으로 답을 기다리고 Send로 보냅니다.",
      }),
      code: "Subscribe · Listen · Send",
    },
  ];

  const zonePropRows = [
    {
      key: "refName",
      type: "string",
      tags: [required],
      desc: l.trans({
        en: "The signal to document: `base`, or a module name such as `product`.",
        ko: "문서로 만들 signal입니다. `base`나 `product` 같은 모듈 이름을 넣습니다.",
      }),
    },
    {
      key: "fetch",
      type: "FetchProxy",
      tags: [l.trans({ en: "optional", ko: "선택" })],
      desc: l.trans({
        en: "Defaults to the app's own `fetch`. A signal it does not mount shows as unregistered.",
        ko: "기본값은 앱 자신의 `fetch`입니다. 마운트되지 않은 signal은 등록되지 않았다고 나옵니다.",
      }),
    },
    {
      key: "openAll",
      type: "boolean",
      tags: [l.trans({ en: "optional", ko: "선택" })],
      desc: l.trans({
        en: "Opens every endpoint row. Leave it off for a signal with many endpoints.",
        ko: "모든 엔드포인트 행을 펼칩니다. 엔드포인트가 많은 signal에서는 빼 두세요.",
      }),
    },
  ];

  const partRows = [
    {
      name: "Signal.Doc.Zone",
      desc: l.trans({
        en: "One signal's whole document: summary, toolbar, REST and WebSocket lists.",
        ko: "signal 하나의 문서 전체입니다. 요약, 도구 모음, REST와 WebSocket 목록이 들어 있습니다.",
      }),
    },
    {
      name: "Signal.Doc.Explorer",
      desc: l.trans({
        en: "Every mounted signal in a sidebar, each mounted on first open. Scope with `include`, `exclude`, `libs`, `groupBy`.",
        ko: "마운트된 signal 전체를 사이드바에 두고 처음 열 때 마운트합니다. `include`, `exclude`, `libs`, `groupBy`로 범위를 정합니다.",
      }),
    },
    {
      name: "Signal.Doc.Setting",
      desc: l.trans({
        en: "The toolbar alone. Pass `search` and `onSearch` to add the search box.",
        ko: "도구 모음만 따로 그립니다. `search`와 `onSearch`를 넘기면 검색창이 붙습니다.",
      }),
    },
    {
      name: "Signal.Doc.DocSignals",
      desc: l.trans({
        en: "Every signal the app mounts, one collapsible row each, with REST endpoints only.",
        ko: "앱이 마운트한 모든 signal을 접이식 행 하나씩으로 보여 주며, REST 엔드포인트만 나옵니다.",
      }),
    },
    {
      name: "Signal.RestApi.Endpoints",
      desc: l.trans({
        en: "One signal's REST endpoints, or only those named in `endpoints`. The `ping` demo below uses it.",
        ko: "signal 하나의 REST 엔드포인트, 또는 `endpoints`에 적은 것만 보여 줍니다. 아래 `ping` 실습이 이것입니다.",
      }),
    },
  ];

  const rowPartRows = [
    {
      name: ["GET", "POST"],
      desc: l.trans({
        en: "The method badge: GET for a query, POST for a mutation.",
        ko: "메서드 배지입니다. query는 GET, mutation은 POST로 표시됩니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "guard badges", ko: "가드 배지" })}</span>,
      desc: l.trans({
        en: "The guards the endpoint declares. An endpoint with none shows no badge.",
        ko: "엔드포인트가 선언한 가드입니다. 가드가 없으면 배지도 없습니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "MCP badge", ko: "MCP 배지" })}</span>,
      desc: l.trans({
        en: "Whether agents can call it as an MCP tool. A refused row says why underneath.",
        ko: "에이전트가 MCP 툴로 호출할 수 있는지 알려 줍니다. 거부된 행은 그 아래에 이유가 나옵니다.",
      }),
    },
    {
      name: "Reference",
      desc: l.trans({
        en: "The arguments (path, query, body, form data), the return type and an example response.",
        ko: "인자(path, query, body, form data), 반환 타입, 응답 예시를 보여 줍니다.",
      }),
    },
    {
      name: "Try it",
      desc: l.trans({
        en: "Inputs filled with example values, the request path to copy, and a Send Request button.",
        ko: "예시 값이 채워진 입력칸, 복사할 수 있는 요청 경로, Send Request 버튼이 있습니다.",
      }),
    },
  ];

  const baseEndpoints = [
    {
      endpoint: "ping",
      kind: "query · GET",
      tryIt: l.trans({ en: 'No arguments. Returns `"ping"`.', ko: '인자가 없습니다. `"ping"`을 돌려줍니다.' }),
    },
    {
      endpoint: "pingParam",
      kind: "query · GET",
      tryIt: l.trans({
        en: "Takes a path parameter `id` and returns `pingParam: <id>`.",
        ko: "path 파라미터 `id`를 받아 `pingParam: <id>`를 돌려줍니다.",
      }),
    },
    {
      endpoint: "pingQuery",
      kind: "query · GET",
      tryIt: l.trans({
        en: "Takes a query-string `id` and returns `pingQuery: <id>`.",
        ko: "쿼리 문자열 `id`를 받아 `pingQuery: <id>`를 돌려줍니다.",
      }),
    },
    {
      endpoint: "pingBody",
      kind: "mutation · POST",
      tryIt: l.trans({
        en: "Takes a body field `data` and returns `pingBody: <data>`.",
        ko: "body 필드 `data`를 받아 `pingBody: <data>`를 돌려줍니다.",
      }),
    },
    {
      endpoint: "wsPing",
      kind: "message",
      tryIt: l.trans({
        en: "Press Listen, then Send. The reply `wsPing: <data>` appears in the stream.",
        ko: "Listen을 누른 뒤 Send를 누르면 `wsPing: <data>` 답이 스트림에 나타납니다.",
      }),
    },
    {
      endpoint: "pubsubPing",
      kind: "pubsub",
      tryIt: l.trans({
        en: "A room to try Subscribe and Unsubscribe on.",
        ko: "Subscribe와 Unsubscribe를 눌러 볼 수 있는 room입니다.",
      }),
    },
  ];
  const baseRows = baseEndpoints.map(({ endpoint, kind, tryIt }) => ({
    endpoint: (
      <span>
        {endpoint} <span className="ml-1.5 font-normal text-foreground/50">{kind}</span>
      </span>
    ),
    tryIt,
  }));

  const toolbarRows = [
    {
      name: "Base URL",
      desc: l.trans({
        en: "The server the explorer calls. Click it to copy.",
        ko: "탐색기가 호출하는 서버입니다. 누르면 복사됩니다.",
      }),
    },
    {
      name: "Guards",
      desc: l.trans({
        en: "Filters by any of the guards your signals declare. A guardless endpoint counts as `Public`.",
        ko: "signal이 선언한 가드 중 고른 것으로 행을 거릅니다. 가드가 없는 엔드포인트는 `Public`으로 칩니다.",
      }),
    },
    {
      name: "Auth",
      desc: l.trans({
        en: "Reads Anonymous or Authorized, and opens the JWT window.",
        ko: "Anonymous 또는 Authorized로 표시되며, 누르면 JWT 입력 창이 열립니다.",
      }),
    },
    {
      name: "Search endpoints",
      desc: l.trans({
        en: "Filters the rows by endpoint name or path.",
        ko: "엔드포인트 이름이나 경로로 행을 거릅니다.",
      }),
    },
  ];

  const relatedLinks = [
    {
      href: "/references/ui/system#Signal",
      title: l.trans({ en: "Signal Components", ko: "Signal 컴포넌트" }),
      desc: l.trans({
        en: "Every Signal part and its members.",
        ko: "Signal 부품과 멤버 전체 목록입니다.",
      }),
    },
    {
      href: "/cheatsheet/interface/mcp",
      title: l.trans({ en: "MCP Server", ko: "MCP 서버" }),
      desc: l.trans({
        en: "Why an endpoint is published to agents or refused.",
        ko: "엔드포인트가 에이전트에게 공개되거나 거부되는 이유를 다룹니다.",
      }),
    },
    {
      href: "/cheatsheet/general/auth",
      title: l.trans({ en: "Authorization", ko: "인증과 권한" }),
      desc: l.trans({
        en: "The guards an endpoint can declare.",
        ko: "엔드포인트에 달 수 있는 가드를 다룹니다.",
      }),
    },
    {
      href: "/cheatsheet/dev/test",
      title: l.trans({ en: "Testing", ko: "테스트" }),
      desc: l.trans({
        en: "Automated tests for your signals.",
        ko: "signal을 자동으로 검증하는 테스트를 다룹니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "API Documentation", ko: "API 문서" })}>
        <Docs.Title>{l.trans({ en: "API Documentation", ko: "API 문서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Akan turns your app's <code>fetch</code> into an API explorer: every endpoint of a signal with its
                  arguments, guards and return type. It is not just a list, because you can call each endpoint from the
                  same screen.
                </span>
              ),
              ko: (
                <span>
                  Akan은 앱의 <code>fetch</code>로 API 탐색기를 그립니다. signal의 모든 엔드포인트와 인자, 가드, 반환
                  타입이 나옵니다. 같은 화면에서 엔드포인트를 바로 호출할 수 있으니 단순한 목록이 아닙니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>
            {l.trans({ en: "What one document shows", ko: "문서 한 장에 담기는 것" })}
          </Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {sectionCards.map(({ title, desc, code }) => (
              <div key={code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{title}</div>
                <div className="mt-1 text-foreground/70 text-sm">{desc}</div>
                <code className={chip}>{code}</code>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="zone" title={l.trans({ en: "Render A Zone", ko: "Zone으로 문서 띄우기" })}>
        <Docs.Title>{l.trans({ en: "Render A Zone", ko: "Zone으로 문서 띄우기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Put the explorer on an admin or developer-only page. Start with the <code>base</code> signal: every
                  app has it, and its ping endpoints are simple.
                </span>
              ),
              ko: (
                <span>
                  탐색기는 관리자나 개발자만 보는 페이지에 둡니다. 첫 대상으로는 <code>base</code> signal이 좋습니다.
                  모든 앱에 들어 있고 ping 엔드포인트가 단순합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/(admin)/api/_index.tsx"
          code={`import { page } from "akanjs/client";
import { Signal } from "akanjs/ui";

export default page()
  .config({ devOnly: true })
  .render(() => <Signal.Doc.Zone refName="base" openAll />);`}
        />
        <Docs.Description>
          <Docs.OptionTable items={zonePropRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The route stays a server page.</strong> Each <code>Signal.Doc</code> member is its own
                    client boundary, so no wrapper is needed and only the explorer ships as JavaScript.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>route는 서버 페이지로 남습니다.</strong> <code>Signal.Doc</code>의 멤버마다 클라이언트
                    경계가 따로 있어 래퍼가 필요 없고, JavaScript로 가는 것은 탐색기뿐입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>devOnly: true</code> keeps it out of production.
                    </strong>{" "}
                    The route serves under <code>akan start</code>, and <code>akan build</code> leaves it out. For an
                    admin tool in production, remove it and limit the route to admins instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>devOnly: true</code>는 프로덕션에서 이 route를 뺍니다.
                    </strong>{" "}
                    <code>akan start</code>에서는 열리고 <code>akan build</code> 결과에는 들어가지 않습니다. 프로덕션의
                    관리자 도구로 쓸 거라면 이 옵션을 지우고 route를 관리자만 볼 수 있게 막으세요.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Other parts", ko: "다른 부품" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Signal.Doc.Zone</code> is the usual choice. Reach for a smaller part when you need only a piece
                  of it:
                </span>
              ),
              ko: (
                <span>
                  보통은 <code>Signal.Doc.Zone</code>이면 충분합니다. 일부만 필요할 때는 더 작은 부품을 씁니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Component", ko: "컴포넌트" })} items={partRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="try-api" title={l.trans({ en: "Try An Endpoint", ko: "엔드포인트 직접 호출하기" })}>
        <Docs.Title>{l.trans({ en: "Try An Endpoint", ko: "엔드포인트 직접 호출하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Below is the real <code>ping</code> row from the <code>base</code> document, calling this docs server.
                  It returns the string <code>"ping"</code>.
                </span>
              ),
              ko: (
                <span>
                  아래는 <code>base</code> 문서의 실제 <code>ping</code> 행이며, 이 문서 사이트의 서버를 호출합니다.{" "}
                  <code>"ping"</code>이라는 문자열을 돌려줍니다.
                </span>
              ),
            })}
          </div>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    Press <strong>Try it</strong> in the row.
                  </span>
                ),
                ko: (
                  <span>
                    행에서 <strong>Try it</strong>을 누릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Press <strong>Send Request</strong>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Send Request</strong>를 누릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Check that the response pane shows <code>"ping"</code>.
                  </span>
                ),
                ko: (
                  <span>
                    응답 칸에 <code>"ping"</code>이 나오는지 확인합니다.
                  </span>
                ),
              })}
            </li>
          </ol>
        </Docs.Description>
        <PingTester />
        <Docs.Description>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>ping</code> shows MCP refused on purpose.
                  </strong>{" "}
                  It declares no guards, and MCP publishes only endpoints whose guards say who may call them.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>ping</code>에 MCP refused가 뜨는 것은 정상입니다.
                  </strong>{" "}
                  가드를 선언하지 않았고, MCP는 누가 호출할 수 있는지 가드로 밝힌 엔드포인트만 공개합니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Reading a row", ko: "행 읽는 법" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Part", ko: "구성 요소" })} items={rowPartRows} />
          <Docs.SubSubTitle>
            {l.trans({ en: "The rest of the base signal", ko: "base signal의 다른 엔드포인트" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>base</code> has one simple endpoint of each kind. Render its whole document to try them all:
                </span>
              ),
              ko: (
                <span>
                  <code>base</code>에는 종류별로 단순한 엔드포인트가 하나씩 있습니다. 문서 전체를 띄우면 모두 눌러 볼 수
                  있습니다:
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "endpoint", label: l.trans({ en: "Endpoint · Kind", ko: "엔드포인트 · 종류" }), code: true },
              { key: "tryIt", label: l.trans({ en: "What to try", ko: "해 볼 것" }) },
            ]}
            rows={baseRows}
            stacked
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="auth" title={l.trans({ en: "Auth And Guards", ko: "인증과 가드" })}>
        <Docs.Title>{l.trans({ en: "Auth And Guards", ko: "인증과 가드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An endpoint behind a guard such as <code>User</code> or <code>Admin</code> needs a signed-in caller.
                  Paste a JWT once, and every REST request you send from Try it carries it.
                </span>
              ),
              ko: (
                <span>
                  <code>User</code>나 <code>Admin</code> 같은 가드가 걸린 엔드포인트는 로그인한 호출자가 필요합니다.
                  JWT를 한 번 붙여넣으면 Try it에서 보내는 모든 REST 요청에 그 토큰이 실립니다.
                </span>
              ),
            })}
          </div>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    Press <strong>Anonymous</strong> in the toolbar's Auth field.
                  </span>
                ),
                ko: (
                  <span>
                    도구 모음의 Auth 칸에서 <strong>Anonymous</strong>를 누릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Paste a token into <strong>Bearer token</strong>. <strong>Account decoded</strong> below it shows
                    the account inside, so you can check which roles you are testing with.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Bearer token</strong>에 토큰을 붙여넣습니다. 아래 <strong>Account decoded</strong>에 토큰 속
                    계정 정보가 나오니, 어떤 role로 테스트하는지 확인하세요.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Press <strong>Set Authorization</strong>. The button now reads <strong>Authorized</strong>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Set Authorization</strong>을 누르면 버튼이 <strong>Authorized</strong>로 바뀝니다.
                  </span>
                ),
              })}
            </li>
          </ol>
          <Docs.SubSubTitle>{l.trans({ en: "The toolbar", ko: "도구 모음" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Field", ko: "항목" })} items={toolbarRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The server checks the signature.</strong> The window only reads the token's payload; the
                    signature is checked when you send.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>서명은 서버가 확인합니다.</strong> 이 창은 토큰의 payload를 읽기만 하고, 서명 검증은 요청을
                    보낼 때 서버가 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One setting for the whole screen.</strong> The guard filter and the JWT live in the store,
                    so every endpoint list and every Try it request on the page follows them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>설정은 화면 전체에 하나입니다.</strong> 가드 필터와 JWT는 store에 있으므로, 화면의 모든
                    엔드포인트 목록과 Try it 요청이 같은 값을 따릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>REST only.</strong> WebSocket tries run on the page's own socket connection, not with the
                    pasted token.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>REST에만 쓰입니다.</strong> WebSocket 실습은 붙여넣은 토큰이 아니라 페이지 자신의 소켓
                    연결로 동작합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>The JWT is for developer testing only.</strong> Paste a test account's token, not a real
                  user's.
                </span>
              ),
              ko: (
                <span>
                  <strong>JWT는 개발자 테스트용으로만 씁니다.</strong> 실제 사용자의 토큰이 아니라 테스트 계정의 토큰을
                  붙여넣으세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Show it to developers or admins only.</strong> <code>devOnly: true</code> on the route is
                    the simplest way.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>API 문서는 개발자나 관리자에게만 보여 주세요.</strong> route에 <code>devOnly: true</code>를
                    다는 것이 가장 간단합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Start small.</strong> Try <code>base</code> or a small module before documenting a large
                    domain.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>작게 시작하세요.</strong> 큰 도메인을 문서화하기 전에 <code>base</code>나 작은 모듈로 먼저
                    익히세요.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Manual checks, not tests.</strong> Use the explorer for a quick look; it does not replace
                    automated tests.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>수동 점검용이지 테스트가 아닙니다.</strong> 빠르게 확인할 때 쓰고, 자동 테스트를 대신하지는
                    않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 읽기" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
