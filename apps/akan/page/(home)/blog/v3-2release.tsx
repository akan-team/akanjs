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

interface UpgradeCheck {
  title: Phrase;
  desc: Phrase;
  href?: string;
}

const changelogUrl = "https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/CHANGELOG.md";

const glance: Glance[] = [
  {
    href: "#v32-fast",
    value: "−72 KB",
    label: {
      en: "framework JavaScript on every server-rendered page",
      ko: "서버에서 그리는 모든 페이지의 프레임워크 자바스크립트",
    },
  },
  {
    href: "#v32-features",
    value: "7",
    label: { en: "changes worth knowing", ko: "알아 둘 변화" },
  },
  {
    href: "#v32-guard",
    value: "403",
    label: { en: "what an endpoint with no guard answers now", ko: "가드 없는 엔드포인트의 새 응답" },
  },
];

const features: Feature[] = [
  {
    id: "agent",
    nav: { en: "Server agent", ko: "서버 에이전트" },
    title: { en: "An agent that runs on your server", ko: "서버에서 도는 에이전트" },
    lead: {
      en: "The agent no longer needs an open screen to work.",
      ko: "에이전트가 일하는 데 더 이상 열린 화면이 필요 없습니다.",
    },
    body: [
      {
        en: "Until 3.2 the agent lived in the page and worked the screen a person had open. agentService.loop runs one inside your server instead, over the same tools your app publishes at /mcp, as one account. It can do only what that account may do, so a scheduled job, a webhook or a chat in another channel can each hand work to an agent.",
        ko: "3.1까지 에이전트는 페이지 안에서 사람이 열어 둔 화면을 다뤘습니다. agentService.loop는 에이전트를 서버 안에서 실행합니다. 앱이 /mcp로 공개하는 것과 같은 도구를 한 계정의 권한으로 씁니다. 그 계정이 할 수 있는 일만 할 수 있으므로, 예약 작업이나 웹훅, 다른 채널의 대화도 에이전트에게 일을 맡길 수 있습니다.",
      },
      {
        en: "You name the tools a run may use and group the rest into toolkits it opens when a task needs them. A run can call other MCP servers, use the screen a member has open, or stop to ask the person a question and pick up when they answer. Text it reads from someone else counts as untrusted: after that, a write runs only if your code approves it.",
        ko: "실행이 쓸 수 있는 도구를 직접 정하고, 나머지는 작업에 필요할 때 여는 툴킷으로 묶어 둡니다. 실행 중에 다른 MCP 서버를 부르거나, 사용자가 열어 둔 화면을 쓰거나, 사람에게 질문하고 멈췄다가 답이 오면 이어 갈 수 있습니다. 다른 사람이 쓴 글을 읽으면 신뢰할 수 없는 입력으로 취급해, 그 뒤의 쓰기는 코드가 승인해야만 실행됩니다.",
      },
    ],
    snippet: {
      title: "In a service",
      code: `for await (const event of this.agentService.loop({
  account,
  allow: ["orderListInSelf", "refundOrder"],
  messages: [{ role: "user", text: "Refund my last order." }],
})) {
  if (event.type === "text") reply += event.delta;
}`,
    },
    links: [
      { href: "/cheatsheet/interface/mcp", label: { en: "MCP", ko: "MCP" } },
      { href: "/cheatsheet/interface/agent-chat", label: { en: "Agent chat", ko: "에이전트 채팅" } },
    ],
  },
  {
    id: "graph",
    nav: { en: "Graph and Studio", ko: "그래프와 Studio" },
    title: { en: "Your whole app on one map", ko: "앱 전체를 한 장의 지도로" },
    lead: {
      en: "Models, endpoints and pages, drawn from the source and linked back to it.",
      ko: "모델과 엔드포인트, 페이지를 소스에서 그리고 소스로 다시 잇습니다.",
    },
    body: [
      {
        en: "The Akan Graph describes an app straight from its source, with no server running: models, scalars, slices, endpoints with their guards, services, jobs, routes and layouts. A coding agent asks for it with the get_graph tool, and with a git revision it gets only what changed since then. It reads a map instead of opening files one by one.",
        ko: "Akan 그래프는 서버를 띄우지 않고 소스에서 바로 읽어 낸 앱의 설명입니다. 모델, 스칼라, 슬라이스, 가드가 붙은 엔드포인트, 서비스, job, 라우트와 레이아웃이 담깁니다. 코딩 에이전트는 get_graph 도구로 이를 받고, git 리비전을 주면 그 뒤로 바뀐 것만 받습니다. 파일을 하나씩 여는 대신 지도를 읽는 셈입니다.",
      },
      {
        en: "For people there is Akan Studio. akan start serves it at /_akan/studio: the ERD, request paths, a map of your changes and a map of the framework, each linked to its source, plus the running server's services and jobs.",
        ko: "사람을 위한 화면은 Akan Studio입니다. akan start가 /_akan/studio에서 열어 주며, ERD와 요청 경로, 변경 지도, 프레임워크 지도를 각각 소스에 이어서 보여 주고, 실행 중인 서버의 서비스와 job도 함께 그립니다.",
      },
    ],
    snippet: { title: "Terminal", code: "akan start myapp\nakan studio myapp --open" },
    links: [
      { href: "/references/cli/context", label: { en: "Agent context tools", ko: "에이전트 컨텍스트 도구" } },
      { href: "/references/cli/application", label: { en: "akan studio", ko: "akan studio" } },
    ],
  },
  {
    id: "editor",
    nav: { en: "Editor", ko: "에디터" },
    title: { en: "An editor that knows Akan's names", ko: "Akan의 이름을 아는 에디터" },
    lead: {
      en: "Go to definition works on names you never wrote.",
      ko: "직접 쓴 적 없는 이름에서도 정의로 이동이 됩니다.",
    },
    body: [
      {
        en: "Akan derives many names from your models: fetch.initMemoInPublic, st.do.setNameOnMemo, this.memoService.listByName. An editor used to see generated code and stop there. The new @akanjs/language package resolves each name to the model, slice or field it came from, and ships a language server any editor can run.",
        ko: "Akan은 모델에서 많은 이름을 만들어 냅니다. fetch.initMemoInPublic, st.do.setNameOnMemo, this.memoService.listByName 같은 것들입니다. 에디터는 이를 생성된 코드로만 보고 거기서 멈췄습니다. 새 @akanjs/language 패키지는 각 이름을 그것이 나온 모델, 슬라이스, 필드로 이어 주고, 어느 에디터에서나 돌릴 수 있는 언어 서버를 함께 제공합니다.",
      },
      {
        en: "The VS Code and Cursor extension builds on it. It opens a module's files side by side, runs akan verify and workflows from the editor, and opens Studio.",
        ko: "VS Code와 Cursor 확장은 이 위에 만들어졌습니다. 모듈의 파일을 나란히 열고, 에디터에서 akan verify와 워크플로를 실행하며, Studio를 엽니다.",
      },
    ],
    links: [
      {
        href: "https://marketplace.visualstudio.com/items?itemName=akanjs.akan",
        label: { en: "VS Marketplace", ko: "VS Marketplace" },
      },
      { href: "https://open-vsx.org/extension/akanjs/akan", label: { en: "Open VSX", ko: "Open VSX" } },
    ],
  },
  {
    id: "guard",
    nav: { en: "Closed by default", ko: "기본은 닫힘" },
    title: { en: "Closed unless you open it", ko: "열지 않으면 닫혀 있습니다" },
    lead: {
      en: "An endpoint nobody decided on answers 403.",
      ko: "누가 호출할지 정하지 않은 엔드포인트는 403으로 응답합니다.",
    },
    body: [
      {
        en: "An endpoint, a slice query or a realtime room that declares no guard used to be open to anyone. In 3.2 it is refused, and a deployed server stops at boot and names each one. Write [Public] where anonymous access is the intent, and the decision stays visible in the code.",
        ko: "가드를 선언하지 않은 엔드포인트, 슬라이스 쿼리, 실시간 룸은 지금까지 누구에게나 열려 있었습니다. 3.2에서는 거부되고, 배포된 서버는 부팅에서 멈추며 해당 엔드포인트를 하나씩 알려 줍니다. 익명 접근이 의도라면 [Public]을 적으세요. 그 결정이 코드에 남습니다.",
      },
      {
        en: "The same rule runs through the release. The in-page agent asks before every write, not only before a removal. A session token is sent only to your own origin. akan start listens on this machine alone. A production error page shows a code, never a stack trace. Each change names the setting that brings the old behaviour back.",
        ko: "같은 원칙이 릴리즈 전체에 적용됩니다. 인페이지 에이전트는 삭제뿐 아니라 모든 쓰기 전에 묻습니다. 세션 토큰은 자기 origin으로만 보냅니다. akan start는 이 컴퓨터에서만 접속을 받습니다. 프로덕션 에러 화면은 스택 트레이스 없이 코드만 보여 줍니다. 바뀐 항목마다 이전 동작으로 되돌리는 설정이 있습니다.",
      },
    ],
    snippet: {
      title: "lib/story/story.signal.ts",
      code: `export class StoryEndpoint extends endpoint(srv.story, ({ query }) => ({
  featuredStory: query(cnst.Story, { guards: [Public] }).exec(async function () {
    return await this.storyService.getFeaturedStory();
  }),
})) {}`,
    },
    links: [
      { href: "/conventions/module/signal", label: { en: "Guards on endpoints", ko: "엔드포인트의 가드" } },
      { href: "/cheatsheet/general/auth", label: { en: "Auth", ko: "인증" } },
    ],
  },
  {
    id: "fast",
    nav: { en: "Faster pages", ko: "빠른 페이지" },
    title: { en: "Every page starts lighter", ko: "모든 페이지가 가볍게 시작합니다" },
    lead: {
      en: "72 KB less framework code on every server-rendered page.",
      ko: "서버에서 그리는 모든 페이지에서 프레임워크 코드가 72KB 줄었습니다.",
    },
    body: [
      {
        en: "That is 22 KB less over the wire once compressed, with nothing to change in your code. The browser also learns sooner what a page needs: its scripts are announced in the page head, a link starts loading its page when the pointer reaches it, and each font family preloads a single face.",
        ko: "압축해서 전송하면 22KB가 줄고, 코드는 바꿀 것이 없습니다. 브라우저는 페이지에 무엇이 필요한지도 더 일찍 압니다. 스크립트는 페이지 head에서 미리 알려지고, 링크는 포인터가 닿을 때 대상 페이지를 불러오기 시작하며, 글꼴은 패밀리마다 한 벌만 미리 불러옵니다.",
      },
      {
        en: "To keep it that way, the build records how much JavaScript each route loads. akan build --check-budget fails when a route grows past its record, so a heavy import is caught in the pull request that adds it.",
        ko: "이 상태를 지키기 위해 빌드가 라우트마다 불러오는 자바스크립트 양을 기록합니다. 라우트가 기록보다 커지면 akan build --check-budget이 실패하므로, 무거운 import는 그것을 추가한 풀 리퀘스트에서 걸러집니다.",
      },
    ],
    snippet: { title: "Terminal", code: "akan build myapp --check-budget" },
    links: [{ href: "/references/cli/application", label: { en: "akan build", ko: "akan build" } }],
  },
  {
    id: "realtime",
    nav: { en: "Realtime", ko: "실시간" },
    title: { en: "Realtime that holds under load", ko: "부하에도 버티는 실시간" },
    lead: {
      en: "One busy client can no longer use up a server.",
      ko: "바쁜 클라이언트 하나가 서버를 다 써 버릴 수 없습니다.",
    },
    body: [
      {
        en: "Live data now has limits. A socket holds at most 256 rooms, one caller 2,000 per process, and one model 50,000 live rooms. A subscribe past a limit gets a clear 429 answer instead of slowing everyone else down.",
        ko: "실시간 데이터에 한도가 생겼습니다. 소켓 하나는 최대 256개, 호출자 하나는 프로세스당 2,000개, 모델 하나는 50,000개의 라이브 룸을 가집니다. 한도를 넘는 구독은 다른 사용자를 느리게 하는 대신 분명한 429 응답을 받습니다.",
      },
      {
        en: "Recovery got attention too. After a Redis outage a room resyncs once Redis is back, a socket that went away keeps at most 100 queued messages, and with Redis each room and model gets a channel of its own.",
        ko: "복구도 손봤습니다. Redis 장애 뒤에는 Redis가 돌아오면 룸이 다시 동기화되고, 끊긴 소켓에는 메시지가 최대 100개까지만 쌓이며, Redis를 쓰면 룸과 모델마다 채널이 따로 생깁니다.",
      },
    ],
    links: [{ href: "/cheatsheet/performance/realtime", label: { en: "Realtime", ko: "실시간" } }],
  },
  {
    id: "native",
    nav: { en: "Native", ko: "네이티브" },
    title: { en: "Desktop on Linux, and a fix for Android 12", ko: "Linux 데스크톱, 그리고 Android 12 수정" },
    lead: {
      en: "External views reach Linux, and apps launch again on Android 12.",
      ko: "외부 뷰가 Linux에 오고, Android 12에서 앱이 다시 실행됩니다.",
    },
    body: [
      {
        en: "A desktop app can now show an external view, another site inside the app, on Linux under both Wayland and X11, and send key presses to it. A Linux AppImage relaunches itself, and the crash at launch on Android 12 and 12L is fixed.",
        ko: "데스크톱 앱이 이제 Linux의 Wayland와 X11 모두에서 외부 뷰, 즉 앱 안에 띄우는 다른 사이트를 보여 주고 키 입력을 보낼 수 있습니다. Linux AppImage는 스스로 다시 실행되고, Android 12와 12L에서 실행 직후 죽던 문제가 고쳐졌습니다.",
      },
      {
        en: "Native builds follow the closed-by-default rule as well. They ship a content security policy, open only https, mailto and tel links outside the app, and check a downloaded desktop update again before installing it.",
        ko: "네이티브 빌드도 기본은 닫힘 원칙을 따릅니다. 콘텐츠 보안 정책을 담아 나가고, 앱 밖으로는 https, mailto, tel 링크만 열며, 내려받은 데스크톱 업데이트를 설치 전에 한 번 더 확인합니다.",
      },
    ],
    links: [
      { href: "/cheatsheet/mobile/setup", label: { en: "Native setup", ko: "네이티브 설정" } },
      { href: "/cheatsheet/mobile/desktop-release", label: { en: "Desktop release", ko: "데스크톱 릴리즈" } },
    ],
  },
];

const teamImprovements: Improvement[] = [
  {
    title: { en: "Tests in parallel, with reports", ko: "병렬 테스트와 리포트" },
    desc: {
      en: "akan test runs files in parallel with --parallel=<n>, writes a JUnit file with --junit <path>, and measures coverage with --coverage.",
      ko: "akan test가 --parallel=<n>으로 파일을 병렬 실행하고, --junit <path>로 JUnit 파일을 쓰며, --coverage로 커버리지를 잽니다.",
    },
    href: "/cheatsheet/dev/test",
  },
  {
    title: { en: "Create many records in one call", ko: "한 번에 여러 건 생성" },
    desc: {
      en: "create<Model>Many runs every row through the same hooks as a single create, and bulkWrite runs in one transaction.",
      ko: "create<Model>Many는 모든 행을 단건 생성과 같은 훅에 태우고, bulkWrite는 하나의 트랜잭션으로 실행됩니다.",
    },
    href: "/cheatsheet/performance/mutation",
  },
  {
    title: { en: "A failed section retries in place", ko: "실패한 구역은 그 자리에서 다시 시도" },
    desc: {
      en: "A part of a page that fails draws a notice with Try again in its own place, and the rest of the page stays.",
      ko: "페이지의 한 부분이 실패하면 그 자리에 다시 시도 버튼이 있는 안내가 뜨고, 나머지 화면은 그대로 남습니다.",
    },
    href: "/docs/core/routing",
  },
  {
    title: { en: "URLs without a language prefix", ko: "언어 접두사 없는 URL" },
    desc: {
      en: 'With i18n.localePrefix set to "as-needed", the default language is served at /about instead of /en/about.',
      ko: 'i18n.localePrefix를 "as-needed"로 두면 기본 언어를 /en/about이 아니라 /about으로 서비스합니다.',
    },
    href: "/docs/core/config",
  },
  {
    title: { en: "Errors that carry a code", ko: "코드가 붙은 에러" },
    desc: {
      en: "Every error is one Err class whose code is always set, so client code tells failures apart with Err.is instead of reading messages.",
      ko: "모든 에러가 code가 항상 채워진 하나의 Err 클래스라서, 클라이언트 코드는 메시지를 읽는 대신 Err.is로 실패를 구분합니다.",
    },
    href: "/references/akanjs/client",
  },
  {
    title: { en: "A CLI scripts can rely on", ko: "스크립트가 믿고 쓰는 CLI" },
    desc: {
      en: "Exit codes mean something: 2 for a wrong command, 3 for a failed check. With --json a failure ends in one JSON line, and akan verify prints how long each step took.",
      ko: "종료 코드에 뜻이 생겼습니다. 잘못된 명령은 2, 실패한 검사는 3입니다. --json이면 실패가 JSON 한 줄로 끝나고, akan verify는 단계별 소요 시간을 출력합니다.",
    },
    href: "/references/cli/overview",
  },
];

const fixes: Phrase[] = [
  {
    en: "A dev page keeps its styles when a stylesheet change arrives together with a page rebuild.",
    ko: "스타일시트 변경이 페이지 재빌드와 함께 도착해도 개발 페이지의 스타일이 유지됩니다.",
  },
  {
    en: "A page that renders a string of 1,024 characters or more renders and hydrates correctly.",
    ko: "1,024자 이상의 문자열을 그리는 페이지가 올바르게 렌더되고 하이드레이션됩니다.",
  },
  {
    en: "A page cut off by a visitor who left, or one that streamed an error, is no longer cached.",
    ko: "방문자가 떠나 중간에 끊긴 페이지나 에러를 스트리밍한 페이지는 더 이상 캐시되지 않습니다.",
  },
  {
    en: "A crafted forwarded header can no longer stall the server while it reads the client address.",
    ko: "조작된 forwarded 헤더로 클라이언트 주소를 읽는 서버를 멈추게 할 수 없습니다.",
  },
  {
    en: "akan verify and akan build reuse the typecheck cache, so a second run is quicker.",
    ko: "akan verify와 akan build가 타입 검사 캐시를 재사용해 두 번째 실행이 빨라졌습니다.",
  },
  {
    en: "create-akan-workspace no longer hangs when akan is not on the PATH.",
    ko: "PATH에 akan이 없어도 create-akan-workspace가 멈추지 않습니다.",
  },
];

const upgradeSteps = `akan update
akan verify <app-or-lib>
akan agent install`;

const upgradeChecks: UpgradeCheck[] = [
  {
    title: { en: "Give every endpoint a guard", ko: "모든 엔드포인트에 가드를 적으세요" },
    desc: {
      en: "An endpoint, slice query or pubsub room with no guards answers 403, and a deployed server stops at boot and names each one. Add [Public] where anonymous access is intended. AKAN_UNGUARDED_ENDPOINTS=open answers them as before while you fix them.",
      ko: "가드가 없는 엔드포인트, 슬라이스 쿼리, pubsub 룸은 403으로 응답하고, 배포된 서버는 부팅에서 멈추며 하나씩 알려 줍니다. 익명 접근이 의도라면 [Public]을 추가하세요. 고치는 동안에는 AKAN_UNGUARDED_ENDPOINTS=open이 이전처럼 응답하게 합니다.",
    },
    href: "/conventions/module/signal",
  },
  {
    title: { en: "Update the CLI with the workspace", ko: "CLI를 워크스페이스와 함께 올리세요" },
    desc: {
      en: "A CLI whose major.minor differs from the workspace's akanjs refuses every command that writes: run akan update. A script that tested for exit code 1 should test for non-zero, since a usage error is 2 and a failed check is 3.",
      ko: "CLI의 major.minor가 워크스페이스의 akanjs와 다르면 파일을 쓰는 명령이 모두 거부됩니다. akan update를 실행하세요. 종료 코드 1을 검사하던 스크립트는 0이 아닌지로 검사하세요. 사용법 오류는 2, 실패한 검사는 3입니다.",
    },
    href: "/references/cli/overview",
  },
  {
    title: { en: "Check errors with Err.is", ko: "에러는 Err.is로 확인하세요" },
    desc: {
      en: "Every Err is one class from akanjs/common, and err.code is always set. Between a page bundle and the framework, test with Err.is rather than instanceof. Err.NotFound.is also requires status 404.",
      ko: "모든 Err는 akanjs/common의 한 클래스이고 err.code가 항상 채워집니다. 페이지 번들과 프레임워크 사이에서는 instanceof 대신 Err.is로 검사하세요. Err.NotFound.is는 status 404도 요구합니다.",
    },
    href: "/references/akanjs/client",
  },
  {
    title: { en: "Re-tune log alerts", ko: "로그 알림 기준을 다시 맞추세요" },
    desc: {
      en: "A failure under 500 logs at warn, and a declared error, a 429 or a read of a missing id logs at debug. Alerts and --level error filters see fewer lines than before.",
      ko: "500 미만의 실패는 warn으로, 선언된 에러와 429, 없는 id 조회는 debug로 남습니다. 알림과 --level error 필터에는 전보다 적은 줄이 잡힙니다.",
    },
    href: "/cheatsheet/observability/logging",
  },
  {
    title: { en: "Prune old indexes once", ko: "오래된 인덱스를 한 번 정리하세요" },
    desc: {
      en: "A boot keeps an index the release no longer declares and warns about it. After every instance runs 3.2, run akan migrate <app> prune-indexes once.",
      ko: "부팅은 릴리즈가 더 이상 선언하지 않는 인덱스를 지우지 않고 경고만 남깁니다. 모든 인스턴스가 3.2로 올라간 뒤 akan migrate <app> prune-indexes를 한 번 실행하세요.",
    },
    href: "/cheatsheet/dev/migration",
  },
  {
    title: { en: "Transactions keep to themselves", ko: "트랜잭션은 밖에서 보이지 않습니다" },
    desc: {
      en: "Work outside an open this.transaction() no longer sees its uncommitted rows, on SQLite too, and a loader no longer shares a batch with it. SqliteDatabase.getMeta and listMeta return promises, so await them.",
      ko: "열려 있는 this.transaction() 밖의 작업은 SQLite에서도 커밋 전의 행을 보지 못하고, 로더도 트랜잭션과 배치를 공유하지 않습니다. SqliteDatabase.getMeta와 listMeta는 프라미스를 돌려주므로 await하세요.",
    },
  },
  {
    title: { en: "Realtime and request limits", ko: "실시간과 요청 한도" },
    desc: {
      en: "A subscribe past the room limits gets a 429 frame coded liveRoomLimit. An idle connection closes after 120 s, and a body is capped at 128 MiB for an upload and 16 MiB otherwise: AKAN_IDLE_TIMEOUT, AKAN_MAX_UPLOAD_BODY and AKAN_MAX_REQUEST_BODY change them.",
      ko: "룸 한도를 넘는 구독은 liveRoomLimit 코드의 429 프레임을 받습니다. 유휴 연결은 120초 뒤 닫히고, 본문은 업로드 128MiB, 그 외 16MiB로 제한됩니다. AKAN_IDLE_TIMEOUT, AKAN_MAX_UPLOAD_BODY, AKAN_MAX_REQUEST_BODY로 바꿉니다.",
    },
    href: "/cheatsheet/performance/realtime",
  },
  {
    title: { en: "akan start listens on this machine", ko: "akan start는 이 컴퓨터에서만 받습니다" },
    desc: {
      en: "akan start binds 127.0.0.1, and the dev server answers only localhost, *.localhost and IP hosts. AKAN_LISTEN_HOST=* and AKAN_ALLOWED_HOSTS open it to other devices on your network.",
      ko: "akan start는 127.0.0.1에 바인드하고, 개발 서버는 localhost, *.localhost, IP 호스트에만 응답합니다. 같은 네트워크의 다른 기기에서 접속하려면 AKAN_LISTEN_HOST=*와 AKAN_ALLOWED_HOSTS를 설정하세요.",
    },
  },
  {
    title: { en: "Agent writes ask first", ko: "에이전트의 쓰기는 먼저 묻습니다" },
    desc: {
      en: "In-page agent tools that write, such as submit, create, update, send and export, confirm before they run: pass { confirm: false } to one that should not. A FetchClient sends its token only to its own origin: use clone({ origin, jwt }) for another.",
      ko: "submit, create, update, send, export처럼 쓰기를 하는 인페이지 에이전트 도구는 실행 전에 확인을 받습니다. 받지 않을 도구에는 { confirm: false }를 넘기세요. FetchClient는 토큰을 자기 origin으로만 보내므로, 다른 곳에는 clone({ origin, jwt })를 쓰세요.",
    },
    href: "/cheatsheet/interface/agent-chat",
  },
  {
    title: { en: "Switches and library copies", ko: "스위치와 라이브러리 사본" },
    desc: {
      en: 'Field.Switch is the primary color when on; variant="accent" brings the old look back. If you copied shared or util with akan install-library, compare your copy with the refreshed one.',
      ko: 'Field.Switch는 켜졌을 때 primary 색입니다. variant="accent"로 이전 모습을 되돌립니다. akan install-library로 shared나 util을 복사해 쓰고 있다면 새로 고쳐진 사본과 비교하세요.',
    },
    href: "/references/cli/library",
  },
];

export default page()
  .config({ transition: "stack" })
  .head(({ lang }) => {
    const title =
      lang === "ko"
        ? "Akan.js 3.2: 서버로 간 에이전트, 기본은 닫힘 | Akan.js 블로그"
        : "Akan.js 3.2: agents on the server, closed by default | Akan.js Blog";
    const description =
      lang === "ko"
        ? "에이전트가 서버 안에서 돌고, 가드 없는 엔드포인트는 닫히며, 앱 전체가 지도로 그려지고, 에디터가 Akan의 이름을 이해합니다. 3.2.0에서 바뀐 것과 3.1에서 올릴 때 확인할 것을 정리했습니다."
        : "The agent runs inside the server, an endpoint with no guard is closed, the whole app is drawn as a map, and the editor understands Akan's names. What changed in 3.2.0, and what to check when you upgrade from 3.1.";
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
      agent: (
        <Docs.Figure
          title={l.trans({ en: "The agent works inside the server", ko: "서버 안에서 일하는 에이전트" })}
          image="v32-server-agent"
          prompt={`
          On the left, two shapes stacked one above the other: the upper one is a round clock face with two hands,
          labelled "Scheduled job"; the lower one is a person, labelled "Member". From each of them one arrow runs
          to the right into one large wide server in the middle of the image, labelled "Server". Inside the
          server sits one rounded rectangle labelled "Agent"; this rounded rectangle is the red accent. From the
          rounded rectangle three short arrows run to the right, each ending at one of three small plain squares
          stacked vertically along the right edge inside the server; the stack of three squares is labelled
          "Your tools". Draw nothing to the right of the server.
        `}
          alt={l.trans({
            en: "A scheduled job and a member each hand work to an agent that runs inside the server and calls the app's own tools.",
            ko: "예약 작업과 사용자가 각각 서버 안에서 도는 에이전트에게 일을 맡기고, 에이전트는 앱 자신의 도구를 호출합니다.",
          })}
        />
      ),
      graph: (
        <Docs.Figure
          title={l.trans({ en: "One map, read from the source", ko: "소스에서 읽어 낸 한 장의 지도" })}
          image="v32-app-map"
          prompt={`
          On the left, one application source page labelled "Source". Three long arrows fan out from it to the
          right and end at three shapes stacked vertically: at the top a database labelled "Models", in the
          middle a process labelled "Endpoints", at the bottom a browser labelled "Pages". Two short thick
          vertical lines join the three stacked shapes, one from the database down to the process and one from
          the process down to the browser; these two joining lines are the red accent. To the right of the
          stack, one large magnifying glass, with no label.
        `}
          alt={l.trans({
            en: "The source is read into one map of models, endpoints and pages, with the links between them drawn.",
            ko: "소스를 읽어 모델, 엔드포인트, 페이지와 그 사이의 연결을 한 장의 지도로 그립니다.",
          })}
        />
      ),
      guard: (
        <Docs.Figure
          title={l.trans({ en: "No guard, no entry", ko: "가드가 없으면 들어올 수 없습니다" })}
          image="v32-closed-by-default"
          prompt={`
          On the left, one person labelled "Anyone". Two arrows leave the person to the right, one toward each of
          two doors stacked one above the other in the middle of the image. The upper door stands wide open and
          is labelled "Public"; the upper arrow passes through it and ends at a server on the right labelled
          "Endpoint". The lower door is shut, with one large padlock hanging on it, and is labelled "No guard";
          the lower arrow stops at the shut door. The padlock is the red accent. Draw nothing behind the shut
          door.
        `}
          alt={l.trans({
            en: "A caller passes the door marked Public and reaches the endpoint, while the door with no guard stays locked.",
            ko: "호출자는 Public이라 적힌 문을 지나 엔드포인트에 닿지만, 가드가 없는 문은 잠겨 있습니다.",
          })}
        />
      ),
    };

    return (
      <main className="min-h-screen text-foreground">
        <article className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
          <header>
            <div className="mb-10 flex items-end justify-between gap-4">
              <JellyKicker>Akan.js 3.2</JellyKicker>
            </div>
            <p className="mb-4 text-foreground/50 text-sm">
              {l.trans({ en: "Release note · Nov 15, 2026", ko: "릴리즈 노트 · 2026년 11월 15일" })}
            </p>
            <h1 className="font-black text-4xl leading-[1.08] md:text-[3.25rem]">
              {l.trans({
                en: "Akan.js 3.2: agents on the server, closed by default",
                ko: "Akan.js 3.2: 서버로 간 에이전트, 기본은 닫힘",
              })}
            </h1>
            <p className="mt-6 text-foreground/70 text-lg leading-8">
              {l.trans({
                en: "3.2 moves the agent from the page into the server, and closes whatever nobody decided to open. It also draws your app as a map for people and for coding agents, teaches the editor the names Akan derives, and makes every page lighter. This post walks through seven changes in plain words, then lists what to check when you upgrade from 3.1.",
                ko: "3.2는 에이전트를 페이지에서 서버로 옮기고, 열겠다고 정한 적 없는 것을 닫습니다. 사람과 코딩 에이전트를 위해 앱을 지도로 그리고, 에디터에 Akan이 만들어 내는 이름을 가르치며, 모든 페이지를 가볍게 합니다. 이 글은 일곱 가지 변화를 쉬운 말로 훑고, 3.1에서 올라올 때 확인할 것을 정리합니다.",
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
                  href={`#v32-${feature.id}`}
                  className={badgeRecipe(
                    undefined,
                    "border-foreground/10 bg-foreground/5 text-foreground/70 hover:text-primary",
                  )}
                >
                  {l.trans(feature.nav)}
                </a>
              ))}
              <a
                href="#v32-upgrade"
                className={badgeRecipe(undefined, "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15")}
              >
                {l.trans({ en: "Upgrading from 3.1", ko: "3.1에서 올라올 때" })}
              </a>
            </nav>
          </header>

          <Scroll className="mt-14">
            <Scroll.Slide id="v32-features" title={l.trans({ en: "What's new", ko: "새로워진 것" })}>
              <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
                {l.trans({ en: "What's new", ko: "새로워진 것" })}
              </p>
              <h2 className="mt-3 font-black text-3xl">
                {l.trans({ en: "Seven changes worth knowing", ko: "알아 둘 일곱 가지 변화" })}
              </h2>
            </Scroll.Slide>

            {features.map((feature, idx) => (
              <Scroll.Slide
                key={feature.id}
                id={`v32-${feature.id}`}
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
                        target={link.href.startsWith("https://") ? "_blank" : undefined}
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
              id="v32-team"
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

            <Scroll.Slide id="v32-fixes" title={l.trans({ en: "Fixes", ko: "수정" })} className="mt-16">
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
              id="v32-upgrade"
              title={l.trans({ en: "Upgrading from 3.1", ko: "3.1에서 올라올 때" })}
              className="mt-16"
            >
              <h2 className="font-black text-2xl md:text-3xl">
                {l.trans({ en: "Upgrading from 3.1", ko: "3.1에서 올라올 때" })}
              </h2>
              <p className="mt-3 text-foreground/65 leading-7">
                {l.trans({
                  en: "3.2 keeps the requirements of 3.1: Bun 1.4.4 or newer and React 19.3.1. Update the workspace, verify each app and library, and refresh the agent guide. Many defaults became narrower, so go through the list below before you deploy.",
                  ko: "3.2의 요구 사항은 3.1과 같습니다. Bun 1.4.4 이상과 React 19.3.1입니다. 워크스페이스를 업데이트하고, 앱과 라이브러리마다 verify를 돌리고, 에이전트 가이드를 새로 받으세요. 기본값이 여럿 좁아졌으니 배포 전에 아래 목록을 확인하세요.",
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
                  en: "The changelog has every option, env variable and deprecated name. Once you are on 3.2, the 3.3 post lists what to check next.",
                  ko: "모든 옵션과 환경 변수, deprecated된 이름은 변경 로그에 있습니다. 3.2로 올라왔다면 다음에 확인할 것은 3.3 글에 정리돼 있습니다.",
                })}
              </p>
              <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <Link
                  href={changelogUrl}
                  target="_blank"
                  className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
                >
                  {l.trans({ en: "Read the full changelog", ko: "전체 변경 로그 보기" })} <BsArrowRight />
                </Link>
                <Link
                  href="/blog/v3-3release"
                  className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
                >
                  {l.trans({ en: "Read what changed in 3.3", ko: "3.3에서 바뀐 것 읽기" })} <BsArrowRight />
                </Link>
              </p>
            </Scroll.Slide>
            <DocsToc />
          </Scroll>
        </article>
      </main>
    );
  });
