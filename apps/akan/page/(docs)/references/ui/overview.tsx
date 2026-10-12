import { usePage } from "@apps/akan/client";
import { Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";
import type { ReactNode } from "react";

export default page().render(() => {
  const { l } = usePage();

  const pages = [
    {
      href: "/references/ui/core",
      title: l.trans({ en: "Core", ko: "핵심 (Core)" }),
      components: "Link, Image, Layout, Load, Model",
      desc: l.trans({
        en: "The parts most pages are built from: routing, images, page shells, data loading, model CRUD.",
        ko: "대부분의 페이지를 이루는 기본 부품입니다. 라우팅, 이미지, 페이지 셸, 데이터 로딩, 모델 CRUD를 다룹니다.",
      }),
    },
    {
      href: "/references/ui/display",
      title: l.trans({ en: "Display", ko: "표시 (Display)" }),
      components: "Data, RecentTime, Loading, Empty, Table, Pagination, Badge",
      desc: l.trans({
        en: "Showing data and feedback: admin lists, relative times, loading and empty states, badges, tables.",
        ko: "데이터와 피드백을 보여 줍니다. 관리자 목록, 상대 시각, 로딩·빈 상태, 배지, 표가 있습니다.",
      }),
    },
    {
      href: "/references/ui/forms",
      title: l.trans({ en: "Forms", ko: "폼 (Forms)" }),
      components: "Field, Input, Select, Switch, Radio, ToggleSelect, DatePicker, Button",
      desc: l.trans({
        en: "Form controls and buttons for templates, filters and admin screens.",
        ko: "템플릿, 필터, 관리자 화면에서 쓰는 폼 컨트롤과 버튼입니다.",
      }),
    },
    {
      href: "/references/ui/overlays",
      title: l.trans({ en: "Overlays", ko: "오버레이 (Overlays)" }),
      components: "Modal, Dialog, Popconfirm, Dropdown, BottomSheet, Tooltip, Menu, Portal, Copy",
      desc: l.trans({
        en: "What opens over the page: modals, confirmations, sheets, menus, hints and copy buttons.",
        ko: "페이지 위에 뜨는 것들입니다. 모달, 확인 창, 시트, 메뉴, 힌트, 복사 버튼이 있습니다.",
      }),
    },
    {
      href: "/references/ui/system",
      title: l.trans({ en: "System", ko: "시스템 (System)" }),
      components: "System, ClientSide, Signal, Tab, animated",
      desc: l.trans({
        en: "The app shell, client-only boundaries, the API explorer, tabs and animation.",
        ko: "앱 셸, 클라이언트 전용 경계, API 탐색기, 탭, 애니메이션입니다.",
      }),
    },
    {
      href: "/references/ui/agent",
      title: l.trans({ en: "Agent", ko: "에이전트 (Agent)" }),
      components: "Agent.Chat, Agent.Zone, Agent.Guide, Agent.History, Agent.Skip, Agent.Scope, Agent.Dock",
      desc: l.trans({
        en: "The in-page agent: the layout chat, zones with their own conversation, route guidance, the dev dock.",
        ko: "인페이지 에이전트입니다. 레이아웃의 채팅 하나, 자기 대화를 갖는 zone, 라우트 지침, 개발용 도크가 있습니다.",
      }),
    },
    {
      href: "/references/ui/customize",
      title: l.trans({ en: "Customization", ko: "커스터마이즈" }),
      components: l.trans({ en: "_overrides.tsx, override(), 46 slots", ko: "_overrides.tsx, override(), 슬롯 46개" }),
      desc: l.trans({
        en: "Swap framework components per route with a `page/**/_overrides.tsx` file; call sites stay.",
        ko: "`page/**/_overrides.tsx` 파일 하나로 프레임워크 컴포넌트를 라우트 단위로 바꿉니다. 호출부는 그대로입니다.",
      }),
    },
    {
      href: "/docs/arch/ui-recipe",
      title: l.trans({ en: "Recipes", ko: "레시피 (Recipe)" }),
      components: "buttonRecipe, badgeRecipe, inputRecipe",
      desc: l.trans({
        en: "The className factories: use one, add one in `apps/<app>/ui/Recipe/`, or swap one via `recipes`.",
        ko: "className 팩토리입니다. 가져다 쓰거나, `apps/<app>/ui/Recipe/`에 만들거나, `recipes` 키로 교체합니다.",
      }),
    },
  ];

  const core = { label: l.trans({ en: "Core", ko: "핵심" }), href: "/references/ui/core" };
  const display = { label: l.trans({ en: "Display", ko: "표시" }), href: "/references/ui/display" };
  const forms = { label: l.trans({ en: "Forms", ko: "폼" }), href: "/references/ui/forms" };
  const overlays = { label: l.trans({ en: "Overlays", ko: "오버레이" }), href: "/references/ui/overlays" };
  const system = { label: l.trans({ en: "System", ko: "시스템" }), href: "/references/ui/system" };
  const agent = { label: l.trans({ en: "Agent", ko: "에이전트" }), href: "/references/ui/agent" };
  const custom = { label: l.trans({ en: "Customization", ko: "커스터마이즈" }), href: "/references/ui/customize" };
  const here = { label: l.trans({ en: "Only here", ko: "여기서만" }), href: "" };

  const customApi = "/references/ui/customize#how-it-works";
  const customSlots = "/references/ui/customize#slots";

  const defaultParts = [
    "DefaultApproval",
    "DefaultBubble",
    "DefaultCode",
    "DefaultComposer",
    "DefaultLauncher",
    "DefaultMarkdown",
    "DefaultAgentMenu",
    "DefaultQuestion",
    "DefaultQueued",
    "DefaultSteps",
    "DefaultToolCard",
    "DefaultToast",
    "DefaultToastItem",
  ];

  const on = (area: { label: string; href: string }, text: ReactNode) => (
    <span>
      {area.href ? (
        <Link href={area.href} className="font-semibold text-primary hover:underline">
          {area.label}
        </Link>
      ) : (
        <strong className="text-foreground/50">{area.label}</strong>
      )}
      <span className="text-foreground/40"> · </span>
      <Docs.CodeText>{text}</Docs.CodeText>
    </span>
  );

  const exportRows = [
    {
      name: "Agent",
      href: "/references/ui/agent#agent-ui",
      area: agent,
      en: "The in-page agent namespace, with twelve members.",
      ko: "인페이지 에이전트 네임스페이스이며, 멤버는 12개입니다.",
    },
    {
      name: "AgentAttachments",
      area: agent,
      en: "The attachment chips, drawn in the composer and on each sent message.",
      ko: "첨부 파일 칩입니다. 입력창과 보낸 메시지에 붙습니다.",
    },
    {
      name: "agentAttrs",
      href: customApi,
      area: custom,
      en: "The `data-akan-*` attributes for a handler passed by reference; spread them on your own control.",
      ko: "참조로 넘긴 핸들러의 `data-akan-*` 속성입니다. 직접 만든 컨트롤에 펼쳐 넣습니다.",
    },
    {
      name: "AgentProvider",
      area: agent,
      en: "Hands a subtree one session, passed in or built from a `runner`; an `Agent.Chat` inside uses it.",
      ko: "하위 트리에 세션 하나를 내려 줍니다. 세션은 직접 넘기거나 `runner`로 만들고, 그 안의 `Agent.Chat`이 이 세션을 씁니다.",
    },
    {
      name: "AgentReferences",
      area: agent,
      en: "The `@` reference chips, drawn in the composer and on each sent message.",
      ko: "`@` 참조 칩입니다. 입력창과 보낸 메시지에 붙습니다.",
    },
    {
      name: "AgentSession",
      area: agent,
      en: "The conversation loop that runs in the browser; build one to own the transcript yourself.",
      ko: "브라우저에서 도는 대화 루프입니다. 대화 기록을 직접 소유하려면 이것을 만듭니다.",
    },
    {
      name: "agentSessionOf",
      area: agent,
      en: "Builds an `AgentSession` from the same options `Agent.Chat` takes.",
      ko: "`Agent.Chat`이 받는 것과 같은 옵션으로 `AgentSession`을 만듭니다.",
    },
    {
      name: "animated",
      href: "/references/ui/system#animated",
      area: system,
      en: "The react-spring animated elements: `div`, `g` and `progress`.",
      ko: "react-spring으로 움직이는 `div`, `g`, `progress` 요소입니다.",
    },
    {
      name: "Badge",
      href: "/references/ui/display#Badge",
      area: display,
      en: "The status pill.",
      ko: "상태를 보여 주는 작은 배지입니다.",
    },
    {
      name: "badgeRecipe",
      href: "/references/ui/customize#recipe-slots",
      area: custom,
      en: "The badge's className factory, and a recipe slot.",
      ko: "배지의 className 팩토리이며, 레시피 슬롯이기도 합니다.",
    },
    {
      name: "BottomSheet",
      href: "/references/ui/overlays#BottomSheet",
      area: overlays,
      en: "The mobile sheet, `half` or `full` height.",
      ko: "모바일용 시트이며, 높이는 `half`와 `full` 두 가지입니다.",
    },
    {
      name: "Button",
      href: "/references/ui/forms#Button",
      area: forms,
      en: "The one button primitive; an `onClick` that returns a promise turns on its async states.",
      ko: "하나뿐인 버튼 부품입니다. `onClick`이 promise를 반환하면 비동기 상태가 켜집니다.",
    },
    {
      name: "buttonRecipe",
      href: "/references/ui/customize#recipe-slots",
      area: custom,
      en: "The button's className factory, and a recipe slot.",
      ko: "버튼의 className 팩토리이며, 레시피 슬롯이기도 합니다.",
    },
    {
      name: "ChatCommands",
      area: agent,
      en: "The chat's slash-command registry: the whole `/` menu.",
      ko: "채팅의 슬래시 명령 목록이며, `/` 메뉴 전체입니다.",
    },
    {
      name: "ClientSide",
      href: "/references/ui/system#ClientSide",
      area: system,
      en: "A small Suspense boundary for client-only content.",
      ko: "클라이언트 전용 콘텐츠를 감싸는 작은 Suspense 경계입니다.",
    },
    {
      name: "Clipboard",
      area: overlays,
      en: "A bare copy icon that turns into a check; `Copy` is the one with a success toast.",
      ko: "복사 아이콘 하나이며 누르면 체크 표시로 바뀝니다. 성공 토스트까지 띄우는 쪽은 `Copy`입니다.",
    },
    {
      name: "Constant",
      href: "/cheatsheet/dev/constants",
      area: system,
      en: "`Doc` and `Graph`: constant models as a schema document and as a relation graph.",
      ko: "`Doc`과 `Graph`입니다. constant 모델을 스키마 문서와 관계 그래프로 그립니다.",
    },
    {
      name: "Copy",
      href: "/references/ui/overlays#Copy",
      area: overlays,
      en: "Wraps a trigger; a click copies text to the clipboard and shows a global success message.",
      ko: "트리거를 감쌉니다. 누르면 텍스트를 클립보드에 복사하고 전역 성공 메시지를 띄웁니다.",
    },
    {
      name: "createOverridable",
      href: customApi,
      area: custom,
      en: "Makes a framework component resolve through a route's override slot.",
      ko: "프레임워크 컴포넌트가 라우트의 override 슬롯을 거쳐 결정되게 만듭니다.",
    },
    {
      name: "CsrImage",
      area: core,
      en: "`Image` without the optimizer: a plain `img` for a CSR-only bundle.",
      ko: "최적화를 거치지 않는 `Image`입니다. CSR 전용 번들을 위해 일반 `img`를 그립니다.",
    },
    {
      name: "Data",
      href: "/references/ui/display#Data",
      area: display,
      en: "The admin listing screen, in nine parts.",
      ko: "관리자 목록 화면이며, 부품은 9개입니다.",
    },
    {
      name: "DatePicker",
      href: "/references/ui/forms#DatePicker",
      area: forms,
      en: "The browser's native date field, plus `RangePicker` and `TimePicker`.",
      ko: "브라우저 기본 날짜 입력이며, `RangePicker`와 `TimePicker`가 함께 있습니다.",
    },
    {
      name: defaultParts,
      href: defaultParts.map(() => customApi),
      area: custom,
      en: "The shipped default behind each matching slot, public so a replacement can compose it.",
      ko: "각 슬롯의 기본 구현입니다. 교체 컴포넌트가 가져다 조합할 수 있게 공개되어 있습니다.",
    },
    {
      name: "Dialog",
      href: "/references/ui/overlays#Dialog",
      area: overlays,
      en: "The headless dialog namespace that `Modal` is built on.",
      ko: "`Modal`의 바탕이 되는 헤드리스 다이얼로그 네임스페이스입니다.",
    },
    {
      name: "DragAction",
      area: here,
      en: "A row that reveals a left and a right action when swiped, built from `Body`, `Left` and `Right`.",
      ko: "옆으로 밀면 왼쪽·오른쪽 동작이 드러나는 행입니다. `Body`, `Left`, `Right`로 조립합니다.",
    },
    {
      name: "DraggableList",
      area: here,
      en: "A drag-to-sort list with `Item` and `Cursor`; `Field.TextList` is built on it.",
      ko: "끌어서 순서를 바꾸는 목록이며 `Item`과 `Cursor`가 있습니다. `Field.TextList`가 이것으로 만들어졌습니다.",
    },
    {
      name: "Dropdown",
      href: "/references/ui/overlays#Dropdown",
      area: overlays,
      en: "The row-action menu: a trigger that opens a floating menu.",
      ko: "행 동작 메뉴입니다. 트리거를 누르면 떠 있는 메뉴가 열립니다.",
    },
    {
      name: "DROPDOWN_KEEP_OPEN_ATTR",
      href: "/references/ui/overlays#Dropdown",
      area: overlays,
      en: "`data-dropdown-keep-open`: a click on an item carrying it leaves the menu open.",
      ko: "`data-dropdown-keep-open` 속성 이름입니다. 이 속성이 붙은 항목을 눌러도 메뉴가 닫히지 않습니다.",
    },
    {
      name: "Empty",
      href: "/references/ui/display#Empty",
      area: display,
      en: "The no-data placeholder.",
      ko: "데이터가 없을 때 보이는 자리 표시자입니다.",
    },
    {
      name: "fetchRunner",
      href: "/references/ui/agent#Chat",
      area: agent,
      en: "The default runner: sends each turn to the app's own `runAgentTurn` endpoint.",
      ko: "기본 러너입니다. 매 턴을 앱의 `runAgentTurn` 엔드포인트로 보냅니다.",
    },
    {
      name: "Field",
      href: "/references/ui/forms#Field",
      area: forms,
      en: "The form-field namespace: a section wrapper and twenty members.",
      ko: "폼 필드 네임스페이스이며, 섹션 래퍼와 멤버 20개로 이루어집니다.",
    },
    {
      name: "FontFace",
      area: here,
      en: "Adds one `ReactFont`'s `@font-face` rule in the browser; fonts from `.fonts()` are already handled.",
      ko: "`ReactFont` 하나의 `@font-face` 규칙을 브라우저에 넣습니다. `.fonts()`에 선언한 글꼴은 이미 처리됩니다.",
    },
    {
      name: "httpRunner",
      href: "/references/ui/agent#Chat",
      area: agent,
      en: "A runner that POSTs each turn to a URL you name, streamed or not.",
      ko: "매 턴을 지정한 URL로 POST하는 러너입니다. 스트리밍 응답과 일반 응답을 모두 받습니다.",
    },
    {
      name: "Image",
      href: "/references/ui/core#Image",
      area: core,
      en: "An image from a `File` model or a URL, served through the Akan optimizer.",
      ko: "`File` 모델이나 URL의 이미지를 Akan 최적화를 거쳐 보여 줍니다.",
    },
    {
      name: "InfiniteScroll",
      area: here,
      en: "Loads the next batch when a sentinel scrolls into view; `reverse` prepends and keeps position.",
      ko: "감시 요소가 화면에 들어오면 다음 묶음을 불러옵니다. `reverse`는 위쪽에 덧붙이면서 읽던 위치를 지킵니다.",
    },
    {
      name: "Input",
      href: "/references/ui/forms#Input",
      area: forms,
      en: "The text input, plus `TextArea`, `Password`, `Email`, `Number` and `Checkbox`.",
      ko: "텍스트 입력이며, `TextArea`, `Password`, `Email`, `Number`, `Checkbox`가 함께 있습니다.",
    },
    {
      name: "inputRecipe",
      href: "/references/ui/customize#recipe-slots",
      area: custom,
      en: "The field shell's className factory, and a recipe slot.",
      ko: "입력 필드 껍데기의 className 팩토리이며, 레시피 슬롯이기도 합니다.",
    },
    {
      name: "KeyboardAvoiding",
      area: here,
      en: "Lifts its children above the on-screen keyboard.",
      ko: "자식 요소를 화면 키보드 위로 밀어 올립니다.",
    },
    {
      name: "Layout",
      href: "/references/ui/core#Layout",
      area: core,
      en: "The page shell: content containers such as `View` and frame slots such as `Navbar`.",
      ko: "페이지 셸입니다. `View` 같은 콘텐츠 컨테이너와 `Navbar` 같은 프레임 슬롯으로 이루어집니다.",
    },
    {
      name: "LegacyModal",
      href: "/references/ui/overlays#Modal",
      area: overlays,
      en: "The previous modal skin, with spring transitions and drag-to-dismiss.",
      ko: "이전 모달 스킨입니다. 스프링 전환과 끌어서 닫기가 있습니다.",
    },
    {
      name: "Link",
      href: "/references/ui/core#Link",
      area: core,
      en: "Route-aware navigation, plus `Back`, `Close` and `Lang`.",
      ko: "라우트를 아는 내비게이션이며, `Back`, `Close`, `Lang`이 함께 있습니다.",
    },
    {
      name: "Load",
      href: "/references/ui/core#Load",
      area: core,
      en: "The fetch-to-React bridge: `Units`, `View`, `Edit`, `Pagination`, `Page`, `Stream`.",
      ko: "fetch 결과를 React로 잇는 다리입니다. `Units`, `View`, `Edit`, `Pagination`, `Page`, `Stream`이 있습니다.",
    },
    {
      name: "Loading",
      href: "/references/ui/display#Loading",
      area: display,
      en: "Six loading indicators, one per shape of waiting.",
      ko: "기다리는 모양마다 하나씩, 로딩 표시 6종입니다.",
    },
    {
      name: ["maxAttachmentBytes", "maxMessageAttachmentBytes", "maxMessageAttachments"],
      area: agent,
      en: "The composer's default attachment limits: 4 MB a file, 8 MB and five files a message.",
      ko: "입력창의 기본 첨부 한도입니다. 파일당 4MB, 메시지당 8MB와 5개입니다.",
    },
    {
      name: "Menu",
      href: "/references/ui/overlays#Menu",
      area: overlays,
      en: "A navigation menu built from an item tree.",
      ko: "항목 트리로 만드는 내비게이션 메뉴입니다.",
    },
    {
      name: "Modal",
      href: "/references/ui/overlays#Modal",
      area: overlays,
      en: "The modal: drive it with `open`, or hand it a `trigger` that opens it on click.",
      ko: "모달입니다. `open`으로 직접 열고 닫거나, 누르면 열리는 `trigger`를 넘깁니다.",
    },
    {
      name: "Model",
      href: "/references/ui/core#Model",
      area: core,
      en: "The CRUD shells for a generated model store, with fifteen members.",
      ko: "생성된 모델 스토어용 CRUD 셸이며, 멤버는 15개입니다.",
    },
    {
      name: "More",
      area: here,
      en: "A list footer: infinite scroll on mobile, a pager elsewhere; `Load.Units` uses it by default.",
      ko: "목록 아래 붙는 푸터입니다. 모바일에서는 무한 스크롤, 그 밖에서는 페이지 버튼이며 `Load.Units`가 기본으로 씁니다.",
    },
    {
      name: "ObjectId",
      area: here,
      en: "A document id cut to its ends, with the full id in a tooltip and a copy button.",
      ko: "문서 id를 앞뒤만 남겨 보여 줍니다. 전체 id는 툴팁으로 보이고 복사 버튼이 붙습니다.",
    },
    {
      name: [
        "OverlayOwnerProvider",
        "isOwnOverlayClick",
        "OVERLAY_LAYER_ATTR",
        "useOverlayLayerProps",
        "useOverlayScope",
      ],
      area: overlays,
      en: "How a menu tells a click in an overlay it opened from a click outside.",
      ko: "메뉴가 자기가 띄운 오버레이 안의 클릭과 바깥 클릭을 구분하는 장치입니다.",
    },
    {
      name: "override",
      href: customApi,
      area: custom,
      en: "Builds the manifest an `_overrides.tsx` exports; it returns the map unchanged and checks its types.",
      ko: "`_overrides.tsx`가 export하는 매니페스트를 만듭니다. 맵을 그대로 돌려주고 타입만 검사합니다.",
    },
    {
      name: "Pagination",
      href: "/references/ui/display#Pagination",
      area: display,
      en: "The pager, taking its numbers as props.",
      ko: "페이지 번호를 prop으로 받는 페이지 버튼입니다.",
    },
    {
      name: "Popconfirm",
      href: "/references/ui/overlays#Popconfirm",
      area: overlays,
      en: "A small confirmation before a destructive action.",
      ko: "되돌리기 어려운 동작 앞에 띄우는 작은 확인 창입니다.",
    },
    {
      name: "Portal",
      href: "/references/ui/overlays#Portal",
      area: overlays,
      en: "Renders into the host element with the given id, SSR included.",
      ko: "지정한 id의 호스트 요소 안에 렌더하며, SSR에서도 동작합니다.",
    },
    {
      name: "Radio",
      href: "/references/ui/forms#Radio",
      area: forms,
      en: "The radio group, with `Item`.",
      ko: "라디오 그룹이며, `Item`이 있습니다.",
    },
    {
      name: "RecentTime",
      href: "/references/ui/display#RecentTime",
      area: display,
      en: "A relative time label, with the absolute date in a tooltip.",
      ko: "상대 시각 라벨이며, 정확한 날짜는 툴팁에 나옵니다.",
    },
    {
      name: ["recipe", "tv"],
      href: ["/docs/arch/ui-recipe", "/docs/arch/ui-recipe"],
      area: custom,
      en: "The two factories every recipe is built from: `recipe(tv({ ... }))`.",
      ko: "모든 레시피를 만드는 팩토리 두 개입니다. `recipe(tv({ ... }))` 형태로 씁니다.",
    },
    {
      name: "Reference",
      area: agent,
      en: "Helpers for an `@` reference: its token in the draft, its identity and its size cap.",
      ko: "`@` 참조를 다루는 헬퍼입니다. 입력창 속 토큰, 같은 참조인지 판단, 크기 상한을 맡습니다.",
    },
    {
      name: "Refresh",
      area: here,
      en: "Pull-to-refresh around a scrolling child.",
      ko: "스크롤되는 자식을 감싸 당겨서 새로고침을 붙입니다.",
    },
    {
      name: "ScreenNavigator",
      area: here,
      en: "A swipeable pager across `Screen`s, with `NavbarItem`; `namespace` publishes it to the agent.",
      ko: "`Screen` 사이를 스와이프로 넘기며 `NavbarItem`이 있습니다. `namespace`를 주면 에이전트에게 공개됩니다.",
    },
    {
      name: "Select",
      href: "/references/ui/forms#Select",
      area: forms,
      en: "The selector: single, multiple or searchable.",
      ko: "선택 상자이며, 단일·다중·검색 선택을 지원합니다.",
    },
    {
      name: "SessionContext",
      area: agent,
      en: "The React context `Agent.Zone` and `AgentProvider` hand a session down through.",
      ko: "`Agent.Zone`과 `AgentProvider`가 세션을 아래로 내려 주는 React context입니다.",
    },
    {
      name: "Signal",
      href: "/references/ui/system#Signal",
      area: system,
      en: "The API explorer, in eight namespaces.",
      ko: "API 탐색기이며, 네임스페이스 8개로 이루어집니다.",
    },
    {
      name: "Switch",
      href: "/references/ui/forms#Switch",
      area: forms,
      en: 'An on/off toggle, drawn as a `role="switch"` button.',
      ko: '`role="switch"` 버튼으로 그린 켜기/끄기 토글입니다.',
    },
    {
      name: "System",
      href: "/references/ui/system#System",
      area: system,
      en: "The app shell: `Provider`, `Root` and four controls.",
      ko: "앱 셸입니다. `Provider`, `Root`, 그리고 컨트롤 4개로 이루어집니다.",
    },
    {
      name: "Tab",
      href: "/references/ui/system#Tab",
      area: system,
      en: "Tabs split into parts so the panels stay on the server.",
      ko: "패널이 서버에 남도록 부품으로 나눈 탭입니다.",
    },
    {
      name: "Table",
      href: "/references/ui/display#Table",
      area: display,
      en: "Draws rows you already have, with columns and an optional pager.",
      ko: "이미 가진 행을 컬럼과 선택적인 페이지 버튼으로 그립니다.",
    },
    {
      name: "Toast",
      href: customSlots,
      area: system,
      en: "The toast stack `System.Provider` mounts; you write into it with `msg.*`.",
      ko: "`System.Provider`가 마운트하는 토스트 묶음입니다. 메시지는 `msg.*`로 띄웁니다.",
    },
    {
      name: "ToggleSelect",
      href: "/references/ui/forms#ToggleSelect",
      area: forms,
      en: "A choice drawn as a row of buttons, with `Multi`.",
      ko: "버튼 한 줄로 고르는 선택이며, `Multi`가 있습니다.",
    },
    {
      name: "tokenCount",
      area: agent,
      en: "Formats a token estimate as a short label: `950`, `1.2k`, `3.4M`.",
      ko: "토큰 추정치를 `950`, `1.2k`, `3.4M` 같은 짧은 라벨로 바꿉니다.",
    },
    {
      name: "Tooltip",
      href: "/references/ui/overlays#Tooltip",
      area: overlays,
      en: "A hint shown on hover or focus that flips to the side with room.",
      ko: "마우스를 올리거나 포커스를 받을 때 뜨고, 자리가 있는 쪽으로 뒤집히는 힌트입니다.",
    },
    {
      name: "triggerSlot",
      href: customApi,
      area: custom,
      en: "Clones a caller's trigger so aria state lands on the real control.",
      ko: "호출자가 넘긴 트리거를 복제해 aria 상태가 실제 컨트롤에 붙게 합니다.",
    },
    {
      name: "UiOverrideProvider",
      href: customApi,
      area: custom,
      en: "The provider behind every `_overrides.tsx`; mount one yourself to override a subtree.",
      ko: "모든 `_overrides.tsx` 뒤에 있는 provider입니다. 하위 트리 하나를 바꿀 때 직접 마운트합니다.",
    },
    {
      name: "Unauthorized",
      href: customSlots,
      area: display,
      en: "The no-access placeholder, shaped like `Empty`; you render it yourself.",
      ko: "접근 권한이 없을 때 보이는 자리 표시자입니다. `Empty`와 같은 모양이며 직접 렌더합니다.",
    },
    {
      name: "useAgent",
      area: agent,
      en: "Reads the enclosing session from a component.",
      ko: "컴포넌트에서 자신을 감싼 세션을 읽습니다.",
    },
    {
      name: "useAgentReference",
      area: agent,
      en: "Returns a function that puts data a component shows into the draft as an `@` chip.",
      ko: "컴포넌트가 보여 주는 데이터를 `@` 칩으로 입력창에 넣는 함수를 돌려줍니다.",
    },
    {
      name: ["useUiOverride", "useUiRecipe"],
      href: [customApi, customApi],
      area: custom,
      en: "How a component looks up its own component slot and recipe slot on the current route.",
      ko: "컴포넌트가 현재 라우트에서 자기 컴포넌트 슬롯과 레시피 슬롯을 찾는 훅입니다.",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-ui" title="akanjs/ui">
        <Docs.Title>akanjs/ui</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akanjs/ui</code> is the framework's shared UI package: links, data loading, model CRUD shells,
                  form controls, display helpers, overlays, the in-page agent and the app shell. Every name in this
                  reference imports from that one path.
                </span>
              ),
              ko: (
                <span>
                  <code>akanjs/ui</code>는 프레임워크가 제공하는 공용 UI 패키지입니다. 링크, 데이터 로딩, 모델 CRUD 셸,
                  폼 컨트롤, 표시 헬퍼, 오버레이, 인페이지 에이전트, 앱 셸이 모두 여기 있습니다. 이 레퍼런스의 모든
                  이름은 이 경로 하나에서 import합니다.
                </span>
              ),
            })}
          </div>
          <Docs.LinkGrid
            items={[
              {
                href: "#page-map",
                title: l.trans({ en: "By Layer", ko: "작업 영역으로 찾기" }),
                desc: l.trans({
                  en: "One page per layer you work in. Pick yours from the Page Map.",
                  ko: "작업하는 영역마다 한 페이지씩 있습니다. 페이지 안내에서 고르세요.",
                }),
              },
              {
                href: "#exports",
                title: l.trans({ en: "By Name", ko: "이름으로 찾기" }),
                desc: l.trans({
                  en: "Every export A to Z, each with the page that covers it. Start here when you know the name.",
                  ko: "모든 export를 A부터 Z까지, 다루는 페이지와 함께 적었습니다. 이름을 알면 여기서 시작하세요.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="page-map" title={l.trans({ en: "Page Map", ko: "페이지 안내" })}>
        <Docs.Title>{l.trans({ en: "Page Map", ko: "페이지 안내" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Open the page for the layer you are working in. Each component there gets its own section: a props table, then the notes props alone cannot carry.",
              ko: "지금 작업하는 영역의 페이지를 여세요. 그 페이지에서는 컴포넌트마다 섹션 하나를 두고, props 표와 props만으로는 전할 수 없는 설명을 함께 싣습니다.",
            })}
          </div>
          <Docs.LinkGrid
            items={pages.map(({ href, title, components, desc }) => ({
              href,
              title,
              desc: (
                <>
                  <span className="block">{desc}</span>
                  <span className="mt-1.5 block font-mono text-foreground/60 text-xs">{components}</span>
                </>
              ),
            }))}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="exports" title={l.trans({ en: "Every Export", ko: "전체 export" })}>
        <Docs.Title>{l.trans({ en: "Every Export", ko: "전체 export" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Every value <code>akanjs/ui</code> exports, A to Z. Use it when you know a name but not the page.
                </span>
              ),
              ko: (
                <span>
                  <code>akanjs/ui</code>가 export하는 모든 값을 A부터 Z까지 모았습니다. 이름은 아는데 페이지를 모를 때
                  쓰세요.
                </span>
              ),
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The label up front is the page.</strong> Each description starts with the page that covers
                    that area; click it to go there.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>설명 앞의 이름표가 페이지입니다.</strong> 그 영역을 다루는 페이지 이름이 설명 맨 앞에 있고,
                    누르면 그 페이지로 갑니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A name with its own section links to it.</strong> Click the name itself to land on that
                    section.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>자기 섹션이 있는 이름은 링크입니다.</strong> 이름을 누르면 그 섹션으로 바로 갑니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only here</strong> means no page covers the name. The row is the whole documentation.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>여기서만</strong> 표시는 따로 다루는 페이지가 없다는 뜻입니다. 그 한 줄이 문서의 전부입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Type-only exports are left out.</strong> A type follows the component it describes, and a
                    props interface is in that component's props table.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>타입 전용 export는 뺐습니다.</strong> 타입은 자신이 설명하는 컴포넌트를 따라가고, props
                    interface는 그 컴포넌트의 props 표에 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.IntroTable
            type={l.trans({ en: "Export", ko: "이름" })}
            items={exportRows.map(({ name, href, area, en, ko }) => ({
              name,
              href,
              desc: on(area, l.trans({ en, ko })),
            }))}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
