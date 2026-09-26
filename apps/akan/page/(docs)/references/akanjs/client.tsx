import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const exportRows = [
    {
      name: ["page", "layout", "rootLayout"],
      desc: l.trans({
        en: "The route chain: the one default export of every route file.",
        ko: "route chain입니다. 모든 route 파일이 default export 하나로 내보내는 것입니다.",
      }),
    },
    {
      name: "PageConfig",
      desc: l.trans({
        en: "What `.config()` takes: transition, safe area, cache and SSR mode.",
        ko: "`.config()`가 받는 설정입니다. transition, safe area, cache, SSR 방식을 정합니다.",
      }),
    },
    {
      name: "router",
      desc: l.trans({
        en: "Moves between routes and adds the locale and basePath for you.",
        ko: "route 사이를 이동합니다. locale과 basePath는 알아서 붙습니다.",
      }),
    },
    {
      name: "cn",
      desc: l.trans({
        en: "Joins class names and resolves Tailwind conflicts.",
        ko: "class 이름을 합치고 Tailwind 충돌을 정리합니다.",
      }),
    },
    {
      name: ["ModelProps", "ModelsProps"],
      desc: l.trans({
        en: "Prop types for components that draw one record or a list.",
        ko: "레코드 하나 또는 목록을 그리는 컴포넌트의 props 타입입니다.",
      }),
    },
    {
      name: ["usePage", "msg", "Err", "fetch", "sig"],
      desc: l.trans({
        en: "Runtime proxies without your app's types. Import the typed ones from `@apps/<app>/client`.",
        ko: "앱의 타입이 붙지 않은 런타임 프록시입니다. 타입이 붙은 것은 `@apps/<app>/client`에서 import합니다.",
      }),
    },
    {
      name: ["getCookie", "getAccount", "getAuthToken"],
      desc: l.trans({
        en: "Read cookies, the auth token and the signed-in account.",
        ko: "cookie, 인증 토큰, 로그인한 계정을 읽습니다.",
      }),
    },
    {
      name: ["setAuth", "initAuth", "resetAuth"],
      desc: l.trans({
        en: "Save or clear the auth token in fetch, the cookie and storage at once.",
        ko: "fetch, cookie, storage에 있는 인증 토큰을 한 번에 저장하거나 지웁니다.",
      }),
    },
    {
      name: "Device",
      desc: l.trans({
        en: "Platform, safe area, keyboard, haptics and scroll of the device.",
        ko: "기기의 platform, safe area, 키보드, 햅틱, 스크롤을 다룹니다.",
      }),
    },
    {
      name: "Font",
      desc: l.trans({
        en: "The type of one font entry in `rootLayout().fonts([...])`.",
        ko: "`rootLayout().fonts([...])`에 넣는 폰트 항목 하나의 타입입니다.",
      }),
    },
    {
      name: ["resolveRouteModule", "isRouteDefinition"],
      desc: l.trans({
        en: "Used by route loaders. App code never calls them.",
        ko: "route loader가 쓰는 함수입니다. 앱 코드에서는 호출하지 않습니다.",
      }),
    },
  ];

  const routerRows = [
    {
      name: "push(href, { scrollToTop })",
      desc: l.trans({
        en: "Goes to a route and adds a history entry.",
        ko: "route로 이동하고 history 항목을 하나 추가합니다.",
      }),
    },
    {
      name: "replace(href)",
      desc: l.trans({
        en: "Goes to a route in place of the current history entry.",
        ko: "현재 history 항목을 바꾸면서 이동합니다.",
      }),
    },
    {
      name: "back()",
      desc: l.trans({ en: "Goes back one entry. Browser only.", ko: "한 단계 뒤로 갑니다. 브라우저에서만 됩니다." }),
    },
    {
      name: "backOrFallback(href?)",
      desc: l.trans({
        en: "Goes back, or replaces with `href` when there is no history. Defaults to the index path.",
        ko: "뒤로 갈 기록이 있으면 뒤로 가고, 없으면 `href`로 교체합니다. 기본값은 index 경로입니다.",
      }),
    },
    {
      name: "refresh()",
      desc: l.trans({
        en: "Renders the current route again. Browser only.",
        ko: "현재 route를 다시 렌더링합니다. 브라우저에서만 됩니다.",
      }),
    },
    {
      name: "redirect(href, { method, status })",
      desc: l.trans({
        en: "On the server, answers with a redirect (307 by default). In the browser, navigates.",
        ko: "서버에서는 redirect로 응답하고(기본 307), 브라우저에서는 그냥 이동합니다.",
      }),
    },
    {
      name: "notFound()",
      desc: l.trans({ en: "Shows the 404 page.", ko: "404 페이지를 보여 줍니다." }),
    },
    {
      name: "setLang(lang)",
      desc: l.trans({
        en: "Switches the locale and stays on the same route. Browser only.",
        ko: "같은 route에 머문 채 locale만 바꿉니다. 브라우저에서만 됩니다.",
      }),
    },
    {
      name: "getPath()",
      desc: l.trans({
        en: "The current route without the locale and basePath. Browser only.",
        ko: "locale과 basePath를 뺀 현재 route입니다. 브라우저에서만 됩니다.",
      }),
    },
    {
      name: "getPrefixedPath(path)",
      desc: l.trans({
        en: "Adds the locale and basePath to a path when the app has a basePath.",
        ko: "앱에 basePath가 있으면 경로 앞에 locale과 basePath를 붙입니다.",
      }),
    },
    {
      name: "navigation()",
      desc: l.trans({
        en: "The last push or replace as a promise. It rejects when the route refused to move.",
        ko: "마지막 push·replace를 promise로 돌려줍니다. route가 이동을 거부하면 reject됩니다.",
      }),
    },
  ];

  const modelPropRows = [
    {
      key: "user",
      type: "cnst.LightUser",
      tags: [l.trans({ en: "required", ko: "필수" })],
      desc: l.trans({
        en: "The record, under the key named by the first type argument.",
        ko: "그릴 레코드입니다. 첫 번째 타입 인자로 정한 이름의 prop으로 들어옵니다.",
      }),
    },
    {
      key: "className",
      type: "string",
      desc: l.trans({ en: "Classes from the caller.", ko: "부모가 넘기는 class입니다." }),
    },
    {
      key: "href",
      type: "string",
      desc: l.trans({ en: "Where the card links to.", ko: "카드를 눌렀을 때 이동할 경로입니다." }),
    },
    {
      key: "onClick",
      type: "(model) => unknown",
      desc: l.trans({ en: "Called with the record when it is clicked.", ko: "클릭하면 레코드를 인자로 호출됩니다." }),
    },
    {
      key: "slice",
      type: "SliceMeta",
      desc: l.trans({ en: "The slice the record came from.", ko: "레코드를 가져온 slice입니다." }),
    },
    {
      key: "actions",
      type: "DataAction[]",
      desc: l.trans({
        en: '`"edit"`, `"view"`, `"remove"` or an element, shown as row actions.',
        ko: '행 동작으로 보여 줄 `"edit"`, `"view"`, `"remove"` 또는 엘리먼트입니다.',
      }),
    },
    {
      key: "columns",
      type: "DataColumn[]",
      desc: l.trans({
        en: "Columns to show when the record is drawn as a table row.",
        ko: "레코드를 표의 행으로 그릴 때 보여 줄 열입니다.",
      }),
    },
  ];

  const modelsPropRows = [
    {
      key: "init",
      type: "FetchInitForm",
      desc: l.trans({
        en: "How to load the list: `page`, `limit`, `sort`, `insight` and so on.",
        ko: "목록을 불러오는 설정입니다. `page`, `limit`, `sort`, `insight` 등을 담습니다.",
      }),
    },
    {
      key: "query",
      type: "QuerySetting",
      desc: l.trans({
        en: "Which filter to list with, as `{ queryKey, args }`.",
        ko: "어떤 filter로 목록을 만들지 `{ queryKey, args }`로 정합니다.",
      }),
    },
    {
      key: "slice",
      type: "SliceMeta",
      desc: l.trans({ en: "The slice the list came from.", ko: "목록을 가져온 slice입니다." }),
    },
    {
      key: "onClickItem",
      type: "(model) => unknown",
      desc: l.trans({ en: "Called with the clicked record.", ko: "클릭한 레코드를 인자로 호출됩니다." }),
    },
    {
      key: "className",
      type: "string",
      desc: l.trans({ en: "Classes from the caller.", ko: "부모가 넘기는 class입니다." }),
    },
  ];

  const stageColumns = [
    { key: "page", label: "page", code: true },
    { key: "layout", label: "layout", code: true },
    { key: "root", label: "rootLayout", code: true },
  ];
  const onEvery = { page: true, layout: true, root: true };
  const onPage = { page: true, layout: false, root: false };
  const onLayouts = { page: false, layout: true, root: true };
  const onRoot = { page: false, layout: false, root: true };

  const stageGroups = [
    {
      label: l.trans({ en: "Every chain", ko: "모든 chain" }),
      rows: [
        {
          name: ".param(name, Type)",
          desc: l.trans({
            en: "One `[name]` segment of the path. A page declares every segment in its path.",
            ko: "경로의 `[name]` segment 하나를 선언합니다. page는 자기 경로의 segment를 모두 선언합니다.",
          }),
          marks: onEvery,
        },
        {
          name: ".search(name, Type)",
          desc: l.trans({
            en: "One query key. Written as `[Type]`, it is a list.",
            ko: "query key 하나를 선언합니다. `[Type]`으로 쓰면 목록이 됩니다.",
          }),
          marks: onEvery,
        },
        {
          name: ".config(options)",
          desc: l.trans({
            en: "A `PageConfig`: transition, safe area, cache and SSR mode.",
            ko: "`PageConfig`로 transition, safe area, cache, SSR 방식을 정합니다.",
          }),
          marks: onEvery,
        },
        {
          name: ".head(node | fn)",
          desc: l.trans({
            en: "The `<title>`, `<meta>` and `<link>` tags, written as JSX.",
            ko: "`<title>`, `<meta>`, `<link>` 태그를 JSX로 적습니다.",
          }),
          marks: onEvery,
        },
        {
          name: ".loading(fn)",
          desc: l.trans({
            en: "Shown while render awaits. It gets path values but no search values.",
            ko: "render가 기다리는 동안 보여 줍니다. path 값은 받지만 search 값은 받지 않습니다.",
          }),
          marks: onEvery,
        },
        {
          name: ".render(fn)",
          desc: l.trans({
            en: "The last stage. Draws the route from the typed arguments.",
            ko: "마지막 stage입니다. 타입이 맞춰진 인자로 route를 그립니다.",
          }),
          marks: onEvery,
        },
      ],
    },
    {
      label: l.trans({ en: "Page only", ko: "page 전용" }),
      rows: [
        {
          name: ".prompt(name, desc)",
          desc: l.trans({ en: "Publishes the screen as an MCP prompt.", ko: "화면을 MCP prompt로 공개합니다." }),
          marks: onPage,
        },
      ],
    },
    {
      label: l.trans({ en: "Layouts only", ko: "layout 전용" }),
      rows: [
        {
          name: ".notFound(fn)",
          desc: l.trans({
            en: "What the subtree shows when a page is not found.",
            ko: "하위 경로에서 페이지를 찾지 못했을 때 보여 줄 화면입니다.",
          }),
          marks: onLayouts,
        },
        {
          name: ".error(fn)",
          desc: l.trans({
            en: "What the subtree shows when rendering throws.",
            ko: "하위 route를 렌더링하다 오류가 나면 보여 줄 화면입니다.",
          }),
          marks: onLayouts,
        },
      ],
    },
    {
      label: l.trans({ en: "Root layout only", ko: "root layout 전용" }),
      rows: [
        {
          name: ".fonts(Font[])",
          desc: l.trans({ en: "Fonts the build subsets and preloads.", ko: "빌드가 subset하고 preload할 폰트입니다." }),
          marks: onRoot,
        },
        {
          name: ".theme(name)",
          desc: l.trans({ en: "The theme the page opens with.", ko: "페이지가 처음 열릴 때의 테마입니다." }),
          marks: onRoot,
        },
        {
          name: ".manifest(obj)",
          desc: l.trans({ en: "The web app manifest.", ko: "web app manifest입니다." }),
          marks: onRoot,
        },
        {
          name: ".layoutStyle(…)",
          desc: l.trans({
            en: "Full-width web layout, or a centered phone column.",
            ko: "창을 꽉 채우는 web 레이아웃과 가운데 폰 화면 열 중에서 고릅니다.",
          }),
          marks: onRoot,
        },
        {
          name: ".reconnect(on?)",
          desc: l.trans({ en: "The connection-lost overlay.", ko: "연결이 끊겼을 때 뜨는 오버레이입니다." }),
          marks: onRoot,
        },
        {
          name: ".wsConnect(on?)",
          desc: l.trans({
            en: "Opens the websocket when the page loads.",
            ko: "페이지가 열릴 때 websocket을 연결합니다.",
          }),
          marks: onRoot,
        },
      ],
    },
  ];

  const argTypeColumns = [
    { key: "declared", label: l.trans({ en: "Declared as", ko: "선언" }), code: true },
    { key: "value", label: l.trans({ en: "Arrives as", ko: "받는 값" }), code: true },
    { key: "note", label: l.trans({ en: "Note", ko: "참고" }) },
  ];
  const argTypeRows = [
    { declared: "ID · String", value: "string", note: "" },
    { declared: "Int · Float", value: "number", note: "" },
    { declared: "Boolean", value: "boolean", note: "" },
    {
      declared: "Date",
      value: "Dayjs",
      note: l.trans({ en: "A day.js date.", ko: "day.js 날짜 값입니다." }),
    },
    {
      declared: "cnst.TicketStatus",
      value: '"open" | …',
      note: l.trans({
        en: "An `enumOf` class arrives as its value union.",
        ko: "`enumOf` 클래스는 값 union으로 옵니다.",
      }),
    },
    {
      declared: "[String]",
      value: "string[]",
      note: l.trans({
        en: "Search only. Repeat the key: `?tags=a&tags=b`.",
        ko: "search 전용입니다. key를 반복해 씁니다: `?tags=a&tags=b`.",
      }),
    },
  ];

  const layoutStageRows = [
    {
      key: ".notFound(fn)",
      type: "({ pathname, params, searchParams }) => node",
      desc: l.trans({
        en: "What the subtree shows when a page is not found. Replaces the legacy `NotFound` export.",
        ko: "하위 경로에서 페이지를 찾지 못했을 때의 화면입니다. 예전 `NotFound` export를 대신합니다.",
      }),
    },
    {
      key: ".error(fn)",
      type: "({ error, digest, pathname }) => node",
      desc: l.trans({
        en: "What the subtree shows when rendering throws. Replaces the legacy `Error` export.",
        ko: "하위 route 렌더링 중 오류가 났을 때의 화면입니다. 예전 `Error` export를 대신합니다.",
      }),
    },
  ];

  const rootStageRows = [
    {
      key: ".fonts(fonts)",
      type: "Font[]",
      desc: l.trans({
        en: "Fonts to subset and preload. Write the list inline; see `Font / createFont` below.",
        ko: "subset하고 preload할 폰트입니다. 목록은 인라인으로 씁니다. 아래 `Font / createFont`를 보세요.",
      }),
    },
    {
      key: ".theme(theme)",
      type: '"system" | "css" | string',
      desc: l.trans({
        en: "`system` follows the OS, `css` sets no `data-theme`, and any other name is set as is.",
        ko: "`system`은 OS 설정을 따르고, `css`는 `data-theme`를 달지 않으며, 그 밖의 이름은 그대로 답니다.",
      }),
    },
    {
      key: ".manifest(manifest)",
      type: "WebAppManifest",
      desc: l.trans({
        en: "The PWA manifest, emitted as a data URL.",
        ko: "PWA manifest입니다. data URL로 내보냅니다.",
      }),
    },
    {
      key: ".layoutStyle(style)",
      type: '"web" | "mobile"',
      default: '"web"',
      desc: l.trans({
        en: "`mobile` centers the app in a column at most 600px wide, and fills a narrower screen.",
        ko: "`mobile`은 앱을 가운데 최대 600px 폭의 열에 그리고, 그보다 좁은 화면은 꽉 채웁니다.",
      }),
    },
    {
      key: ".reconnect(on = true)",
      type: "boolean",
      default: 'operationMode === "local"',
      desc: l.trans({
        en: "Shows an overlay while the websocket is disconnected.",
        ko: "websocket 연결이 끊긴 동안 오버레이를 띄웁니다.",
      }),
    },
    {
      key: ".wsConnect(on = true)",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "Connects the websocket on load. With `false`, call `fetch.instance.connect()` before subscribing.",
        ko: "페이지가 열리면 websocket을 연결합니다. `false`라면 구독 전에 `fetch.instance.connect()`를 부릅니다.",
      }),
    },
  ];

  const pageConfigRows = [
    {
      key: "transition",
      type: '"none" | "fade" | "bottomUp" | "stack" | "scaleOut"',
      default: l.trans({ en: "by platform", ko: "플랫폼별" }),
      desc: l.trans({
        en: "Enter animation. Nested routes use `stack` on iOS, `scaleOut` on Android, `none` elsewhere.",
        ko: "들어올 때의 애니메이션입니다. 하위 route는 iOS에서 `stack`, Android에서 `scaleOut`, 그 밖에는 `none`입니다.",
      }),
    },
    {
      key: "safeArea",
      type: 'boolean | "top" | "bottom" | { top, bottom, android }',
      default: l.trans({ en: "on in the app, off on the web", ko: "앱은 켜짐, 웹은 꺼짐" }),
      desc: l.trans({
        en: "Pads the page for the notch and the home bar.",
        ko: "노치와 홈 바만큼 페이지에 여백을 줍니다.",
      }),
    },
    {
      key: "topInset",
      type: "number | boolean",
      default: "0",
      desc: l.trans({
        en: "Space kept for a fixed top bar, in px. `true` means 48.",
        ko: "고정된 상단 바를 위해 비워 둘 높이(px)입니다. `true`는 48입니다.",
      }),
    },
    {
      key: "bottomInset",
      type: "number | boolean",
      default: "0",
      desc: l.trans({
        en: "Space kept for a fixed bottom bar, in px. `true` means 48.",
        ko: "고정된 하단 바를 위해 비워 둘 높이(px)입니다. `true`는 48입니다.",
      }),
    },
    {
      key: "gesture",
      type: "boolean",
      default: l.trans({ en: "on for nested routes on iOS", ko: "iOS의 하위 route에서만 켜짐" }),
      desc: l.trans({ en: "Allows swipe-back.", ko: "밀어서 뒤로 가기를 허용합니다." }),
    },
    {
      key: "cache",
      type: "boolean",
      default: l.trans({ en: "true for top-level routes", ko: "최상위 route는 true" }),
      desc: l.trans({
        en: "In the app shell, keeps the page's last render to show again on return.",
        ko: "앱 셸에서 페이지의 마지막 렌더를 보관했다가 돌아오면 다시 보여 줍니다.",
      }),
    },
    {
      key: "ssr",
      type: '"stream" | "block"',
      default: '"stream"',
      desc: l.trans({
        en: "`stream` sends the shell first; `block` waits for every section before the first byte.",
        ko: "`stream`은 셸을 먼저 보내고, `block`은 모든 섹션을 기다린 뒤 첫 바이트를 보냅니다.",
      }),
    },
    {
      key: "topSafeAreaColor",
      type: "string",
      default: l.trans({ en: "background color", ko: "배경색" }),
      desc: l.trans({ en: "Color painted behind the top safe area.", ko: "상단 safe area 뒤에 칠할 색입니다." }),
    },
    {
      key: "bottomSafeAreaColor",
      type: "string",
      default: l.trans({ en: "background color", ko: "배경색" }),
      desc: l.trans({ en: "Color painted behind the bottom safe area.", ko: "하단 safe area 뒤에 칠할 색입니다." }),
    },
    {
      key: "devOnly",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Keeps the route out of `akan build`. It still serves under `akan start`.",
        ko: "route를 `akan build`에서 뺍니다. `akan start`에서는 계속 열립니다.",
      }),
    },
  ];

  const promptArgRows = [
    {
      name: ".prompt(name, …)",
      desc: l.trans({
        en: "The prompt name: letters, digits, `_` and `-`, up to 64 characters.",
        ko: "prompt 이름입니다. 영문자, 숫자, `_`, `-`만 쓰고 64자까지입니다.",
      }),
    },
    {
      name: ".prompt(…, description)",
      desc: l.trans({
        en: "The whole instruction the model receives. English, and never empty.",
        ko: "model이 받는 지시문 전체입니다. 영어로, 비워 두지 않고 씁니다.",
      }),
    },
    {
      name: ".param(name, Type, { desc })",
      desc: l.trans({
        en: "A required prompt argument. Give it a `desc`.",
        ko: "필수 prompt 인자가 됩니다. `desc`를 적어 주세요.",
      }),
    },
    {
      name: ".search(name, Type, { desc })",
      desc: l.trans({
        en: "An optional prompt argument. A list is typed comma-separated.",
        ko: "선택 prompt 인자가 됩니다. 목록은 쉼표로 구분해 입력합니다.",
      }),
    },
  ];

  const promptAnswerColumns = [
    { key: "when", label: l.trans({ en: "When", ko: "상황" }) },
    { key: "answer", label: l.trans({ en: "prompts/get answers", ko: "prompts/get의 답" }) },
  ];
  const promptAnswerRows = [
    {
      when: l.trans({ en: "The page renders", ko: "page가 정상 실행됨" }),
      answer: l.trans({
        en: "The description, one resource per `fetch.*` query, and a `Tools for this screen: …` line.",
        ko: "description, `fetch.*` query마다 resource 하나, 그리고 `Tools for this screen: …` 한 줄입니다.",
      }),
    },
    {
      when: l.trans({ en: "A required argument is missing", ko: "필수 인자가 빠짐" }),
      answer: l.trans({
        en: "One message per argument, pointing at the `<model>List…` tool that finds the id.",
        ko: "빠진 인자마다 메시지 하나로, id를 찾을 `<model>List…` tool을 알려 줍니다.",
      }),
    },
    {
      when: l.trans({ en: "Redirect or guard refusal, no token", ko: "redirect나 guard 거절, token 없음" }),
      answer: l.trans({
        en: "A 401 challenge, so the client signs in first.",
        ko: "401 challenge입니다. 클라이언트가 먼저 로그인하게 합니다.",
      }),
    },
    {
      when: l.trans({ en: "Redirect or guard refusal, with a token", ko: "redirect나 guard 거절, token 있음" }),
      answer: "`This screen is not available to the signed-in account.`",
    },
    {
      when: l.trans({ en: "The page answers not-found", ko: "page가 not-found로 응답함" }),
      answer: "`No screen exists for these arguments.`",
    },
  ];

  const fontRows = [
    {
      key: "name",
      type: "string",
      tags: [l.trans({ en: "required", ko: "필수" })],
      desc: l.trans({
        en: "Family name. It also names the `--font-<name>` variable and the `font-<name>` class.",
        ko: "폰트 family 이름입니다. `--font-<name>` 변수와 `font-<name>` class의 이름도 됩니다.",
      }),
    },
    {
      key: "paths",
      type: "{ src, weight, style? }[]",
      tags: [l.trans({ en: "required", ko: "필수" })],
      desc: l.trans({
        en: "One file per weight and style. `src` starts with `/` and is read from `public/`.",
        ko: "굵기·스타일마다 파일 하나입니다. `src`는 `/`로 시작하고 `public/`에서 읽습니다.",
      }),
    },
    {
      key: "default",
      type: "boolean",
      desc: l.trans({
        en: "Applies this font to the whole app. One font per root layout at most.",
        ko: "앱 전체에 이 폰트를 적용합니다. root layout마다 하나까지만 됩니다.",
      }),
    },
    {
      key: "subsets",
      type: "string[]",
      default: '["latin"]',
      desc: l.trans({
        en: "Character sets to keep, such as `latin` or `ks-x-1001` for Korean.",
        ko: "남길 문자 집합입니다. 예를 들어 `latin`, 한국어는 `ks-x-1001`입니다.",
      }),
    },
    {
      key: "subset",
      type: "false",
      desc: l.trans({
        en: "Skips subsetting. The file is only converted to woff2.",
        ko: "subset을 건너뜁니다. 파일을 woff2로 바꾸기만 합니다.",
      }),
    },
    {
      key: "optimize",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "`false` serves the file from `src` as is, with no build step and no preload.",
        ko: "`false`면 빌드 단계와 preload 없이 `src` 파일을 그대로 씁니다.",
      }),
    },
    {
      key: "preload",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "Adds a preload link for each optimized file.",
        ko: "최적화된 파일마다 preload 링크를 답니다.",
      }),
    },
    {
      key: "display",
      type: '"auto" | "block" | "swap" | "fallback" | "optional"',
      default: '"swap"',
      desc: l.trans({ en: "The CSS `font-display` value.", ko: "CSS `font-display` 값입니다." }),
    },
    {
      key: "variable",
      type: "string",
      default: "--font-<name>",
      desc: l.trans({
        en: "The CSS variable that holds the font family.",
        ko: "폰트 family를 담는 CSS 변수 이름입니다.",
      }),
    },
    {
      key: "className",
      type: "string",
      default: "font-<name>",
      desc: l.trans({
        en: "The class a `default` font puts on the app.",
        ko: "`default` 폰트가 앱에 붙이는 class 이름입니다.",
      }),
    },
  ];

  const pageRuntimeRows = [
    {
      name: "usePage()",
      desc: l.trans({
        en: "Returns `{ l, lang, path }`. Works in server components too.",
        ko: "`{ l, lang, path }`를 돌려줍니다. 서버 컴포넌트에서도 됩니다.",
      }),
    },
    {
      name: "l(key, params?)",
      desc: l.trans({
        en: "Translates a dictionary key such as `project.name`.",
        ko: "`project.name` 같은 dictionary key를 번역합니다.",
      }),
    },
    {
      name: "l.trans({ en, ko })",
      desc: l.trans({
        en: "Picks the text for the current locale, falling back to the default locale.",
        ko: "현재 locale의 문구를 고릅니다. 없으면 기본 locale의 문구를 씁니다.",
      }),
    },
    {
      name: "l.rich(key)",
      desc: l.trans({
        en: "Renders a translation that contains HTML tags.",
        ko: "HTML 태그가 들어 있는 번역을 그대로 렌더링합니다.",
      }),
    },
    {
      name: "l._(key)",
      desc: l.trans({
        en: "Same as `l`, without type-checking the key.",
        ko: "`l`과 같지만 key의 타입을 검사하지 않습니다.",
      }),
    },
    {
      name: "msg.success(key, { key, duration, data })",
      desc: l.trans({
        en: "A toast from a dictionary key, 3 seconds by default. `info`, `warning`, `error`, `loading` too.",
        ko: "dictionary key로 toast를 띄웁니다. 기본 3초이며 `info`, `warning`, `error`, `loading`도 같습니다.",
      }),
    },
    {
      name: "new Err(key, data?)",
      desc: l.trans({
        en: "The translated error class. Keys look like `<module>.error.<key>`; the status is 400.",
        ko: "번역되는 오류 클래스입니다. key는 `<module>.error.<key>` 모양이고 status는 400입니다.",
      }),
    },
    {
      name: ["Err.BadRequest", "Err.Unauthorized", "Err.Forbidden", "Err.NotFound", "Err.Conflict"],
      desc: l.trans({
        en: "Subclasses with their own status: 400, 401, 403, 404 and 409.",
        ko: "각자 status를 가진 하위 클래스입니다. 차례로 400, 401, 403, 404, 409입니다.",
      }),
    },
  ];

  const fetchRows = [
    {
      name: "fetch.<endpoint>(...args)",
      desc: l.trans({
        en: "Calls one generated or custom endpoint, such as `fetch.user(id)`.",
        ko: "생성된 endpoint나 직접 만든 endpoint 하나를 호출합니다. 예: `fetch.user(id)`.",
      }),
    },
    {
      name: "fetch.init<Model><Suffix>(...args)",
      desc: l.trans({
        en: "Loads a slice's list and insight in a route, for a Zone's `init` prop.",
        ko: "route에서 slice의 목록과 insight를 불러와 Zone의 `init` prop으로 넘깁니다.",
      }),
    },
    {
      name: ["fetch.view<Model>(id)", "fetch.edit<Model>(id)"],
      desc: l.trans({
        en: "Loads one record as `{ project, projectView }` or `{ project, projectEdit }`.",
        ko: "레코드 하나를 `{ project, projectView }` 또는 `{ project, projectEdit }`로 불러옵니다.",
      }),
    },
    {
      name: "fetch.instance",
      desc: l.trans({
        en: "The client itself, with `setTimeout(ms)` and `connect()`.",
        ko: "클라이언트 자체입니다. `setTimeout(ms)`, `connect()`가 있습니다.",
      }),
    },
    {
      name: "sig.<model>",
      desc: l.trans({
        en: "The model's slices and endpoints. `store(sig.project, …)` is built from it.",
        ko: "model의 slice와 endpoint 정보입니다. `store(sig.project, …)`가 이것으로 만들어집니다.",
      }),
    },
  ];

  const cookieRows = [
    {
      name: "getCookie(key)",
      desc: l.trans({
        en: "Reads a cookie, on the server and in the browser.",
        ko: "cookie를 읽습니다. 서버와 브라우저 모두에서 됩니다.",
      }),
    },
    {
      name: "setCookie(key, value, options?)",
      desc: l.trans({
        en: "Writes a cookie in the browser (`path=/`, `SameSite=None`, `Secure`). Does nothing on the server.",
        ko: "브라우저에 cookie를 씁니다(`path=/`, `SameSite=None`, `Secure`). 서버에서는 아무 일도 하지 않습니다.",
      }),
    },
    {
      name: "removeCookie(key)",
      desc: l.trans({ en: "Deletes a cookie in the browser.", ko: "브라우저에서 cookie를 지웁니다." }),
    },
    {
      name: "getHeader(key)",
      desc: l.trans({
        en: "Reads a request header on the server. Empty in the browser.",
        ko: "서버에서 요청 header를 읽습니다. 브라우저에서는 비어 있습니다.",
      }),
    },
    {
      name: "getAuthToken()",
      desc: l.trans({ en: "The app's JWT from the cookie jar.", ko: "cookie에 있는 이 앱의 JWT입니다." }),
    },
    {
      name: "getStoredAuthToken()",
      desc: l.trans({
        en: "The JWT from client storage: localStorage on the web, Capacitor Preferences in the app.",
        ko: "클라이언트 storage의 JWT입니다. 웹은 localStorage, 앱은 Capacitor Preferences에서 읽습니다.",
      }),
    },
    {
      name: "authTokenKey()",
      desc: l.trans({ en: "The cookie name: `jwt:<appName>`.", ko: "cookie 이름인 `jwt:<appName>`입니다." }),
    },
    {
      name: "getAccount<T>()",
      desc: l.trans({
        en: "Decodes the JWT into the account. Another app's or environment's token reads as signed out.",
        ko: "JWT를 계정으로 풀어 줍니다. 다른 앱·환경의 token이면 로그아웃 상태로 봅니다.",
      }),
    },
  ];

  const authRows = [
    {
      name: "setAuth({ jwt })",
      desc: l.trans({
        en: "Gives `fetch` the token and saves it to the cookie and client storage.",
        ko: "`fetch`에 token을 주고 cookie와 클라이언트 storage에 저장합니다.",
      }),
    },
    {
      name: "initAuth({ jwt? })",
      desc: l.trans({
        en: "Restores the token from `?jwt=` or the cookie at startup. Ignores another app's token.",
        ko: "시작할 때 `?jwt=`나 cookie에서 token을 되살립니다. 다른 앱의 token은 무시합니다.",
      }),
    },
    {
      name: "resetAuth()",
      desc: l.trans({
        en: "Clears the token from `fetch`, the cookie and client storage, for a session you drop entirely.",
        ko: "`fetch`, cookie, 클라이언트 storage에서 token을 모두 지웁니다. 세션을 완전히 버릴 때 씁니다.",
      }),
    },
  ];

  const deviceRows = [
    {
      name: "Device.getDevice()",
      desc: l.trans({
        en: "Returns the loaded device. Throws before the framework has loaded it.",
        ko: "불러온 device를 돌려줍니다. 프레임워크가 불러오기 전에는 오류를 던집니다.",
      }),
    },
    {
      name: "info.platform",
      desc: l.trans({ en: '`"ios"`, `"android"` or `"web"`.', ko: '`"ios"`, `"android"`, `"web"` 중 하나입니다.' }),
    },
    {
      name: "lang",
      desc: l.trans({ en: "The locale the app opened with.", ko: "앱이 열릴 때의 locale입니다." }),
    },
    {
      name: ["topSafeArea", "bottomSafeArea"],
      desc: l.trans({
        en: "Notch and home-bar insets in px. 0 on the web.",
        ko: "노치와 홈 바 높이(px)입니다. 웹에서는 0입니다.",
      }),
    },
    {
      name: "isMobile",
      desc: l.trans({
        en: "True on a touch device or a mobile browser. `isMobileDevice()` is the same check.",
        ko: "터치 기기나 모바일 브라우저면 true입니다. `isMobileDevice()`도 같은 검사입니다.",
      }),
    },
    {
      name: "vibrate(type?)",
      desc: l.trans({
        en: 'Haptic feedback: `"light"`, `"medium"` (default), `"heavy"`, or a duration in ms.',
        ko: '햅틱 진동입니다. `"light"`, `"medium"`(기본), `"heavy"` 또는 ms 단위 길이를 넘깁니다.',
      }),
    },
    {
      name: ["showKeyboard()", "hideKeyboard()"],
      desc: l.trans({ en: "Opens or closes the native keyboard.", ko: "네이티브 키보드를 열거나 닫습니다." }),
    },
    {
      name: ["listenKeyboardChanged(fn)", "unlistenKeyboardChanged()"],
      desc: l.trans({
        en: "Reports the keyboard height as it opens and closes.",
        ko: "키보드가 열리고 닫힐 때 높이를 알려 줍니다.",
      }),
    },
    {
      name: ["getScrollTop()", "setScrollTop(y)"],
      desc: l.trans({ en: "Reads or sets the page's scroll position.", ko: "페이지의 스크롤 위치를 읽거나 바꿉니다." }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-client" title="akanjs/client">
        <Docs.Title>akanjs/client</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/client` is what route files and client code import from the framework: the route chain, navigation, class merging, auth helpers, device access and font declarations.",
              ko: "`akanjs/client`는 route 파일과 클라이언트 코드가 프레임워크에서 가져다 쓰는 모듈입니다. route chain, 페이지 이동, class 병합, 인증 helper, 기기 접근, 폰트 선언이 들어 있습니다.",
            })}
          </div>
          <code className={chip}>{'import { cn, page, router } from "akanjs/client";'}</code>
          <Docs.IntroTable type={l.trans({ en: "Export", ko: "export" })} items={exportRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Most of it runs on the server too.</strong> <code>page()</code>, <code>cn</code>,{" "}
                    <code>getCookie</code> and <code>getAccount</code> work in server components;{" "}
                    <code>router.back()</code>, <code>setCookie</code> and <code>Device</code> need the browser.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>대부분은 서버에서도 동작합니다.</strong> <code>page()</code>, <code>cn</code>,{" "}
                    <code>getCookie</code>, <code>getAccount</code>는 서버 컴포넌트에서 쓸 수 있고,{" "}
                    <code>router.back()</code>, <code>setCookie</code>, <code>Device</code>는 브라우저가 필요합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Typed helpers come from your app.</strong> <code>usePage</code>, <code>fetch</code>,{" "}
                    <code>msg</code>, <code>Err</code> and <code>sig</code> here do not know your app's types. Import
                    them from <code>{"@apps/<app>/client"}</code> to get your own dictionary keys and endpoints.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>타입이 붙은 helper는 앱에서 가져옵니다.</strong> 여기의 <code>usePage</code>,{" "}
                    <code>fetch</code>, <code>msg</code>, <code>Err</code>, <code>sig</code>는 앱의 타입을 모릅니다.
                    앱의 dictionary key와 endpoint가 타입으로 붙은 <code>{"@apps/<app>/client"}</code>에서 import합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="router" title="router">
        <Docs.Title>router</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`router` moves between routes from stores, event handlers and utilities. Give it the app path: it adds the locale and basePath itself.",
              ko: "`router`는 store, 이벤트 핸들러, 유틸리티에서 route 사이를 이동할 때 씁니다. 앱 안의 경로만 넘기면 locale과 basePath는 알아서 붙입니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={routerRows} />
          <div>
            {l.trans({
              en: "A store action that opens the record it just created:",
              ko: "방금 만든 레코드의 페이지로 이동하는 store action입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/project/project.store.ts"
          code={`import { router } from "akanjs/client";
import { store } from "akanjs/store";

import { fetch, sig } from "../useClient";

export class ProjectStore extends store(sig.project, () => ({
  // state
})) {
  async duplicateProject(projectId: string) {
    const project = await fetch.duplicateProject(projectId);
    router.push(\`/project/\${project.id}\`); // → /en/project/<id>
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Paths are app-internal.</strong> Write <code>/profile</code>, not <code>/en/profile</code>.
                    A path that already starts with the locale is accepted too.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>경로는 앱 안의 경로로 씁니다.</strong> <code>/en/profile</code>이 아니라{" "}
                    <code>/profile</code>로 씁니다. locale로 시작하는 경로를 넘겨도 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Redirect from a page.</strong> In a page's render, <code>router.redirect("/signin")</code>{" "}
                    answers the request with a 307 redirect.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>page에서는 redirect를 씁니다.</strong> page의 render 안에서{" "}
                    <code>router.redirect("/signin")</code>을 부르면 307 redirect로 응답합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="cn" title="cn">
        <Docs.Title>cn</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`cn` is the only class-combining function. It joins class strings and resolves Tailwind conflicts, Akan's semantic tokens included.",
              ko: "`cn`은 class를 합치는 유일한 함수입니다. class 문자열을 이어 붙이고, Akan 시맨틱 토큰까지 포함해 Tailwind 충돌을 정리합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A component that adds one conditional class and takes the caller's className last:",
              ko: "조건부 class 하나를 더하고, 부모의 className을 맨 뒤에 받는 컴포넌트입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/Chip.tsx"
          language="tsx"
          code={`import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface ChipProps {
  className?: string;
  isActive?: boolean;
  children: ReactNode;
}
export const Chip = ({ className, isActive = false, children }: ChipProps) => {
  return (
    <span
      className={cn(
        "rounded-field px-3 py-1",
        isActive && "bg-primary text-primary-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only for a condition or a merge.</strong> A fixed class string stays a plain string. Reach
                    for <code>cn</code> when a part is conditional or the caller passes <code>className</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>조건이나 병합이 있을 때만 씁니다.</strong> 고정된 class는 그냥 문자열로 둡니다. 조건부
                    조각이 있거나 부모가 <code>className</code>을 넘길 때 <code>cn</code>을 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The caller goes last.</strong> The last class wins a conflict, so the incoming{" "}
                    <code>className</code> can override the defaults.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>부모의 class는 맨 뒤에 둡니다.</strong> 충돌하면 뒤의 class가 이기므로, 넘겨받은{" "}
                    <code>className</code>이 기본값을 덮을 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Tokens resolve too.</strong> <code>cn("bg-primary", "bg-open")</code> keeps only{" "}
                    <code>bg-open</code>, because the semantic color and radius tokens are registered.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>시맨틱 토큰도 충돌을 정리합니다.</strong> 색상·radius 토큰이 등록되어 있어서{" "}
                    <code>cn("bg-primary", "bg-open")</code>은 <code>bg-open</code>만 남깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No object syntax.</strong> Write <code>{'cond && "x"'}</code>, not{" "}
                    <code>{"{ x: cond }"}</code>. <code>clsx</code> and a raw <code>twMerge</code> are not used.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>객체 문법은 쓰지 않습니다.</strong> <code>{"{ x: cond }"}</code> 대신{" "}
                    <code>{'cond && "x"'}</code>로 씁니다. <code>clsx</code>나 <code>twMerge</code>를 직접 쓰지
                    않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="ModelProps / ModelsProps" title="ModelProps / ModelsProps">
        <Docs.Title>ModelProps / ModelsProps</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: '`ModelProps` types a Unit that draws one record: `ModelProps<"user", cnst.LightUser>` puts the record under `user`. `ModelsProps` types a component that draws a list.',
              ko: '`ModelProps`는 레코드 하나를 그리는 Unit의 props 타입입니다. `ModelProps<"user", cnst.LightUser>`로 쓰면 레코드가 `user` prop으로 들어옵니다. `ModelsProps`는 목록을 그리는 컴포넌트의 props 타입입니다.',
            })}
          </div>
          <Docs.SubSubTitle>
            <span className="font-mono">ModelProps&lt;"user", cnst.LightUser&gt;</span>
          </Docs.SubSubTitle>
          <Docs.OptionTable items={modelPropRows} />
          <Docs.SubSubTitle>
            <span className="font-mono">ModelsProps&lt;cnst.LightUser&gt;</span>
          </Docs.SubSubTitle>
          <Docs.OptionTable items={modelsPropRows} />
          <div>
            {l.trans({
              en: "A Unit card that links to the record:",
              ko: "레코드 페이지로 링크하는 Unit 카드입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/user/User.Unit.tsx"
          language="tsx"
          code={`import type { cnst } from "@apps/myapp/client";
import type { ModelProps } from "akanjs/client";
import { Link } from "akanjs/ui";

export const Card = ({ user, href }: ModelProps<"user", cnst.LightUser>) => {
  return (
    <Link href={href ?? \`/user/\${user.id}\`}>
      {user.nickname}
    </Link>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Units and Views take the model.</strong> They are server components, so a <code>cnst</code>{" "}
                    model prop never has to cross to the browser.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Unit과 View는 model을 받습니다.</strong> 서버 컴포넌트라서 <code>cnst</code> model을
                    prop으로 받아도 브라우저로 넘길 일이 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Utils and Zones take an id.</strong> They are client components: take{" "}
                    <code>userId: string</code> and read the model from the store. A current Zone types its{" "}
                    <code>init</code> prop with <code>ClientInit</code> from <code>akanjs/fetch</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Util과 Zone은 id를 받습니다.</strong> 클라이언트 컴포넌트이므로 <code>userId: string</code>
                    을 받고 model은 store에서 읽습니다. 요즘 Zone은 <code>init</code> prop을 <code>akanjs/fetch</code>의{" "}
                    <code>ClientInit</code>으로 타입을 붙입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="page / layout / rootLayout" title="page / layout / rootLayout">
        <Docs.Title>page / layout / rootLayout</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every route file has exactly one export: a chain that starts with `page()`, `layout()` or `rootLayout()` and ends with `.render()`. Each route setting is one stage of that chain.",
              ko: "모든 route 파일의 export는 하나뿐입니다. `page()`, `layout()`, `rootLayout()` 중 하나로 시작해 `.render()`로 끝나는 chain입니다. route 설정은 모두 그 chain의 stage 하나입니다.",
            })}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: "`page()` goes in a page file: `<name>.tsx` or `_index.tsx`.",
                ko: "`page()`는 page 파일, 즉 `<name>.tsx`나 `_index.tsx`에 씁니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`layout()` goes in a `_layout.tsx`.",
                ko: "`layout()`은 `_layout.tsx`에 씁니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`rootLayout()` goes in the root `_layout.tsx` of the app or of a basePath.",
                ko: "`rootLayout()`은 앱이나 basePath의 최상위 `_layout.tsx`에 씁니다.",
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Stages by chain", ko: "chain별 stage" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Stage", ko: "stage" })}
            columns={stageColumns}
            groups={stageGroups}
            markLabel={l.trans({ en: "Available", ko: "쓸 수 있음" })}
            emptyLabel={l.trans({ en: "Not available", ko: "쓸 수 없음" })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "What render receives", ko: "render가 받는 값" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Each declared argument arrives already typed:",
              ko: "선언한 인자는 타입이 맞춰진 값으로 들어옵니다:",
            })}
          </div>
          <Docs.Table columns={argTypeColumns} rows={argTypeRows} stacked />
          <div>
            {l.trans({
              en: "A page that reads one path segment and two query keys:",
              ko: "path segment 하나와 query key 둘을 읽는 page입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/project/[projectId]/_index.tsx"
          language="tsx"
          code={`import { fetch, Project } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Loading } from "akanjs/ui";

export default page()
  .param("projectId", ID)
  .search("tab", String)
  .search("tags", [String])
  .config({ transition: "stack" })
  .head(({ projectId }) => <title>{projectId}</title>)
  .loading(() => <Loading.Skeleton active />)
  .render(async ({ projectId, tab, tags }) => {
    const { projectView } = await fetch.viewProject(projectId);
    return (
      <Project.Zone.View view={projectView} tab={tab} tags={tags ?? []} />
    );
  });`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every search value is optional.</strong> A missing or unreadable one arrives as{" "}
                    <code>undefined</code>. A path value that fails its type answers not-found.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>search 값은 모두 optional입니다.</strong> 없거나 읽을 수 없으면 <code>undefined</code>로
                    옵니다. path 값이 타입에 맞지 않으면 not-found로 응답합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>lang is always there.</strong> Every route sits under the locale segment, so every stage
                    receives <code>lang</code> as a string. Never declare it with <code>.param()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>lang은 늘 들어옵니다.</strong> 모든 route는 locale segment 아래에 있으므로 모든 stage가{" "}
                    <code>lang</code>을 문자열로 받습니다. <code>.param()</code>으로 선언하지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Render is not a React component.</strong> Call <code>usePage()</code>,{" "}
                    <code>getSelf()</code> and <code>fetch.*</code> inside it, and make it <code>async</code> only when
                    it awaits.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>render callback은 React 컴포넌트가 아닙니다.</strong> 그 안에서 <code>usePage()</code>,{" "}
                    <code>getSelf()</code>, <code>fetch.*</code>를 부르고, await할 때만 <code>async</code>를 붙입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Names are string literals.</strong> A <code>[projectId]</code> folder needs{" "}
                    <code>.param("projectId", ID)</code> with that literal name; the same goes for{" "}
                    <code>.prompt("name", …)</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이름은 문자열 리터럴로 씁니다.</strong> <code>[projectId]</code> 폴더에는 그 이름 그대로{" "}
                    <code>.param("projectId", ID)</code>가 있어야 합니다. <code>.prompt("name", …)</code>도 같습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A route file exports only its chain.</strong> A named export beside the chain, or{" "}
                  <code>page()</code> in a <code>_layout.tsx</code>, breaks the build.
                </span>
              ),
              ko: (
                <span>
                  <strong>route 파일은 chain 하나만 export합니다.</strong> chain 옆에 named export를 두거나{" "}
                  <code>_layout.tsx</code>에서 <code>page()</code>를 쓰면 빌드가 깨집니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="layout / rootLayout stages"
        title={l.trans({ en: "layout / rootLayout Stages", ko: "layout / rootLayout 전용 stage" })}
      >
        <Docs.Title>{l.trans({ en: "layout / rootLayout Stages", ko: "layout / rootLayout 전용 stage" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`layout()` takes every `page()` stage except `.prompt()`, and its render also receives `children`. It may declare only the `[x]` segments it reads.",
              ko: "`layout()`은 `.prompt()`를 뺀 `page()`의 stage를 모두 받고, render에 `children`도 함께 받습니다. 자기가 읽는 `[x]` segment만 선언해도 됩니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "layout() adds", ko: "layout()이 더하는 것" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={layoutStageRows} />
          <Docs.SubSubTitle>{l.trans({ en: "rootLayout() adds", ko: "rootLayout()이 더하는 것" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "These are app-wide settings, so only the root `_layout.tsx` of an app or a basePath sets them.",
              ko: "앱 전체에 걸리는 설정이라서 앱이나 basePath의 최상위 `_layout.tsx`에서만 정합니다.",
            })}
          </div>
          <Docs.OptionTable items={rootStageRows} />
          <div>
            {l.trans({
              en: 'An app\'s root layout. `import "./styles.css";` stays its first line:',
              ko: '앱의 root layout입니다. `import "./styles.css";`는 첫 줄에 그대로 둡니다:',
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/_layout.tsx"
          language="tsx"
          code={`import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "notosans",
      default: true,
      paths: [{ src: "/fonts/NotoSansKR.woff2", weight: 400 }],
    },
  ])
  .theme("dark")
  .layoutStyle("web")
  .head(<link rel="icon" href="/favicon.ico" />)
  .render(({ children }) => children);`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "A nested layout that reads one segment and draws a not-found screen for its subtree:",
              ko: "segment 하나를 읽고, 하위 경로의 not-found 화면을 정하는 중첩 layout입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/org/[orgId]/_layout.tsx"
          language="tsx"
          code={`import { Org } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { layout } from "akanjs/client";

export default layout()
  .param("orgId", ID)
  .notFound(({ pathname }) => <p>{pathname}</p>)
  .render(({ orgId, children }) => (
    <Org.Zone.Shell orgId={orgId}>{children}</Org.Zone.Shell>
  ));`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A theme cookie wins.</strong> Once the user picks a theme, the <code>theme</code> cookie
                    overrides <code>.theme()</code> on the next load.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>theme cookie가 우선입니다.</strong> 사용자가 테마를 고르면 다음부터는 <code>theme</code>{" "}
                    cookie가 <code>.theme()</code>보다 앞섭니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No argument means on.</strong> <code>.reconnect()</code> and <code>.wsConnect()</code> with
                    no argument are <code>true</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>인자가 없으면 켜짐입니다.</strong> 인자 없이 부른 <code>.reconnect()</code>와{" "}
                    <code>.wsConnect()</code>는 <code>true</code>입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="PageConfig" title="PageConfig">
        <Docs.Title>PageConfig</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`PageConfig` is the object `.config()` takes. It sets how a route enters, how much room it keeps for the device edges, and how the server sends it.",
              ko: "`PageConfig`는 `.config()`가 받는 객체입니다. route가 어떻게 들어오는지, 기기 가장자리에 여백을 얼마나 두는지, 서버가 어떻게 보내는지를 정합니다.",
            })}
          </div>
          <Docs.OptionTable items={pageConfigRows} />
          <div>
            {l.trans({
              en: "A playground page that slides up, pads for the notch, and never ships to production:",
              ko: "아래에서 올라오고, 노치만큼 여백을 두며, 운영 빌드에는 들어가지 않는 playground page입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/playground.tsx"
          language="tsx"
          code={`import { Playground } from "@apps/myapp/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "bottomUp", safeArea: true, devOnly: true })
  .render(() => <Playground />);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Configs merge down the tree.</strong> A layout's config applies to every route under it, and
                    the page's own value wins.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>설정은 트리를 따라 합쳐집니다.</strong> layout의 설정은 그 아래 모든 route에 적용되고,
                    page에 직접 적은 값이 이깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>devOnly is a literal.</strong> Write <code>true</code> or <code>false</code> directly. On a{" "}
                    <code>_layout.tsx</code> it drops every route under that folder.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>devOnly는 리터럴로 씁니다.</strong> <code>true</code>나 <code>false</code>를 그대로
                    적습니다. <code>_layout.tsx</code>에 두면 그 폴더 아래 route가 모두 빠집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>block trades speed for a clean error page.</strong> With <code>ssr: "block"</code> the
                    Loading fallback never reaches the browser. Use it only where SEO and first paint do not matter.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>block은 속도 대신 깔끔한 오류 화면을 택합니다.</strong> <code>ssr: "block"</code>이면
                    Loading 화면이 브라우저에 가지 않습니다. SEO와 첫 화면이 중요하지 않은 route에만 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="prompt" title="prompt">
        <Docs.Title>prompt</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`.prompt(name, description)` publishes a page as an MCP prompt, so an agent can open the same screen a person sees. The description is the whole instruction the model gets, in English.",
              ko: "`.prompt(name, description)`은 page를 MCP prompt로 공개해서, 에이전트가 사람이 보는 화면을 그대로 열 수 있게 합니다. description은 model이 받는 지시문 전체이며 영어로 씁니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Declaration", ko: "선언" })} items={promptArgRows} />
          <div>
            {l.trans({
              en: "A ticket board published as a prompt:",
              ko: "티켓 보드를 prompt로 공개하는 page입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/project/[projectId]/board.tsx"
          language="tsx"
          code={`import { cnst, fetch, Ticket } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("projectId", ID, { desc: "The project to brief." })
  .search("status", cnst.TicketStatus, { desc: "Only this status." })
  .prompt("briefProjectTickets", "Brief the ticket board of one project.")
  .render(async ({ projectId, status }) => {
    const { ticketInitInProject } = await fetch.initTicketInProject(
      projectId,
      status,
    );
    return <Ticket.Zone.Board init={ticketInitInProject} />;
  });`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "What an agent gets back", ko: "에이전트가 받는 답" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "`prompts/get` runs the page body under the caller's token and renders nothing. What it answers depends on how the body went:",
              ko: "`prompts/get`은 호출자의 token으로 page body를 실행하고, 화면은 그리지 않습니다. 실행 결과에 따라 이렇게 답합니다:",
            })}
          </div>
          <Docs.Table columns={promptAnswerColumns} rows={promptAnswerRows} stacked />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Data is masked.</strong> Each resource is masked by its endpoint's return model and
                    addressed by an <code>akan://</code> uri. One document travels once, however many queries read it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>데이터는 마스킹됩니다.</strong> resource마다 endpoint의 return model로 마스킹되고{" "}
                    <code>akan://</code> uri로 주소가 붙습니다. 같은 도큐먼트는 여러 query가 읽어도 한 번만 갑니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only lists are cut.</strong> They are trimmed to <code>promptBudget</code> characters,
                    60,000 by default. Change it with <code>option.setMcp({"{ promptBudget }"})</code> or{" "}
                    <code>AKAN_MCP_PROMPT_BUDGET</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>잘리는 것은 목록뿐입니다.</strong> 목록은 <code>promptBudget</code>자(기본 60,000자)에 맞게
                    잘립니다. <code>option.setMcp({"{ promptBudget }"})</code>나 <code>AKAN_MCP_PROMPT_BUDGET</code>
                    으로 바꿉니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Tools are the screen's own.</strong> The last line names the published tools of the modules
                    the page fetched from, limited to what this caller may see.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>tool은 그 화면의 것만 알려 줍니다.</strong> 마지막 줄에는 page가 데이터를 가져온 모듈의 공개
                    tool 중 호출자가 볼 수 있는 것만 나옵니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>A prompt is always a page.</strong> <code>endpoint()</code> has no <code>prompt()</code> kind,
                  and <code>Msg</code> is not public.
                </span>
              ),
              ko: (
                <span>
                  <strong>prompt는 언제나 page입니다.</strong> <code>endpoint()</code>에는 <code>prompt()</code> 종류가
                  없고, <code>Msg</code>는 공개 API가 아닙니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="resolveRouteModule / isRouteDefinition" title="resolveRouteModule / isRouteDefinition">
        <Docs.Title>resolveRouteModule / isRouteDefinition</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every route loader reads route files through these two functions. App code never calls them; you need them only when you write a tool that loads route files itself.",
              ko: "모든 route loader는 이 두 함수로 route 파일을 읽습니다. 앱 코드에서는 부르지 않고, route 파일을 직접 불러오는 도구를 만들 때만 씁니다.",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Function", ko: "함수" })}
            items={[
              {
                name: "resolveRouteModule(mod, key, { kind, pattern })",
                desc: l.trans({
                  en: "Unfolds a chain's default export into the named-export shape. A legacy module passes through.",
                  ko: "chain의 default export를 named-export 모양으로 펼칩니다. legacy module은 그대로 통과합니다.",
                }),
              },
              {
                name: "isRouteDefinition(value)",
                desc: l.trans({
                  en: "True when the value is a `page()`, `layout()` or `rootLayout()` chain.",
                  ko: "값이 `page()`, `layout()`, `rootLayout()` chain이면 true입니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: "A script that loads one route file the way the server does:",
              ko: "서버와 같은 방식으로 route 파일 하나를 불러오는 스크립트입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/script/inspectRoute.ts"
          code={`import { isRouteDefinition, resolveRouteModule } from "akanjs/client";

const key = "project/[projectId]/_index.tsx";
const mod = await import(\`../page/\${key}\`);
const { module, definition } = resolveRouteModule(mod, key, {
  kind: "page",
  pattern: "/:lang/project/:projectId",
});
isRouteDefinition(mod.default); // true: this file exports a chain
module.default; // the render every loader reads`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It returns both shapes.</strong> <code>module</code> is what loaders read;{" "}
                    <code>definition</code> is set only for a chain module.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>두 모양을 함께 돌려줍니다.</strong> <code>module</code>은 loader가 읽는 모양이고,{" "}
                    <code>definition</code>은 chain module일 때만 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It checks the file.</strong> A named export beside the chain is always rejected.{" "}
                    <code>kind</code> also rejects a chain in the wrong kind of file, and <code>pattern</code> rejects a{" "}
                    <code>.param()</code> that does not match the path.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>파일을 검사합니다.</strong> chain 옆의 named export는 언제나 거절합니다. <code>kind</code>를
                    넘기면 파일 종류와 맞지 않는 chain을, <code>pattern</code>을 넘기면 경로와 맞지 않는{" "}
                    <code>.param()</code>을 함께 거절합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Font / createFont" title="Font / createFont">
        <Docs.Title>Font / createFont</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Font` is the type of one entry in `rootLayout().fonts([...])`. The build subsets each font, serves it from `/_akan/fonts`, and preloads it.",
              ko: "`Font`는 `rootLayout().fonts([...])`에 넣는 항목 하나의 타입입니다. 빌드가 폰트마다 subset을 만들고, `/_akan/fonts`에서 제공하며, preload합니다.",
            })}
          </div>
          <Docs.OptionTable items={fontRows} />
          <div>
            {l.trans({
              en: "A Korean font in two weights, applied to the whole app:",
              ko: "두 가지 굵기의 한글 폰트를 앱 전체에 적용하는 예입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/_layout.tsx"
          language="tsx"
          code={`import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "notosans",
      default: true,
      paths: [
        { src: "/fonts/NotoSansKR-Regular.woff2", weight: 400 },
        { src: "/fonts/NotoSansKR-Bold.woff2", weight: 700 },
      ],
      subsets: ["latin", "ks-x-1001"],
    },
  ])
  .render(({ children }) => children);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Paths are public URLs.</strong> <code>/fonts/NotoSansKR-Regular.woff2</code> is read from{" "}
                    <code>apps/myapp/public/fonts/</code>. A relative path such as <code>./font.woff2</code> is not
                    found.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>경로는 public URL입니다.</strong> <code>/fonts/NotoSansKR-Regular.woff2</code>는{" "}
                    <code>apps/myapp/public/fonts/</code>에서 읽습니다. <code>./font.woff2</code> 같은 상대 경로는 찾지
                    못합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>createFont is a shim.</strong> <code>createFont</code> and the named factories{" "}
                    <code>Noto_Sans_KR</code>, <code>Inter</code>, <code>Roboto</code> and{" "}
                    <code>Nanum_Gothic_Coding</code> return <code>null</code>. They keep old font-factory imports
                    loading; they declare nothing.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>createFont는 자리만 채우는 shim입니다.</strong> <code>createFont</code>와 이름 붙은
                    factory인 <code>Noto_Sans_KR</code>, <code>Inter</code>, <code>Roboto</code>,{" "}
                    <code>Nanum_Gothic_Coding</code>은 <code>null</code>을 돌려줍니다. 예전 font factory import가 깨지지
                    않게 둔 것이며, 폰트를 선언하지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Write the font list inline.</strong> The build reads <code>.fonts([...])</code> from the
                  source without running it. A list kept in a variable is not subset, and every{" "}
                  <code>/_akan/fonts</code> request for it returns 404.
                </span>
              ),
              ko: (
                <span>
                  <strong>폰트 목록은 인라인으로 씁니다.</strong> 빌드는 <code>.fonts([...])</code>를 실행하지 않고
                  소스에서 읽습니다. 변수에 담은 목록은 subset되지 않고, 그 폰트의 <code>/_akan/fonts</code> 요청은 모두
                  404가 됩니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="usePage / msg / Err" title="usePage / msg / Err">
        <Docs.Title>usePage / msg / Err</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Translation, toast messages and the error class. Import them from your app's `@apps/<app>/client`, where the keys are typed by your dictionary.",
              ko: "번역, toast 메시지, 오류 클래스입니다. 앱의 dictionary로 key 타입이 붙은 `@apps/<app>/client`에서 import합니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Call", ko: "호출" })} items={pageRuntimeRows} />
          <div>
            {l.trans({
              en: "`usePage()` works in a server View, so translated text never needs a client component:",
              ko: "`usePage()`는 서버 View에서도 되므로, 번역 문구 때문에 클라이언트 컴포넌트를 만들 필요가 없습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/project/Project.View.tsx"
          language="tsx"
          code={`import { type cnst, usePage } from "@apps/myapp/client";

interface GeneralProps {
  project: cnst.Project;
}
export const General = ({ project }: GeneralProps) => {
  const { l } = usePage();
  return (
    <section>
      <h3>{l("project.name")}</h3>
      <p>{project.name}</p>
      <p>{l.trans({ en: "Read only", ko: "읽기 전용" })}</p>
    </section>
  );
};`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "In a store, `msg` reports a failed check and confirms success:",
              ko: "store에서는 `msg`로 검사 실패를 알리고 성공을 확인해 줍니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/project/project.store.ts"
          code={`import { store } from "akanjs/store";

import { fetch, msg, sig } from "../useClient";

export class ProjectStore extends store(sig.project, () => ({
  // state
})) {
  async inviteMember(projectId: string, email: string) {
    if (!email.includes("@")) {
      msg.error("project.error.invalidEmail");
      return;
    }
    await fetch.inviteMember(projectId, email);
    msg.success("project.inviteMemberSuccess", { duration: 5 });
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Validation reports, never throws.</strong> On the client, call <code>msg.error(key)</code>{" "}
                    and return early.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>검증 실패는 알리기만 하고 throw하지 않습니다.</strong> 클라이언트에서는{" "}
                    <code>msg.error(key)</code>를 부르고 바로 return합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A store action does not catch.</strong> A failed <code>fetch.*</code> rejects with the
                    server's <code>Err</code>, and the framework shows it as a toast.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>store action은 catch하지 않습니다.</strong> 실패한 <code>fetch.*</code>는 서버의{" "}
                    <code>Err</code>로 reject되고, 프레임워크가 그것을 toast로 띄웁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One toast per key.</strong> <code>option.key</code> replaces an earlier toast with the same
                    key, and <code>data</code> fills the translation's parameters.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>key가 같으면 toast는 하나입니다.</strong> <code>option.key</code>가 같은 toast는 앞의 것을
                    바꾸고, <code>data</code>는 번역문의 매개변수를 채웁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="fetch / sig" title="fetch / sig">
        <Docs.Title>fetch / sig</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`fetch` calls the server's endpoints and slices; `sig` describes each model's signal so a store can be built from it. Import both from your app: `@apps/<app>/client` in UI, `../useClient` inside `lib/`.",
              ko: "`fetch`는 서버의 endpoint와 slice를 호출하고, `sig`는 model마다 signal 정보를 담아 store를 만들 수 있게 합니다. 둘 다 앱에서 import합니다. UI에서는 `@apps/<app>/client`, `lib/` 안에서는 `../useClient`입니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Member", ko: "멤버" })} items={fetchRows} />
          <div>
            {l.trans({
              en: "A store built from `sig.project` that archives a project and updates its list:",
              ko: "`sig.project`로 만든 store가 프로젝트를 보관 처리하고 목록을 갱신하는 예입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/project/project.store.ts"
          code={`import { store } from "akanjs/store";

import { fetch, sig } from "../useClient";

export class ProjectStore extends store(sig.project, () => ({
  // state
})) {
  async archiveProject(projectId: string) {
    const project = await fetch.archiveProject(projectId);
    const { projectList } = this.get();
    this.set({ projectList: projectList.set(project).save() });
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Typed only in your app.</strong> The <code>akanjs/client</code> exports forward to the
                    runtime your app client registered, without its types.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>타입은 앱에서만 붙습니다.</strong> <code>akanjs/client</code>의 export는 앱 client가 등록한
                    런타임으로 호출을 넘기지만, 앱의 타입은 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Load in the route.</strong> A client component reads <code>st.use.*</code> and writes{" "}
                    <code>st.do.*</code>; the route loads data and passes it down as <code>init</code> or{" "}
                    <code>view</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>데이터는 route에서 불러옵니다.</strong> 클라이언트 컴포넌트는 <code>st.use.*</code>로 읽고{" "}
                    <code>st.do.*</code>로 씁니다. route가 데이터를 불러와 <code>init</code>이나 <code>view</code>로
                    넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every call carries the token.</strong> After <code>setAuth</code>, each call sends the JWT.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 호출에 token이 실립니다.</strong> <code>setAuth</code> 다음부터는 호출마다 JWT를
                    보냅니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="getCookie / setCookie / getAccount / getAuthToken"
        title="getCookie / setCookie / getAccount / getAuthToken"
      >
        <Docs.Title>getCookie / setCookie / getAccount / getAuthToken</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Read cookies and the signed-in account from any component, server or browser. The auth token sits in a cookie named per app.",
              ko: "서버든 브라우저든 어느 컴포넌트에서나 cookie와 로그인한 계정을 읽습니다. 인증 token은 앱마다 이름이 다른 cookie에 들어 있습니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Function", ko: "함수" })} items={cookieRows} />
          <div>
            {l.trans({
              en: "`libs/shared` builds `getSelf()` on top of `getAccount()`. Trimmed, it reads:",
              ko: "`libs/shared`의 `getSelf()`는 `getAccount()` 위에 만들어져 있습니다. 줄여 보면 이렇습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/webkit/cookie.ts"
          code={`import type { Self } from "@libs/shared/common";
import { getAccount, router } from "akanjs/client";

export const getSelf = (option?: { unauthorize: string }) => {
  // undefined when signed out, or when the token belongs to another app
  const self = getAccount<{ self?: Self }>().self;
  if (!self && option) router.redirect(option.unauthorize);
  return self;
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Why the key is per app.</strong> Cookies carry no port, so two apps on one host would share
                    a single <code>jwt</code> cookie. Read it with <code>getAuthToken()</code>, never by name.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>key가 앱마다 다른 이유.</strong> cookie에는 port가 없어서, 한 host의 두 앱이{" "}
                    <code>jwt</code> cookie 하나를 나눠 쓰게 됩니다. 이름으로 직접 읽지 말고 <code>getAuthToken()</code>
                    을 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>getAccount reads what the server honors.</strong> It decodes the app's cookie or an{" "}
                    <code>Authorization: Bearer</code> header, the same two credentials the server accepts.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>getAccount는 서버가 인정하는 것만 읽습니다.</strong> 앱의 cookie나{" "}
                    <code>Authorization: Bearer</code> header를 풉니다. 서버가 받아 주는 자격 증명도 이 두 가지입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="setAuth / initAuth / resetAuth" title="setAuth / initAuth / resetAuth">
        <Docs.Title>setAuth / initAuth / resetAuth</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These three keep `fetch`, the cookie and client storage holding the same token. Call `setAuth` after sign-in; the framework already calls `initAuth` at startup.",
              ko: "이 세 함수는 `fetch`, cookie, 클라이언트 storage가 같은 token을 갖게 합니다. 로그인 뒤에는 `setAuth`를 부르고, `initAuth`는 프레임워크가 시작할 때 이미 부릅니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Function", ko: "함수" })} items={authRows} />
          <div>
            {l.trans({
              en: "Refreshing the token in `libs/shared` is one call to the server and one `setAuth`:",
              ko: "`libs/shared`의 token 갱신은 서버 호출 한 번과 `setAuth` 한 번입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/ui/Auth/tokenRefresh.util.ts"
          code={`import { fetch } from "@libs/shared/client";
import { setAuth } from "akanjs/client";

export const refreshToken = async () => {
  const accessToken = await fetch.refreshJwt(null);
  setAuth({ jwt: accessToken.jwt });
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Sign-out swaps the token too.</strong> The <code>libs/shared</code> stores call{" "}
                    <code>setAuth</code> after sign-in, and after sign-out with the token{" "}
                    <code>fetch.signoutUser()</code> returns.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>로그아웃도 token을 바꿔 끼웁니다.</strong> <code>libs/shared</code>의 store는 로그인 뒤에{" "}
                    <code>setAuth</code>를 부르고, 로그아웃 뒤에도 <code>fetch.signoutUser()</code>가 돌려준 token으로
                    다시 부릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A foreign token is dropped.</strong> <code>initAuth</code> ignores a token minted for
                    another app or environment, and clears it when it came from the cookie.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>다른 앱의 token은 버립니다.</strong> <code>initAuth</code>는 다른 앱이나 환경에서 발급된
                    token을 무시하고, cookie에서 온 것이면 지웁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="device" title="Device">
        <Docs.Title>Device</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Device` wraps what Capacitor exposes on a phone: platform, safe area, keyboard, haptics and scroll. The framework loads it once in the browser; read it with `Device.getDevice()`.",
              ko: "`Device`는 Capacitor가 폰에서 제공하는 platform, safe area, 키보드, 햅틱, 스크롤을 감쌉니다. 프레임워크가 브라우저에서 한 번 불러 두므로 `Device.getDevice()`로 꺼내 씁니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Member", ko: "멤버" })} items={deviceRows} />
          <div>
            {l.trans({
              en: "A button that vibrates lightly before it acts:",
              ko: "동작하기 전에 가볍게 진동하는 버튼입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/HapticButton.tsx"
          language="tsx"
          code={`"use client";
import { Device } from "akanjs/client";
import type { ReactNode } from "react";

interface HapticButtonProps {
  onClick: () => void;
  children: ReactNode;
}
export const HapticButton = ({ onClick, children }: HapticButtonProps) => {
  return (
    <button
      type="button"
      onClick={() => {
        void Device.getDevice().vibrate("light");
        onClick();
      }}
    >
      {children}
    </button>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Browser only.</strong> On the server and before boot, <code>Device.getDevice()</code>{" "}
                    throws. Call it from an event handler or an effect.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>브라우저에서만 씁니다.</strong> 서버에서나 부팅 전에는 <code>Device.getDevice()</code>가
                    오류를 던집니다. 이벤트 핸들러나 effect 안에서 부릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The web is a safe no-op.</strong> On the web, keyboard and haptics do nothing and the insets
                    are 0, so no platform check is needed.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>웹에서는 조용히 넘어갑니다.</strong> 웹에서는 키보드와 햅틱이 아무 일도 하지 않고 inset은
                    0이므로, platform을 따로 확인하지 않아도 됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
