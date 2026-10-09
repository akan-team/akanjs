import { usePage } from "@apps/akan/client";
import { Divider, Docs, DocsToc, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const termRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "app shell", ko: "앱 셸" })}</span>,
      desc: l.trans({
        en: "The frame every page renders inside, holding the theme, fonts, locale, toasts and socket.",
        ko: "모든 페이지가 그 안에서 그려지는 틀로, 테마, 폰트, 언어, 토스트, 소켓 연결을 맡습니다.",
      }),
    },
    {
      name: "Suspense",
      desc: l.trans({
        en: "A React boundary that shows a fallback until the content inside it is ready.",
        ko: "안쪽 내용이 준비될 때까지 대신 보여 줄 fallback을 그리는 React 경계입니다.",
      }),
    },
    {
      name: <span className="font-sans">serialized signal</span>,
      desc: l.trans({
        en: "Every endpoint with its arguments, guards and return model, shipped as `fetch.serializedSignal`.",
        ko: "endpoint 전부와 그 인자, guard, 반환 모델을 담은 정보로, `fetch.serializedSignal`로 전달됩니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "agent tool", ko: "에이전트 툴" })}</span>,
      desc: l.trans({
        en: "An action a control publishes so the in-page agent can do what the user's click does.",
        ko: "컨트롤이 공개하는 동작으로, 인페이지 에이전트가 사용자의 클릭과 같은 일을 할 수 있게 합니다.",
      }),
    },
  ];

  const pickColumns = [
    { key: "auto", label: l.trans({ en: "Auto", ko: "자동" }) },
    {
      key: "server",
      label: l.trans({ en: "Server", ko: "서버" }),
      caption: l.trans({ en: 'no "use client"', ko: '"use client" 없이' }),
    },
    { key: "agent", label: l.trans({ en: "Tool", ko: "툴" }), caption: "st.tool" },
  ];

  const pickGroups = [
    {
      label: l.trans({ en: "App shell", ko: "앱 셸" }),
      rows: [
        {
          name: "System.Provider",
          desc: l.trans({
            en: (
              <span>
                The app frame Akan wraps around your root <code>_layout.tsx</code>.
              </span>
            ),
            ko: (
              <span>
                Akan이 root <code>_layout.tsx</code>를 감싸는 앱 프레임입니다.
              </span>
            ),
          }),
          marks: { auto: true, server: true, agent: false },
        },
        {
          name: "System.Reconnect",
          desc: l.trans({
            en: (
              <span>
                The connection-lost overlay <code>Provider</code> mounts after <code>.reconnect()</code>.
              </span>
            ),
            ko: (
              <span>
                <code>.reconnect()</code>를 켜면 <code>Provider</code>가 마운트하는 연결 끊김 오버레이입니다.
              </span>
            ),
          }),
          marks: { auto: true, server: true, agent: false },
        },
      ],
    },
    {
      label: l.trans({ en: "Controls you place", ko: "직접 놓는 컨트롤" }),
      rows: [
        {
          name: "System.ThemeToggle",
          desc: l.trans({
            en: "Switches the color theme and publishes `applyTheme`.",
            ko: "색 테마를 바꾸고 `applyTheme` 툴을 공개합니다.",
          }),
          marks: { auto: false, server: true, agent: true },
        },
        {
          name: "System.SelectLanguage",
          desc: l.trans({
            en: "Switches the URL's language and publishes `setLanguage`.",
            ko: "URL의 언어를 바꾸고 `setLanguage` 툴을 공개합니다.",
          }),
          marks: { auto: false, server: true, agent: true },
        },
        {
          name: "System.DevModeToggle",
          desc: l.trans({
            en: "Turns developer-only UI on and off.",
            ko: "개발자 전용 UI를 켜고 끕니다.",
          }),
          marks: { auto: false, server: true, agent: false },
        },
        {
          name: "Tab",
          desc: l.trans({
            en: (
              <span>
                Tabs whose panels stay on the server, published as a tool only with a <code>namespace</code>.
              </span>
            ),
            ko: (
              <span>
                패널이 서버에 남는 탭으로, <code>namespace</code>가 있을 때만 툴을 공개합니다.
              </span>
            ),
          }),
          marks: { auto: false, server: true, agent: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Developer tools and primitives", ko: "개발 도구와 기본 부품" }),
      rows: [
        {
          name: "Signal.*",
          desc: l.trans({
            en: "The API explorer, for an admin or docs screen.",
            ko: "API 탐색기입니다. 관리자나 문서 화면에 둡니다.",
          }),
          marks: { auto: false, server: false, agent: false },
        },
        {
          name: "ClientSide",
          desc: l.trans({
            en: (
              <span>
                A <code>Suspense</code> boundary with a <code>loading</code> fallback.
              </span>
            ),
            ko: (
              <span>
                <code>loading</code> fallback을 가진 <code>Suspense</code> 경계입니다.
              </span>
            ),
          }),
          marks: { auto: false, server: true, agent: false },
        },
        {
          name: "animated",
          desc: l.trans({
            en: "react-spring's animated `div`, `g` and `progress`.",
            ko: "react-spring으로 움직이는 `div`, `g`, `progress`입니다.",
          }),
          marks: { auto: false, server: false, agent: false },
        },
      ],
    },
  ];

  const relatedLinks = [
    {
      href: "/docs/core/routing#root-layout-exports",
      title: l.trans({ en: "Root Layout Stages", ko: "Root Layout 단계" }),
      desc: l.trans({
        en: (
          <span>
            <code>.theme()</code>, <code>.fonts()</code>, <code>.reconnect()</code> and the rest that fill{" "}
            <code>System.Provider</code>.
          </span>
        ),
        ko: (
          <span>
            <code>System.Provider</code>를 채우는 <code>.theme()</code>, <code>.fonts()</code>,{" "}
            <code>.reconnect()</code> 같은 단계입니다.
          </span>
        ),
      }),
    },
    {
      href: "/references/ui/customize#slots",
      title: l.trans({ en: "Override Slots", ko: "오버라이드 슬롯" }),
      desc: l.trans({
        en: (
          <span>
            Restyle the toast stack through the <code>Toast</code> and <code>ToastItem</code> slots.
          </span>
        ),
        ko: (
          <span>
            <code>Toast</code>, <code>ToastItem</code> 슬롯으로 토스트 모양을 바꿉니다.
          </span>
        ),
      }),
    },
    {
      href: "/cheatsheet/dev/constants",
      title: l.trans({ en: "Constant Schema Docs", ko: "Constant 스키마 문서" }),
      desc: l.trans({
        en: (
          <span>
            <code>Constant.Doc</code>, the model explorer that sits beside <code>Signal</code>.
          </span>
        ),
        ko: (
          <span>
            <code>Signal</code> 옆에 두는 모델 탐색기 <code>Constant.Doc</code>을 다룹니다.
          </span>
        ),
      }),
    },
    {
      href: "/docs/arch/agentic",
      title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
      desc: l.trans({
        en: "How the tools a control publishes let the agent drive the screen.",
        ko: "컨트롤이 공개한 툴로 에이전트가 화면을 다루는 방식을 설명합니다.",
      }),
    },
  ];

  const components: UiComponentReference[] = [
    {
      name: "System",
      desc: l.trans({
        en: "The app shell. Akan mounts `Provider` for you, and `Provider` mounts `Reconnect` when you turn it on. `ThemeToggle`, `SelectLanguage` and `DevModeToggle` are controls you place yourself.",
        ko: "앱 셸입니다. `Provider`는 Akan이 대신 마운트하고, `Reconnect`는 켜 두면 `Provider`가 마운트합니다. `ThemeToggle`, `SelectLanguage`, `DevModeToggle`은 직접 배치하는 컨트롤입니다.",
      }),
      props: [
        {
          name: "System.Provider",
          type: "{ appName, params, of, children, className?, env?, theme?, prefix?, manifest?, head?, fonts?, layoutStyle?, reconnect?, wsConnect?, dictionary?, allDictionary? }",
          desc: l.trans({
            en: "The frame around your root `_layout.tsx`, filled from its `rootLayout()` stages.",
            ko: "root `_layout.tsx`를 감싸는 앱 프레임으로, 값은 `rootLayout()` 단계에서 정합니다.",
          }),
        },
        {
          name: "System.Root",
          type: "{ st, children }",
          desc: l.trans({
            en: "Deprecated: it renders `children` and ignores `st`, so render the children directly.",
            ko: "지원이 중단되었고 `st`는 무시한 채 `children`만 그리므로, 자식을 바로 렌더하면 됩니다.",
          }),
        },
        {
          name: "System.ThemeToggle",
          type: "{ themes?: string[] }",
          desc: l.trans({
            en: "Sets `data-theme` to one of `themes`: a switch for two, a dropdown for three or more.",
            ko: "`data-theme`을 `themes` 중 하나로 바꾸며, 두 개면 스위치, 셋 이상이면 드롭다운으로 그립니다.",
          }),
        },
        {
          name: "System.SelectLanguage",
          type: "{ className?, languages?: string[] }",
          desc: l.trans({
            en: "A dropdown that swaps the `/:lang` segment of the current URL and keeps the rest.",
            ko: "현재 URL에서 `/:lang` 구간만 바꾸고 나머지 경로와 쿼리는 그대로 두는 드롭다운입니다.",
          }),
        },
        {
          name: "System.Reconnect",
          type: "{}",
          desc: l.trans({
            en: "When the socket drops and a ping fails, it covers the screen, then reloads once reconnected.",
            ko: "소켓이 끊기고 서버 ping도 실패하면 화면을 덮고, 다시 연결되면 페이지를 새로고침합니다.",
          }),
        },
        {
          name: "System.DevModeToggle",
          type: "{}",
          desc: l.trans({
            en: "A switch for the store's `devMode` flag, kept in `localStorage` across reloads.",
            ko: "store의 `devMode` 플래그를 켜고 끄는 스위치로, 값이 `localStorage`에 남아 새로고침해도 유지됩니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Set the frame from the root layout.</strong> <code>.theme()</code>, <code>.fonts()</code>,{" "}
              <code>.manifest()</code>, <code>.layoutStyle()</code>, <code>.reconnect()</code> and{" "}
              <code>.wsConnect()</code> become <code>Provider</code>'s props, and <code>env</code> comes from{" "}
              <code>env/env.client.ts</code>.
            </span>
          ),
          ko: (
            <span>
              <strong>프레임은 root layout에서 정합니다.</strong> <code>.theme()</code>, <code>.fonts()</code>,{" "}
              <code>.manifest()</code>, <code>.layoutStyle()</code>, <code>.reconnect()</code>,{" "}
              <code>.wsConnect()</code>가 <code>Provider</code>의 prop이 되고, <code>env</code>는{" "}
              <code>env/env.client.ts</code>에서 옵니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>
                <code>Reconnect</code> is a local-development aid.
              </strong>{" "}
              It stays off until the root layout calls <code>.reconnect()</code>, and it renders only when{" "}
              <code>AKAN_PUBLIC_ENV</code> is <code>local</code>.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>Reconnect</code>는 로컬 개발용입니다.
              </strong>{" "}
              root layout에서 <code>.reconnect()</code>를 호출해야 켜지고, <code>AKAN_PUBLIC_ENV</code>가{" "}
              <code>local</code>일 때만 화면에 나타납니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>
                <code>ThemeToggle</code> needs at least two themes.
              </strong>{" "}
              With <code>themes</code> left out or holding one entry it renders nothing. The choice is kept in the{" "}
              <code>theme</code> cookie.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>ThemeToggle</code>에는 테마가 두 개 이상 필요합니다.
              </strong>{" "}
              <code>themes</code>를 빼거나 하나만 넘기면 아무것도 그리지 않습니다. 고른 테마는 <code>theme</code> 쿠키에
              남습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>
                <code>languages</code> defaults to the app's locales.
              </strong>{" "}
              A code the app does not serve is dropped from the menu, because choosing it would lead to a 404.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>languages</code>의 기본값은 앱의 locale 목록입니다.
              </strong>{" "}
              앱이 서비스하지 않는 언어 코드는 메뉴에서 빠집니다. 고르면 404로 가기 때문입니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>
                <code>devMode</code> is what developer-only UI reads.
              </strong>{" "}
              Admin screens check it before showing developer affordances, and <code>Only.Dev</code> from{" "}
              <code>@libs/shared/ui</code> renders its children only while it is on.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>devMode</code>는 개발자 전용 UI가 읽는 값입니다.
              </strong>{" "}
              관리자 화면은 이 값을 보고 개발자용 기능을 보여 줄지 정하고, <code>@libs/shared/ui</code>의{" "}
              <code>Only.Dev</code>는 이 값이 켜져 있을 때만 자식을 그립니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>The toast stack is not a member on purpose.</strong> <code>Provider</code> mounts it and keeps the{" "}
              <code>msg.*</code> wiring, the store read, the body-level portal and the dismiss timers. That is why the
              override slots are the surface, <code>Toast</code> and <code>ToastItem</code>, not the part that decides
              when a toast appears and goes away.
            </span>
          ),
          ko: (
            <span>
              <strong>토스트 묶음은 일부러 멤버에서 뺐습니다.</strong> <code>Provider</code>가 마운트하며,{" "}
              <code>msg.*</code> 연결, store 읽기, body 수준 portal, 자동 닫힘 타이머를 스스로 가집니다. 그래서
              오버라이드 슬롯은 토스트가 언제 뜨고 사라질지 정하는 부분이 아니라 겉모습인 <code>Toast</code>와{" "}
              <code>ToastItem</code>입니다.
            </span>
          ),
        }),
      ],
      code: `import { System } from "akanjs/ui";

export const AppSettings = () => {
  return (
    <div className="flex items-center gap-4">
      <System.SelectLanguage languages={["en", "ko"]} />
      <System.ThemeToggle themes={["light", "dark"]} />
    </div>
  );
};`,
    },
    {
      name: "ClientSide",
      desc: l.trans({
        en: "A small React `Suspense` boundary. It shows `loading` while anything inside it suspends, such as a `lazy()` component still fetching its chunk.",
        ko: "작은 React `Suspense` 경계입니다. 안쪽 내용이 suspend되는 동안 `loading`을 보여 줍니다. 아직 chunk를 받는 중인 `lazy()` 컴포넌트가 대표적입니다.",
      }),
      props: [
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({
            en: "The content that may suspend.",
            ko: "suspend될 수 있는 내용입니다.",
          }),
        },
        {
          name: "loading",
          type: "ReactNode",
          desc: l.trans({
            en: "The fallback shown meanwhile; nothing is shown when it is left out.",
            ko: "그동안 보여 줄 fallback이며, 빼면 아무것도 보이지 않습니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>It does not make its children client-only.</strong> It is a plain <code>Suspense</code> with no{" "}
              <code>{'"use client"'}</code>, so children that can render on the server still do.
            </span>
          ),
          ko: (
            <span>
              <strong>자식을 클라이언트 전용으로 만들지는 않습니다.</strong> <code>{'"use client"'}</code> 없는 평범한{" "}
              <code>Suspense</code>라서, 서버에서 그릴 수 있는 자식은 그대로 서버에서 그려집니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>
                In the example, <code>StoreMap</code> is a <code>lazy()</code> export.
              </strong>{" "}
              It comes from a <code>ui/StoreMap/index_.tsx</code> boundary, so <code>loading</code> covers the chunk
              download.
            </span>
          ),
          ko: (
            <span>
              <strong>
                예시의 <code>StoreMap</code>은 <code>lazy()</code>로 내보낸 컴포넌트입니다.
              </strong>{" "}
              <code>ui/StoreMap/index_.tsx</code> 경계에서 오므로, chunk를 받는 동안 <code>loading</code>이 대신
              보입니다.
            </span>
          ),
        }),
      ],
      code: `import { ClientSide, Loading } from "akanjs/ui";
import { StoreMap } from "./StoreMap";

export const StoreLocation = () => {
  return (
    <ClientSide loading={<Loading.Skeleton className="h-64 w-full" />}>
      <StoreMap />
    </ClientSide>
  );
};`,
    },
    {
      name: "Signal",
      desc: l.trans({
        en: "The API explorer, split into parts. It reads the serialized signal the server ships with the app — every endpoint, its arguments, guards and return model — and renders a document you can also call endpoints from.",
        ko: "API 탐색기를 부품으로 나눈 것입니다. 서버가 앱과 함께 보내는 serialized signal, 즉 endpoint 전부와 그 인자, guard, 반환 모델을 읽어서, 읽기만 하는 문서가 아니라 endpoint를 직접 호출해 볼 수 있는 문서를 그립니다.",
      }),
      props: [
        {
          name: "Signal.Doc",
          type: ".Zone · .Explorer · .Setting · .AuthModal · .DocSignals · .DocSignal",
          desc: l.trans({
            en: "`Zone({ refName })` documents one signal; `Explorer({ include?, exclude? })` puts them all behind a sidebar.",
            ko: "`Zone({ refName })`은 signal 하나를 문서로 그리고, `Explorer({ include?, exclude? })`는 전체를 사이드바 뒤에 둡니다.",
          }),
        },
        {
          name: "Signal.RestApi",
          type: ".Endpoints · .Endpoint · .Interface · .Try",
          desc: l.trans({
            en: "The HTTP side: `Endpoints` lists queries and mutations, or only the ones named in `endpoints`.",
            ko: "HTTP 쪽으로, `Endpoints`가 query와 mutation을 나열하고 `endpoints`를 넘기면 그것만 보여 줍니다.",
          }),
        },
        {
          name: "Signal.WebSocket",
          type: ".Endpoints",
          desc: l.trans({
            en: "The same list for websocket endpoints, each row handed to `PubSub` or `Message`.",
            ko: "websocket endpoint를 같은 방식으로 나열하며, 각 행은 `PubSub`이나 `Message`가 그립니다.",
          }),
        },
        {
          name: "Signal.PubSub",
          type: ".Endpoint · .Interface · .Try",
          desc: l.trans({
            en: "One subscription: its room, its payload shape, and a Try that shows frames as they land.",
            ko: "구독 하나의 room과 payload 형태, 그리고 도착하는 프레임을 바로 보여 주는 Try입니다.",
          }),
        },
        {
          name: "Signal.Message",
          type: ".Endpoint · .Interface · .Try",
          desc: l.trans({
            en: "The same three parts for a one-way message endpoint.",
            ko: "단방향 message endpoint용으로 같은 세 부품을 제공합니다.",
          }),
        },
        {
          name: "Signal.Listener",
          type: ".Result",
          desc: l.trans({
            en: "`Result` is the live pane a Try writes into, showing byte payloads as a short hex preview.",
            ko: "`Result`는 Try가 결과를 적는 실시간 창이며, byte payload는 짧은 16진수 미리보기로 보입니다.",
          }),
        },
        {
          name: "Signal.Object",
          type: ".Type · .Detail · .Schema",
          desc: l.trans({
            en: "A model from its constant class: a type chip, its field table, or a titled schema.",
            ko: "constant class를 읽어 모델을 타입 칩, 필드 표, 제목이 붙은 스키마 중 하나로 보여 줍니다.",
          }),
        },
        {
          name: "Signal.Arg",
          type: "component · .Table · .Param · .Query · .FormData · .ID · .Int · .Float · .String · .Boolean · .Date · .Json · .Upload",
          desc: l.trans({
            en: "The one real component: `Arg({ argType, value, onChange })` renders one scalar's input.",
            ko: "유일하게 그 자체로 컴포넌트이며, `Arg({ argType, value, onChange })`가 scalar 하나의 입력칸을 그립니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Reach for a member, never a root.</strong> <code>Signal.Doc</code> and its siblings are
              namespaces, so write <code>Signal.Doc.Zone</code> or <code>Signal.RestApi.Endpoints</code>. Only{" "}
              <code>Signal.Arg</code> is a component itself.
            </span>
          ),
          ko: (
            <span>
              <strong>루트가 아니라 멤버를 씁니다.</strong> <code>Signal.Doc</code>과 형제들은 네임스페이스이므로{" "}
              <code>Signal.Doc.Zone</code>이나 <code>Signal.RestApi.Endpoints</code>를 씁니다. 그 자체로 컴포넌트인 것은{" "}
              <code>Signal.Arg</code>뿐입니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Render it straight from a page.</strong> Every member crosses the client boundary on its own, and{" "}
              <code>fetch</code> defaults to the app's own, so no <code>{'"use client"'}</code> wrapper is needed. Pass{" "}
              <code>fetch</code> only to document another app's proxy.
            </span>
          ),
          ko: (
            <span>
              <strong>페이지에서 바로 렌더합니다.</strong> 멤버마다 따로 클라이언트 경계를 넘고 <code>fetch</code>는 앱
              자신의 것이 기본값이므로 <code>{'"use client"'}</code> 래퍼가 필요 없습니다. 다른 앱의 proxy를 문서로 보여
              줄 때만 <code>fetch</code>를 넘깁니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Only mounted signals appear.</strong> The explorer reads <code>fetch.serializedSignal</code>, so a
              signal the app did not mount is reported as unregistered instead of rendering empty.
            </span>
          ),
          ko: (
            <span>
              <strong>마운트된 signal만 나옵니다.</strong> 탐색기는 <code>fetch.serializedSignal</code>을 읽으므로, 앱이
              마운트하지 않은 signal은 빈 화면이 아니라 등록되지 않았다고 표시됩니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>One setting for the whole screen.</strong> The guard filter and the JWT chosen in{" "}
              <code>Doc.Setting</code> live in the store, so every endpoint list and every REST Try on the page follows
              them.
            </span>
          ),
          ko: (
            <span>
              <strong>설정은 화면 전체에 한 번입니다.</strong> <code>Doc.Setting</code>에서 고른 guard 필터와 JWT는
              store에 있으므로, 화면의 모든 endpoint 목록과 REST Try가 같은 값을 따릅니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Each REST row shows its guards and its MCP status.</strong> A badge says whether the endpoint is
              published as an MCP tool, and a refused one says why.
            </span>
          ),
          ko: (
            <span>
              <strong>REST 행마다 guard와 MCP 상태가 보입니다.</strong> 배지가 MCP 툴로 공개되는지 알려 주고, 거부된
              endpoint에는 그 이유가 함께 나옵니다.
            </span>
          ),
        }),
      ],
      code: `import { page } from "akanjs/client";
import { Signal } from "akanjs/ui";

export default page().render(() => (
  <Signal.Doc.Explorer exclude={["banner"]} defaultRefName="product" />
));

// one endpoint, inline in a guide
<Signal.RestApi.Endpoints refName="base" endpoints={["ping"]} openAll />`,
    },
    {
      name: "Tab",
      desc: l.trans({
        en: "A tab set split into parts so the panels stay on the server. Only the provider and the menu hold state, and `Tab.Panel` renders what it is given, so the markup inside a panel never reaches the bundle.",
        ko: "패널이 서버에 남도록 부품으로 나눈 탭 묶음입니다. 상태는 provider와 menu만 가지고, `Tab.Panel`은 받은 것을 그대로 그리므로 패널 안의 마크업은 번들에 들어가지 않습니다.",
      }),
      props: [
        {
          name: "Tab",
          type: "{ className?, defaultMenu?, namespace?, children? }",
          desc: l.trans({
            en: "The provider holding the selected menu, which starts at `defaultMenu` or, left out, at none.",
            ko: "선택된 메뉴를 쥐는 provider로, 처음엔 `defaultMenu`가 선택되고 빼면 아무 메뉴도 선택되지 않습니다.",
          }),
        },
        {
          name: "Tab.Menus",
          type: "{ className?, children }",
          desc: l.trans({
            en: 'The `role="tablist"` row the menu buttons sit in.',
            ko: '메뉴 버튼이 놓이는 `role="tablist"` 줄입니다.',
          }),
        },
        {
          name: "Tab.Menu",
          type: "{ menu, children, className?, activeClassName?, disabledClassName?, disabled?, tooltip?, scrollToTop? }",
          desc: l.trans({
            en: "One tab button, keyed by `menu` rather than `value`.",
            ko: "탭 버튼 하나이며, key는 `value`가 아니라 `menu`입니다.",
          }),
        },
        {
          name: "Tab.Panel",
          type: '{ menu, children?, className?, loading?: "eager" | "lazy" | "every" }',
          desc: l.trans({
            en: "The body shown while its `menu` is selected; `loading` decides when it mounts.",
            ko: "자기 `menu`가 선택된 동안 보이는 본문이며, 언제 마운트할지는 `loading`이 정합니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>
                <code>loading</code> decides when a panel mounts.
              </strong>{" "}
              <code>"eager"</code>, the default, renders every panel up front and hides the others. <code>"lazy"</code>{" "}
              mounts a panel on its first selection and keeps it; <code>"every"</code> mounts it on each selection and
              unmounts it on leave.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>loading</code>이 패널의 마운트 시점을 정합니다.
              </strong>{" "}
              기본값 <code>"eager"</code>는 모든 패널을 처음부터 그리고 나머지를 숨깁니다. <code>"lazy"</code>는 처음
              선택될 때 마운트해 계속 두고, <code>"every"</code>는 선택될 때마다 마운트하고 떠나면 내립니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>
                <code>namespace</code> publishes the tab to the in-page agent.
              </strong>{" "}
              <code>namespace="product"</code> adds the <code>tabsInProduct</code> state and the{" "}
              <code>switchTabInProduct</code> tool. Without it the tab set publishes nothing.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>namespace</code>가 있어야 인페이지 에이전트에 공개됩니다.
              </strong>{" "}
              <code>namespace="product"</code>를 주면 <code>tabsInProduct</code> 상태와 <code>switchTabInProduct</code>{" "}
              툴이 생깁니다. 없으면 아무것도 공개하지 않습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>A disabled menu cannot stay selected.</strong> Disabling the active <code>Tab.Menu</code> moves
              the selection to the first other enabled menu, and <code>scrollToTop</code> scrolls the window up on
              click.
            </span>
          ),
          ko: (
            <span>
              <strong>비활성 메뉴는 선택된 채로 남지 않습니다.</strong> 선택된 <code>Tab.Menu</code>를 비활성화하면 다른
              활성 메뉴 중 첫 번째로 선택이 옮겨 가고, <code>scrollToTop</code>을 주면 클릭할 때 창을 맨 위로 올립니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Copy this shape.</strong> Never write one <code>{'"use client"'}</code> file with a mode{" "}
              <code>useState</code> and every panel inlined in it: every panel's markup then ships as JavaScript.
            </span>
          ),
          ko: (
            <span>
              <strong>이 모양을 따라 합니다.</strong> mode <code>useState</code> 하나와 모든 패널을 인라인한{" "}
              <code>{'"use client"'}</code> 파일 하나로 만들지 마세요. 그러면 모든 패널의 마크업이 JavaScript로 실려
              갑니다.
            </span>
          ),
        }),
      ],
      code: `import { cnst, usePage } from "@apps/shop/client";
import { Tab } from "akanjs/ui";

interface DetailProps {
  className?: string;
  product: cnst.Product;
}
export const Detail = ({ className, product }: DetailProps) => {
  const { l } = usePage();
  return (
    <Tab className={className} defaultMenu="info" namespace="product">
      <Tab.Menus>
        <Tab.Menu menu="info">
          {l.trans({ en: "Info", ko: "정보" })}
        </Tab.Menu>
        <Tab.Menu menu="history">
          {l.trans({ en: "History", ko: "이력" })}
        </Tab.Menu>
      </Tab.Menus>
      <Tab.Panel menu="info">
        <General product={product} />
      </Tab.Panel>
      <Tab.Panel menu="history" loading="lazy">
        <History product={product} />
      </Tab.Panel>
    </Tab>
  );
};`,
    },
    {
      name: "animated",
      desc: l.trans({
        en: "A small re-export of react-spring's animated elements, the ones Akan UI components animate with. Drive them with a spring hook in your own animated surfaces.",
        ko: "Akan UI 컴포넌트가 쓰는 react-spring animated 요소를 그대로 다시 내보낸 것입니다. 직접 만드는 애니메이션 화면에서 spring hook과 함께 씁니다.",
      }),
      props: [
        {
          name: "animated.div",
          type: "react-spring animated div",
          desc: l.trans({ en: "An animated `div`.", ko: "움직이는 `div`입니다." }),
        },
        {
          name: "animated.g",
          type: "react-spring animated g",
          desc: l.trans({ en: "An animated SVG group, `g`.", ko: "움직이는 SVG 그룹 `g`입니다." }),
        },
        {
          name: "animated.progress",
          type: "react-spring animated progress",
          desc: l.trans({ en: "An animated `progress` element.", ko: "움직이는 `progress` 요소입니다." }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>
                Use it in a <code>{'"use client"'}</code> file.
              </strong>{" "}
              The spring hooks that drive it run only in the browser, and its members are not available to a server
              component.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>{'"use client"'}</code> 파일에서 씁니다.
              </strong>{" "}
              이것을 움직이는 spring hook은 브라우저에서만 돌고, 멤버도 서버 컴포넌트에서는 쓸 수 없습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>
                Only <code>div</code>, <code>g</code> and <code>progress</code> are wrapped.
              </strong>{" "}
              For another tag, use react-spring's own <code>animated</code> in a <code>ui/</code> file, the same way you
              import <code>useSpring</code>.
            </span>
          ),
          ko: (
            <span>
              <strong>
                감싼 태그는 <code>div</code>, <code>g</code>, <code>progress</code>뿐입니다.
              </strong>{" "}
              다른 태그가 필요하면 <code>useSpring</code>처럼 <code>ui/</code> 파일에서 react-spring의{" "}
              <code>animated</code>를 직접 가져다 씁니다.
            </span>
          ),
        }),
      ],
      code: `"use client";
import { useSpring } from "@react-spring/web";
import { animated } from "akanjs/ui";
import type { ReactNode } from "react";

interface FadeInProps {
  className?: string;
  children: ReactNode;
}
export const FadeIn = ({ className, children }: FadeInProps) => {
  const style = useSpring({ opacity: 1, from: { opacity: 0 } });
  return (
    <animated.div className={className} style={style}>
      {children}
    </animated.div>
  );
};`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="system-ui" title={l.trans({ en: "System UI", ko: "시스템 UI" })}>
        <Docs.Title>{l.trans({ en: "System UI", ko: "시스템 UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The parts around your screens rather than feature widgets: the app shell, theme and language switches,
                  an API explorer, tabs, and animation. They go in root layouts, admin pages, signal dashboards, tabbed
                  detail views, and animated UI, and all come from <code>akanjs/ui</code>.
                </span>
              ),
              ko: (
                <span>
                  기능 위젯이 아니라 화면을 둘러싼 부품입니다. 앱 셸, 테마와 언어 전환, API 탐색기, 탭, 애니메이션을
                  다룹니다. root layout, 관리자 페이지, signal 대시보드, 탭으로 나뉜 상세 화면, 애니메이션 UI에 쓰며
                  모두 <code>akanjs/ui</code>에서 가져옵니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Pick a component", ko: "컴포넌트 고르기" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Component", ko: "컴포넌트" })}
            columns={pickColumns}
            groups={pickGroups}
            markLabel={l.trans({ en: "Yes", ko: "예" })}
            emptyLabel={l.trans({ en: "No", ko: "아니요" })}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Auto means you never write it.</strong> <code>Provider</code> wraps every page, and it
                    mounts <code>Reconnect</code> when the root layout calls <code>.reconnect()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>자동은 직접 쓸 일이 없다는 뜻입니다.</strong> <code>Provider</code>가 모든 페이지를 감싸고,
                    root layout이 <code>.reconnect()</code>를 호출하면 <code>Reconnect</code>도 마운트합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Server means you add no <code>{'"use client"'}</code> yourself.
                    </strong>{" "}
                    A page, layout or View renders these directly; the parts that need the browser carry their own.{" "}
                    <code>Signal</code> parts and <code>animated</code> need a file that starts with{" "}
                    <code>{'"use client"'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      서버는 직접 <code>{'"use client"'}</code>를 달 필요가 없다는 뜻입니다.
                    </strong>{" "}
                    page, layout, View에서 바로 그리면 되고, 브라우저가 필요한 부분에는 이미{" "}
                    <code>{'"use client"'}</code>가 붙어 있습니다. <code>Signal</code> 부품과 <code>animated</code>는 첫
                    줄이 <code>{'"use client"'}</code>인 파일에서 써야 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Tool means the in-page agent can use it too.</strong> Placing <code>ThemeToggle</code> or{" "}
                    <code>SelectLanguage</code> is enough for the agent to switch the theme or the language the same way
                    the user does.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>툴은 인페이지 에이전트도 쓸 수 있다는 뜻입니다.</strong> <code>ThemeToggle</code>이나{" "}
                    <code>SelectLanguage</code>를 놓기만 하면, 에이전트도 사용자와 같은 방식으로 테마와 언어를 바꿀 수
                    있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <DocsToc />
    </Scroll>
  );
});
