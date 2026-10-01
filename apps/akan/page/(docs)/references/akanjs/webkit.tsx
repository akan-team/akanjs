import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const required = l.trans({ en: "required", ko: "필수" });
  const exportLabel = l.trans({ en: "Export", ko: "export" });
  const memberLabel = l.trans({ en: "Returns", ko: "반환값" });

  const exportRows = [
    {
      name: "lazy",
      href: "#lazy",
      desc: l.trans({
        en: "Loads a component's code on demand. `ssr: false` skips server rendering.",
        ko: "컴포넌트 코드를 필요할 때 받아 옵니다. `ssr: false`면 서버 렌더링을 건너뜁니다.",
      }),
    },
    {
      name: "useDebounce",
      href: "#useDebounce",
      desc: l.trans({
        en: "Runs a callback once, after the calls stop for a while.",
        ko: "호출이 잠시 멈춘 뒤에 콜백을 한 번 실행합니다.",
      }),
    },
    {
      name: "useInterval",
      href: "#useInterval",
      desc: l.trans({
        en: "Runs a callback on a fixed interval and stops on unmount.",
        ko: "콜백을 일정한 간격으로 실행하고, 언마운트되면 멈춥니다.",
      }),
    },
    {
      name: "useThrottle",
      href: "#useThrottle",
      desc: l.trans({
        en: "Runs a callback at once, then ignores calls for a while.",
        ko: "콜백을 바로 실행하고, 잠시 동안 이어지는 호출은 무시합니다.",
      }),
    },
    {
      name: ["useFetch", "useFetchFn"],
      href: ["#useFetch / useFetchFn", "#useFetch / useFetchFn"],
      desc: l.trans({
        en: "Tells a client component whether a promise has resolved, and its value.",
        ko: "클라이언트 컴포넌트에 promise가 끝났는지와 그 값을 알려 줍니다.",
      }),
    },
    {
      name: ["useCamera", "useGeoLocation"],
      href: ["#useCamera", "#useGeoLocation"],
      desc: l.trans({
        en: "Camera and location through the native runtime's plugins, with a browser fallback and the permission prompts.",
        ko: "네이티브 런타임의 플러그인으로 카메라와 위치를 씁니다. 브라우저 대체 경로와 권한 요청까지 처리합니다.",
      }),
    },
    {
      name: "usePushNotification",
      href: "#usePushNotification",
      desc: l.trans({
        en: "Not in this module: the push hook lives in `@libs/util/webkit`.",
        ko: "이 모듈에는 없습니다. 푸시 hook은 `@libs/util/webkit`에 있습니다.",
      }),
    },
    {
      name: "usePurchase",
      href: "#usePurchase",
      desc: l.trans({
        en: "In-app purchase on the native iap plugin, verified by your server. Imported from `akanjs/webkit/usePurchase`.",
        ko: "네이티브 iap 플러그인으로 인앱 결제를 하고, 서버가 검증합니다. `akanjs/webkit/usePurchase`에서 가져옵니다.",
      }),
    },
    {
      name: ["useLocation", "useHistory"],
      href: ["#useLocation / useHistory", "#useLocation / useHistory"],
      desc: l.trans({
        en: "The CSR router's location parser and history stack.",
        ko: "CSR 라우터가 쓰는 위치 해석기와 history 스택입니다.",
      }),
    },
    {
      name: "LoginForm",
      href: "#LoginForm",
      desc: l.trans({
        en: "The argument of the shared store's `login` action.",
        ko: "shared store의 `login` action이 받는 인자 타입입니다.",
      }),
    },
  ];

  const otherRows = [
    {
      name: "useBodyScrollLock(active)",
      desc: l.trans({
        en: "Locks `document.body` scrolling while `active`. Overlays share one count.",
        ko: "`active`인 동안 `document.body` 스크롤을 막습니다. 여러 오버레이가 카운터 하나를 함께 씁니다.",
      }),
    },
    {
      name: "useEscapeKey(active, onEscape)",
      desc: l.trans({
        en: "Calls `onEscape` on Escape while `active`. Only the topmost open surface gets the key.",
        ko: "`active`인 동안 Escape를 누르면 `onEscape`를 부릅니다. 겹쳐 열린 것 중 맨 위 하나만 받습니다.",
      }),
    },
    {
      name: "usePageFocusEffect(effect, deps)",
      desc: l.trans({
        en: "Runs `effect` while the user is on this page and cleans it up when they leave. A page kept under the current one for a swipe back stays mounted, so a plain effect there keeps running.",
        ko: "사용자가 이 페이지에 있는 동안 `effect`를 돌리고, 떠나면 정리합니다. 스와이프 뒤로가기를 위해 현재 페이지 아래 남은 페이지는 마운트된 채라 평범한 effect는 계속 돕니다.",
      }),
    },
    {
      name: "usePageLocation()",
      desc: l.trans({
        en: "`{ pathname, params, searchParams }` of this page. `st.use.searchParams()` follows the page on screen, so a page being prepared or kept under the current one reads its own here.",
        ko: "이 페이지의 `{ pathname, params, searchParams }`입니다. `st.use.searchParams()`는 화면에 보이는 페이지를 따르므로, 준비 중이거나 현재 페이지 아래 남은 페이지는 여기서 자기 값을 읽습니다.",
      }),
    },
    {
      name: "usePageActivity()",
      desc: l.trans({
        en: '`"current" | "prev" | "pending" | "hidden"` — where this page stands in the CSR stack; always `current` outside one.',
        ko: '`"current" | "prev" | "pending" | "hidden"` — CSR 스택에서 이 페이지의 위치이며, CSR 밖에서는 늘 `current`입니다.',
      }),
    },
    {
      name: ["usePageTool", "useScreenScope"],
      desc: l.trans({
        en: "Show a pager and on-screen items to the in-page agent. `Load.Units` and `Load.View` call them.",
        ko: "페이지 넘김과 화면 속 항목을 인페이지 에이전트에게 알립니다. `Load.Units`와 `Load.View`가 이미 부릅니다.",
      }),
    },
    {
      name: ["createRobotPage", "createSitemapPage"],
      desc: l.trans({
        en: 'Build robots rules (`disallow: "/admin/"` by default) and a list of sitemap entries.',
        ko: 'robots 규칙(기본 `disallow: "/admin/"`)과 sitemap 항목 목록을 만듭니다.',
      }),
    },
    {
      name: ["bootCsr", "replacePages", "useCsrValues"],
      desc: l.trans({
        en: "Start the CSR (mobile) bundle, swap its route modules in place during dev, and hold its router state. The generated entry calls them.",
        ko: "CSR(모바일) 번들을 띄우고, dev에서는 라우트 모듈을 그 자리에서 바꾸며, 라우터 상태를 쥡니다. 자동 생성된 진입 파일이 부르므로 앱 코드에서는 부르지 않습니다.",
      }),
    },
    {
      name: ["LoginAuth", "ScreenScopeItem"],
      desc: l.trans({
        en: 'Types: `"user" | "admin" | "public"`, and one on-screen item `{ id, label? }`.',
        ko: '타입입니다. `"user" | "admin" | "public"`, 그리고 화면 속 항목 하나인 `{ id, label? }`입니다.',
      }),
    },
  ];

  const lazyOptionRows = [
    {
      key: "ssr",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "`false` skips server rendering: the server sends `loading`, and the chunk loads after mount.",
        ko: "`false`면 서버 렌더링을 건너뜁니다. 서버는 `loading`만 보내고, 청크는 마운트 뒤에 받습니다.",
      }),
    },
    {
      key: "suspense",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Wraps the component in its own Suspense boundary, so only this spot waits for the chunk.",
        ko: "컴포넌트를 전용 Suspense 경계로 감싸, 청크를 기다리는 동안 이 자리만 기다리게 합니다.",
      }),
    },
    {
      key: "loading",
      type: "() => ReactNode",
      desc: l.trans({
        en: "The placeholder. It shows only with `ssr: false` or `suspense: true`.",
        ko: "자리 표시입니다. `ssr: false`나 `suspense: true`일 때만 보입니다.",
      }),
    },
  ];

  const lazyModeColumns = [
    { key: "mode", label: l.trans({ en: "Call", ko: "호출" }) },
    { key: "server", label: l.trans({ en: "Server HTML", ko: "서버 HTML" }) },
    { key: "waiting", label: l.trans({ en: "While the chunk loads", ko: "청크를 받는 동안" }) },
  ];
  const lazyModeRows = [
    {
      mode: l.trans({ en: "No option", ko: "옵션 없음" }),
      server: l.trans({ en: "The component itself.", ko: "컴포넌트를 그대로 그립니다." }),
      waiting: l.trans({
        en: "The nearest boundary, usually the whole route, shows its fallback.",
        ko: "가장 가까운 경계(보통 route 전체)가 fallback을 보여 줍니다.",
      }),
    },
    {
      mode: "`suspense: true`",
      server: l.trans({
        en: "The component, sent after the shell in stream mode.",
        ko: "컴포넌트를 그립니다. stream 모드에서는 shell 뒤에 따로 도착합니다.",
      }),
      waiting: l.trans({ en: "Only this spot shows `loading`.", ko: "이 자리만 `loading`을 보여 줍니다." }),
    },
    {
      mode: "`ssr: false`",
      server: l.trans({
        en: "Only `loading`, or nothing.",
        ko: "`loading`만 보내고, 없으면 아무것도 보내지 않습니다.",
      }),
      waiting: l.trans({
        en: "`loading` until the component mounts and its chunk arrives.",
        ko: "마운트되고 청크가 도착할 때까지 `loading`을 보여 줍니다.",
      }),
    },
  ];

  const debounceArgRows = [
    {
      key: "callback",
      type: "(...args) => unknown",
      tags: [required],
      desc: l.trans({
        en: "Runs once, with the arguments of the last call.",
        ko: "마지막 호출의 인자로 한 번 실행됩니다.",
      }),
    },
    {
      key: "states",
      type: "unknown[]",
      default: "[]",
      desc: l.trans({
        en: "The dependency list of the inner `useCallback`: every prop and state the callback reads.",
        ko: "안쪽 `useCallback`의 의존성 배열입니다. 콜백이 읽는 prop과 state를 모두 넣습니다.",
      }),
    },
    {
      key: "wait",
      type: "number",
      default: "100",
      desc: l.trans({
        en: "Milliseconds to wait after the last call.",
        ko: "마지막 호출 뒤에 기다리는 시간(ms)입니다.",
      }),
    },
  ];

  const intervalArgRows = [
    {
      key: "callback",
      type: "() => void | Promise<void>",
      tags: [required],
      desc: l.trans({
        en: "Runs on every tick. The callback from the latest render is the one that runs.",
        ko: "틱마다 실행됩니다. 가장 최근 렌더링에서 넘긴 콜백이 실행됩니다.",
      }),
    },
    {
      key: "delay",
      type: "number",
      tags: [required],
      desc: l.trans({
        en: "Milliseconds between ticks. Changing it restarts the timer.",
        ko: "틱 사이의 간격(ms)입니다. 값이 바뀌면 타이머를 다시 시작합니다.",
      }),
    },
  ];

  const throttleArgRows = [
    {
      key: "func",
      type: "(...args) => unknown",
      tags: [required],
      desc: l.trans({
        en: "Runs at once on the first call of each window.",
        ko: "구간마다 첫 호출에서 바로 실행됩니다.",
      }),
    },
    {
      key: "delay",
      type: "number",
      default: "200",
      desc: l.trans({
        en: "Milliseconds during which later calls are dropped.",
        ko: "실행 뒤 이어지는 호출을 버리는 시간(ms)입니다.",
      }),
    },
    {
      key: "deps",
      type: "unknown[]",
      default: "[]",
      desc: l.trans({
        en: "Extra dependencies. `func` and `delay` are already included.",
        ko: "추가 의존성입니다. `func`와 `delay`는 이미 들어 있습니다.",
      }),
    },
  ];

  const rateColumns = [
    { key: "call", label: l.trans({ en: "Call", ko: "호출" }), code: true },
    { key: "when", label: l.trans({ en: "When it runs", ko: "실행 시점" }) },
  ];
  const rateRows = [
    {
      call: "useDebounce(callback, states = [], wait = 100)",
      when: l.trans({
        en: "Once, after the calls stop for `wait` ms.",
        ko: "호출이 `wait` ms 동안 멈춘 뒤 한 번 실행합니다.",
      }),
    },
    {
      call: "useThrottle(func, delay = 200, deps = [])",
      when: l.trans({
        en: "At once, then drops calls for `delay` ms.",
        ko: "바로 실행하고, `delay` ms 동안 이어지는 호출은 버립니다.",
      }),
    },
  ];

  const fetchHookRows = [
    {
      name: "useFetch(promiseOrValue, { onError })",
      desc: l.trans({
        en: "Follows the promise handed on each render; a plain value comes back at once, `fulfilled: true`.",
        ko: "렌더링마다 넘겨받은 promise를 따라갑니다. promise가 아닌 값이면 바로 `fulfilled: true`로 돌려줍니다.",
      }),
    },
    {
      name: "useFetchFn(factory, deps = [], { onError })",
      desc: l.trans({
        en: "Calls `factory` inside `useMemo`, so a new request starts only when `deps` change.",
        ko: "`factory`를 `useMemo` 안에서 불러, `deps`가 바뀔 때만 요청이 새로 나갑니다.",
      }),
    },
  ];

  const fetchResultRows = [
    {
      key: "fulfilled",
      type: "boolean",
      desc: l.trans({
        en: "`true` once the current promise resolves; a rejected or newly handed one reads `false`.",
        ko: "지금 promise가 끝나면 `true`입니다. 실패했거나 새로 넘겨받은 promise는 `false`입니다.",
      }),
    },
    {
      key: "value",
      type: "T | null",
      desc: l.trans({
        en: "The current promise's resolved value, `null` until it resolves.",
        ko: "지금 promise가 끝난 값입니다. 그 전에는 `null`입니다.",
      }),
    },
    {
      key: "onError",
      type: "(err: string) => void",
      desc: l.trans({
        en: 'Option. Called with `"Error: <message>"` when the promise rejects.',
        ko: '옵션입니다. promise가 실패하면 `"Error: <message>"` 문자열로 불립니다.',
      }),
    },
  ];

  const cameraRows = [
    {
      name: 'getPhoto(src = "prompt")',
      desc: l.trans({
        en: 'Takes or picks one photo as `{ dataUrl }`, an upright JPEG. `"prompt"` shows a camera-or-library sheet in the native app; cancel returns `undefined`.',
        ko: '사진 한 장을 찍거나 골라 똑바로 선 JPEG `{ dataUrl }`로 돌려줍니다. `"prompt"`는 네이티브 앱에서 카메라·앨범 선택 시트를 띄우고, 취소하면 `undefined`입니다.',
      }),
    },
    {
      name: "pickImage({ limit })",
      desc: l.trans({
        en: "Picks several images from the library, each as `{ dataUrl }`.",
        ko: "앨범에서 여러 장을 골라 각각 `{ dataUrl }`로 돌려줍니다.",
      }),
    },
    {
      name: "permissions",
      desc: l.trans({
        en: '`{ camera }`. Read on mount in the native app, `"prompt"` until then.',
        ko: '`{ camera }` 권한 상태입니다. 네이티브 앱에서 마운트할 때 읽고, 그 전에는 `"prompt"`입니다.',
      }),
    },
    {
      name: "checkPermission()",
      desc: l.trans({
        en: "Asks for the camera, and opens the app settings when it is denied.",
        ko: "카메라 권한을 요청하고, 거부됐으면 앱 설정을 엽니다.",
      }),
    },
  ];

  const cameraOptionRows = [
    {
      key: "promptLabels",
      type: "{ header?, photo?, picture?, cancel? }",
      default: "{}",
      desc: l.trans({
        en: "Text of the native picker sheet. A missing one comes from the `base` dictionary.",
        ko: "네이티브 선택 시트의 문구입니다. 빠진 것은 `base` 사전에서 현재 언어로 가져옵니다.",
      }),
    },
  ];

  const geoRows = [
    {
      name: "getPosition({ enableHighAccuracy })",
      desc: l.trans({
        en: "Returns a `Position`. When the permission is denied, opens the settings and returns `undefined`.",
        ko: "`Position`을 돌려줍니다. 권한이 거부되면 앱 설정을 열고 `undefined`를 돌려줍니다.",
      }),
    },
    {
      name: "checkPermission()",
      desc: l.trans({
        en: "Requests permission and returns `{ location, precise }`.",
        ko: "권한을 요청하고 `{ location, precise }`를 돌려줍니다.",
      }),
    },
  ];

  const pushRows = [
    {
      name: "register()",
      desc: l.trans({
        en: "Asks for permission, then returns a `PushToken`, or `undefined` when refused or unsupported.",
        ko: "권한을 요청한 뒤 `PushToken`을 돌려줍니다. 거부되거나 지원하지 않으면 `undefined`입니다.",
      }),
    },
    {
      name: "getToken()",
      desc: l.trans({
        en: "Returns the token without asking. Registering shows no prompt, so check the permission first.",
        ko: "묻지 않고 토큰을 돌려줍니다. 등록 자체는 창을 띄우지 않으므로 먼저 권한을 확인합니다.",
      }),
    },
    {
      name: ["getPermission()", "requestPermission()"],
      desc: l.trans({
        en: "Read the permission state, or show the prompt and return the answer.",
        ko: "권한 상태를 읽거나, 권한 요청 창을 띄우고 결과를 돌려줍니다.",
      }),
    },
    {
      name: "isSupported()",
      desc: l.trans({
        en: "Tells whether push can work in this runtime.",
        ko: "지금 런타임에서 푸시를 쓸 수 있는지 알려 줍니다.",
      }),
    },
    {
      name: "onTokenChange(listener)",
      desc: l.trans({
        en: "Hands each token a native shell rotates to the listener. Returns the unsubscribe.",
        ko: "네이티브 셸이 바꾼 토큰을 리스너에 넘깁니다. 해제 함수를 돌려줍니다.",
      }),
    },
    {
      name: "initClickBridge()",
      desc: l.trans({
        en: "Routes the browser's notification clicks. The hook runs it on mount; native taps need nothing.",
        ko: "브라우저의 알림 클릭을 앱 안 이동으로 잇습니다. 훅이 마운트될 때 실행하며, 네이티브 탭은 할 일이 없습니다.",
      }),
    },
  ];

  const purchaseOptionRows = [
    {
      key: "platform",
      type: '"ios" | "android" | "all"',
      tags: [required],
      desc: l.trans({
        en: "The stores the app sells in. A native shell on another platform shows no products.",
        ko: "앱이 판매하는 스토어입니다. 다른 플랫폼의 네이티브 셸에서는 상품을 보여 주지 않습니다.",
      }),
    },
    {
      key: "productInfo",
      type: '{ id, type: "consumable" | "nonConsumable" | "subscription" }[]',
      tags: [required],
      desc: l.trans({
        en: "The store product ids and what each one is. A product not listed is finished without being consumed.",
        ko: "스토어 상품 id와 그 종류입니다. 목록에 없는 상품은 소비하지 않고 완료만 합니다.",
      }),
    },
    {
      key: "url",
      type: "string",
      tags: [required],
      desc: l.trans({
        en: "The verification server's origin. It answers `POST <url>/billing/verifyBilling`.",
        ko: "검증 서버의 origin입니다. `POST <url>/billing/verifyBilling`에 답해야 합니다.",
      }),
    },
    {
      key: "onPay",
      type: "(transaction, verified) => void | Promise<void>",
      desc: l.trans({
        en: "Credits a consumable or non-consumable. `verified` is the server's JSON answer.",
        ko: "소비성·비소비성 상품을 지급합니다. `verified`는 서버가 돌려준 JSON입니다.",
      }),
    },
    {
      key: "onSubscribe",
      type: "(transaction, verified) => void | Promise<void>",
      desc: l.trans({
        en: "The same, for a subscription.",
        ko: "구독 상품에 대해 같은 일을 합니다.",
      }),
    },
  ];

  const purchaseRows = [
    {
      name: "products",
      desc: l.trans({
        en: "The store's `IapProduct`s for `productInfo`: title, `displayPrice`, price, currency and offers.",
        ko: "`productInfo`에 대한 스토어의 `IapProduct` 목록입니다. 제목, `displayPrice`, 가격, 통화, 할인 조건이 들어 있습니다.",
      }),
    },
    {
      name: "isLoading",
      desc: l.trans({
        en: "`true` until the products and the unfinished transactions are loaded.",
        ko: "상품과 완료되지 않은 거래를 불러올 때까지 `true`입니다.",
      }),
    },
    {
      name: "purchaseProduct(product, offerToken?)",
      desc: l.trans({
        en: 'Opens the store sheet and answers `"purchased"`, `"pending"`, `"cancelled"` or `"unverified"`.',
        ko: '스토어 결제 창을 열고 `"purchased"`, `"pending"`, `"cancelled"`, `"unverified"` 중 하나로 답합니다.',
      }),
    },
    {
      name: "restorePurchases()",
      desc: l.trans({
        en: "Returns what the person owns now, finishing an Android purchase still unacknowledged on the way.",
        ko: "지금 가진 구매 목록을 돌려주고, 아직 확인되지 않은 Android 구매는 그 김에 검증하고 완료합니다.",
      }),
    },
  ];

  const routerRows = [
    {
      name: "useLocation({ rootRouteGuide })",
      desc: l.trans({
        en: "Returns `getLocation(href)`, which matches an href against the route tree.",
        ko: "`getLocation(href)`를 돌려줍니다. href를 route 트리에 맞춰 봅니다.",
      }),
    },
    {
      name: "getLocation(href)",
      desc: l.trans({
        en: "Gives `pathname`, `search`, `hash`, `params`, `searchParams` and the matched `pathRoute`.",
        ko: "`pathname`, `search`, `hash`, `params`, `searchParams`, 맞춘 `pathRoute`를 돌려줍니다.",
      }),
    },
    {
      name: "useHistory(locations)",
      desc: l.trans({
        en: "Keeps visited locations, the current index and each page's scroll position in a ref.",
        ko: "방문한 위치, 현재 index, 페이지별 스크롤 위치를 ref에 담아 둡니다.",
      }),
    },
    {
      name: ["setHistoryForward", "setHistoryBack"],
      desc: l.trans({
        en: "Record a push, replace or pop, saving the scroll of the page being left.",
        ko: "push, replace, pop을 기록하고, 떠나는 페이지의 스크롤 위치를 저장합니다.",
      }),
    },
    {
      name: ["getPrevLocation", "getCurrentLocation", "getNextLocation"],
      desc: l.trans({
        en: "Read the entries around the current one. Back and forward are told apart with them.",
        ko: "현재 항목의 앞뒤를 읽습니다. 뒤로 가기와 앞으로 가기를 이것으로 구분합니다.",
      }),
    },
    {
      name: "getScrollTop(location)",
      desc: l.trans({
        en: "The scroll position to restore: the saved one, or the `#hash` element's top.",
        ko: "되돌릴 스크롤 위치입니다. 저장된 값이나, `#hash` 요소의 위치입니다.",
      }),
    },
  ];

  const loginRows = [
    {
      key: "auth",
      type: '"user" | "admin" | "public"',
      tags: [required],
      desc: l.trans({
        en: '`"admin"` loads the admin account. Any other value loads the user with `getSelf`.',
        ko: '`"admin"`이면 관리자 계정을 불러옵니다. 그 밖의 값이면 `getSelf`로 사용자를 불러옵니다.',
      }),
    },
    {
      key: "redirect",
      type: "string",
      desc: l.trans({
        en: "Where `router.push` goes after the account loads.",
        ko: "계정을 불러온 뒤 `router.push`로 이동할 경로입니다.",
      }),
    },
    {
      key: "unauthorize",
      type: "string",
      desc: l.trans({
        en: "Where to go when loading the account fails.",
        ko: "계정을 불러오지 못했을 때 이동할 경로입니다.",
      }),
    },
    {
      key: "jwt",
      type: "string | null",
      desc: l.trans({
        en: "A token saved with `setAuth` before anything loads, for example right after sign-in.",
        ko: "무엇이든 불러오기 전에 `setAuth`로 저장할 토큰입니다. 로그인 직후처럼 토큰을 막 받았을 때 넘깁니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-webkit" title="akanjs/webkit">
        <Docs.Title>akanjs/webkit</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/webkit` holds React hooks and helpers that run only in the browser or in the native app. Timers, lazy loading, promise state, device features and the CSR router state live here.",
              ko: "`akanjs/webkit`은 브라우저나 네이티브 앱에서만 도는 React hook과 helper를 모은 모듈입니다. 타이머, 지연 로딩, promise 상태, 기기 기능, CSR 라우터 상태가 여기에 있습니다.",
            })}
          </div>
          <code className={chip}>{'import { lazy, useDebounce, useInterval } from "akanjs/webkit";'}</code>
          <Docs.SubSubTitle>{l.trans({ en: "On This Page", ko: "이 페이지에서 다루는 것" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={exportLabel} items={exportRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Other Exports", ko: "그 밖의 export" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={exportLabel} items={otherRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Call the hooks from a client file.</strong> They are React hooks, so they need a file with{" "}
                    <code>{'"use client"'}</code>. Put <code>lazy()</code> in the{" "}
                    <code>{"ui/<Folder>/index_.tsx"}</code> boundary file.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>hook은 클라이언트 파일에서 부릅니다.</strong> React hook이라 <code>{'"use client"'}</code>가
                    붙은 파일이 필요합니다. <code>lazy()</code>는 <code>{"ui/<Folder>/index_.tsx"}</code> 경계 파일에
                    둡니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Push and speech come from the util library.</strong> <code>usePushNotification</code> and{" "}
                    <code>useSpeech</code> are imported from <code>@libs/util/webkit</code>, not from here.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>푸시와 음성은 util 라이브러리에서 가져옵니다.</strong> <code>usePushNotification</code>과{" "}
                    <code>useSpeech</code>는 여기가 아니라 <code>@libs/util/webkit</code>에서 import합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/conventions/applib/webkit",
                title: l.trans({ en: "Writing Your Own Hook", ko: "직접 hook 만들기" }),
                desc: l.trans({
                  en: "Where an app or lib puts its own browser-only hooks.",
                  ko: "앱이나 lib가 자기 브라우저 전용 hook을 두는 자리입니다.",
                }),
              },
              {
                href: "/cheatsheet/performance/lazy",
                title: l.trans({ en: "Lazy Loading", ko: "지연 로딩" }),
                desc: l.trans({
                  en: "Which libraries and components to defer, with worked examples.",
                  ko: "어떤 라이브러리와 컴포넌트를 미룰지 예제와 함께 봅니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="lazy" title="lazy">
        <Docs.Title>lazy</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`lazy` is React's `lazy` with Akan's server switch. With `ssr: false` it skips server rendering, which is what a map, chart or 3D library that touches `window` on import needs.",
              ko: "`lazy`는 서버 렌더링 스위치가 붙은 React `lazy`입니다. `ssr: false`를 주면 서버에서 그리지 않으므로, import하는 순간 `window`를 건드리는 지도, 차트, 3D 라이브러리에 씁니다.",
            })}
          </div>
          <code className={chip}>lazy(loader, {"{ ssr, suspense, loading }"})</code>
          <Docs.OptionTable items={lazyOptionRows} />
          <Docs.SubSubTitle>{l.trans({ en: "What Each Call Renders", ko: "호출 방식별 렌더링" })}</Docs.SubSubTitle>
          <Docs.Table columns={lazyModeColumns} rows={lazyModeRows} stacked />
          <div>
            {l.trans({
              en: "A globe that needs the browser, behind its lazy boundary file:",
              ko: "브라우저가 있어야 그려지는 지구본을 lazy 경계 파일 뒤에 둡니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/Globe/index_.tsx"
          language="tsx"
          code={`"use client";
import { Loading } from "akanjs/ui";
import { lazy } from "akanjs/webkit";

export const Globe = lazy(() => import("./Globe"), {
  ssr: false,
  loading: () => <Loading.Skeleton className="h-96" />,
});`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the file pair.</strong> <code>{'"use client"'}</code> and <code>lazy()</code> go in{" "}
                    <code>index_.tsx</code>; the <code>index.tsx</code> beside it stays safe to import on the server.
                    Merging the two breaks server rendering.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>파일 쌍을 지킵니다.</strong> <code>{'"use client"'}</code>와 <code>lazy()</code>는{" "}
                    <code>index_.tsx</code>에 두고, 옆의 <code>index.tsx</code>는 서버에서도 import할 수 있게 둡니다.
                    둘을 합치면 서버 렌더링이 깨집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The loaded file exports the component as default.</strong> A loader may also return the
                    component itself, such as a package's default export.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>불러오는 파일은 컴포넌트를 default로 내보냅니다.</strong> 패키지의 default export처럼
                    loader가 컴포넌트를 바로 돌려줘도 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Use <code>suspense: true</code> only for what opens later.
                    </strong>{" "}
                    A modal body, a dropdown or an editor. On a page body it moves markup out of the shell that SEO
                    snapshots and prerendering read.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>suspense: true</code>는 나중에 열리는 것에만 씁니다.
                    </strong>{" "}
                    모달 본문, 드롭다운, 에디터가 그렇습니다. 페이지 본문에 쓰면 SEO 스냅샷과 사전 렌더링이 읽는
                    shell에서 마크업이 빠집니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="useDebounce" title="useDebounce">
        <Docs.Title>useDebounce</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`useDebounce` returns a callback that runs only after the calls stop. A search box that queries once the user stops typing is the usual case; an image editor or a costly field update uses it while the user drags or types.",
              ko: "`useDebounce`는 호출이 멈춘 뒤에만 실행되는 콜백을 돌려줍니다. 입력이 멈추면 한 번 검색하는 검색창이 대표적이고, 이미지 편집기나 비용이 큰 필드 갱신도 사용자가 드래그하거나 입력하는 동안 이것으로 작업을 미룹니다.",
            })}
          </div>
          <code className={chip}>useDebounce(callback, states = [], wait = 100)</code>
          <Docs.OptionTable items={debounceArgRows} />
          <div>
            {l.trans({
              en: "A search box that reloads a slice 300 ms after the last keystroke:",
              ko: "마지막 입력 300ms 뒤에 slice를 다시 불러오는 검색창입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/product/Product.Util.tsx"
          language="tsx"
          code={`"use client";
import { st } from "@apps/myapp/client";
import { Input } from "akanjs/ui";
import { useDebounce } from "akanjs/webkit";
import { useState } from "react";

interface SearchProps {
  className?: string;
  shopId: string;
}
export const Search = ({ className, shopId }: SearchProps) => {
  const [text, setText] = useState("");
  const search = useDebounce(
    (query: string) => {
      void st.do.setQueryArgsOfProductInShop(shopId, query);
    },
    [shopId],
    300,
  );
  return (
    <Input
      className={className}
      value={text}
      onChange={(value) => {
        setText(value);
        search(value);
      }}
    />
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      List what the callback reads in <code>states</code>.
                    </strong>{" "}
                    With <code>[]</code>, the callback from the first render keeps running and sees a stale{" "}
                    <code>shopId</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      콜백이 읽는 값을 <code>states</code>에 넣습니다.
                    </strong>{" "}
                    <code>[]</code>로 두면 첫 렌더링의 콜백이 계속 실행되어 예전 <code>shopId</code>를 봅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      The argument order differs from <code>useThrottle</code>.
                    </strong>{" "}
                    Here the dependencies come second and the wait third.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      인자 순서가 <code>useThrottle</code>과 다릅니다.
                    </strong>{" "}
                    여기서는 의존성이 두 번째, 대기 시간이 세 번째입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="useInterval" title="useInterval">
        <Docs.Title>useInterval</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`useInterval` runs a callback every `delay` ms and clears the timer on unmount. Use it to poll a dashboard, a game state or a build log.",
              ko: "`useInterval`은 `delay` ms마다 콜백을 실행하고, 언마운트되면 타이머를 정리합니다. 대시보드, 게임 상태, 빌드 로그를 주기적으로 다시 불러올 때 씁니다.",
            })}
          </div>
          <code className={chip}>useInterval(callback, delay)</code>
          <Docs.OptionTable items={intervalArgRows} />
          <div>
            {l.trans({
              en: "A Zone that refreshes its order list every 3 seconds:",
              ko: "주문 목록을 3초마다 새로 불러오는 Zone입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/order/Order.Zone.tsx"
          language="tsx"
          code={`"use client";
import { cnst, Order, st } from "@apps/myapp/client";
import type { ClientInit } from "akanjs/fetch";
import { Load } from "akanjs/ui";
import { useInterval } from "akanjs/webkit";

interface BoardProps {
  className?: string;
  init: ClientInit<"order", cnst.LightOrder>;
}
export const Board = ({ className, init }: BoardProps) => {
  useInterval(() => {
    void st.do.refreshOrderInShop();
  }, 3000);
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(order: cnst.LightOrder) => (
        <Order.Unit.Card key={order.id} order={order} />
      )}
    />
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A new callback each render is fine.</strong> The timer keeps running and picks up the latest
                    callback; only a new <code>delay</code> restarts it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>렌더링마다 새 콜백을 넘겨도 됩니다.</strong> 타이머는 그대로 돌면서 최신 콜백을 실행하고,{" "}
                    <code>delay</code>가 바뀔 때만 다시 시작합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Ticks do not wait for each other.</strong> An async callback that takes longer than{" "}
                    <code>delay</code> overlaps with the next tick.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>틱은 서로를 기다리지 않습니다.</strong> async 콜백이 <code>delay</code>보다 오래 걸리면 다음
                    틱과 겹쳐 실행됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      For changes as they happen, declare a <code>.live()</code> slice.
                    </strong>{" "}
                    Polling only reloads on a timer; a live slice sends each change to its subscribers.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      바뀌는 즉시 받아야 하면 <code>.live()</code> slice를 선언합니다.
                    </strong>{" "}
                    폴링은 타이머에 맞춰 다시 불러올 뿐이고, live slice는 변경을 구독자에게 바로 보냅니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="useThrottle" title="useThrottle">
        <Docs.Title>useThrottle</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`useThrottle` returns a callback that runs at once, then drops calls until `delay` ms pass. Use it for scroll, pointer, resize and drag handlers that fire too often.",
              ko: "`useThrottle`은 바로 실행한 뒤 `delay` ms가 지날 때까지 호출을 버리는 콜백을 돌려줍니다. 너무 자주 발생하는 scroll, pointer, resize, drag 핸들러에 씁니다.",
            })}
          </div>
          <code className={chip}>useThrottle(func, delay = 200, deps = [])</code>
          <Docs.OptionTable items={throttleArgRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Compared With useDebounce", ko: "useDebounce와 비교" })}</Docs.SubSubTitle>
          <Docs.Table columns={rateColumns} rows={rateRows} stacked />
          <div>
            {l.trans({
              en: "A drag pad that updates its dot at most every 100 ms:",
              ko: "점 위치를 최대 100ms마다 한 번만 바꾸는 드래그 패드입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/DragPad.tsx"
          language="tsx"
          code={`"use client";
import { cn } from "akanjs/client";
import { useThrottle } from "akanjs/webkit";
import { useState } from "react";

interface DragPadProps {
  className?: string;
}
export const DragPad = ({ className }: DragPadProps) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const onMove = useThrottle((x: number, y: number) => {
    setPosition({ x, y });
  }, 100);
  return (
    <div
      className={cn("relative h-64", className)}
      onPointerMove={(e) => onMove(e.nativeEvent.offsetX, e.nativeEvent.offsetY)}
    >
      <span
        className="absolute size-3 rounded-full bg-primary"
        style={{ left: position.x, top: position.y }}
      />
    </div>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The first call always runs.</strong> Calls inside the window are dropped, not queued, so the
                    last position of a fast drag may be skipped.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>첫 호출은 항상 실행됩니다.</strong> 구간 안의 호출은 쌓아 두지 않고 버리므로, 빠른 드래그의
                    마지막 위치는 빠질 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Need the final value? Use <code>useDebounce</code>.
                    </strong>{" "}
                    It runs once with the arguments of the last call.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      마지막 값이 꼭 필요하면 <code>useDebounce</code>를 씁니다.
                    </strong>{" "}
                    마지막 호출의 인자로 한 번 실행됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="useFetch / useFetchFn" title="useFetch / useFetchFn">
        <Docs.Title>useFetch / useFetchFn</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These hooks turn a promise into `{ fulfilled, value }` inside a client component. Use them for a value that exists only in the browser, or when client code needs the value itself, not just to draw it.",
              ko: "이 두 hook은 클라이언트 컴포넌트 안에서 promise를 `{ fulfilled, value }`로 바꿔 줍니다. 브라우저에만 있는 값이거나, 값을 그리기만 하는 게 아니라 클라이언트 코드가 값 자체를 써야 할 때 씁니다.",
            })}
          </div>
          <Docs.IntroTable type="hook" items={fetchHookRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Result And Option", ko: "반환값과 옵션" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={fetchResultRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  The storage quota exists only in the browser, so this component is loaded through{" "}
                  <code>{"lazy(…, { ssr: false })"}</code>:
                </span>
              ),
              ko: (
                <span>
                  저장 공간 사용량은 브라우저에만 있으므로, 이 컴포넌트는 <code>{"lazy(…, { ssr: false })"}</code>로
                  불러옵니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/StorageUsage/StorageUsage.tsx"
          language="tsx"
          code={`"use client";
import { Loading } from "akanjs/ui";
import { useFetchFn } from "akanjs/webkit";

interface StorageUsageProps {
  className?: string;
}
const StorageUsage = ({ className }: StorageUsageProps) => {
  const { fulfilled, value } = useFetchFn(() => navigator.storage.estimate());
  return fulfilled ? (
    <progress className={className} max={value?.quota} value={value?.usage} />
  ) : (
    <Loading.Spin />
  );
};

export default StorageUsage;`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      To draw a promise, reach for <code>{"<Load.Stream of={promise}>"}</code> first.
                    </strong>{" "}
                    It streams real markup from the server, while <code>useFetch</code> waits in an effect and ships
                    only the fallback in the first HTML.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      promise를 그리기만 한다면 <code>{"<Load.Stream of={promise}>"}</code>가 먼저입니다.
                    </strong>{" "}
                    서버가 실제 마크업을 스트리밍합니다. <code>useFetch</code>는 effect에서 기다리므로 첫 HTML에는 대체
                    화면만 들어갑니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Do not call <code>fetch.*</code> on mount.
                    </strong>{" "}
                    Load server data in the route and hand it down as a prop or an unawaited promise.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      마운트할 때 <code>fetch.*</code>를 부르지 않습니다.
                    </strong>{" "}
                    서버 데이터는 route에서 불러 prop이나 await하지 않은 promise로 넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The factory runs during render, on the server too.</strong> A client component still renders
                    once on the server, where <code>navigator.storage</code> is missing, so a browser-only call needs
                    the <code>ssr: false</code> boundary shown above.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>factory는 렌더링 중에 실행되며, 서버에서도 실행됩니다.</strong> 클라이언트 컴포넌트도
                    서버에서 한 번 렌더링되는데 그곳에는 <code>navigator.storage</code>가 없습니다. 그래서 브라우저 전용
                    호출은 위처럼 <code>ssr: false</code> 경계 뒤에 둡니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It follows the promise handed on each render.</strong> A new promise, or new{" "}
                    <code>deps</code> on <code>useFetchFn</code>, resets the result to <code>fulfilled: false</code>{" "}
                    until it resolves, and a result from an older promise is dropped.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>렌더링마다 넘겨받은 promise를 따라갑니다.</strong> 새 promise를 넘기거나{" "}
                    <code>useFetchFn</code>의 <code>deps</code>가 바뀌면, 결과는 그 promise가 끝날 때까지{" "}
                    <code>fulfilled: false</code>로 돌아가고 이전 promise의 결과는 버려집니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Never create the promise inline in render.</strong>{" "}
                  <code>useFetch(navigator.storage.estimate())</code> makes a new promise on every render, and each
                  result renders again, so the request repeats in a loop. Pass a stable promise, such as a prop or a
                  ref, or use <code>useFetchFn(factory, deps)</code>, which recreates it only when <code>deps</code>{" "}
                  change.
                </span>
              ),
              ko: (
                <span>
                  <strong>promise를 렌더링 안에서 바로 만들지 마세요.</strong>{" "}
                  <code>useFetch(navigator.storage.estimate())</code>는 렌더링할 때마다 새 promise를 만들고, 결과가 올
                  때마다 다시 렌더링되므로 요청이 끝없이 반복됩니다. prop이나 ref처럼 바뀌지 않는 promise를 넘기거나,{" "}
                  <code>deps</code>가 바뀔 때만 promise를 다시 만드는 <code>useFetchFn(factory, deps)</code>를 쓰세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="useCamera" title="useCamera">
        <Docs.Title>useCamera</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`useCamera` takes a photo or picks one from the library through the native runtime's camera plugin. In the native app it asks for the camera first and opens the app settings when the user has denied it; in a browser it picks from files.",
              ko: "`useCamera`는 네이티브 런타임의 camera 플러그인으로 사진을 찍거나 앨범에서 고릅니다. 네이티브 앱에서는 먼저 카메라 권한을 요청하고, 거부된 상태면 앱 설정 화면을 엽니다. 브라우저에서는 파일에서 고릅니다.",
            })}
          </div>
          <code className={chip}>
            useCamera({"{ promptLabels }"} = {"{}"})
          </code>
          <Docs.IntroTable type={memberLabel} items={cameraRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Option", ko: "옵션" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={cameraOptionRows} />
          <div>
            {l.trans({
              en: "A button that takes a photo and previews it:",
              ko: "사진을 찍어 미리 보여 주는 버튼입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/TakePhoto.tsx"
          language="tsx"
          code={`"use client";
import { usePage } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";
import { useCamera } from "akanjs/webkit";
import { useState } from "react";

interface TakePhotoProps {
  className?: string;
}
export const TakePhoto = ({ className }: TakePhotoProps) => {
  const { l } = usePage();
  const { getPhoto } = useCamera();
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className={className}>
      <button
        className={buttonRecipe()}
        onClick={async () => {
          const photo = await getPhoto("camera");
          setPreview(photo?.dataUrl ?? null);
        }}
        type="button"
      >
        {l("base.cameraPromptPicture")}
      </button>
      {preview ? <img src={preview} alt="" /> : null}
    </div>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Declare the permission.</strong> <code>"camera"</code> in <code>native.permissions</code>{" "}
                    adds the camera plugin and its usage texts. There is no package to install.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>권한을 선언합니다.</strong> <code>native.permissions</code>에 <code>"camera"</code>를 넣으면
                    camera 플러그인과 사용 목적 문구가 들어갑니다. 설치할 패키지는 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The browser picks from files.</strong> Outside the native app every source becomes the
                    library, so the same call works on the web without a check of your own.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>브라우저에서는 파일에서 고릅니다.</strong> 네이티브 앱 밖에서는 어떤 source든 앨범 선택이
                    되므로, 따로 확인하지 않아도 같은 호출이 웹에서 동작합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The photo is read once.</strong> The runtime hands over a file reference, and the hook turns
                    it into a data URL and releases it, so there is nothing to clean up.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>사진은 한 번만 읽습니다.</strong> 런타임이 넘긴 파일 참조를 hook이 data URL로 바꾸고 바로
                    놓아 주므로, 따로 정리할 것이 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/mobile/setup#native-plugins",
                title: l.trans({ en: "Native Plugins", ko: "네이티브 플러그인" }),
                desc: l.trans({
                  en: "Native permissions, and the plugins they add.",
                  ko: "네이티브 권한과 그 권한이 넣는 플러그인입니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="useGeoLocation" title="useGeoLocation">
        <Docs.Title>useGeoLocation</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`useGeoLocation` reads the current position through the native runtime's geolocation plugin, and through `navigator.geolocation` in a browser. It sends the user to the app settings when the permission is denied.",
              ko: "`useGeoLocation`은 네이티브 런타임의 geolocation 플러그인으로, 브라우저에서는 `navigator.geolocation`으로 현재 위치를 읽습니다. 권한이 거부되면 사용자를 앱 설정으로 보냅니다.",
            })}
          </div>
          <code className={chip}>useGeoLocation()</code>
          <Docs.IntroTable type={memberLabel} items={geoRows} />
          <div>
            {l.trans({
              en: "An app hook that finds where to center a map:",
              ko: "지도를 어디에 맞출지 찾는 앱 hook입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/webkit/useMapCenter.tsx"
          language="tsx"
          code={`"use client";
import { useGeoLocation } from "akanjs/webkit";

export const useMapCenter = () => {
  const { getPosition } = useGeoLocation();
  const getCenter = async () => {
    const position = await getPosition();
    if (!position) return null;
    return { lat: position.latitude, lng: position.longitude };
  };
  return { getCenter };
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Check for <code>undefined</code>.
                    </strong>{" "}
                    It means the permission was denied and the settings screen is already open.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>undefined</code>를 확인합니다.
                    </strong>{" "}
                    권한이 거부되어 이미 설정 화면을 연 상태라는 뜻입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The position is flat.</strong> <code>latitude</code>, <code>longitude</code>,{" "}
                    <code>accuracy</code>, <code>altitude</code>, <code>heading</code>, <code>speed</code> and{" "}
                    <code>timestamp</code> sit on the value itself, not under <code>coords</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>위치 값은 평평합니다.</strong> <code>latitude</code>, <code>longitude</code>,{" "}
                    <code>accuracy</code>, <code>altitude</code>, <code>heading</code>, <code>speed</code>,{" "}
                    <code>timestamp</code>가 <code>coords</code> 아래가 아니라 값 자체에 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>precise</code> says whether the fix is exact.
                    </strong>{" "}
                    <code>false</code> means the user granted approximate location only; the web answers{" "}
                    <code>null</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>precise</code>는 정확한 위치인지 알려 줍니다.
                    </strong>{" "}
                    <code>false</code>면 사용자가 대략적인 위치만 허용한 것이고, 웹은 <code>null</code>로 답합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Declare the permission.</strong> <code>"location"</code> in <code>native.permissions</code>{" "}
                    adds the geolocation plugin and its usage texts.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>권한을 선언합니다.</strong> <code>native.permissions</code>에 <code>"location"</code>을
                    넣으면 geolocation 플러그인과 사용 목적 문구가 들어갑니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="usePushNotification" title="usePushNotification">
        <Docs.Title>usePushNotification</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Push lives in `@libs/util/webkit`, not `akanjs/webkit`. In a native shell the hook calls the runtime's push plugin (APNs on iOS, FCM on Android); in a browser it calls Firebase. Either way it hands back one `PushToken` shape.",
              ko: "푸시는 `akanjs/webkit`이 아니라 `@libs/util/webkit`에 있습니다. 네이티브 셸에서는 런타임의 push 플러그인(iOS는 APNs, Android는 FCM)을, 브라우저에서는 Firebase를 부르고, 어느 쪽이든 같은 모양의 `PushToken`을 돌려줍니다.",
            })}
          </div>
          <code className={chip}>{'import { type PushToken, usePushNotification } from "@libs/util/webkit";'}</code>
          <Docs.IntroTable type={memberLabel} items={pushRows} />
          <div>
            {l.trans({
              en: "Registering from a button, because `register()` may show a permission prompt:",
              ko: "`register()`가 권한 창을 띄울 수 있으므로 버튼에서 등록합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/EnablePush.tsx"
          language="tsx"
          code={`"use client";
import { st } from "@apps/myapp/client";
import { type PushToken, usePushNotification } from "@libs/util/webkit";
import { buttonRecipe } from "akanjs/ui";
import type { ReactNode } from "react";

interface EnablePushProps {
  className?: string;
  children: ReactNode;
}
export const EnablePush = ({ className, children }: EnablePushProps) => {
  const push = usePushNotification();
  return (
    <button
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={async () => {
        const pushToken: PushToken | undefined = await push.register();
        if (pushToken) await st.do.registerPushToken(pushToken);
      }}
      type="button"
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
                    <strong>
                      A <code>PushToken</code> is the address of one install.
                    </strong>{" "}
                    It holds <code>token</code>, <code>platform</code> (<code>web</code> | <code>ios</code> |{" "}
                    <code>android</code>), <code>provider</code> (<code>apns</code> | <code>fcm</code>) and{" "}
                    <code>deviceId</code>, the installation id kept in the app&apos;s storage.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>PushToken</code>은 앱 설치 하나의 주소입니다.
                    </strong>{" "}
                    <code>token</code>, <code>platform</code>(<code>web</code> | <code>ios</code> | <code>android</code>
                    ), <code>provider</code>(<code>apns</code> | <code>fcm</code>), 앱 저장소에 두는 설치 id인{" "}
                    <code>deviceId</code>를 담습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A tap opens the push&apos;s <code>url</code>.
                    </strong>{" "}
                    In a native shell the framework routes it from boot, the launching tap included; only a path inside
                    the app is followed.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      알림을 누르면 푸시의 <code>url</code>로 이동합니다.
                    </strong>{" "}
                    네이티브 셸에서는 앱을 띄운 탭까지 프레임워크가 부팅 때부터 라우팅하며, 앱 안의 경로만 따라갑니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>registerPushToken</code> comes with <code>libs/shared</code>.
                    </strong>{" "}
                    Its notification store keeps the token on the signed-in user;{" "}
                    <code>Notification.Zone.Initialize</code> keeps it current.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>registerPushToken</code>은 <code>libs/shared</code>에 들어 있습니다.
                    </strong>{" "}
                    notification 스토어가 토큰을 로그인한 사용자에게 저장하고, <code>Notification.Zone.Initialize</code>
                    가 최신으로 유지합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/mobile/push#client-registration",
                title: l.trans({ en: "Client Registration", ko: "클라이언트 등록" }),
                desc: l.trans({
                  en: "The full register flow, and where the token is stored.",
                  ko: "등록 흐름 전체와 토큰을 저장하는 곳입니다.",
                }),
              },
              {
                href: "/cheatsheet/mobile/push#web-push",
                title: l.trans({ en: "Web Push", ko: "웹 푸시" }),
                desc: l.trans({
                  en: "The Firebase settings `register()` needs in the browser.",
                  ko: "브라우저에서 `register()`가 필요로 하는 Firebase 설정입니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="usePurchase" title="usePurchase">
        <Docs.Title>usePurchase</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`usePurchase` sells in-app products through the native runtime's iap plugin: StoreKit 2 on iOS, Play Billing on Android. Your server verifies every transaction before the app credits it, and a browser sells nothing.",
              ko: "`usePurchase`는 네이티브 런타임의 iap 플러그인으로 인앱 상품을 팝니다. iOS는 StoreKit 2, Android는 Play Billing입니다. 앱이 지급하기 전에 서버가 거래마다 검증하고, 브라우저에서는 팔지 않습니다.",
            })}
          </div>
          <code className={chip}>{'import { usePurchase } from "akanjs/webkit/usePurchase";'}</code>
          <Docs.SubSubTitle>{l.trans({ en: "Options", ko: "옵션" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={purchaseOptionRows} />
          <Docs.IntroTable type={memberLabel} items={purchaseRows} />
          <div>
            {l.trans({
              en: "A buy button that credits coins once the server has accepted the purchase:",
              ko: "서버가 구매를 받아 준 뒤에 코인을 지급하는 구매 버튼입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/BuyCoins.tsx"
          language="tsx"
          code={`"use client";
import { st } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";
import { usePurchase } from "akanjs/webkit/usePurchase";

interface BuyCoinsProps {
  className?: string;
}
export const BuyCoins = ({ className }: BuyCoinsProps) => {
  const { products, purchaseProduct } = usePurchase({
    platform: "all",
    productInfo: [{ id: "coins_100", type: "consumable" }],
    url: "https://billing.myapp.com",
    onPay: async () => {
      await st.do.refreshWallet();
    },
  });
  const [coins] = products;
  if (!coins) return null;
  return (
    <button
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={() => void purchaseProduct(coins)}
      type="button"
    >
      {coins.title} · {coins.displayPrice}
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
                    <strong>Add the plugin to the native app.</strong> The iap plugin is not a permission: name it with{" "}
                    <code>native: {'{ plugins: ["iap"] }'}</code> in <code>akan.config.ts</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>네이티브 앱에 플러그인을 넣습니다.</strong> iap 플러그인은 권한이 아니므로,{" "}
                    <code>akan.config.ts</code>에 <code>native: {'{ plugins: ["iap"] }'}</code>로 적습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      The server gets one body: <code>{"{ data }"}</code>.
                    </strong>{" "}
                    <code>data</code> is <code>{"{ platform, packageName, productId, receipt, transactionId }"}</code>.
                    On iOS <code>receipt</code> is the transaction&apos;s signed JWS (no app receipt, no account id), on
                    Android the purchase token with its package name. Any 2xx accepts it, and its JSON reaches{" "}
                    <code>onPay</code> or <code>onSubscribe</code> as <code>verified</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      서버는 본문 하나를 받습니다: <code>{"{ data }"}</code>.
                    </strong>{" "}
                    <code>data</code>는 <code>{"{ platform, packageName, productId, receipt, transactionId }"}</code>
                    입니다. iOS의 <code>receipt</code>는 거래의 서명된 JWS이고(app receipt와 account id는 없습니다),
                    Android는 purchase token과 패키지 이름입니다. 2xx면 받아 준 것이고, 그 JSON이 <code>onPay</code>나{" "}
                    <code>onSubscribe</code>에 <code>verified</code>로 옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Finished only once it is credited.</strong> A transaction is finished after the server
                    accepted it and your callback resolved. A refusal or a throw leaves it unfinished, and the store
                    hands it over again: iOS at the next launch, while Google refunds an unacknowledged purchase after
                    three days.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>지급한 뒤에만 완료합니다.</strong> 서버가 받아 주고 콜백이 끝난 뒤에 거래를 완료합니다.
                    거절되거나 콜백이 던지면 완료하지 않고, 스토어가 다시 넘겨줍니다. iOS는 다음 실행 때 다시 오고,
                    Google은 확인하지 않은 구매를 3일 뒤 환불합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Leftovers settle at mount.</strong> The hook loads the unfinished transactions and listens
                    for later ones (Ask to Buy, a pending payment), and one transaction is credited once even when it
                    arrives twice.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>남은 거래는 마운트할 때 정리합니다.</strong> hook이 완료되지 않은 거래를 불러오고 나중에
                    오는 거래(Ask to Buy, 보류된 결제)도 듣습니다. 같은 거래가 두 번 와도 한 번만 지급합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="useLocation / useHistory" title="useLocation / useHistory">
        <Docs.Title>useLocation / useHistory</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The CSR router runs on these two hooks: one turns an href into route state, the other remembers where the user has been. They drive cached page transitions, scroll restoration and back/forward detection.",
              ko: "CSR 라우터는 이 두 hook 위에서 돕니다. 하나는 href를 route 상태로 바꾸고, 다른 하나는 사용자가 지나온 곳을 기억합니다. 캐시된 페이지 전환, 스크롤 복원, 뒤로/앞으로 가기 판별이 여기서 나옵니다.",
            })}
          </div>
          <Docs.IntroTable type="API" items={routerRows} />
          <div>
            {l.trans({
              en: "The router sets them up once, starting from the page it opened on:",
              ko: "라우터는 처음 연 페이지에서 시작해 한 번만 준비합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="pkgs/akanjs/webkit/useCsrValues.ts"
          code={`const { getLocation } = useLocation({ rootRouteGuide });
const {
  history,
  setHistoryForward,
  setHistoryBack,
  getNextLocation,
  getCurrentLocation,
  getPrevLocation,
  getScrollTop,
} = useHistory([getLocation(window.location.href.replace(window.location.origin, ""))]);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      App code navigates with <code>router</code>.
                    </strong>{" "}
                    <code>router.push</code> and <code>router.back</code> from <code>akanjs/client</code> go through
                    these hooks for you.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      앱 코드는 <code>router</code>로 이동합니다.
                    </strong>{" "}
                    <code>akanjs/client</code>의 <code>router.push</code>와 <code>router.back</code>이 이 hook들을 대신
                    거칩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A page with <code>cache</code> in its config is kept.
                    </strong>{" "}
                    The history remembers its location, so going back shows it without rebuilding it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      config에 <code>cache</code>를 켠 페이지는 보관됩니다.
                    </strong>{" "}
                    history가 그 위치를 기억해 두므로, 뒤로 가면 다시 만들지 않고 보여 줍니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/references/akanjs/client#router",
                title: "router",
                desc: l.trans({
                  en: "Moving between routes from stores and event handlers.",
                  ko: "store와 이벤트 핸들러에서 route 사이를 이동합니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="LoginForm" title="LoginForm">
        <Docs.Title>LoginForm</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`LoginForm` is what the shared store's `login` action takes. It says which account to load after sign-in, and where to send the user on success or failure.",
              ko: "`LoginForm`은 shared store의 `login` action이 받는 인자입니다. 로그인 뒤 어떤 계정을 불러올지, 성공하거나 실패하면 어디로 보낼지를 담습니다.",
            })}
          </div>
          <Docs.OptionTable items={loginRows} />
          <div>
            {l.trans({
              en: "A button that loads the signed-in user, then lands on the home page or goes back to sign-in:",
              ko: "로그인한 사용자를 불러온 뒤 홈으로 보내고, 실패하면 로그인 화면으로 돌려보내는 버튼입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/Continue.tsx"
          language="tsx"
          code={`"use client";
import { st, usePage } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";
import type { LoginForm } from "akanjs/webkit";

const homeLogin: LoginForm = {
  auth: "user",
  redirect: "/",
  unauthorize: "/signin",
};

interface ContinueProps {
  className?: string;
}
export const Continue = ({ className }: ContinueProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({}, className)}
      onClick={() => void st.do.login(homeLogin)}
      type="button"
    >
      {l.trans({ en: "Continue", ko: "계속하기" })}
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
                    <strong>
                      Pass <code>jwt</code> right after a sign-in call.
                    </strong>{" "}
                    The admin store does this: it signs in, then calls <code>login</code> with{" "}
                    <code>{'{ auth: "admin", jwt, redirect }'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      로그인 호출 직후에는 <code>jwt</code>를 넘깁니다.
                    </strong>{" "}
                    admin store가 이렇게 합니다. 로그인한 뒤 <code>{'{ auth: "admin", jwt, redirect }'}</code>로{" "}
                    <code>login</code>을 부릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>"public"</code> loads the same way as <code>"user"</code> today.
                    </strong>{" "}
                    Only <code>"admin"</code> takes a different path.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      지금은 <code>"public"</code>도 <code>"user"</code>와 같은 방식으로 불러옵니다.
                    </strong>{" "}
                    <code>"admin"</code>만 다른 길로 갑니다.
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
