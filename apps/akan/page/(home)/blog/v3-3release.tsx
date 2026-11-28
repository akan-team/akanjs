import { usePage } from "@apps/akan/client";
import { Code, Docs, DocsToc, JellyKicker, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { badgeRecipe, Link } from "akanjs/ui";
import type { ReactNode } from "react";
import { BsArrowRight } from "react-icons/bs";

type Phrase = Record<"en" | "ko", string>;

interface Glance {
  href: string;
  value: string;
  label: Phrase;
}

interface Feature {
  id: string;
  nav: Phrase;
  title: Phrase;
  lead: Phrase;
  body: Phrase[];
  snippet?: { title: string; code: string };
  links: { href: string; label: Phrase }[];
}

interface Improvement {
  title: Phrase;
  desc: Phrase;
  href: string;
}

interface Stat {
  value: string;
  label: Phrase;
  detail: string;
}

interface UpgradeCheck {
  title: Phrase;
  desc: Phrase;
  href?: string;
}

const changelogUrl = "https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/CHANGELOG.md";

const glance: Glance[] = [
  {
    href: "#v33-light",
    value: "43%",
    label: { en: "less JavaScript on this site's typical page", ko: "이 사이트 보통 페이지의 자바스크립트 감소" },
  },
  {
    href: "#v33-features",
    value: "8",
    label: { en: "changes worth knowing", ko: "알아 둘 변화" },
  },
  {
    href: "#v33-team",
    value: "4×",
    label: { en: "faster lint on a whole app", ko: "더 빨라진 앱 전체 린트" },
  },
];

const features: Feature[] = [
  {
    id: "light",
    nav: { en: "Lighter pages", ko: "가벼운 페이지" },
    title: { en: "Pages load only what they use", ko: "페이지는 쓰는 것만 불러옵니다" },
    lead: {
      en: "This site's typical page now sends 43% less JavaScript, and most apps get lighter just by upgrading.",
      ko: "이 사이트의 보통 페이지는 자바스크립트가 43% 줄었고, 대부분의 앱은 업그레이드만으로 가벼워집니다.",
    },
    body: [
      {
        en: "Until now a page loaded the stores, API descriptions and texts of the whole app, even when it used one module. In 3.3 a page loads only the modules its own code names and only the icons it draws, and it loads no store library at all when it uses no store.",
        ko: "지금까지는 페이지가 모듈 하나만 써도 앱 전체의 스토어, API 설명, 문구를 함께 불러왔습니다. 3.3부터 페이지는 자기 코드가 이름을 적은 모듈과 실제로 그리는 아이콘만 불러오고, 스토어를 쓰지 않으면 스토어 라이브러리도 불러오지 않습니다.",
      },
      {
        en: "How much lighter depends on the app: a page that uses many modules has less to leave behind. When a page still loads everything, akan quality runtime names the file and line that cause it.",
        ko: "얼마나 가벼워지는지는 앱마다 다릅니다. 모듈을 많이 쓰는 페이지는 덜어낼 것이 적습니다. 여전히 전체를 불러오는 페이지가 있다면 akan quality runtime이 원인이 되는 파일과 줄을 짚어 줍니다.",
      },
    ],
    snippet: { title: "Terminal", code: "akan build myapp\nakan quality runtime" },
    links: [{ href: "/references/cli/quality", label: { en: "akan quality", ko: "akan quality" } }],
  },
  {
    id: "secrets",
    nav: { en: "Secrets", ko: "시크릿" },
    title: { en: "Secrets stay out of the build", ko: "시크릿은 빌드에 넣지 않습니다" },
    lead: {
      en: "A leaked image no longer takes your passwords with it.",
      ko: "이미지가 유출돼도 비밀번호까지 따라 나가지 않습니다.",
    },
    body: [
      {
        en: "A built server used to carry the secret values of its env file: database passwords, API tokens, signing keys. akan build now leaves them out. The server reads each one from an environment variable when it starts, and stops with a message that names any it could not find.",
        ko: "빌드된 서버에는 env 파일의 시크릿 값, 즉 데이터베이스 비밀번호와 API 토큰, 서명 키가 그대로 들어 있었습니다. 이제 akan build는 이 값들을 빼고 빌드합니다. 서버는 시작할 때 환경 변수에서 하나씩 읽고, 찾지 못한 것이 있으면 그 이름을 알려 주며 멈춥니다.",
      },
      {
        en: "akan secret-env lists the variables an app needs and writes them as a Kubernetes Secret or a dotenv file, so nobody copies them by hand.",
        ko: "akan secret-env가 앱에 필요한 변수를 나열하고 Kubernetes Secret이나 dotenv 파일로 써 주므로, 손으로 옮겨 적을 일이 없습니다.",
      },
    ],
    snippet: {
      title: "Terminal",
      code: "akan secret-env myapp --env main\nakan secret-env myapp --env main --format k8s --out local/secret-env.yaml",
    },
    links: [{ href: "/cheatsheet/dev/k8s", label: { en: "Deploying with secrets", ko: "시크릿과 함께 배포하기" } }],
  },
  {
    id: "script",
    nav: { en: "Script policy", ko: "스크립트 정책" },
    title: { en: "Only your scripts run on your pages", ko: "내 페이지에서는 내 스크립트만" },
    lead: {
      en: "A script someone slips into a page is refused by the browser.",
      ko: "누군가 페이지에 끼워 넣은 스크립트는 브라우저가 실행을 거부합니다.",
    },
    body: [
      {
        en: "Every page now tells the browser exactly which scripts it may run. The framework lists its own, so an injected script, the usual way an account is stolen through a comment or a profile field, does not run. A snippet of your own, such as an analytics tag, is named once in the page's head.",
        ko: "이제 모든 페이지가 어떤 스크립트를 실행해도 되는지 브라우저에 정확히 알려 줍니다. 프레임워크가 쓰는 스크립트는 프레임워크가 직접 등록하므로, 댓글이나 프로필 칸을 통해 계정을 훔치는 흔한 수법인 주입된 스크립트는 실행되지 않습니다. 분석 태그처럼 직접 넣는 스니펫은 페이지 head에서 한 번 등록합니다.",
      },
      {
        en: "Not sure what your pages carry? Deploy once in report-only mode, and the server logs each script the policy would have blocked without blocking it.",
        ko: "페이지에 무엇이 들어 있는지 확실하지 않다면 보고 전용 모드로 한 번 배포하세요. 서버가 정책이 막았을 스크립트를 막지 않고 하나씩 로그로 남깁니다.",
      },
    ],
    snippet: {
      title: "page/_layout.tsx",
      code: `import { layout, scriptHashes } from "akanjs/client";

const consent = "window.dataLayer=window.dataLayer||[];";

export default layout()
  .head(() => {
    scriptHashes("sha256-djPdT5J1kuWFwawDhtbzz0YHt/63i3CUBG3CyUjLa4c=");
    return <script dangerouslySetInnerHTML={{ __html: consent }} />;
  })
  .render(({ children }) => children);`,
    },
    links: [{ href: "/cheatsheet/general/script-policy", label: { en: "Script policy", ko: "스크립트 정책" } }],
  },
  {
    id: "session",
    nav: { en: "Sessions", ko: "세션" },
    title: { en: "Sign-ins that are harder to steal", ko: "훔치기 어려워진 로그인" },
    lead: {
      en: "A stolen token is good for an hour, not a week.",
      ko: "토큰이 탈취돼도 쓸 수 있는 시간은 일주일이 아니라 한 시간입니다.",
    },
    body: [
      {
        en: "With the shared library's sign-in, a web session now lives in cookies that page scripts cannot read. The token a browser holds lasts one hour and renews itself while the app is open. Signing a device out closes its live connections at once, on every server.",
        ko: "shared 라이브러리의 로그인을 쓰는 웹 세션은 이제 페이지 스크립트가 읽을 수 없는 쿠키에 담깁니다. 브라우저가 가진 토큰은 한 시간만 유효하고, 앱이 열려 있는 동안 스스로 갱신됩니다. 기기를 로그아웃시키면 그 기기의 실시간 연결이 모든 서버에서 즉시 끊깁니다.",
      },
      {
        en: "Users can see the devices signed in to their account and sign any of them out. Admin password sign-in can be closed in favour of SSO, and your code can be told about a locked account, a reused refresh token or a sign-in from a new device.",
        ko: "사용자는 자기 계정에 로그인된 기기를 보고 원하는 기기를 로그아웃시킬 수 있습니다. 관리자 비밀번호 로그인을 닫고 SSO만 남길 수 있고, 계정 잠금, 리프레시 토큰 재사용, 새 기기 로그인 같은 신호를 코드에서 받을 수 있습니다.",
      },
    ],
    links: [],
  },
  {
    id: "observe",
    nav: { en: "Observability", ko: "관측" },
    title: { en: "See what your server is doing", ko: "서버가 지금 무엇을 하는지 보입니다" },
    lead: {
      en: "Request counts, slow queries and errors, without adding a library.",
      ko: "라이브러리를 더하지 않고도 요청 수, 느린 쿼리, 에러까지.",
    },
    body: [
      {
        en: "Every endpoint and page now counts its requests and times them, in a form Prometheus scrapes as it is. One request id follows a request through every process it touches, background jobs and websocket messages included, so one search finds its whole story in the logs.",
        ko: "모든 엔드포인트와 페이지가 요청 수와 걸린 시간을 재고, Prometheus가 그대로 수집할 수 있는 형태로 내놓습니다. 요청 하나에는 id 하나가 붙어 백그라운드 작업과 웹소켓 메시지까지 거쳐 가는 모든 프로세스를 따라가므로, 한 번의 검색으로 그 요청의 전 과정을 로그에서 찾습니다.",
      },
      {
        en: "A SQL statement that takes 200 ms or more gets a log line of its own, and the server can list which statements run most and take longest. Hand the server one function and its errors reach your error tracker; turn on client reports and the ones that happen only in a user's browser or inside a native app arrive too.",
        ko: "200ms 이상 걸린 SQL 문은 따로 로그에 남고, 어떤 문장이 가장 자주 돌고 가장 오래 걸리는지 서버가 목록으로 보여 줍니다. 서버에 함수 하나만 넘기면 서버 에러가 에러 추적 서비스에 닿고, 클라이언트 리포트를 켜면 사용자 브라우저나 네이티브 앱 안에서만 나는 에러도 함께 옵니다.",
      },
    ],
    snippet: {
      title: "apps/myapp/lib/option.ts",
      code: `export const option = new AkanOption<ModulesOptions>()
  .setErrorReporter(errorTracker)
  .setClientReport({ sampleRate: 0.25 });`,
    },
    links: [
      { href: "/cheatsheet/observability/metrics", label: { en: "Metrics", ko: "메트릭" } },
      { href: "/cheatsheet/observability/error", label: { en: "Error reporting", ko: "에러 리포팅" } },
    ],
  },
  {
    id: "agent",
    nav: { en: "Agents", ko: "에이전트" },
    title: { en: "Agents that carry fewer tools and take more care", ko: "도구는 덜 들고, 더 조심하는 에이전트" },
    lead: {
      en: "Long conversations cost less, and a stranger's text cannot give orders.",
      ko: "긴 대화는 더 싸게, 남이 쓴 글이 지시가 되지 않게.",
    },
    body: [
      {
        en: "An agent with hundreds of tools used to send every tool's description on every turn. Now it can keep a short list and search for the rest when a task needs them. The conversation it sends only grows at the end, so the model provider's prompt cache keeps working and long conversations cost less.",
        ko: "도구가 수백 개인 에이전트는 매 턴마다 모든 도구 설명을 보내야 했습니다. 이제는 짧은 목록만 들고, 나머지는 작업에 필요할 때 검색해서 꺼냅니다. 보내는 대화는 끝에만 덧붙으므로 모델 제공자의 프롬프트 캐시가 계속 유지되고, 긴 대화의 비용이 줄어듭니다.",
      },
      {
        en: "Text someone else wrote, such as a document a user mentions or the content on the screen, now reaches the model marked as data, not as instructions. After the agent reads such text, its next change asks the user first. The in-page agent also answers only once the page it moved to has finished loading.",
        ko: "사용자가 멘션한 문서나 화면의 내용처럼 다른 사람이 쓴 글은 이제 지시가 아니라 데이터로 표시되어 모델에 전달됩니다. 에이전트가 그런 글을 읽은 뒤의 첫 변경은 사용자에게 먼저 묻습니다. 인페이지 에이전트는 이동한 페이지가 다 불러와진 뒤에야 답합니다.",
      },
      {
        en: "The same idea reaches MCP: an app with many endpoints can sort them onto shelves and let an MCP client search them, instead of handing over the whole list.",
        ko: "MCP도 같은 방식입니다. 엔드포인트가 많은 앱은 전체 목록을 넘기는 대신 선반으로 나눠 두고, MCP 클라이언트가 검색해서 찾게 할 수 있습니다.",
      },
    ],
    links: [
      { href: "/cheatsheet/interface/agent-chat", label: { en: "Agent chat", ko: "에이전트 채팅" } },
      { href: "/cheatsheet/interface/mcp", label: { en: "MCP", ko: "MCP" } },
    ],
  },
  {
    id: "worker",
    nav: { en: "Workers and images", ko: "워커와 이미지" },
    title: {
      en: "Heavy work in its own process, in a safer image",
      ko: "무거운 일은 별도 프로세스로, 이미지는 더 안전하게",
    },
    lead: {
      en: "A long job no longer slows the requests running beside it.",
      ko: "오래 걸리는 작업이 옆에서 처리되는 요청을 느리게 하지 않습니다.",
    },
    body: [
      {
        en: "Name an entry file under workers in akan.config.ts and Akan builds it apart from the server. AppWorker.spawn then runs it as a process of its own, sends its output to the server log, and starts it again if it crashes. A library can ship a worker to every app that uses it.",
        ko: "akan.config.ts의 workers에 엔트리 파일을 적으면 Akan이 서버와 따로 빌드합니다. AppWorker.spawn이 이를 별도 프로세스로 실행하고, 출력을 서버 로그로 보내며, 죽으면 다시 띄웁니다. 라이브러리가 워커를 자기를 쓰는 모든 앱에 함께 실어 보낼 수도 있습니다.",
      },
      {
        en: "The Docker image akan build writes now runs the server as an ordinary user instead of root, on a base image pinned to one exact build, and it can be built for another CPU architecture.",
        ko: "akan build가 쓰는 Docker 이미지는 이제 서버를 root가 아닌 일반 사용자로 실행하고, 정확히 하나의 빌드로 고정된 베이스 이미지를 쓰며, 다른 CPU 아키텍처용으로도 빌드할 수 있습니다.",
      },
    ],
    snippet: {
      title: "apps/myapp/akan.config.ts",
      code: `workers: { vision: "srvkit/vision.worker.ts" },`,
    },
    links: [{ href: "/docs/core/config", label: { en: "Configuration", ko: "설정" } }],
  },
  {
    id: "native",
    nav: { en: "Navigation and native", ko: "화면 이동과 네이티브" },
    title: {
      en: "Navigation that answers at once, on the web and in native apps",
      ko: "웹에서도 네이티브 앱에서도 바로 반응하는 화면 이동",
    },
    lead: {
      en: "A tap shows it was heard before the next page arrives.",
      ko: "다음 페이지가 오기 전에, 눌렸다는 것부터 보여 줍니다.",
    },
    body: [
      {
        en: "A link can show a pressed state from the tap until its page is drawn, and a loading view can appear at the press. Nested layouts start rendering together instead of one after another, so the first paint of a page under three layouts that each wait for data came down from 214 ms to 52 ms in our test.",
        ko: "링크는 누른 순간부터 페이지가 그려질 때까지 눌린 상태를 보여 줄 수 있고, 로딩 화면을 누르는 즉시 띄울 수 있습니다. 중첩된 레이아웃은 차례로가 아니라 동시에 렌더를 시작합니다. 각자 데이터를 기다리는 레이아웃 세 개 아래의 페이지는 테스트에서 첫 화면이 214ms에서 52ms로 줄었습니다.",
      },
      {
        en: "In a native app the page meets the keyboard the way a native screen does, on iOS and Android alike. A deep link opens the right screen with the screens that belong under it, Android's back button closes an open dialog first, and a development build installs beside the store app under its own name.",
        ko: "네이티브 앱에서는 iOS와 Android 모두 페이지가 네이티브 화면처럼 키보드를 맞이합니다. 딥링크는 그 아래 있어야 할 화면들과 함께 올바른 화면을 열고, Android 뒤로 가기는 열린 대화상자부터 닫으며, 개발 빌드는 자기 이름을 달고 스토어 앱 옆에 따로 설치됩니다.",
      },
    ],
    snippet: {
      title: "ui/Menu.tsx",
      code: `<Link href="/orders" pendingClassName="opacity-60">
  Orders
</Link>`,
    },
    links: [
      { href: "/docs/core/routing", label: { en: "Routing", ko: "라우팅" } },
      { href: "/cheatsheet/mobile/links", label: { en: "Deep links", ko: "딥링크" } },
    ],
  },
];

const teamImprovements: Improvement[] = [
  {
    title: { en: "akan code asks before it runs a command", ko: "명령을 실행하기 전에 묻는 akan code" },
    desc: {
      en: "The coding agent ships as its own package, @akanjs/code, so a workspace that never uses it installs no model SDKs. On your machine it asks before each shell command.",
      ko: "코딩 에이전트가 @akanjs/code라는 별도 패키지로 나와, 쓰지 않는 워크스페이스는 모델 SDK를 설치하지 않습니다. 내 컴퓨터에서는 셸 명령마다 실행 전에 묻습니다.",
    },
    href: "/references/cli/code",
  },
  {
    title: { en: "Preview pages behind a sign-in", ko: "로그인 뒤의 페이지도 미리 보기" },
    desc: {
      en: "akan preview opens pages signed in as an account you configure, and opens a [param] route at the examples you declare.",
      ko: "akan preview가 설정해 둔 계정으로 로그인한 채 페이지를 열고, [param] 라우트는 선언한 예시 값으로 엽니다.",
    },
    href: "/references/cli/application",
  },
  {
    title: { en: "A dev server that answers sooner", ko: "더 빨리 응답하는 개발 서버" },
    desc: {
      en: "akan start boots the backend beside the first build, so the API answers while pages are still building, and saving an endpoint restarts only the backend.",
      ko: "akan start가 첫 빌드와 나란히 백엔드를 띄워 페이지가 빌드되는 동안에도 API가 응답하고, 엔드포인트를 저장하면 백엔드만 다시 시작합니다.",
    },
    href: "/references/cli/application",
  },
  {
    title: { en: "Lint about four times faster", ko: "약 4배 빨라진 린트" },
    desc: {
      en: "Linting this site's whole app went from 8.0 seconds to 2.0, with the same rules.",
      ko: "이 사이트 앱 전체의 린트가 같은 규칙으로 8.0초에서 2.0초로 줄었습니다.",
    },
    href: "/conventions/workspace/lint",
  },
  {
    title: { en: "Tests mount only what they name", ko: "이름을 적은 모듈만 띄우는 테스트" },
    desc: {
      en: "A signal test can start just the modules it names, and a call to a module the server did not mount says so instead of failing with a vague error.",
      ko: "시그널 테스트가 이름을 적은 모듈만 띄울 수 있고, 서버가 띄우지 않은 모듈을 부르면 모호한 에러 대신 그 사실을 알려 줍니다.",
    },
    href: "/cheatsheet/dev/test",
  },
  {
    title: { en: "A shorter guide for coding agents", ko: "더 짧아진 코딩 에이전트 가이드" },
    desc: {
      en: "The AGENTS.md the CLI writes is about 9% smaller and its path rules a fifth shorter, so an agent spends less context before its first edit.",
      ko: "CLI가 쓰는 AGENTS.md가 약 9% 작아지고 경로 규칙은 5분의 1 짧아져, 에이전트가 첫 수정 전에 쓰는 컨텍스트가 줄었습니다.",
    },
    href: "/references/cli/agent",
  },
];

const performanceStats: Stat[] = [
  {
    value: "−43%",
    label: { en: "JavaScript on this site's median page", ko: "이 사이트 중앙값 페이지의 자바스크립트" },
    detail: "535 KB → 304 KB",
  },
  {
    value: "−38%",
    label: { en: "lightest page of a 236-route app", ko: "라우트 236개 앱의 가장 가벼운 페이지" },
    detail: "466 KB → 290 KB",
  },
  {
    value: "−32%",
    label: { en: "largest page of the minimal sample app", ko: "minimal 샘플 앱의 가장 큰 페이지" },
    detail: "469 KB → 319 KB",
  },
  {
    value: "−15%",
    label: { en: "an empty page", ko: "빈 페이지" },
    detail: "202 KB → 171 KB",
  },
  {
    value: "4×",
    label: { en: "faster first paint under three waiting layouts", ko: "기다리는 레이아웃 세 개 아래의 첫 화면" },
    detail: "214 ms → 52 ms",
  },
  {
    value: "5×",
    label: { en: "faster burst of cached pages", ko: "캐시된 페이지가 한꺼번에 몰릴 때" },
    detail: "38 ms → 7 ms",
  },
];

const fixes: Phrase[] = [
  {
    en: "Korean, Japanese and emoji characters no longer break where a long page's output happened to be cut in the middle of a character.",
    ko: "긴 페이지의 출력이 글자 중간에서 잘릴 때 한글, 일본어, 이모지가 깨지던 문제가 사라졌습니다.",
  },
  {
    en: "A built server started on a machine with no NODE_ENV set renders its pages, where it used to fail every one.",
    ko: "NODE_ENV가 없는 머신에서 빌드된 서버를 실행해도 페이지가 정상 렌더됩니다. 전에는 모든 렌더가 실패했습니다.",
  },
  {
    en: "A call to an API path that does not exist answers a JSON 404 instead of an HTML page, and a malformed websocket message answers 400 or 404 instead of a server error.",
    ko: "없는 API 경로를 호출하면 HTML 페이지 대신 JSON 404로 응답하고, 형식이 잘못된 웹소켓 메시지는 서버 에러 대신 400이나 404로 응답합니다.",
  },
  {
    en: "Tailwind classes marked important, such as h-0!, compile as important.",
    ko: "h-0!처럼 important로 표시한 Tailwind 클래스가 important로 컴파일됩니다.",
  },
  {
    en: "An input drops its error message when the field is emptied.",
    ko: "입력 칸을 비우면 에러 메시지가 사라집니다.",
  },
  {
    en: "On iOS, opening the camera or the in-app browser no longer reloads the page underneath.",
    ko: "iOS에서 카메라나 인앱 브라우저를 열어도 그 아래 페이지가 다시 불러와지지 않습니다.",
  },
];

const upgradeSteps = `akan update
akan verify <app-or-lib>
akan agent install`;

const upgradeChecks: UpgradeCheck[] = [
  {
    title: { en: "Give the server its secrets", ko: "서버에 시크릿을 넘겨 주세요" },
    desc: {
      en: "An image built with 3.3 holds no secret values and does not start without them. Run akan secret-env <app> --env <env>, supply those variables, and rotate the secrets older images still hold.",
      ko: "3.3으로 빌드한 이미지에는 시크릿 값이 없고, 값이 없으면 시작하지 않습니다. akan secret-env <app> --env <env>를 실행해 변수를 넣어 주고, 이전 이미지에 남아 있는 시크릿은 교체하세요.",
    },
    href: "/cheatsheet/dev/k8s",
  },
  {
    title: { en: "Name your own inline scripts", ko: "직접 넣은 인라인 스크립트를 등록하세요" },
    desc: {
      en: 'An inline script, an onclick="…" attribute or a javascript: link is blocked until the page names it. Deploy once with AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=on to find them first.',
      ko: '인라인 스크립트, onclick="…" 속성, javascript: 링크는 페이지가 등록하기 전까지 막힙니다. 먼저 AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=on으로 한 번 배포해 찾아내세요.',
    },
    href: "/cheatsheet/general/script-policy",
  },
  {
    title: { en: "Sessions last one hour", ko: "세션은 한 시간 단위로 갱신됩니다" },
    desc: {
      en: "An app that mounts Auth.User or Auth.Admin renews by itself. A page that read the token out of a sign-in answer now gets an empty one: pass the answer to setAuth and let the cookie carry the session.",
      ko: "Auth.User나 Auth.Admin을 마운트한 앱은 스스로 갱신합니다. 로그인 응답에서 토큰을 꺼내 쓰던 페이지는 이제 빈 값을 받으므로, 응답을 setAuth에 넘기고 세션은 쿠키에 맡기세요.",
    },
  },
  {
    title: { en: "The image runs as uid 1000", ko: "이미지는 uid 1000으로 실행됩니다" },
    desc: {
      en: "A volume an older image wrote belongs to root. The server stops at boot and names the directory and the chown to run once. The Helm chart has values that keep an older image on root.",
      ko: "이전 이미지가 쓴 볼륨은 root 소유입니다. 서버는 부팅에서 멈추고 해당 디렉터리와 한 번 실행할 chown을 알려 줍니다. Helm 차트에는 이전 이미지를 root로 유지하는 값이 있습니다.",
    },
    href: "/cheatsheet/dev/k8s",
  },
  {
    title: { en: "Ignore two new generated paths", ko: "새로 생성되는 경로 두 개를 ignore하세요" },
    desc: {
      en: "Add lib/usePage.ts and lib/__client to .gitignore for apps and libs. Then run akan build and akan quality runtime to see whether anything keeps a page on the whole runtime.",
      ko: "앱과 lib의 lib/usePage.ts와 lib/__client를 .gitignore에 추가하세요. 그다음 akan build와 akan quality runtime을 실행해 페이지가 런타임 전체를 불러오게 만드는 것이 있는지 확인합니다.",
    },
    href: "/references/cli/quality",
  },
  {
    title: { en: "Deprecated imports are gone", ko: "deprecated였던 import가 제거됐습니다" },
    desc: {
      en: "What 3.2 marked deprecated is removed: wildcard paths such as akanjs/server/* and @akanjs/devkit/*, and thirteen old exports. Typecheck points at each use.",
      ko: "3.2에서 deprecated로 표시한 것이 제거됐습니다. akanjs/server/*, @akanjs/devkit/* 같은 와일드카드 경로와 오래된 export 열세 개입니다. 타입 검사가 쓰인 곳을 하나씩 짚어 줍니다.",
    },
  },
  {
    title: { en: "akan code is its own package", ko: "akan code는 별도 패키지입니다" },
    desc: {
      en: "A workspace that runs akan code adds it at the same version: bun add -d @akanjs/code@3.3.0.",
      ko: "akan code를 쓰는 워크스페이스는 같은 버전으로 추가합니다: bun add -d @akanjs/code@3.3.0.",
    },
    href: "/references/cli/code",
  },
  {
    title: { en: "Native apps: two settings", ko: "네이티브 앱: 설정 두 가지" },
    desc: {
      en: "A desktop app that opens external views names their origins in native.desktop.externalView.allowOrigins. An iOS dev build installs as <appId>.debug, so register that App ID and its development profile.",
      ko: "외부 뷰를 여는 데스크톱 앱은 native.desktop.externalView.allowOrigins에 origin을 적습니다. iOS 개발 빌드는 <appId>.debug로 설치되므로 그 App ID와 개발 프로파일을 등록하세요.",
    },
    href: "/cheatsheet/mobile/setup",
  },
];

export default page()
  .config({ transition: "stack" })
  .head(({ lang }) => {
    const title =
      lang === "ko"
        ? "Akan.js 3.3: 가볍게, 안전하게 | Akan.js 블로그"
        : "Akan.js 3.3: lighter pages, safer by default | Akan.js Blog";
    const description =
      lang === "ko"
        ? "페이지는 쓰는 코드만 불러오고, 시크릿은 빌드에서 빠지며, 모든 페이지에 스크립트 정책이 적용되고, 서버가 무엇을 하는지 보입니다. 3.3.0에서 바뀐 것과 3.2에서 올릴 때 확인할 것을 정리했습니다."
        : "Pages load only the code they use, secrets leave the build, every page enforces a script policy, and the server shows what it is doing. What changed in 3.3.0, and what to check when you upgrade from 3.2.";
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
    const figures: Record<string, ReactNode> = {
      light: (
        <Docs.Figure
          title={l.trans({ en: "A page takes only its own modules", ko: "페이지는 자기 모듈만 가져갑니다" })}
          image="v33-page-modules"
          prompt={`
          On the left, one large browser labelled "Page". On the right, five small plain squares stacked
          vertically in one column, with a thin bracket along their right side labelled "App modules". The top
          two squares are drawn with solid outlines, and from each of them one long arrow runs to the left and
          ends at the browser; these two arrows are the red accent. The lower three squares are drawn with
          dashed outlines and have no arrows.
        `}
          alt={l.trans({
            en: "Of the app's five modules, only the two the page names are sent to the browser; the other three stay behind.",
            ko: "앱의 모듈 다섯 개 중 페이지가 이름을 적은 두 개만 브라우저로 가고, 나머지 셋은 남습니다.",
          })}
        />
      ),
      secrets: (
        <Docs.Figure
          title={l.trans({ en: "Secrets arrive when the server starts", ko: "시크릿은 서버가 시작할 때 들어옵니다" })}
          image="v33-secrets-outside"
          prompt={`
          On the left, two shapes stacked one above the other: the upper one is a container labelled "Image",
          drawn empty inside; the lower one is one large door key labelled "Secrets". On the right, one server
          labelled "Server". One long arrow runs from the container to the server, and a second long arrow runs
          from the key to the server, so the two arrows arrive at the server separately. The key is the red
          accent.
        `}
          alt={l.trans({
            en: "The image and the secrets reach the server by separate paths: the image holds no secret, and the key is handed over at start.",
            ko: "이미지와 시크릿은 서로 다른 길로 서버에 닿습니다. 이미지에는 시크릿이 없고, 열쇠는 시작할 때 건네집니다.",
          })}
        />
      ),
      script: (
        <Docs.Figure
          title={l.trans({ en: "The browser checks every script", ko: "브라우저가 스크립트를 하나씩 확인합니다" })}
          image="v33-script-policy"
          prompt={`
          On the left, two application source pages stacked one above the other: the upper one labelled "Your
          script", the lower one labelled "Injected script". In the middle, one tall thick vertical wall that
          runs the full height of both pages, labelled "Policy" under it; the wall has one doorway gap, level
          with the upper page only. On the right, one large browser labelled "Page". One long arrow runs from the
          upper page straight through the doorway gap and ends at the browser. One short arrow runs from the
          lower page, stops at the solid part of the wall and ends in one large cross mark; the cross mark is the
          red accent.
        `}
          alt={l.trans({
            en: "The page's own script passes the policy and runs in the browser, while an injected script is stopped at the gate.",
            ko: "페이지 자신의 스크립트는 정책을 통과해 브라우저에서 실행되고, 주입된 스크립트는 문 앞에서 막힙니다.",
          })}
        />
      ),
      observe: (
        <Docs.Figure
          title={l.trans({ en: "One id follows the request", ko: "id 하나가 요청을 따라갑니다" })}
          image="v33-request-id"
          prompt={`
          On the far left, one person. To the right of the person, three processes in one row from left to right,
          labelled "Gateway", "Server" and "Job". One long unbroken line starts at the person and threads
          straight through all three processes, ending in an arrowhead after the last one; this long line is the
          red accent. Hanging from the line just after the person, one small luggage tag labelled "Request id".
        `}
          alt={l.trans({
            en: "One request id travels with a request from the gateway through the server to a background job.",
            ko: "요청 id 하나가 게이트웨이에서 서버를 거쳐 백그라운드 job까지 요청과 함께 이동합니다.",
          })}
        />
      ),
    };

    return (
      <main className="min-h-screen text-foreground">
        <article className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
          <header>
            <div className="mb-10 flex items-end justify-between gap-4">
              <JellyKicker>Akan.js 3.3</JellyKicker>
            </div>
            <p className="mb-4 text-foreground/50 text-sm">
              {l.trans({ en: "Release note · Nov 28, 2026", ko: "릴리즈 노트 · 2026년 11월 28일" })}
            </p>
            <h1 className="font-black text-4xl leading-[1.08] md:text-[3.25rem]">
              {l.trans({
                en: "Akan.js 3.3: lighter pages, safer by default",
                ko: "Akan.js 3.3: 가볍게, 안전하게",
              })}
            </h1>
            <p className="mt-6 text-foreground/70 text-lg leading-8">
              {l.trans({
                en: "3.3 gathers more than 200 changes around three questions an app meets once real users arrive. How much does a page make the browser download? What could leak? Can you see what the server is doing? This post walks through the answers in plain words, then lists what to check when you upgrade from 3.2.",
                ko: "3.3은 200개가 넘는 변경을, 실제 사용자가 생긴 앱이 마주하는 세 가지 질문에 맞춰 묶었습니다. 페이지가 브라우저에 얼마나 많이 내려받게 하는가? 무엇이 새어 나갈 수 있는가? 서버가 지금 무엇을 하는지 볼 수 있는가? 이 글은 그 답을 쉬운 말로 훑고, 3.2에서 올라올 때 확인할 것을 정리합니다.",
              })}
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {glance.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={panelRecipe(
                    { tone: "jelly", radius: "3xl", padding: "none" },
                    "group squish hover:tint-primary p-5 transition-shadow",
                  )}
                >
                  <p className="font-black text-4xl text-primary">{item.value}</p>
                  <p className="mt-2 text-foreground/70 text-sm leading-6 group-hover:text-foreground">
                    {l.trans(item.label)}
                  </p>
                </a>
              ))}
            </div>
            <nav className="mt-6 flex flex-wrap gap-2">
              {features.map((feature) => (
                <a
                  key={feature.id}
                  href={`#v33-${feature.id}`}
                  className={badgeRecipe(
                    undefined,
                    "border-foreground/10 bg-foreground/5 text-foreground/70 hover:text-primary",
                  )}
                >
                  {l.trans(feature.nav)}
                </a>
              ))}
              <a
                href="#v33-upgrade"
                className={badgeRecipe(undefined, "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15")}
              >
                {l.trans({ en: "Upgrading from 3.2", ko: "3.2에서 올라올 때" })}
              </a>
            </nav>
          </header>

          <Scroll className="mt-14">
            <Scroll.Slide id="v33-features" title={l.trans({ en: "What's new", ko: "새로워진 것" })}>
              <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
                {l.trans({ en: "What's new", ko: "새로워진 것" })}
              </p>
              <h2 className="mt-3 font-black text-3xl">
                {l.trans({ en: "Eight changes worth knowing", ko: "알아 둘 여덟 가지 변화" })}
              </h2>
            </Scroll.Slide>

            {features.map((feature, idx) => (
              <Scroll.Slide
                key={feature.id}
                id={`v33-${feature.id}`}
                title={l.trans(feature.nav)}
                className={idx === 0 ? "mt-12" : "mt-16"}
              >
                <p className="font-black font-mono text-primary text-sm">{String(idx + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 font-black text-3xl">{l.trans(feature.title)}</h3>
                <p className="mt-3 font-semibold text-foreground/85 text-lg leading-7">{l.trans(feature.lead)}</p>
                {feature.body.map((paragraph) => (
                  <p key={paragraph.en} className="mt-4 text-foreground/75 leading-7">
                    {l.trans(paragraph)}
                  </p>
                ))}
                {figures[feature.id] ?? null}
                {feature.snippet ? (
                  <Code.Snippet
                    className="mt-5 w-full"
                    title={feature.snippet.title}
                    code={feature.snippet.code}
                    showLineNumbers={false}
                  />
                ) : null}
                {feature.links.length > 0 ? (
                  <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                    {feature.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="inline-flex items-center gap-1 font-semibold text-primary text-sm hover:underline"
                      >
                        {l.trans(link.label)} <BsArrowRight />
                      </Link>
                    ))}
                  </p>
                ) : null}
              </Scroll.Slide>
            ))}

            <Scroll.Slide
              id="v33-team"
              title={l.trans({ en: "For your team", ko: "개발팀이 느끼는 변화" })}
              className="mt-20"
            >
              <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
                {l.trans({ en: "Everyday work", ko: "매일의 작업" })}
              </p>
              <h2 className="mt-3 font-black text-3xl">
                {l.trans({ en: "What your team will notice", ko: "개발팀이 느끼는 변화" })}
              </h2>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {teamImprovements.map((item) => (
                  <Link
                    key={item.title.en}
                    href={item.href}
                    className={panelRecipe(
                      { tone: "jelly", radius: "3xl", padding: "none" },
                      "group squish hover:tint-primary p-5 transition-shadow",
                    )}
                  >
                    <p className="font-bold group-hover:text-primary">{l.trans(item.title)}</p>
                    <p className="mt-2 text-foreground/65 text-sm leading-6">{l.trans(item.desc)}</p>
                  </Link>
                ))}
              </div>
            </Scroll.Slide>

            <Scroll.Slide id="v33-performance" title={l.trans({ en: "Performance", ko: "성능" })} className="mt-20">
              <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
                {l.trans({ en: "Performance", ko: "성능" })}
              </p>
              <h2 className="mt-3 font-black text-3xl">{l.trans({ en: "The numbers", ko: "숫자로 보기" })}</h2>
              <p className="mt-4 text-foreground/75 leading-7">
                {l.trans({
                  en: "Less to download is the headline, but the server got quicker too. It starts every level of a route at once, sends a page's file list to the render process once instead of with every request, and streams static files from disk at about a quarter of the CPU.",
                  ko: "가장 큰 변화는 내려받는 양이 줄어든 것이지만, 서버도 빨라졌습니다. 라우트의 모든 단계를 동시에 시작하고, 페이지의 파일 목록을 요청마다가 아니라 한 번만 렌더 프로세스에 보내며, 정적 파일을 디스크에서 바로 스트리밍해 CPU를 4분의 1 정도만 씁니다.",
                })}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {performanceStats.map((stat) => (
                  <div key={stat.label.en} className="jelly-glass rounded-3xl p-5">
                    <p className="font-black text-4xl text-primary">{stat.value}</p>
                    <p className="mt-2 font-semibold text-foreground/80 text-sm leading-6">{l.trans(stat.label)}</p>
                    <p className="mt-1 font-mono text-foreground/45 text-xs">{stat.detail}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-foreground/45 text-xs leading-5">
                {l.trans({
                  en: "Page sizes are the JavaScript a route loads, as served with brotli. Each figure was measured before and after the change behind it.",
                  ko: "페이지 크기는 라우트가 불러오는 자바스크립트를 brotli로 전송한 기준입니다. 각 수치는 해당 변경의 전과 후를 측정한 값입니다.",
                })}
              </p>
            </Scroll.Slide>

            <Scroll.Slide id="v33-fixes" title={l.trans({ en: "Fixes", ko: "수정" })} className="mt-16">
              <h2 className="font-black text-2xl md:text-3xl">
                {l.trans({ en: "Fixed along the way", ko: "함께 고쳐진 것" })}
              </h2>
              <ul className="mt-6 list-disc space-y-3 pl-5 text-foreground/75 leading-7">
                {fixes.map((fix) => (
                  <li key={fix.en}>{l.trans(fix)}</li>
                ))}
              </ul>
            </Scroll.Slide>

            <Scroll.Slide
              id="v33-upgrade"
              title={l.trans({ en: "Upgrading from 3.2", ko: "3.2에서 올라올 때" })}
              className="mt-16"
            >
              <h2 className="font-black text-2xl md:text-3xl">
                {l.trans({ en: "Upgrading from 3.2", ko: "3.2에서 올라올 때" })}
              </h2>
              <p className="mt-3 text-foreground/65 leading-7">
                {l.trans({
                  en: "3.3 keeps the requirements of 3.2: Bun 1.4.4 or newer and React 19.3.1. Update the workspace, verify each app and library, and refresh the agent guide. Several defaults changed for safety, so go through the list below before you deploy.",
                  ko: "3.3의 요구 사항은 3.2와 같습니다. Bun 1.4.4 이상과 React 19.3.1입니다. 워크스페이스를 업데이트하고, 앱과 라이브러리마다 verify를 돌리고, 에이전트 가이드를 새로 받으세요. 안전을 위해 기본값이 여럿 바뀌었으니 배포 전에 아래 목록을 확인하세요.",
                })}
              </p>
              <Code.Snippet className="mt-5 w-full" title="Terminal" code={upgradeSteps} showLineNumbers={false} />
              <ol className="mt-6 space-y-3">
                {upgradeChecks.map((check, idx) => (
                  <li key={check.title.en} className="jelly-glass flex gap-4 rounded-3xl p-4">
                    <span className="font-black font-mono text-primary text-sm">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-bold">{l.trans(check.title)}</p>
                      <p className="wrap-anywhere mt-1 text-foreground/65 text-sm leading-6">{l.trans(check.desc)}</p>
                      {check.href ? (
                        <Link
                          href={check.href}
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-primary text-sm hover:underline"
                        >
                          {l.trans({ en: "Details", ko: "자세히" })} <BsArrowRight />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-foreground/65 leading-7">
                {l.trans({
                  en: "The changelog has every option, env variable and removed name, including the notes for agents, observability and route caches that most apps will not need.",
                  ko: "모든 옵션과 환경 변수, 제거된 이름은 변경 로그에 있습니다. 대부분의 앱에는 필요 없는 에이전트, 관측, 라우트 캐시 관련 안내도 거기에 있습니다.",
                })}
              </p>
              <Link
                href={changelogUrl}
                target="_blank"
                className="mt-4 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
              >
                {l.trans({ en: "Read the full changelog", ko: "전체 변경 로그 보기" })} <BsArrowRight />
              </Link>
            </Scroll.Slide>
            <DocsToc />
          </Scroll>
        </article>
      </main>
    );
  });
