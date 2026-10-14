import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const componentRows = [
    {
      name: "Link",
      desc: l.trans({
        en: "Moves between internal routes. Every internal link is a `Link`.",
        ko: "앱 내부 route 사이를 이동합니다. 내부 링크는 전부 `Link`입니다.",
      }),
    },
    {
      name: "Image",
      desc: l.trans({
        en: "Draws an uploaded file or a URL, resized by Akan's image optimizer.",
        ko: "업로드한 파일이나 URL을 그리고, Akan 이미지 최적화기로 크기를 맞춥니다.",
      }),
    },
    {
      name: "Layout",
      desc: l.trans({
        en: "The page frame: content containers, top and bottom chrome, a header and drawers.",
        ko: "페이지의 틀입니다. 콘텐츠 컨테이너, 위아래 chrome, 헤더와 서랍으로 나뉩니다.",
      }),
    },
    {
      name: "Load",
      desc: l.trans({
        en: "Turns a fetch result into a list, a detail, a form, or any awaited value.",
        ko: "fetch 결과를 목록, 상세, 폼 화면으로 바꾸고, 그 밖의 promise도 기다렸다가 그립니다.",
      }),
    },
    {
      name: "Model",
      desc: l.trans({
        en: "Create, edit, view and remove shells wired to a model's generated store.",
        ko: "model마다 자동으로 만들어지는 store에 연결된 생성·수정·조회·삭제 셸입니다.",
      }),
    },
  ];

  const termRows = [
    {
      name: "slice",
      desc: l.trans({
        en: "A named list query of a model, such as `productInShop`. Components take it as `fetch.slice.<name>`.",
        ko: "model의 목록 조회에 이름을 붙인 것입니다(`productInShop`). 컴포넌트에는 `fetch.slice.<name>`으로 넘깁니다.",
      }),
    },
    {
      name: ["init", "view", "edit"],
      desc: l.trans({
        en: "What `fetch.init*`, `fetch.view*` and `fetch.edit*` return: the data plus what the store needs.",
        ko: "`fetch.init*`, `fetch.view*`, `fetch.edit*`가 돌려주는 값입니다. 데이터와 store가 받아 쓸 정보가 함께 들어 있습니다.",
      }),
    },
    {
      name: "hydrate",
      desc: l.trans({
        en: "Write server data into the client store, so generated actions such as paging work on it.",
        ko: "서버에서 받은 데이터를 클라이언트 store에 채우는 일입니다. 그래야 페이지 넘김 같은 자동 생성 action이 그 데이터로 동작합니다.",
      }),
    },
    {
      name: "Suspense boundary",
      desc: l.trans({
        en: "A fallback that covers one section while its data loads, without holding the rest of the page.",
        ko: "데이터를 기다리는 섹션 하나만 대체 화면으로 가리고, 나머지 페이지는 먼저 보여 주는 React 경계입니다.",
      }),
    },
    {
      name: "chrome",
      desc: l.trans({
        en: "Bars fixed above or below the scrolling body, such as a navbar or a bottom tab bar.",
        ko: "스크롤 본문 위아래에 고정된 막대입니다. navbar나 하단 탭 바가 여기에 속합니다.",
      }),
    },
    {
      name: "trigger",
      desc: l.trans({
        en: "The element a user clicks to open a modal or a confirmation.",
        ko: "사용자가 눌러서 modal이나 확인 창을 여는 요소입니다.",
      }),
    },
    {
      name: "draft",
      desc: l.trans({
        en: "A form's unsaved input, kept on the device and offered back when the form reopens.",
        ko: "저장하지 않은 폼 입력값입니다. 기기에 남겨 두었다가 폼을 다시 열 때 복구를 제안합니다.",
      }),
    },
  ];

  const linkProps = [
    {
      key: "href",
      type: "string | null",
      desc: l.trans({
        en: "Destination route. When empty, Link renders its children inside a plain `div`.",
        ko: "이동할 route입니다. 비어 있으면 children을 평범한 `div`로 감싸 그립니다.",
      }),
    },
    {
      key: "disabled",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Blocks navigation and renders the same `div`, so the layout does not move.",
        ko: "이동을 막습니다. 같은 `div`를 그리므로 레이아웃은 그대로입니다.",
      }),
    },
    {
      key: "activeClassName",
      type: "string",
      desc: l.trans({
        en: "Class added while the current path starts with `href`.",
        ko: "현재 경로가 `href`로 시작하는 동안 붙는 class입니다.",
      }),
    },
    {
      key: "activeExact",
      type: "boolean",
      desc: l.trans({
        en: "Adds `activeClassName` only on the exact path, not on its sub-paths.",
        ko: "하위 경로는 빼고, 경로가 정확히 같을 때만 `activeClassName`을 붙입니다.",
      }),
    },
    {
      key: "scrollToTop",
      type: "boolean",
      desc: l.trans({
        en: "Scrolls to the top after client-side navigation.",
        ko: "클라이언트 쪽 이동이 끝나면 맨 위로 스크롤합니다.",
      }),
    },
    {
      key: "replace",
      type: "boolean",
      desc: l.trans({
        en: "Replaces the current history entry instead of adding one.",
        ko: "history에 새 항목을 쌓지 않고 현재 항목을 바꿉니다.",
      }),
    },
    {
      key: "noCache",
      type: "boolean",
      desc: l.trans({
        en: "Deprecated: it has no effect, so leave it out.",
        ko: "지원이 중단되었고 아무 효과가 없으므로 넘기지 않습니다.",
      }),
    },
    {
      key: "target / rel / aria-*",
      type: "AnchorHTMLAttributes",
      desc: l.trans({
        en: "Pass through to `<a>` on server-rendered pages. The CSR bundle drops them.",
        ko: "서버 렌더링 페이지에서는 `<a>`에 그대로 전달됩니다. CSR 번들에서는 빠집니다.",
      }),
    },
  ];

  const linkHelpers = [
    {
      key: "Link.Back",
      type: "{ className?, children? }",
      desc: l.trans({
        en: "Calls `router.back()` on click. It is a plain `div`, so it wraps any mark you give it.",
        ko: "클릭하면 `router.back()`을 호출합니다. 버튼이 아닌 평범한 `div`라 어떤 표시든 감쌀 수 있습니다.",
      }),
    },
    {
      key: "Link.Close",
      type: "{ className?, children? }",
      desc: l.trans({
        en: "Calls `window.close()` on click, for a route opened in its own tab such as an OAuth popup.",
        ko: "클릭하면 `window.close()`를 호출합니다. OAuth 팝업처럼 별도 탭으로 열린 route에 씁니다.",
      }),
    },
    {
      key: "Link.Lang",
      type: '{ lang: "ko" | "en" | string, className?, children? }',
      desc: l.trans({
        en: "Calls `router.setLang(lang)` on click, swapping only the locale segment of the current route.",
        ko: "클릭하면 `router.setLang(lang)`을 호출해 현재 route에서 언어 구간만 바꿉니다.",
      }),
    },
  ];

  const imageProps = [
    {
      key: "src",
      type: "string",
      desc: l.trans({
        en: "Direct image URL. It wins over `file.url`.",
        ko: "직접 지정하는 이미지 URL입니다. `file.url`보다 우선합니다.",
      }),
    },
    {
      key: "file",
      type: "ProtoLightFile | { url, imageSize, abstractData? } | null",
      desc: l.trans({
        en: "A `File` model value, or any object with `url` and `imageSize`.",
        ko: "`File` model 값, 또는 `url`과 `imageSize`를 가진 객체입니다.",
      }),
    },
    {
      key: "width / height",
      type: "number",
      default: "file.imageSize",
      desc: l.trans({
        en: "Rendered size. A missing value comes from `file.imageSize`.",
        ko: "그려질 크기입니다. 비워 두면 `file.imageSize`에서 가져옵니다.",
      }),
    },
    {
      key: "alt",
      type: "string",
      default: '"image"',
      desc: l.trans({
        en: "Alternative text. Pass a real description; the default is just the word image.",
        ko: "대체 텍스트입니다. 기본값은 image라는 단어뿐이니 실제 설명을 넘기세요.",
      }),
    },
    {
      key: "abstractData",
      type: "string | null",
      desc: l.trans({
        en: "Low-quality preview data. It overrides `file.abstractData`.",
        ko: "저화질 미리보기 데이터입니다. `file.abstractData`보다 우선합니다.",
      }),
    },
    {
      key: "quality",
      type: "number",
      default: "75",
      desc: l.trans({ en: "Quality the optimizer encodes at.", ko: "최적화기가 쓰는 화질입니다." }),
    },
    {
      key: "priority / preload",
      type: "boolean",
      desc: l.trans({
        en: "Loads eagerly at high priority, and preloads the image on server-rendered pages.",
        ko: "지연 없이 높은 우선순위로 불러오고, 서버 렌더링 페이지에서는 미리 불러옵니다.",
      }),
    },
    {
      key: "unoptimized",
      type: "boolean",
      desc: l.trans({
        en: "Skips the optimizer and serves the original URL.",
        ko: "최적화기를 건너뛰고 원본 URL을 그대로 씁니다.",
      }),
    },
  ];

  const layoutContainers = [
    {
      key: "Layout.Template",
      type: "{ className?, children? }",
      desc: l.trans({
        en: "Vertical form container with the spacing a module `Template` expects.",
        ko: "모듈 `Template`에 맞는 간격을 가진 세로 폼 컨테이너입니다.",
      }),
    },
    {
      key: "Layout.Unit",
      type: "{ className?, children, href? }",
      desc: l.trans({
        en: "List or card item. With `href`, the whole unit becomes one `Link`.",
        ko: "목록·카드 항목입니다. `href`를 주면 항목 전체가 `Link` 하나가 됩니다.",
      }),
    },
    {
      key: "Layout.View",
      type: "{ className?, children }",
      desc: l.trans({
        en: "Detail page container, capped at `max-w-5xl`.",
        ko: "상세 페이지 컨테이너이며, 폭은 `max-w-5xl`까지입니다.",
      }),
    },
    {
      key: "Layout.Zone",
      type: "{ className?, children }",
      desc: l.trans({
        en: "Section container for zones and page blocks, with the same width cap.",
        ko: "zone과 페이지 블록을 담는 섹션 컨테이너이며, 폭 제한은 같습니다.",
      }),
    },
  ];

  const layoutChrome = [
    {
      key: "Layout.Navbar",
      type: "{ className?, children?, height?, back? }",
      default: "height 48",
      desc: l.trans({
        en: "Portals `children` into the top inset. `back` is `true` for the default chevron, or your node.",
        ko: "`children`을 상단 inset으로 옮겨 그립니다. `back`은 `true`면 기본 화살표, 아니면 직접 넘긴 요소입니다.",
      }),
    },
    {
      key: "Layout.TopInset",
      type: "{ className?, children, estimatedHeight? }",
      default: "estimatedHeight 48",
      desc: l.trans({
        en: "Top chrome that is not a navbar. `estimatedHeight` is the space reserved for it.",
        ko: "navbar가 아닌 상단 chrome입니다. `estimatedHeight`만큼 자리를 잡아 둡니다.",
      }),
    },
    {
      key: "Layout.TopLeftAction",
      type: "{ className?, children }",
      desc: l.trans({
        en: "The inset's top-left corner, where the navbar's `back` lands. Other corner controls go here.",
        ko: "상단 inset의 왼쪽 모서리로, navbar의 `back`이 놓이는 자리입니다. 다른 모서리 버튼도 여기에 둡니다.",
      }),
    },
    {
      key: "Layout.BottomInset",
      type: "{ className?, children, keyboardSticky?, role?, estimatedHeight? }",
      default: "estimatedHeight 60",
      desc: l.trans({
        en: "Bottom chrome. `keyboardSticky` rides above the keyboard; `role` is chrome or keyboard accessory.",
        ko: "하단 chrome입니다. `keyboardSticky`면 키보드 위에 붙고, `role`로 상시 chrome과 키보드 액세서리를 나눕니다.",
      }),
    },
    {
      key: "Layout.BottomTab",
      type: "{ className?, tabs, height?, renderTab? }",
      default: "height 64",
      desc: l.trans({
        en: "The app's bottom tab bar. Each tab is `{ name, icon, activeIcon?, notiCount?, href }`.",
        ko: "앱의 하단 탭 바입니다. 탭마다 `{ name, icon, activeIcon?, notiCount?, href }`를 넘깁니다.",
      }),
    },
  ];

  const layoutOverlays = [
    {
      key: "Layout.Header",
      type: '{ className?, children?, type?: "hide" | "static" }',
      default: '"hide"',
      desc: l.trans({
        en: "Fixed web header. `hide` slides it away on scroll down from `md` width up; `static` keeps it.",
        ko: "화면 위에 고정된 웹 헤더입니다. `hide`는 `md` 이상 화면에서 아래로 스크롤하면 숨기고, `static`은 계속 보여 줍니다.",
      }),
    },
    {
      key: "Layout.Sider",
      type: "{ className?, bgClassName?, trigger?, header?, close?, children? }",
      desc: l.trans({
        en: "Drawer that owns its open state and closes on route change; `trigger`, `header`, `close` swap parts.",
        ko: "열림 상태를 스스로 갖고 route가 바뀌면 닫히는 서랍입니다. `trigger`, `header`, `close`로 부품을 바꿉니다.",
      }),
    },
    {
      key: "Layout.LeftSider",
      type: "{ open, onCancel, children, width?, close?, className? }",
      desc: l.trans({
        en: "Controlled left drawer. `close={false}` draws no close control.",
        ko: "`open`으로 제어하는 왼쪽 서랍입니다. `close={false}`면 닫기 버튼을 그리지 않습니다.",
      }),
    },
    {
      key: "Layout.RightSider",
      type: "{ open, onCancel, children, title?, width?, close?, className? }",
      desc: l.trans({
        en: "Controlled right drawer, with a `title` slot the left one lacks.",
        ko: "`open`으로 제어하는 오른쪽 서랍이며, 왼쪽에는 없는 `title` 자리가 있습니다.",
      }),
    },
  ];

  const loadMembers = [
    {
      key: "Load.Units",
      type: "{ init, renderItem | renderList, … }",
      desc: l.trans({
        en: "Renders a slice's list and hydrates the store, so generated paging and refresh keep working.",
        ko: "slice 목록을 그리고 store를 hydrate합니다. 그래서 자동 생성된 페이지 넘김과 새로고침이 그대로 동작합니다.",
      }),
    },
    {
      key: "Load.View",
      type: "{ view, renderView, loading?, empty?, noDiv?, className? }",
      desc: l.trans({
        en: "Hydrates one full model and draws it with `renderView`; `noDiv` drops the wrapper element.",
        ko: "model 하나를 hydrate하고 `renderView`로 그립니다. `noDiv`면 감싸는 요소를 그리지 않습니다.",
      }),
    },
    {
      key: "Load.Edit",
      type: "{ edit, slice, type?, modal?, loading?, draft?, onSubmit?, onCancel?, submitText?, renderSubmit?, … }",
      default: 'type "modal"',
      desc: l.trans({
        en: "`edit` takes an edit payload, its promise, or a new-record seed. `type`: `modal`, `form`, `empty`.",
        ko: "`edit`에는 수정용 payload, 그 promise, 새 레코드용 seed를 넘깁니다. `type`은 `modal`, `form`, `empty` 중 하나입니다.",
      }),
    },
    {
      key: "Load.Pagination",
      type: "{ init, className?, scrollToTop? }",
      desc: l.trans({
        en: "A standalone pager on a list's `init`. It draws nothing while every row fits on one page.",
        ko: "목록의 `init`을 받는 독립 pager입니다. 한 페이지에 다 들어가면 아무것도 그리지 않습니다.",
      }),
    },
    {
      key: "Load.Stream",
      type: "{ of, fallback?, children }",
      desc: l.trans({
        en: "Awaits one promise behind its own Suspense boundary and hands the value to `children`.",
        ko: "promise 하나를 자기 Suspense 경계 안에서 기다렸다가 그 값을 `children`에 넘깁니다.",
      }),
    },
    {
      key: "Load.Page",
      type: "{ of, loader, render, loading?, noCache? }",
      desc: l.trans({
        en: "Route-level loader for SSR and CSR: `of` is the component CSR mounts, `loader` the shared fetch.",
        ko: "SSR과 CSR 공용 route 로더입니다. `of`는 CSR이 마운트할 컴포넌트, `loader`는 둘이 함께 쓰는 fetch입니다.",
      }),
    },
  ];

  const unitsOptions = [
    {
      key: "renderItem / renderList",
      type: "(item, idx) => ReactNode / (list) => ReactNode",
      desc: l.trans({
        en: "One of the two is required: draw each row, or the whole list at once.",
        ko: "둘 중 하나는 꼭 넘깁니다. 행마다 그리거나, 목록 전체를 한 번에 그립니다.",
      }),
    },
    {
      key: "empty / renderEmpty",
      type: "ReactNode / () => ReactNode",
      desc: l.trans({
        en: "Shown when the list has no rows. `empty` wins when both are given.",
        ko: "행이 없을 때 보여 줍니다. 둘 다 주면 `empty`가 우선합니다.",
      }),
    },
    {
      key: "loading",
      type: "ReactNode",
      desc: l.trans({
        en: "Fallback while `init` is pending and while a refetch runs.",
        ko: "`init`을 기다리는 동안과 다시 불러오는 동안 보여 줍니다.",
      }),
    },
    {
      key: "pagination",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "A pager on desktop, infinite scroll on mobile. Turn it off to place `Load.Pagination` yourself.",
        ko: "데스크톱에서는 pager, 모바일에서는 무한 스크롤입니다. `Load.Pagination`을 따로 두려면 끕니다.",
      }),
    },
    {
      key: "staleTime",
      type: "number (ms)",
      desc: l.trans({
        en: "How old seeded data may be before a mount refetches; `0` always refetches.",
        ko: "마운트할 때 다시 불러오지 않고 쓸 수 있는 seed 데이터의 최대 나이입니다. `0`이면 항상 다시 불러옵니다.",
      }),
    },
    {
      key: "from / to",
      type: "number",
      desc: l.trans({
        en: "Slice the rows `renderItem` draws, without refetching.",
        ko: "다시 불러오지 않고 `renderItem`이 그릴 행 범위만 자릅니다.",
      }),
    },
    {
      key: "filter / sort / reverse",
      type: "(item, idx) => boolean / (a, b) => number / boolean",
      desc: l.trans({
        en: "Filter, sort and reverse the rows already loaded, on the client.",
        ko: "이미 불러온 행을 클라이언트에서 거르고, 정렬하고, 뒤집습니다.",
      }),
    },
  ];

  const placeColumns = [
    { key: "page", label: l.trans({ en: "Page", ko: "page" }), caption: l.trans({ en: "server", ko: "서버" }) },
    { key: "zone", label: "Zone", caption: '"use client"' },
  ];
  const placeGroups = [
    {
      label: l.trans({ en: "Takes a render function", ko: "렌더 함수를 받는 멤버" }),
      rows: [
        {
          name: "Load.Units",
          desc: l.trans({
            en: "`renderItem` and `renderList` are functions, so a server page cannot pass them.",
            ko: "`renderItem`과 `renderList`는 함수라서 서버 page에서 넘길 수 없습니다.",
          }),
          marks: { page: false, zone: true },
        },
        {
          name: "Load.View",
          desc: l.trans({
            en: "`renderView` is a function too.",
            ko: "`renderView`도 함수입니다.",
          }),
          marks: { page: false, zone: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Takes only data", ko: "데이터만 받는 멤버" }),
      rows: [
        {
          name: "Load.Edit",
          desc: l.trans({
            en: "`edit`, `slice`, strings and `children` all cross the boundary.",
            ko: "`edit`, `slice`, 문자열, `children`은 모두 경계를 넘을 수 있습니다.",
          }),
          marks: { page: true, zone: true },
        },
        {
          name: "Load.Pagination",
          desc: l.trans({
            en: "Takes `init` and one flag.",
            ko: "`init`과 플래그 하나만 받습니다.",
          }),
          marks: { page: true, zone: true },
        },
        {
          name: "Load.Stream",
          desc: l.trans({
            en: 'Carries no "use client", so its `children` function runs wherever it is rendered.',
            ko: '"use client"가 없어서 `children` 함수는 그려지는 쪽에서 그대로 실행됩니다.',
          }),
          marks: { page: true, zone: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Route-level", ko: "route 전용" }),
      rows: [
        {
          name: "Load.Page",
          desc: l.trans({
            en: "`of`, `loader` and `render` are the function props a page may pass.",
            ko: "`of`, `loader`, `render`는 page가 넘겨도 되는 함수 prop입니다.",
          }),
          marks: { page: true, zone: false },
        },
      ],
    },
  ];

  const draftOption = [
    {
      key: "draft",
      type: "boolean | string",
      default: "true",
      desc: l.trans({
        en: "`false` turns recovery off; a string names the scope yourself.",
        ko: "`false`면 복구를 끄고, 문자열이면 scope를 직접 정합니다.",
      }),
    },
  ];

  const modelTriggers = [
    {
      key: "Model.New",
      type: "{ slice, children, trigger?, partial?, renderTitle?, modal?, namespace?, draft? }",
      desc: l.trans({
        en: "`children` is the form body, `partial` seeds it, `trigger` replaces the default New button.",
        ko: "`children`은 폼 본문, `partial`은 초기값, `trigger`는 기본 신규 버튼을 대신할 요소입니다.",
      }),
    },
    {
      key: "Model.Edit",
      type: "{ slice, modelId, children, trigger?, renderTitle?, modal?, draft? }",
      desc: l.trans({
        en: "The same pair for one record; `trigger` defaults to the framework's Edit button.",
        ko: "레코드 하나에 대한 같은 묶음입니다. `trigger` 기본값은 framework의 수정 버튼입니다.",
      }),
    },
  ];

  const modelWrappers = [
    {
      key: "Model.NewWrapper",
      type: "{ slice, children, partial?, setDefault?, modal?, resets?, namespace?, draft?, className? }",
      desc: l.trans({
        en: "Opens the create form on click. `resets` lists models whose `reset<Model>()` runs on open.",
        ko: "클릭하면 생성 폼을 엽니다. `resets`에 적은 model은 폼이 열릴 때 `reset<Model>()`이 실행됩니다.",
      }),
    },
    {
      key: "Model.EditWrapper",
      type: "{ slice, modelId, children, modal?, disabled?, resets?, draft?, className? }",
      desc: l.trans({ en: "Opens one record in the edit form.", ko: "레코드 하나를 수정 폼으로 엽니다." }),
    },
    {
      key: "Model.ViewWrapper",
      type: "{ slice, modelId, children, modal?, resets?, className? }",
      desc: l.trans({ en: "Opens one record in the detail view.", ko: "레코드 하나를 상세 보기로 엽니다." }),
    },
    {
      key: "Model.RemoveWrapper",
      type: "{ slice, modelId, name, children, modal?, className? }",
      desc: l.trans({
        en: "Asks in a small confirm popover, then removes the record.",
        ko: "작은 확인 팝오버로 한 번 묻고 레코드를 삭제합니다.",
      }),
    },
  ];

  const modelBodies = [
    {
      key: "Model.EditModal",
      type: "{ slice, children, edit?, type?, id?, renderTitle?, submitText?, renderSubmit?, onSubmit?, onCancel?, draft?, draftBarClassName?, … }",
      desc: l.trans({
        en: 'The edit shell with no trigger. `onSubmit` / `onCancel`: `"back"`, `"reset"`, a path, or a callback.',
        ko: 'trigger 없는 수정 셸입니다. `onSubmit` / `onCancel`에는 `"back"`, `"reset"`, 경로, 콜백 중 하나를 넘깁니다.',
      }),
    },
    {
      key: "Model.ViewModal",
      type: "{ id, slice, renderView, renderTitle?, renderAction?, modal?, modalClassName?, viewClassName? }",
      desc: l.trans({
        en: "The detail view in a modal, with title and action slots.",
        ko: "상세 보기를 modal로 띄우며, 제목과 action 자리가 있습니다.",
      }),
    },
    {
      key: "Model.ViewEditModal",
      type: "{ slice, renderView, renderTemplate, renderTitle?, menu?, editLabel?, saveLabel? }",
      desc: l.trans({
        en: "One modal that flips between view and form; edit and the remove entry appear only for verbs the slice's guards open, and `menu={false}` drops the kebab.",
        ko: "상세 보기와 폼을 오가는 modal 하나입니다. 수정 버튼과 삭제 항목은 slice guards가 연 동작에만 나타나며, `menu={false}`면 케밥 메뉴가 빠집니다.",
      }),
    },
    {
      key: "Model.View",
      type: "{ model, render, modelLoading?, loading?, empty?, loadingWrapper?, className? }",
      default: "modelLoading true",
      desc: l.trans({
        en: "The store-side `Load.View`: loaded, loading or empty from one model. Pass the store's loading flag.",
        ko: "store 쪽 `Load.View`입니다. model 하나로 불러온 상태, 로딩 중, 빈 상태를 그리며 store의 로딩 값을 꼭 넘깁니다.",
      }),
    },
    {
      key: "Model.AdminPanel",
      type: "{ slice, components, columns?, actions?, tools?, summaryColumns?, insightColumns?, queryMap? }",
      desc: l.trans({
        en: "A whole admin screen built from the generated `Unit`, `Template` and `View` namespaces.",
        ko: "생성된 `Unit`, `Template`, `View` namespace로 만드는 관리자 화면 전체입니다.",
      }),
    },
    {
      key: "Model.LoadInit / Model.LoadView",
      type: "{ init } / { view }",
      desc: l.trans({
        en: "Seed the client store from a fetch result and render nothing.",
        ko: "fetch 결과로 클라이언트 store를 채우기만 하고, 아무것도 그리지 않습니다.",
      }),
    },
  ];

  const modelRemovals = [
    {
      key: "Model.Remove",
      type: "{ slice, modelId, children, name?, title?, description?, action?, modal?, redirect? }",
      desc: l.trans({
        en: "`children` opens a confirmation modal. A custom `action` must do the removal itself.",
        ko: "`children`을 누르면 확인 modal이 열립니다. `action`을 바꾸면 삭제도 그 안에서 직접 해야 합니다.",
      }),
    },
    {
      key: "Model.SureToRemove",
      type: "{ slice, modelId, name, trigger?, title?, description?, confirmLabel?, typeNameToRemove?, redirect? }",
      desc: l.trans({
        en: "Heavier removal: `typeNameToRemove` keeps the button locked until the user retypes `name`.",
        ko: "더 신중한 삭제입니다. `typeNameToRemove`면 사용자가 `name`을 다시 입력할 때까지 버튼이 잠깁니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="core-ui" title={l.trans({ en: "Core UI", ko: "핵심 UI" })}>
        <Docs.Title>{l.trans({ en: "Core UI", ko: "핵심 UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The five <code>akanjs/ui</code> components almost every screen uses. Each section below lists the
                  props and ends with one working example.
                </span>
              ),
              ko: (
                <span>
                  거의 모든 화면이 쓰는 <code>akanjs/ui</code> 컴포넌트 다섯 개입니다. 아래 섹션마다 props를 정리하고,
                  실제로 동작하는 예시 하나로 마무리합니다.
                </span>
              ),
            })}
            <code className={chip}>{'import { Image, Layout, Link, Load, Model } from "akanjs/ui";'}</code>
          </div>
          <Docs.IntroTable type={l.trans({ en: "Component", ko: "컴포넌트" })} items={componentRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Link" title="Link">
        <Docs.Title>Link</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Navigates between internal routes. Use it for every internal link, and keep a bare{" "}
                  <code>{"<a>"}</code> for <code>mailto:</code> and external addresses only.
                </span>
              ),
              ko: (
                <span>
                  앱 내부 route 사이를 이동합니다. 내부 링크에는 항상 <code>Link</code>를 쓰고, <code>{"<a>"}</code>{" "}
                  태그는 <code>mailto:</code>와 외부 주소에만 직접 씁니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>Props</Docs.SubSubTitle>
          <Docs.OptionTable items={linkProps} />
          <Docs.SubSubTitle>Link.Back · Link.Close · Link.Lang</Docs.SubSubTitle>
          <Docs.OptionTable items={linkHelpers} />
          <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A product card that links to its page and stays highlighted while that page is open:",
              ko: "상품 페이지로 가는 카드입니다. 그 페이지가 열려 있는 동안 강조 표시가 유지됩니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/Product.Unit.tsx"
            code={`import type { cnst } from "@apps/shop/client";
import type { ModelProps } from "akanjs/client";
import { Link } from "akanjs/ui";

export const Card = ({ product }: ModelProps<"product", cnst.LightProduct>) => {
  return (
    <Link
      href={\`/product/\${product.id}\`}
      className="block rounded-xl border p-4"
      activeClassName="border-primary"
    >
      {product.name}
    </Link>
  );
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Active is a prefix match.</strong> <code>/product/1/edit</code> also counts as the card's
                    page; add <code>activeExact</code> to stop that.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>활성 여부는 앞부분 일치로 봅니다.</strong> <code>/product/1/edit</code>에서도 이 카드가
                    활성으로 보이므로, 막으려면 <code>activeExact</code>를 붙입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No client boundary needed.</strong> <code>Link</code> works in a server component, so this
                    Unit carries no <code>{'"use client"'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>클라이언트 경계가 필요 없습니다.</strong> <code>Link</code>는 서버 컴포넌트에서 그대로
                    동작하므로 이 Unit에는 <code>{'"use client"'}</code>가 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Image" title="Image">
        <Docs.Title>Image</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Draws an uploaded file or a URL. On server-rendered pages the request goes through Akan's image
                  optimizer at <code>/_akan/image</code>, which returns a copy resized to fit.
                </span>
              ),
              ko: (
                <span>
                  업로드한 파일이나 URL을 이미지로 그립니다. 서버 렌더링 페이지에서는 Akan 이미지 최적화기(
                  <code>/_akan/image</code>)를 거쳐, 크기에 맞게 줄인 사본을 받습니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>Props</Docs.SubSubTitle>
          <Docs.OptionTable items={imageProps} />
          <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A 48px avatar from the image the user uploaded:",
              ko: "사용자가 올린 이미지로 만든 48px 아바타입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/user/User.Unit.tsx"
            code={`import type { cnst } from "@apps/shop/client";
import type { ModelProps } from "akanjs/client";
import { Image } from "akanjs/ui";

export const Avatar = ({ user }: ModelProps<"user", cnst.LightUser>) => {
  return (
    <Image file={user.image} alt={user.nickname} width={48} height={48} className="rounded-full" />
  );
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>1x and 2x copies.</strong> With a <code>width</code> and no <code>sizes</code>, the
                    optimizer serves both, so this avatar gets a 48px and a 96px file.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>1x·2x 사본.</strong> <code>width</code>만 있고 <code>sizes</code>가 없으면 두 가지를 모두
                    만듭니다. 이 아바타는 48px과 96px 파일을 받습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Never optimized:</strong> SVG files and <code>data:</code> / <code>blob:</code> URLs are
                    served as they are.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>최적화하지 않는 것:</strong> SVG 파일과 <code>data:</code> / <code>blob:</code> URL은 그대로
                    내보냅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The CSR bundle</strong> (the mobile app) renders the original URL, because the optimizer
                    runs on the server.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>CSR 번들</strong>(모바일 앱)은 원본 URL을 그립니다. 최적화기는 서버에서 돌기 때문입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Layout" title="Layout">
        <Docs.Title>Layout</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The page frame. Pick a member by where it goes: inside a module file, above or below the scrolling body, or over the page.",
              ko: "페이지의 틀입니다. 멤버는 놓을 자리로 고릅니다. 모듈 파일 안, 스크롤 본문의 위아래, 그리고 페이지 위에 겹치는 자리입니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Content containers", ko: "콘텐츠 컨테이너" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={layoutContainers} />
          <Docs.SubSubTitle>{l.trans({ en: "Top and bottom chrome", ko: "위아래 chrome" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Navbar, TopInset, BottomInset and BottomTab register their height with the route, so the scrolling body is never hidden behind them.",
              ko: "Navbar, TopInset, BottomInset, BottomTab은 자기 높이를 route에 등록합니다. 그래서 스크롤 본문이 그 뒤에 가려지지 않습니다.",
            })}
          </div>
          <Docs.OptionTable items={layoutChrome} />
          <Docs.SubSubTitle>{l.trans({ en: "Header and drawers", ko: "헤더와 서랍" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "These four draw over the page and register no height.",
              ko: "이 넷은 페이지 위에 그려지며, 높이를 등록하지 않습니다.",
            })}
          </div>
          <Docs.OptionTable items={layoutOverlays} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Close glyph.</strong> With <code>back</code>, the navbar draws ✕ instead of the chevron when
                    the route's transition is <code>bottomUp</code>, <code>scaleOut</code> or <code>fade</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>닫기 표시.</strong> <code>back</code>을 켜면, route 전환이 <code>bottomUp</code>,{" "}
                    <code>scaleOut</code>, <code>fade</code>일 때는 화살표 대신 ✕를 그립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>renderTab</code> draws the whole tab body,
                    </strong>{" "}
                    badge included. The framework keeps only the link and the active match, so draw{" "}
                    <code>notiCount</code> yourself.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>renderTab</code>은 탭 본문 전체를 그립니다.
                    </strong>{" "}
                    배지도 포함입니다. framework는 링크와 활성 판정만 맡으므로 <code>notiCount</code>는 직접 그립니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Layout.Navbar ignores title, left and right.</strong> They are in its prop type, but only{" "}
                  <code>children</code> and <code>back</code> reach the screen. Build the title and the trailing
                  controls inside <code>children</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>Layout.Navbar는 title, left, right를 무시합니다.</strong> prop 타입에는 있지만 화면에 닿는
                  것은 <code>children</code>과 <code>back</code>뿐입니다. 제목과 오른쪽 버튼은 <code>children</code>{" "}
                  안에서 조합합니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A detail page with a back button and an edit link in the navbar:",
              ko: "navbar에 뒤로 가기 버튼과 수정 링크를 둔 상세 페이지입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/page/order/[orderId]/_index.tsx"
            code={`import { fetch, Order, usePage } from "@apps/shop/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";

export default page()
  .param("orderId", ID)
  .render(async ({ orderId }) => {
    const { l } = usePage();
    const [{ order, orderView }] = await Promise.all([
      fetch.viewOrder(orderId),
    ]);
    return (
      <>
        <Layout.Navbar back>
          <div className="flex w-full items-center justify-between">
            <div className="font-bold">{order.name}</div>
            <Link href={\`/order/\${orderId}/edit\`}>{l("base.edit")}</Link>
          </div>
        </Layout.Navbar>
        <Order.Zone.View view={orderView} />
      </>
    );
  });`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Anywhere in the tree.</strong> The navbar portals its content into the top inset, so the
                    page renders it right beside the body.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>트리 어디에 두어도 됩니다.</strong> navbar는 내용을 상단 inset으로 옮겨 그리므로, page는
                    본문 바로 옆에 두면 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The page stays on the server.</strong> <code>children</code> and <code>back</code> are plain
                    props, so the page needs no <code>{'"use client"'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>page는 서버에 그대로 남습니다.</strong> <code>children</code>과 <code>back</code>은 평범한
                    prop이라 page에 <code>{'"use client"'}</code>가 필요 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "A list row that opens the order when tapped:",
              ko: "누르면 주문 상세로 가는 목록 행입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/order/Order.Unit.tsx"
            code={`import type { cnst } from "@apps/shop/client";
import type { ModelProps } from "akanjs/client";
import { Layout } from "akanjs/ui";

export const Card = ({ order }: ModelProps<"order", cnst.LightOrder>) => {
  return (
    <Layout.Unit href={\`/order/\${order.id}\`}>
      <div className="font-bold">{order.name}</div>
    </Layout.Unit>
  );
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Without <code>href</code>
                    </strong>{" "}
                    the unit is a plain container and nothing is clickable.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>href</code>가 없으면
                    </strong>{" "}
                    평범한 컨테이너일 뿐 누를 수 있는 곳이 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Load" title="Load">
        <Docs.Title>Load</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Turns a <code>fetch.*</code> result into markup. Every member accepts the awaited value or the
                  promise; a pending promise waits behind its own Suspense boundary, so one slow section never holds the
                  page.
                </span>
              ),
              ko: (
                <span>
                  <code>fetch.*</code> 결과를 화면으로 바꿉니다. 모든 멤버가 await한 값과 promise를 둘 다 받습니다. 아직
                  끝나지 않은 promise는 자기 Suspense 경계 안에서 기다리므로, 느린 섹션 하나가 페이지 전체를 붙잡지
                  않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Members", ko: "멤버" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={loadMembers} />
          <Docs.SubSubTitle>{l.trans({ en: "Load.Units options", ko: "Load.Units 옵션" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={unitsOptions} />
          <Docs.SubSubTitle>{l.trans({ en: "Where each member goes", ko: "멤버를 두는 곳" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A function cannot cross from a server page into a client component. So the members that take a render
                  function live in a <code>Zone</code>, and the page hands that Zone its promise.
                </span>
              ),
              ko: (
                <span>
                  함수는 서버 page에서 클라이언트 컴포넌트로 넘어갈 수 없습니다. 그래서 렌더 함수를 받는 멤버는{" "}
                  <code>Zone</code>에 두고, page는 그 Zone에 promise를 넘깁니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Member", ko: "멤버" })}
            columns={placeColumns}
            groups={placeGroups}
            markLabel={l.trans({ en: "Works here", ko: "여기에 둘 수 있습니다" })}
            emptyLabel={l.trans({ en: "Not here", ko: "여기에는 두지 않습니다" })}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "Example: a page and its Zone", ko: "예시: page와 Zone" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The page starts every query and hands out the promises:",
              ko: "page는 모든 query를 시작하고 promise를 나눠 줍니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/page/shop/[shopId]/product/[productId]/_index.tsx"
            code={`import { fetch, Product } from "@apps/shop/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load, Loading } from "akanjs/ui";

export default page()
  .param("shopId", ID)
  .param("productId", ID)
  .render(({ shopId, productId }) => {
    const { productView } = fetch.viewProduct(productId);
    const { productInitInShop, productListInShop } =
      fetch.initProductInShop(shopId);
    return (
      <>
        <Product.Zone.View view={productView} />
        <Product.Zone.Card init={productInitInShop} />
        <Load.Stream
          of={productListInShop}
          fallback={<Loading.Skeleton active />}
        >
          {(productList) => <Product.Unit.Total count={productList.length} />}
        </Load.Stream>
      </>
    );
  });`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Hand the promise, not the awaited value.</strong>{" "}
                    <code>fetch.initProductInShop(shopId)</code> puts both queries in flight, and each section renders
                    when its own data lands.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>await한 값 대신 promise를 넘깁니다.</strong> <code>fetch.initProductInShop(shopId)</code>는
                    두 query를 동시에 띄우고, 섹션마다 자기 데이터가 도착하는 대로 그려집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>List data stays on the server.</strong> <code>productListInShop</code> and{" "}
                    <code>productInsightInShop</code> hold hydrated model instances, which React refuses as client
                    props. Read them in a server component, as <code>Load.Stream</code> does here, never as a{" "}
                    <code>Zone</code> prop.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>목록 데이터는 서버에 둡니다.</strong> <code>productListInShop</code>과{" "}
                    <code>productInsightInShop</code>에는 hydrate된 model 인스턴스가 들어 있어, React가 클라이언트
                    prop으로 받지 않습니다. 여기의 <code>Load.Stream</code>처럼 서버 컴포넌트에서 읽고,{" "}
                    <code>Zone</code> prop으로는 넘기지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "The Zone holds the two members that take a render function:",
              ko: "Zone에는 렌더 함수를 받는 두 멤버를 둡니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/Product.Zone.tsx"
            code={`"use client";
import { type cnst, Product } from "@apps/shop/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"product", cnst.LightProduct>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        pagination={false}
        renderItem={(product) => (
          <Product.Unit.Card key={product.id} product={product} />
        )}
      />
      <Load.Pagination init={init} scrollToTop />
    </>
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"product", cnst.Product>;
}
export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(product) => <Product.View.General product={product} />}
    />
  );
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>pagination={"{false}"}</code>
                    </strong>{" "}
                    because <code>Load.Pagination</code> draws the pager below. With the default, the list would draw a
                    second one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>pagination={"{false}"}</code>
                    </strong>
                    는 아래의 <code>Load.Pagination</code>이 pager를 그리기 때문입니다. 기본값 그대로면 목록이 pager를
                    하나 더 그립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The Zone draws no markup of its own.</strong> Rows go to <code>Product.Unit.Card</code> and
                    the detail to <code>Product.View.General</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Zone은 자기 마크업을 그리지 않습니다.</strong> 행은 <code>Product.Unit.Card</code>에, 상세는{" "}
                    <code>Product.View.General</code>에 맡깁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Form drafts", ko: "폼 draft 복구" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Load.Edit</code>, <code>Model.EditModal</code>, <code>Model.New</code> and{" "}
                  <code>Model.Edit</code> save the form as the user types and offer it back the next time it opens.
                </span>
              ),
              ko: (
                <span>
                  <code>Load.Edit</code>, <code>Model.EditModal</code>, <code>Model.New</code>, <code>Model.Edit</code>
                  는 사용자가 입력하는 대로 폼을 저장해 두고, 다음에 열 때 복구를 제안합니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={draftOption} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Scope.</strong> The record id for an edit, and the seed plus the route for a new form,
                    always per signed-in user.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>scope.</strong> 수정 폼은 레코드 id, 새 폼은 seed와 route로 나뉘며, 언제나 로그인한
                    사용자별로 따로 저장됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Never saved:</strong> <code>field.secret</code> and <code>field.hidden</code> values.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>저장하지 않는 값:</strong> <code>field.secret</code>과 <code>field.hidden</code> 값입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Do not persist form values yourself.</strong> The old per-field <code>cache</code> /{" "}
                    <code>cacheKey</code> props are gone: they covered five control types, keyed on the translated
                    label, and restored over server data.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>폼 값을 직접 저장하지 않습니다.</strong> 예전의 field별 <code>cache</code> /{" "}
                    <code>cacheKey</code> prop은 없어졌습니다. 입력 컨트롤 다섯 종류만 다뤘고, 번역된 label을 key로
                    썼으며, 서버 데이터 위에 덮어썼기 때문입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Model" title="Model">
        <Docs.Title>Model</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Create, edit, view and remove shells wired to a model's generated store. Use them in a module's{" "}
                  <code>Util</code>, <code>View</code> or <code>Zone</code>, where the store actions are already in
                  scope.
                </span>
              ),
              ko: (
                <span>
                  model마다 자동으로 만들어지는 store에 연결된 생성·수정·조회·삭제 셸입니다. 그 store action을 바로 쓸
                  수 있는 모듈의 <code>Util</code>, <code>View</code>, <code>Zone</code> 파일에서 씁니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "A trigger and its modal in one line", ko: "trigger와 modal을 한 줄로" })}
          </Docs.SubSubTitle>
          <Docs.OptionTable items={modelTriggers} />
          <Docs.SubSubTitle>
            {l.trans({ en: "Wrappers: your element becomes the trigger", ko: "wrapper: 감싼 요소가 trigger가 됩니다" })}
          </Docs.SubSubTitle>
          <Docs.OptionTable items={modelWrappers} />
          <Docs.SubSubTitle>
            {l.trans({ en: "Modals and bodies with no trigger", ko: "trigger 없는 modal과 본문" })}
          </Docs.SubSubTitle>
          <Docs.OptionTable items={modelBodies} />
          <Docs.SubSubTitle>{l.trans({ en: "Removal", ko: "삭제" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Both take <code>redirect</code>: <code>"back"</code>, or a path to open after the removal.
                </span>
              ),
              ko: (
                <span>
                  둘 다 <code>redirect</code>를 받습니다. <code>"back"</code>이나, 삭제 뒤에 열 경로를 넘깁니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={modelRemovals} />
          <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Edit and remove buttons for one product, and a create button with its own label:",
              ko: "상품 하나의 수정·삭제 버튼과, 문구를 바꾼 생성 버튼입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/Product.Util.tsx"
            code={`"use client";
import { fetch, Product, usePage } from "@apps/shop/client";
import { cn } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui";

interface ManageProps {
  className?: string;
  productId: string;
  name: string;
}
export const Manage = ({ className, productId, name }: ManageProps) => {
  return (
    <div className={cn("flex gap-2", className)}>
      <Model.Edit slice={fetch.slice.product} modelId={productId}>
        <Product.Template.General />
      </Model.Edit>
      <Model.SureToRemove
        slice={fetch.slice.product}
        modelId={productId}
        name={name}
        typeNameToRemove
      />
    </div>
  );
};

export const Create = () => {
  const { l } = usePage();
  return (
    <Model.New
      slice={fetch.slice.product}
      partial={{ status: "draft" }}
      trigger={
        <button className={buttonRecipe({ variant: "outline" })}>
          {l.trans({ en: "Add product", ko: "상품 추가" })}
        </button>
      }
    >
      <Product.Template.General />
    </Model.New>
  );
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Only <code>trigger</code> replaces the opener.
                    </strong>{" "}
                    <code>Model.New</code> and <code>Model.Edit</code> spend <code>children</code> on the form body and
                    take no <code>className</code>; <code>Model.SureToRemove</code> takes no children at all.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      여는 요소를 바꾸는 것은 <code>trigger</code>뿐입니다.
                    </strong>{" "}
                    <code>Model.New</code>와 <code>Model.Edit</code>의 <code>children</code>은 폼 본문이고{" "}
                    <code>className</code>도 없습니다. <code>Model.SureToRemove</code>는 children을 아예 받지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A second create button for the same slice needs <code>namespace</code>.
                    </strong>{" "}
                    It suffixes the tool name the button publishes to the in-page agent.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      같은 slice에 생성 버튼을 하나 더 두면 <code>namespace</code>가 필요합니다.
                    </strong>{" "}
                    버튼이 인페이지 에이전트에 공개하는 tool 이름 뒤에 붙습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>AdminPanel</code> uses each role's <code>General</code> export,
                    </strong>{" "}
                    falling back to the first export (<code>Card</code> first for <code>Unit</code>). A role with no
                    export is skipped.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>AdminPanel</code>은 역할마다 <code>General</code> export를 씁니다.
                    </strong>{" "}
                    없으면 첫 export를 쓰고(<code>Unit</code>은 <code>Card</code>를 먼저 봅니다), export가 하나도 없는
                    역할은 건너뜁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Each export has its own Suspense boundary,</strong> because these mount on interaction, long
                    after the page is painted.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>export마다 자기 Suspense 경계가 있습니다.</strong> 페이지가 그려지고 한참 뒤, 사용자가
                    조작할 때 마운트되기 때문입니다.
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
