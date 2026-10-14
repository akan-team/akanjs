import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const termRows = [
    {
      name: "server component",
      desc: l.trans({
        en: "Runs once on the server and arrives as HTML. None of its JavaScript reaches the browser.",
        ko: "서버에서 한 번 실행되어 HTML로 도착합니다. 이 컴포넌트의 JavaScript는 브라우저로 가지 않습니다.",
      }),
    },
    {
      name: "client component",
      desc: l.trans({
        en: 'A file that starts with "use client". It arrives as HTML, then again as JavaScript in the bundle.',
        ko: '첫 줄이 "use client"인 파일입니다. HTML로 한 번, 번들 속 JavaScript로 한 번 더 도착합니다.',
      }),
    },
    {
      name: "hydrate",
      desc: l.trans({
        en: "The browser re-runs a client component's JavaScript so the HTML on screen responds to input.",
        ko: "브라우저가 클라이언트 컴포넌트의 JavaScript를 다시 실행해, 화면의 HTML이 클릭과 입력에 반응하게 하는 일입니다.",
      }),
    },
    {
      name: "shell",
      desc: l.trans({
        en: "The first HTML the server sends. What the page awaited is in it; streamed sections follow.",
        ko: "서버가 가장 먼저 보내는 HTML입니다. page가 await한 것은 여기 들어가고, 스트리밍하는 섹션은 뒤따라옵니다.",
      }),
    },
    {
      name: "island",
      desc: l.trans({
        en: "One hydrated client component inside HTML the server rendered.",
        ko: "서버가 그린 HTML 속에서 hydrate되는 클라이언트 컴포넌트 하나입니다.",
      }),
    },
  ];

  const sideColumns = [
    { key: "server", label: l.trans({ en: "Server", ko: "서버" }) },
    { key: "client", label: l.trans({ en: "Client", ko: "클라이언트" }), caption: '"use client"' },
  ];
  const onClient = { server: false, client: true };
  const onServer = { server: true, client: false };

  const boundaryGroups = [
    {
      label: l.trans({ en: "The five that need the browser", ko: "브라우저가 꼭 필요한 다섯 가지" }),
      rows: [
        {
          name: "useState · useEffect",
          desc: l.trans({
            en: (
              <span>
                React runs hooks in the browser. <code>usePage()</code>, <code>getSelf()</code> and{" "}
                <code>useServer()</code> are the exceptions and work on the server.
              </span>
            ),
            ko: (
              <span>
                React는 hook을 브라우저에서 실행합니다. 예외로 <code>usePage()</code>, <code>getSelf()</code>,{" "}
                <code>useServer()</code>는 서버에서도 씁니다.
              </span>
            ),
          }),
          marks: onClient,
        },
        {
          name: "onClick · onChange",
          desc: l.trans({
            en: "An event handler has to be in the browser to catch the click, so its component goes there too.",
            ko: "이벤트 핸들러는 브라우저에서 클릭을 받아야 하므로, 그 컴포넌트도 브라우저로 갑니다.",
          }),
          marks: onClient,
        },
        {
          name: "st.use · st.do",
          desc: l.trans({
            en: (
              <span>
                The store lives only in the client bundle. Importing <code>st</code> means the file needs{" "}
                <code>{'"use client"'}</code>.
              </span>
            ),
            ko: (
              <span>
                store는 클라이언트 번들에만 있습니다. <code>st</code>를 import하면 그 파일에는{" "}
                <code>{'"use client"'}</code>가 필요합니다.
              </span>
            ),
          }),
          marks: onClient,
        },
        {
          name: "window · document · localStorage",
          desc: l.trans({
            en: (
              <span>
                Browser globals and APIs such as <code>matchMedia</code> and <code>WebSocket</code> do not exist on the
                server.
              </span>
            ),
            ko: (
              <span>
                브라우저 전역 객체와 <code>matchMedia</code>, <code>WebSocket</code> 같은 API는 서버에 없습니다.
              </span>
            ),
          }),
          marks: onClient,
        },
        {
          name: (
            <span className="font-sans">{l.trans({ en: "client-only package", ko: "클라이언트 전용 패키지" })}</span>
          ),
          desc: l.trans({
            en: "A map, editor or chart that touches the DOM when imported. Reach it through a lib re-export.",
            ko: "import하는 순간 DOM을 건드리는 지도, 에디터, 차트입니다. lib의 re-export를 거쳐 씁니다.",
          }),
          marks: onClient,
        },
      ],
    },
    {
      label: l.trans({ en: "Everything else is server work", ko: "나머지는 전부 서버의 일" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "markup and lists", ko: "마크업과 목록" })}</span>,
          desc: l.trans({
            en: "Cards drawn from an array are plain HTML with nothing to hydrate.",
            ko: "배열로 그린 카드 목록은 hydrate할 것이 없는 평범한 HTML입니다.",
          }),
          marks: onServer,
        },
        {
          name: "usePage · l · l.trans",
          desc: l.trans({
            en: (
              <span>
                Translation works on the server too, so localized text never needs <code>{'"use client"'}</code>.
              </span>
            ),
            ko: (
              <span>
                번역은 서버에서도 되므로, 다국어 문구 때문에 <code>{'"use client"'}</code>를 달 일은 없습니다.
              </span>
            ),
          }),
          marks: onServer,
        },
        {
          name: ".param · .search",
          desc: l.trans({
            en: "Route values arrive typed in the render callback before the first byte is sent.",
            ko: "route 값은 첫 바이트가 나가기 전에 타입이 맞춰져 render callback에 들어옵니다.",
          }),
          marks: onServer,
        },
        {
          name: "fetch.*",
          desc: l.trans({
            en: "Called in a route, it finishes before the first byte. From a mounted client it costs two extra round-trips.",
            ko: "route에서 부르면 첫 바이트 전에 끝납니다. 마운트된 클라이언트에서 부르면 왕복이 두 번 더 듭니다.",
          }),
          marks: onServer,
        },
        {
          name: "getSelf({ unauthorize })",
          desc: l.trans({
            en: (
              <span>
                Check sign-in in <code>_layout.tsx</code>, before any of the page's markup renders.
              </span>
            ),
            ko: (
              <span>
                로그인 확인은 페이지 마크업이 렌더링되기 전에 <code>_layout.tsx</code>에서 합니다.
              </span>
            ),
          }),
          marks: onServer,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "show / hide a panel", ko: "패널 열고 닫기" })}</span>,
          desc: l.trans({
            en: (
              <span>
                Usually server: a <code>data-*</code> attribute or <code>{"<details>"}</code> keeps both states
                server-rendered.
              </span>
            ),
            ko: (
              <span>
                대개 서버입니다. <code>data-*</code> 속성이나 <code>{"<details>"}</code>를 쓰면 열린 상태와 닫힌 상태
                모두 서버에서 그려집니다.
              </span>
            ),
          }),
          marks: onServer,
        },
      ],
    },
  ];

  const roleGroups = [
    {
      label: l.trans({ en: "Files that draw data", ko: "데이터를 그리는 파일" }),
      rows: [
        {
          name: "<Model>.Unit.tsx",
          desc: l.trans({
            en: "One row, card or tile. Takes the model as a prop and only draws it.",
            ko: "목록의 행, 카드, 타일 하나입니다. 모델을 prop으로 받아 그리기만 합니다.",
          }),
          marks: onServer,
        },
        {
          name: "<Model>.View.tsx",
          desc: l.trans({
            en: "The detail screen for one record. Takes the full model as a prop.",
            ko: "레코드 하나의 상세 화면입니다. full 모델을 prop으로 받습니다.",
          }),
          marks: onServer,
        },
      ],
    },
    {
      label: l.trans({ en: "Files that hold state or an action", ko: "상태나 동작을 가진 파일" }),
      rows: [
        {
          name: "<Model>.Zone.tsx",
          desc: l.trans({
            en: "Fills the store from an init or view prop and reads it. Holds almost no markup.",
            ko: "init이나 view prop으로 store를 채우고 읽습니다. 자체 마크업은 거의 없습니다.",
          }),
          marks: onClient,
        },
        {
          name: "<Model>.Template.tsx",
          desc: l.trans({
            en: "The form. Every field is bound to the store, so it holds no useState.",
            ko: "폼입니다. 모든 필드가 store에 묶여 있어 useState가 없습니다.",
          }),
          marks: onClient,
        },
        {
          name: "<Model>.Util.tsx",
          desc: l.trans({
            en: "One domain action as a control, such as Serve, Refund or Remove.",
            ko: "Serve, Refund, Remove 같은 도메인 동작 하나를 컨트롤로 만든 것입니다.",
          }),
          marks: onClient,
        },
      ],
    },
  ];

  const techniques = [
    {
      title: l.trans({ en: "Split compound components", ko: "복합 컴포넌트는 쪼개기" }),
      desc: l.trans({
        en: "Tab is four small client pieces: Tab, Tab.Menus, Tab.Menu and Tab.Panel. Panel bodies arrive as children, so they never enter the bundle. One client file with a mode useState and every panel inlined is the opposite.",
        ko: "Tab은 작은 클라이언트 조각 네 개(Tab, Tab.Menus, Tab.Menu, Tab.Panel)입니다. 패널 본문은 children으로 들어오므로 번들에 들어가지 않습니다. mode용 useState 하나에 모든 패널을 인라인한 클라이언트 파일 하나는 정반대입니다.",
      }),
      code: '<Tab.Panel menu="spec">…</Tab.Panel>',
    },
    {
      title: l.trans({ en: "Use named slots", ko: "이름 있는 슬롯 쓰기" }),
      desc: l.trans({
        en: "Layout.Navbar takes title, back, left, right and children. A client shell holds server content in five places instead of swallowing it.",
        ko: "Layout.Navbar는 title, back, left, right, children을 받습니다. 클라이언트 셸이 서버 콘텐츠를 삼키지 않고 다섯 자리에 끼워 넣습니다.",
      }),
      code: "<Layout.Navbar title={…} right={…}>",
    },
    {
      title: l.trans({ en: "Derive on the server", ko: "파생 계산은 서버에서" }),
      desc: l.trans({
        en: "Display and predicate logic goes on Light<Model>, which both sides hold. An enum-to-class lookup goes in a module-scope as const map.",
        ko: "표시와 판별 로직은 양쪽이 모두 가진 Light<Model>에 둡니다. enum에서 클래스를 찾는 표는 모듈 스코프의 as const 맵에 둡니다.",
      }),
      code: "order.isNew() · statusClass[order.status]",
    },
    {
      title: l.trans({ en: "Load heavy islands late", ko: "무거운 섬은 나중에 불러오기" }),
      desc: l.trans({
        en: "A map, editor or chart sits behind a ui/<Folder>/index_.tsx and lazy() pair, with a server-safe index.tsx beside it. Merging the pair into one file breaks RSC.",
        ko: "지도, 에디터, 차트는 ui/<Folder>/index_.tsx와 lazy() 쌍 뒤에 두고, 옆에 서버에서 안전한 index.tsx를 둡니다. 이 쌍을 한 파일로 합치면 RSC가 깨집니다.",
      }),
      code: "ui/Map/index_.tsx + lazy()",
    },
  ];

  const ssrRuleRows = [
    {
      name: "unnecessary-use-client",
      desc: (
        <>
          <div>
            {l.trans({
              en: 'The file starts with "use client" but uses none of the five features.',
              ko: '파일이 "use client"로 시작하지만 다섯 가지 기능을 하나도 쓰지 않습니다.',
            })}
          </div>
          <div className="font-medium text-foreground">
            → {l.trans({ en: "Delete that first line.", ko: "그 첫 줄을 지웁니다." })}
          </div>
        </>
      ),
    },
    {
      name: "client-static-component",
      desc: (
        <>
          <div>
            {l.trans({
              en: "A component in a client file draws four or more elements with no client feature.",
              ko: "클라이언트 파일 안의 컴포넌트가 클라이언트 기능 없이 엘리먼트를 4개 이상 그립니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            →{" "}
            {l.trans({
              en: 'Move it to a file without "use client".',
              ko: '"use client"가 없는 파일로 옮깁니다.',
            })}
          </div>
        </>
      ),
    },
    {
      name: "client-static-markup",
      desc: (
        <>
          <div>
            {l.trans({
              en: "Ten or more elements wrap only one or two client features.",
              ko: "엘리먼트 10개 이상이 클라이언트 기능 한두 개를 감싸고 있습니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            →{" "}
            {l.trans({
              en: "Keep only the interactive leaf client and pass the rest in as children.",
              ko: "인터랙션 부분만 클라이언트로 남기고, 나머지는 children으로 넘깁니다.",
            })}
          </div>
        </>
      ),
    },
    {
      name: "client-mount-load",
      desc: (
        <>
          <div>
            {l.trans({
              en: "A useEffect(…, []) loads server data after the page mounts.",
              ko: "useEffect(…, [])가 화면이 마운트된 뒤에 서버 데이터를 불러옵니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            →{" "}
            {l.trans({
              en: "Fetch it in the route and pass it down as an init prop.",
              ko: "route에서 fetch하고 init prop으로 넘깁니다.",
            })}
          </div>
        </>
      ),
    },
    {
      name: "module-missing-server-view",
      desc: (
        <>
          <div>
            {l.trans({
              en: "A module draws only from Template, Zone and Util, with no Unit or View.",
              ko: "모듈이 Template, Zone, Util로만 그리고 Unit이나 View가 없습니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            →{" "}
            {l.trans({
              en: "Add a Unit or View and let the Zone hand its rows to it.",
              ko: "Unit이나 View를 추가하고, Zone이 행을 거기에 넘기게 합니다.",
            })}
          </div>
        </>
      ),
    },
    {
      name: "template-client-state",
      desc: (
        <>
          <div>
            {l.trans({
              en: "A Template keeps form state in useState instead of the store.",
              ko: "Template이 폼 상태를 store가 아니라 useState에 둡니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            → {l.trans({ en: "Bind each field to the store:", ko: "각 필드를 store에 묶습니다:" })}
          </div>
        </>
      ),
      example: "value={xForm.field} onChange={st.do.setFieldOnX}",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="ui-overview" title={l.trans({ en: "UI Architecture", ko: "UI 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "UI Architecture", ko: "UI 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Every component in an Akan app runs in one of two places. A server component runs once on the server and reaches the browser as finished HTML. A client component — a file that starts with "use client" — reaches the browser as HTML too, but then its JavaScript follows, and the browser runs it again before its buttons and inputs work.',
              ko: 'Akan 앱의 컴포넌트는 두 곳 중 한 곳에서 실행됩니다. 서버 컴포넌트는 서버에서 한 번 실행되고, 완성된 HTML로 브라우저에 도착합니다. 클라이언트 컴포넌트, 즉 첫 줄이 "use client"인 파일도 HTML로 먼저 도착하지만, 그 뒤에 JavaScript가 따라가고 브라우저가 그것을 한 번 더 실행해야 버튼과 입력이 동작합니다.',
            })}
          </div>
          <div>
            {l.trans({
              en: 'This page is about deciding which of the two each piece of a screen should be. The mistake it exists to prevent looks like this: one button in a file needs an onClick, so "use client" goes on top. The file is two hundred lines of product markup and one handler, and now all two hundred lines ship twice.',
              ko: '이 페이지는 화면의 각 조각을 둘 중 어디에 둘지 정하는 법을 다룹니다. 막으려는 실수는 이런 모습입니다. 파일 안의 버튼 하나에 onClick이 필요해서 맨 위에 "use client"를 답니다. 그 파일은 상품 마크업 200줄에 핸들러 하나인데, 이제 200줄 전체가 두 번 전송됩니다.',
            })}
          </div>
          <Docs.Figure
            title={l.trans({ en: "A client file ships twice", ko: "클라이언트 파일은 두 번 전송됩니다" })}
            image="client-ships-twice"
            prompt={`
              On the left, one tall folded-corner page labelled "OrderPanel.tsx" with a smaller second line
              "use client", filled with many short lines of text and, near its bottom, one small button outline. On
              the right, one browser window labelled "Browser". Two long straight arrows run from the page to the
              browser, one above the other with clear space between them: the upper arrow is black and labelled
              "HTML"; the lower arrow is traced as the red accent and labelled "JavaScript". Nothing else.
            `}
            alt={l.trans({
              en: "A file marked use client travels to the browser twice: once as HTML the user can already read, and again as JavaScript the browser must download and re-run before the one button in it works.",
              ko: "use client가 붙은 파일은 브라우저로 두 번 갑니다. 한 번은 사용자가 바로 읽을 수 있는 HTML로, 또 한 번은 그 안의 버튼 하나가 동작하기 전에 브라우저가 내려받아 다시 실행해야 하는 JavaScript로 갑니다.",
            })}
          />
          <div>
            {l.trans({
              en: 'That is why Akan is SSR-first. Server is the default, and "use client" is a cost you justify for each component rather than a habit. The good news is that the line is mostly mechanical: the sections below show which features need the browser, how domain files decide for you, and how to measure where your app stands.',
              ko: '그래서 Akan은 SSR(서버 렌더링)이 기본입니다. 기본값은 서버이고, "use client"는 습관처럼 다는 것이 아니라 컴포넌트마다 이유가 있어야 하는 비용입니다. 다행히 그 선은 대부분 기계적으로 정해집니다. 아래 섹션에서 어떤 기능이 브라우저를 필요로 하는지, 도메인 파일은 어떻게 알아서 정해지는지, 지금 내 앱이 어디쯤인지 재는 법을 차례로 봅니다.',
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <code>akan quality ssr</code> prints each app's and lib's server render share: the portion of JSX
                  elements rendered on the server. <strong>50% is the floor</strong>, and a falling share is a
                  regression. If a change moves markup to the client, say why, or move it back.
                </span>
              ),
              ko: (
                <span>
                  <code>akan quality ssr</code>은 app과 lib마다 server render share, 즉 전체 JSX 엘리먼트 중 서버에서
                  그려진 비율을 출력합니다. <strong>50%가 하한선</strong>이고, 비율이 떨어지면 회귀입니다. 어떤 변경이
                  마크업을 클라이언트로 옮겼다면 이유를 밝히거나, 되돌리세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="server-side-rendering"
        title={l.trans({ en: "How A Page Reaches The Browser", ko: "페이지가 브라우저에 닿는 경로" })}
      >
        <Docs.Title>
          {l.trans({ en: "How A Page Reaches The Browser", ko: "페이지가 브라우저에 닿는 경로" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Server-side rendering means the server builds the first HTML before the browser has loaded the app. A customer can already read the order list, the prices and the policy text while the filter and the submit button are still on their way.",
              ko: "서버사이드 렌더링은 브라우저가 앱을 다 불러오기 전에 서버가 첫 HTML을 먼저 만들어 보내는 방식입니다. 필터와 제출 버튼이 아직 오는 중이어도 고객은 주문 목록과 가격과 정책 문구를 이미 읽을 수 있습니다.",
            })}
          </div>
          <Docs.Sequence
            title={l.trans({ en: "One request, end to end", ko: "요청 하나의 전 구간" })}
            actors={{
              user: { label: l.trans({ en: "User", ko: "사용자" }), tone: "muted" },
              browser: { label: l.trans({ en: "Browser", ko: "브라우저" }) },
              route: { label: "page().render()" },
              fetch: { label: l.trans({ en: "fetch.init and fetch.view", ko: "fetch.init과 fetch.view" }) },
              server: { label: l.trans({ en: "Akan server", ko: "Akan 서버" }) },
            }}
            messages={[
              { from: "user", to: "browser", label: "opens /en/icecreamOrder" },
              { from: "browser", to: "route", label: l.trans({ en: "request", ko: "요청" }) },
              { from: "route", to: "fetch", label: "fetch.initIcecreamOrderInPublic()" },
              { from: "fetch", to: "server", label: l.trans({ en: "slice query", ko: "slice 쿼리" }) },
              { from: "server", to: "fetch", label: l.trans({ en: "init payload", ko: "init payload" }), dashed: true },
              {
                from: "route",
                to: "browser",
                dashed: true,
                label: l.trans({
                  en: "shell HTML, server components already rendered",
                  ko: "shell HTML, server component는 이미 렌더됨",
                }),
                note: l.trans({
                  en: "the user can read the page here",
                  ko: "여기서 사용자가 페이지를 읽을 수 있습니다",
                }),
              },
              {
                from: "route",
                to: "browser",
                dashed: true,
                label: l.trans({
                  en: "each section streams in as its own promise lands",
                  ko: "promise가 도착하는 대로 섹션이 스트리밍됩니다",
                }),
              },
              {
                from: "browser",
                to: "browser",
                label: l.trans({ en: "hydrate the client islands only", ko: "client island만 hydrate" }),
                note: l.trans({ en: "the user can now type and click", ko: "이제 입력과 클릭이 가능합니다" }),
              },
            ]}
            emphasis={["route"]}
          />
          <div>
            {l.trans({
              en: "Reading and interacting do not have to start at the same moment, so it helps to think of them as two separate clocks:",
              ko: "읽기와 조작이 같은 순간에 시작될 필요는 없습니다. 그래서 둘을 서로 다른 시계로 나눠 생각하면 이해가 쉽습니다:",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">Time to View</div>
              <div className="mb-2 text-foreground/50 text-xs">
                {l.trans({ en: "When the page becomes readable", ko: "읽을 수 있게 되는 시점" })}
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "How soon the user can read something meaningful: titles, sizes, prices, the first rows. Server rendering is what moves this.",
                  ko: "사용자가 제목, 사이즈, 가격, 첫 행처럼 의미 있는 내용을 얼마나 빨리 읽는가입니다. 이 값을 당기는 것이 서버 렌더링입니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">Time to Interaction</div>
              <div className="mb-2 text-foreground/50 text-xs">
                {l.trans({ en: "When the page responds to input", ko: "조작할 수 있게 되는 시점" })}
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "How soon the user can type, click or filter. Only hydrated islands move this, and every element you keep on the server makes them smaller.",
                  ko: "사용자가 얼마나 빨리 입력하고, 클릭하고, 필터링하는가입니다. 이 값은 hydrate되는 섬만 움직이고, 서버에 남기는 엘리먼트마다 섬이 작아집니다.",
                })}
              </div>
            </div>
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "Send the shell first, stream the rest", ko: "셸을 먼저 보내고, 나머지는 스트리밍" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A page does not have to wait for every query before it sends anything. fetch.init<Model><Suffix>, fetch.view<Model> and fetch.edit<Model> can be used in two ways, and the choice decides where the data lands:",
              ko: "page는 모든 query를 다 기다린 뒤에야 무언가를 보낼 필요가 없습니다. fetch.init<Model><Suffix>, fetch.view<Model>, fetch.edit<Model>은 두 가지 방법으로 쓸 수 있고, 어느 쪽을 고르느냐에 따라 데이터가 들어가는 자리가 달라집니다:",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "await — part of the shell", ko: "await — 셸에 넣기" })}
              </div>
              <code className={chip}>await fetch.initXInY(id)</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "The shell waits for the data, so it is in the first HTML. SEO snapshots, prerendering and pre-hydration E2E read exactly this. Use it for what the page needs immediately.",
                  ko: "셸이 데이터를 기다리므로 첫 HTML에 들어갑니다. SEO 스냅샷, prerendering, hydration 이전 E2E가 읽는 것이 바로 이 셸입니다. 페이지에 당장 필요한 것에 씁니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "destructure — streamed", ko: "구조 분해 — 스트리밍" })}
              </div>
              <code className={chip}>{"const { xInitInY } = fetch.initXInY(id)"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "You get one promise per field, with the queries already running. The shell goes out at once, and each section fills in when its own promise lands. Use it for the rest.",
                  ko: "query는 이미 출발한 채로 field마다 promise 하나씩을 받습니다. 셸은 바로 나가고, 각 섹션은 자기 promise가 도착하는 대로 채워집니다. 나머지 전부에 씁니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: "In the page below, the heading goes out right away and the order list streams in behind it:",
              ko: "아래 page에서 제목은 바로 나가고, 주문 목록은 그 뒤를 따라 스트리밍됩니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/page/(public)/icecreamOrder/_index.tsx"
            code={`import { fetch, IcecreamOrder, usePage } from "@apps/koyo/client";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = fetch.initIcecreamOrderInPublic();
  return (
    <div className="p-4">
      <h1 className="font-bold text-2xl">{l("icecreamOrder.modelName")}</h1>
      <IcecreamOrder.Zone.Card init={icecreamOrderInitInPublic} />
    </div>
  );
});`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "The heading is server markup. It is already on the wire while the slice query is still running.",
                ko: "제목(h1)은 서버 마크업입니다. slice query가 아직 도는 동안 이미 전송됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "The Zone is the only part that hydrates. It receives the unawaited promise, not the data, so nothing above it waits.",
                ko: "Zone은 트리에서 유일하게 hydrate되는 부분입니다. 데이터가 아니라 await하지 않은 promise를 받으므로, 그 위의 어떤 것도 기다리지 않습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "A promise that no Zone consumes goes to a Load.Stream instead. The UI Composition page covers it.",
                ko: "Zone이 받지 않는 promise는 대신 Load.Stream으로 보냅니다. UI 구성 문서에서 다룹니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="client-boundary"
        title={l.trans({ en: "What Earns A Client Component", ko: "클라이언트 컴포넌트는 꼭 필요할때만" })}
      >
        <Docs.Title>
          {l.trans({ en: "What Earns A Client Component", ko: "클라이언트 컴포넌트는 꼭 필요할때만" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Only five kinds of feature actually need the browser. A component that uses none of them belongs on the server, even when it sits right next to one that does. akan quality ssr applies this same list when it checks whether a "use client" was needed.',
              ko: '브라우저가 꼭 있어야 하는 기능은 다섯 가지뿐입니다. 컴포넌트가 그중 아무것도 쓰지 않으면, 바로 옆에 그런 컴포넌트가 붙어 있더라도 서버에 둡니다. akan quality ssr도 "use client"가 필요했는지 따질 때 이 목록을 그대로 씁니다.',
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "What the code uses", ko: "코드가 쓰는 것" })}
            columns={sideColumns}
            groups={boundaryGroups}
            markLabel={l.trans({ en: "Belongs here", ko: "여기에 둡니다" })}
            emptyLabel={l.trans({ en: "Not here", ko: "여기가 아닙니다" })}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>Wrap the interaction, not the UI.</strong> Only the feature crosses to the client, never the
                  markup around it. The smallest useful client component adds one behaviour and renders its{" "}
                  <code>children</code> untouched, so everything inside stays server markup. Splitting One Screen below
                  walks through one.
                </span>
              ),
              ko: (
                <span>
                  <strong>UI가 아니라 인터랙션을 감싸세요.</strong> 클라이언트로 넘어가는 것은 기능뿐이고, 그 둘레의
                  마크업은 넘어가지 않습니다. 가장 작은 클라이언트 컴포넌트는 동작 하나만 더하고 <code>children</code>은
                  그대로 그립니다. 그러면 그 안은 전부 서버 마크업으로 남습니다. 아래 "한 화면을 나누기"에서 예를 하나
                  따라가 봅니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="file-roles"
        title={l.trans({ en: "In Domain UI The Rule Is Mechanical", ko: "도메인 UI에서 규칙은 기계적입니다" })}
      >
        <Docs.Title>
          {l.trans({ en: "In Domain UI The Rule Is Mechanical", ko: "도메인 UI에서 규칙은 기계적입니다" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Inside a domain module you never make the call above yourself: the file name makes it. Template, Zone and Util always start with "use client"; Unit and View never do. If a file\'s role and its first line disagree, one of the two is wrong.',
              ko: '도메인 모듈 안에서는 위의 판단을 직접 할 필요가 없습니다. 파일 이름이 정해 줍니다. Template, Zone, Util은 항상 첫 줄이 "use client"이고, Unit과 View에는 절대 없습니다. 파일의 역할과 첫 줄이 어긋나면 둘 중 하나가 잘못된 것입니다.',
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "File", ko: "파일" })}
            columns={sideColumns}
            groups={roleGroups}
            markLabel={l.trans({ en: "Runs here", ko: "여기서 실행" })}
            emptyLabel={l.trans({ en: "Never here", ko: "여기서는 실행하지 않음" })}
          />

          <Docs.SubSubTitle>
            {l.trans({ en: "A Zone and a Unit working together", ko: "Zone과 Unit이 함께 일하는 모습" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Here is the pair the rule produces. The Zone is client for one reason only: it fills the store from init. It draws no markup of its own and hands every row to a Unit:",
              ko: "규칙이 만들어 내는 한 쌍입니다. Zone이 클라이언트인 이유는 init으로 store를 채우기 때문, 하나뿐입니다. 자기 마크업은 그리지 않고 모든 행을 Unit에 맡깁니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
            code={`"use client";
import { IcecreamOrder, type cnst } from "@apps/koyo/client";
import type { ClientInit } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"icecreamOrder", cnst.LightIcecreamOrder>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(icecreamOrder) => (
        <IcecreamOrder.Unit.Card key={icecreamOrder.id} icecreamOrder={icecreamOrder} />
      )}
    />
  );
};`}
          />
          <div>
            {l.trans({
              en: 'The Unit takes the model as a prop and draws it. No "use client", no st, nothing to hydrate. A hundred rows on screen still cost the bundle one component: the Zone.',
              ko: 'Unit은 모델을 prop으로 받아 그리기만 합니다. "use client"도, st도, hydrate할 것도 없습니다. 화면에 행이 100개여도 번들이 치르는 비용은 컴포넌트 하나, Zone뿐입니다.',
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
            code={`import type { cnst } from "@apps/koyo/client";
import type { ModelProps } from "akanjs/client";
import { Link } from "akanjs/ui";

export const Card = ({ icecreamOrder, href }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
  return (
    <Link href={href} className="flex w-full rounded-lg shadow-sm hover:shadow-lg">
      <div>{icecreamOrder.size}</div>
      <div>{icecreamOrder.status}</div>
    </Link>
  );
};`}
          />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>Never pass a model instance to a Zone or Util.</strong> Both are always client components, so
                  a <code>cnst.IcecreamOrder</code> prop is a class the server would have to hand across the boundary.
                  Take <code>icecreamOrderId: string</code> and read the model from the store.
                </span>
              ),
              ko: (
                <span>
                  <strong>Zone과 Util에는 모델 인스턴스를 prop으로 넘기지 않습니다.</strong> 둘 다 언제나 클라이언트
                  컴포넌트이므로 <code>cnst.IcecreamOrder</code> prop은 서버가 경계 너머로 넘겨야 하는 클래스가 됩니다.
                  대신 <code>icecreamOrderId: string</code>을 받고 모델은 store에서 읽습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="splitting-a-screen" title={l.trans({ en: "Splitting One Screen", ko: "한 화면을 나누기" })}>
        <Docs.Title>{l.trans({ en: "Splitting One Screen", ko: "한 화면을 나누기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Outside a domain module (an app shell, a marketing section, a dashboard) you place the boundary yourself. Push it down until it sits on the smallest piece that actually needs the browser, and leave everything above and inside it as server markup.",
              ko: "도메인 모듈 밖(앱 셸, 마케팅 섹션, 대시보드)에서는 경계를 직접 놓습니다. 실제로 브라우저가 필요한 가장 작은 조각까지 경계를 밀어 내리고, 그 위와 그 안은 서버 마크업으로 남겨 두세요.",
            })}
          </div>
          <Docs.Figure
            title={l.trans({
              en: "One client leaf, server markup all around",
              ko: "클라이언트 잎 하나, 둘레는 모두 서버 마크업",
            })}
            image="client-leaf"
            prompt={`
              One browser window drawn large. Inside it, one large card labelled "Receipt" at its top, holding four
              short text lines and one row labelled "Total". In the card's bottom right corner, a small button whose
              outline is traced as the red accent, labelled "Copy Button" with a smaller second line "use client";
              inside the button a small black clipboard icon. A tall bracket runs down the left side of the card,
              labelled "Server Markup".
            `}
            alt={l.trans({
              en: "In a receipt card, only the small copy button is a client component; the card, its lines, the total, and even the icon inside the button stay server markup.",
              ko: "영수증 카드에서 클라이언트 컴포넌트는 작은 복사 버튼 하나뿐입니다. 카드, 줄들, 합계, 심지어 버튼 안의 아이콘까지 서버 마크업으로 남습니다.",
            })}
          />

          <Docs.SubSubTitle>
            {l.trans({ en: "The copy button, in code", ko: "복사 버튼을 코드로 보면" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The client part is a file this small. It adds one behaviour, copying on click, and renders its children untouched:",
              ko: "클라이언트 부분은 이 정도로 작은 파일입니다. 클릭하면 복사하는 동작 하나만 더하고, children은 손대지 않고 그대로 그립니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/ui/CopyOrderId.tsx"
            code={`"use client";
import type { ReactNode } from "react";

interface CopyOrderIdProps {
  className?: string;
  orderId: string;
  children: ReactNode;
}
export const CopyOrderId = ({ className, orderId, children }: CopyOrderIdProps) => {
  return (
    <button type="button" className={className} onClick={() => void navigator.clipboard.writeText(orderId)}>
      {children}
    </button>
  );
};`}
          />
          <div>
            {l.trans({
              en: "The page around it stays a server component. The receipt, its lines and even the button's label are written in the page and passed in as children, so they stay server markup however large they grow:",
              ko: "그 둘레의 page는 서버 컴포넌트로 남습니다. 영수증과 각 줄, 심지어 버튼의 라벨까지 page에서 쓰고 children으로 넘기므로, 아무리 커져도 서버 마크업입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/page/(public)/icecreamOrder/[icecreamOrderId]/_index.tsx"
            code={`import { fetch, usePage } from "@apps/koyo/client";
import { CopyOrderId } from "@apps/koyo/ui";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("icecreamOrderId", ID)
  .render(async ({ icecreamOrderId }) => {
    const { l } = usePage();
    const [{ icecreamOrder }] = await Promise.all([fetch.viewIcecreamOrder(icecreamOrderId)]);
    return (
      <section className="rounded-lg border p-4">
        <h2 className="font-bold text-lg">{l("icecreamOrder.modelName")}</h2>
        <div>{icecreamOrder.size}</div>
        <div>{icecreamOrder.status}</div>
        <CopyOrderId className="mt-2 text-sm" orderId={icecreamOrder.id}>
          {l.trans({ en: "Copy order ID", ko: "주문 번호 복사" })}
        </CopyOrderId>
      </section>
    );
  });`}
          />
          <div>
            {l.trans({
              en: "That is the whole client cost of a copy button: one handler and one children pass-through.",
              ko: "복사 버튼의 클라이언트 비용은 이것이 전부입니다. 핸들러 하나와 children 전달 하나입니다.",
            })}
          </div>

          <Docs.SubSubTitle>
            {l.trans({
              en: "Four more ways to keep markup on the server",
              ko: "마크업을 서버에 남기는 방법 네 가지 더",
            })}
          </Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {techniques.map((technique) => (
              <div key={technique.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="mb-1 font-semibold text-primary">{technique.title}</div>
                <div className="text-foreground/70 text-sm">{technique.desc}</div>
                <code className={chip}>{technique.code}</code>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="quality-ssr" title={l.trans({ en: "Measuring The Split", ko: "경계를 측정하기" })}>
        <Docs.Title>{l.trans({ en: "Measuring The Split", ko: "경계를 측정하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "None of this is a matter of taste, so it is measured rather than argued about in review. akan quality ssr counts the JSX elements on each side and reports, per app and lib, the share kept on the server, plus the six findings below.",
              ko: "이 중 어느 것도 취향의 문제가 아니므로, 리뷰에서 다투지 않고 측정합니다. akan quality ssr은 양쪽의 JSX 엘리먼트를 세어 app과 lib마다 서버에 남긴 비율을 보고하고, 아래 여섯 가지 finding을 함께 알려 줍니다.",
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "It reads the .tsx files under ui/ and lib/ of every app and lib.",
                ko: "각 app과 lib의 ui/, lib/ 아래 .tsx 파일을 읽습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "page/ and webkit/ are not counted, so moving markup into a route neither raises nor lowers the number.",
                ko: "page/와 webkit/은 세지 않습니다. 그래서 마크업을 route로 옮겨도 수치는 오르지도 내리지도 않습니다.",
              })}
            </li>
          </ul>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`$ akan quality ssr

Akan SSR Balance Scan
scanned files: 827
ssr warnings: 14

Server render share (component files, JSX elements rendered per side):

  apps/koyo: 43% server (163 of 381 JSX elements, 218 client)  <- below the 50% target
  libs/shared: 62% server (460 of 742 JSX elements, 282 client)

Warnings:

apps/koyo/ui/OrderPanel.tsx:189:1 - warning akan.ssr.client-static-markup: Client component
"OrderPanel" renders 16 JSX elements around only 1 client-only touch (onClick). Most of this
subtree does not need the client bundle.
  fix: Keep the interactive element in the client component and hoist the static subtree into a
  server component, then accept it as \`children\` or render it through a Unit/View reference.`}
          />
          <div>
            {l.trans({
              en: "Every finding is named akan.ssr.<rule>. Here is what each rule means and how to fix it:",
              ko: "모든 finding의 이름은 akan.ssr.<규칙>입니다. 규칙마다 뜻과 고치는 법은 다음과 같습니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Rule", ko: "규칙" })}
            descLabel={l.trans({ en: "Meaning → fix", ko: "뜻 → 고치는 법" })}
            items={ssrRuleRows}
          />

          <Docs.SubSubTitle>{l.trans({ en: "What is not flagged", ko: "일부러 잡지 않는 것" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: 'A client-only third-party package and an index_.tsx lazy() boundary. Both are legitimate reasons for "use client".',
                ko: '클라이언트 전용 서드파티 패키지와 index_.tsx의 lazy() 경계. 둘 다 "use client"의 정당한 이유입니다.',
              })}
            </li>
            <li>
              {l.trans({
                en: 'A Zone, Template or Util inside a module. Its role requires "use client" even when today\'s body does not use it.',
                ko: '모듈 안의 Zone, Template, Util. 오늘의 본문이 클라이언트 기능을 쓰지 않더라도 역할 자체가 "use client"를 요구합니다.',
              })}
            </li>
            <li>
              {l.trans({
                en: "A fetch started by the user, such as a lookup inside onClick. The server could not have done it in advance; only loads at mount time are findings.",
                ko: "사용자가 시작한 fetch, 예를 들어 onClick 안의 조회. 서버가 미리 할 수 없었던 일입니다. finding은 마운트 시점의 로드뿐입니다.",
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "Run it before and after any change that touches a .tsx file, and use --format json to wire it into CI.",
              ko: ".tsx를 건드리는 변경 전후로 실행하고, CI에 걸 때는 --format json을 씁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "With the boundary settled, the next page covers what fills each side of it: the akanjs/ui shells that render a list, a detail view and a form without a hand-written loading state, and the generated helpers underneath them.",
              ko: "경계가 정리되었으니, 다음 문서는 그 양쪽을 무엇이 채우는지 다룹니다. 로딩 상태를 직접 쓰지 않고도 목록, 상세, 폼을 그려 주는 akanjs/ui 셸들과, 그 아래의 생성된 helper들입니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
