import { usePage } from "@apps/akan/client";
import {
  Code,
  Duet,
  Friend,
  InstallCommand,
  JellyCast,
  JellyKicker,
  jellyButtonRecipe,
  Orrery,
  panelRecipe,
  ShowcaseThumbnail,
  SkyBuild,
  StudioStar,
} from "@apps/akan/ui";
import { cn, page } from "akanjs/client";
import { badgeRecipe, Clipboard, Image, Link } from "akanjs/ui";
import { BsArrowDown, BsArrowRight, BsArrowUpRight } from "react-icons/bs";

const installCommand = "bunx create-akan-workspace@latest";
const mcpUrl = "https://akanjs.com/mcp";

const screenCode = `export const Order = () => {
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  const order = st.tool("createIcecreamOrder", { confirm: true }) // [!code highlight]
    .desc("Place the order in the form.")
    .exec(() => st.do.createIcecreamOrder());
  return (
    <>
      <Field.MultiToggleSelect
        label={l("icecreamOrder.toppings")}
        items={cnst.Topping}
        value={icecreamOrderForm.toppings}
        onChange={st.do.setToppingsOnIcecreamOrder} // [!code highlight]
      />
      <Button onClick={order}>{l("icecreamOrder.createIcecreamOrder")}</Button>
    </>
  );
};`;

const serverCode = `serveIcecreamOrder: mutation(cnst.IcecreamOrder, {
  guards: [Admin], // [!code highlight]
})
  .param("icecreamOrderId", ID)
  .exec(async function (icecreamOrderId) {
    return await this.icecreamOrderService.serve(icecreamOrderId);
  }),
refundIcecreamOrder: mutation(cnst.IcecreamOrder, {
  guards: [Every, Person], // [!code highlight]
})
  .param("icecreamOrderId", ID)
  .with(Self)
  .exec(async function (icecreamOrderId, self) {
    return await this.icecreamOrderService.refund(icecreamOrderId, self.id);
  }),`;

const factTints = ["tint-planet", "tint-rocket", "tint-moon", "tint-comet"] as const;
const qualityFriends = ["cloud", "moon", "comet", "rocket"] as const;

export default page().render(() => {
  const { l } = usePage();
  const stepTitle = "mt-2 font-black text-xl sm:text-3xl lg:mt-3";
  const stepBody = "mt-2 max-w-xl text-[0.9375rem] text-foreground/65 leading-6 sm:text-lg sm:leading-8 lg:mt-3";
  const tagline = l.trans({
    en: "The TypeScript framework, agents included.",
    ko: "에이전트까지 들어 있는 TypeScript 프레임워크.",
  });
  const dimensions = [
    l.trans({ en: "1 line", ko: "한 줄" }),
    l.trans({ en: "8 layers", ko: "8 레이어" }),
    l.trans({ en: "6 platforms", ko: "6 플랫폼" }),
    l.trans({ en: "people & agents", ko: "사람과 에이전트" }),
  ];
  const chapters = [
    {
      numeral: "1",
      tag: l.trans({ en: "1 line", ko: "한 줄" }),
      title: l.trans({ en: "The line you write.", ko: "당신이 쓰는 한 줄." }),
      body: l.trans({
        en: "Adding a field is one declaration — a name and a type. The database, API, screens and agent tools all come from that line, so there is nothing else to write by hand.",
        ko: "필드를 더하는 일은 선언 한 줄, 이름과 타입이면 됩니다. DB, API, 화면, 에이전트 도구까지 모두 이 한 줄에서 나오니 손으로 더 쓸 것이 없습니다.",
      }),
    },
    {
      numeral: "×8",
      tag: l.trans({ en: "8 layers", ko: "8 레이어" }),
      title: l.trans({ en: "Through every layer.", ko: "모든 레이어를 관통하고," }),
      body: l.trans({
        en: "That one line drops through the schema, query, service, API, fetch, client type, state and UI prop — the eight places of the first project, now changing together. Nothing to chase, nothing to miss.",
        ko: "그 한 줄이 스키마, 쿼리, 서비스, API, fetch, 클라이언트 타입, 상태, UI prop까지 뚫고 내려갑니다. 첫 번째 프로젝트의 8곳이 함께 바뀌니, 따라 고칠 곳도 빠뜨릴 곳도 없습니다.",
      }),
    },
    {
      numeral: "×6",
      tag: l.trans({ en: "6 platforms", ko: "6 플랫폼" }),
      title: l.trans({ en: "Onto every platform.", ko: "모든 플랫폼에 닿고," }),
      body: l.trans({
        en: "The same code ships as SEO-ready web, iOS and Android apps, and macOS, Windows and Linux desktop apps — with native-level screen transitions, not a wrapped website. One implementation to maintain, not six to keep in step.",
        ko: "같은 코드가 SEO 웹, iOS·Android 앱, macOS·Windows·Linux 데스크톱 앱으로 배포됩니다. 감싼 웹사이트가 아니라 네이티브 수준의 화면 전환까지 갖춘 채로요. 보조를 맞출 코드베이스 여섯 개가 아니라 관리할 구현 하나뿐입니다.",
      }),
    },
    {
      numeral: "×2",
      tag: l.trans({ en: "people & agents", ko: "사람과 에이전트" }),
      title: l.trans({ en: "For people and agents alike.", ko: "사람과 에이전트 모두에게." }),
      body: l.trans({
        en: "Every guarded endpoint becomes an MCP tool and every control on screen an in-page agent tool, behind the same guards people pass. The screens, servers and guards you saw above all start here — in code you already wrote.",
        ko: "가드를 통과한 엔드포인트는 MCP 도구가, 화면의 컨트롤은 인페이지 에이전트 도구가 됩니다. 사람과 같은 가드를 거쳐서요. 앞에서 본 화면과 서버, 가드가 모두 여기서 시작하고, 이미 쓴 코드로 만들어집니다.",
      }),
    },
  ];
  const screenSteps = [
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Write the screen you were going to write.", ko: "원래 쓰려던 화면을 그대로 씁니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "A field handed its setter publishes it. A button's handler becomes a tool with one st.tool line — the same function the button calls.",
          ko: "setter를 넘겨받은 필드는 그 setter를 공개합니다. 버튼 핸들러는 st.tool 한 줄로 툴이 되고, 버튼이 부르는 바로 그 함수가 됩니다.",
        })}
      </p>
      <Code.Snippet
        className="mt-6 w-full max-lg:hidden"
        title="IcecreamOrder.Zone.tsx"
        language="tsx"
        code={screenCode}
        showLineNumbers={false}
        copy={false}
      />
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "An agent sees tools, not pixels.", ko: "에이전트에게는 픽셀이 아니라 도구가 보입니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "Every control you wired is published under its own name, with the arguments it takes. What isn't on the screen isn't on the list — no lever the user doesn't have.",
          ko: "연결한 컨트롤마다 자기 이름과 받는 인자로 공개됩니다. 화면에 없는 것은 목록에도 없습니다. 사용자에게 없는 레버는 에이전트에게도 없습니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Ask, and it works the screen.", ko: "부탁하면, 화면을 직접 다룹니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "It runs in the customer's own tab, with their session — exactly like a click. You watch the pointer land on every control it uses.",
          ko: "고객 자신의 탭에서, 고객의 세션으로 돕니다. 클릭과 똑같습니다. 포인터가 쓰는 컨트롤마다 내려앉는 모습이 그대로 보입니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "What matters waits for a yes.", ko: "중요한 일은 승인을 기다립니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "A tool declared with confirm stops on an approval card. Approve, and the handler the button calls runs — through the same guards.",
          ko: "confirm으로 선언한 툴은 승인 카드에서 멈춥니다. 승인하면 버튼이 부르는 핸들러가 같은 가드를 지나 실행됩니다.",
        })}
      </p>
      <p className="mt-5 font-mono text-foreground/45 text-xs leading-6">
        {l.trans({
          en: "Setup: one <Agent.Chat /> in a layout, and your model's key.",
          ko: "설정: 레이아웃에 <Agent.Chat /> 하나, 그리고 모델 키.",
        })}
      </p>
    </>,
  ];
  const serverSteps = [
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Point any MCP client at your app.", ko: "MCP 클라이언트에 앱 주소만 넣습니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "/mcp is on by default. Every endpoint whose guards admit the caller is a tool, described by the dictionary you already write.",
          ko: "/mcp는 기본으로 켜져 있습니다. 가드가 허용하는 엔드포인트는 모두 툴이 되고, 설명은 이미 쓰는 사전에서 옵니다.",
        })}
      </p>
      <Code.Snippet
        className="mt-6 w-full max-lg:hidden"
        title="icecreamOrder.signal.ts"
        code={serverCode}
        showLineNumbers={false}
        copy={false}
      />
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "Sign-in and consent happen on your app.", ko: "로그인과 동의는 당신의 앱에서 합니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "OAuth 2.1 ships with libs/shared. The AI gets a token for this one user — exactly their rights, revocable at any time.",
          ko: "OAuth 2.1은 libs/shared에 들어 있습니다. AI는 이 사용자 한 명의 토큰을 받고, 권한도 딱 그 사용자만큼이며, 언제든 해지할 수 있습니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>{l.trans({ en: "Then it just works.", ko: "그다음엔 그냥 됩니다." })}</h3>
      <p className={stepBody}>
        {l.trans({
          en: "Ask in plain words. It calls your endpoints through the same guards and services as your screens — and the board that's open updates live.",
          ko: "평범한 말로 부탁하면, 화면과 같은 가드와 서비스를 지나 엔드포인트를 부릅니다. 열려 있는 보드는 실시간으로 바뀝니다.",
        })}
      </p>
    </>,
    <>
      <h3 className={stepTitle}>
        {l.trans({ en: "And it can't do what it shouldn't.", ko: "해서는 안 되는 일은 못 합니다." })}
      </h3>
      <p className={stepBody}>
        {l.trans({
          en: "refundIcecreamOrder is guarded by Person, so it never reaches the shelf. To the AI it looks exactly like a tool that doesn't exist.",
          ko: "refundIcecreamOrder에는 Person 가드가 걸려 있어 목록에 올라가지 않습니다. AI에게는 처음부터 없는 툴과 똑같아 보입니다.",
        })}
      </p>
    </>,
  ];
  const facts = [
    {
      title: l.trans({ en: "Refusals give nothing away", ko: "거절은 아무것도 드러내지 않습니다" }),
      body: l.trans({
        en: "A tool an agent may not use answers exactly like one that doesn't exist, so the shelf leaks nothing.",
        ko: "에이전트가 쓸 수 없는 툴은 처음부터 없는 툴과 똑같이 답하므로, 목록이 아무것도 흘리지 않습니다.",
      }),
    },
    {
      title: l.trans({ en: "Rate-limited per caller", ko: "호출자마다 속도 제한" }),
      body: l.trans({
        en: "MCP calls are capped at 120 a minute and 8 at once for each caller.",
        ko: "MCP 호출은 호출자마다 분당 120번, 동시에 8개로 묶입니다.",
      }),
    },
    {
      title: l.trans({ en: "Secrets stay home", ko: "비밀은 밖으로 나가지 않습니다" }),
      body: l.trans({
        en: "Hidden and secret fields are stripped before anything reaches a model.",
        ko: "hidden·secret 필드는 모델에 닿기 전에 빠집니다.",
      }),
    },
    {
      title: l.trans({ en: "Connections end when you say", ko: "연결은 언제든 끝낼 수 있습니다" }),
      body: l.trans({
        en: "Revoke a connection and its next call is refused. The chat relay keeps no session and no transcript.",
        ko: "연결을 해지하면 다음 호출부터 거절됩니다. 채팅 릴레이는 세션도 대화도 남기지 않습니다.",
      }),
    },
  ];
  const qualityItems = [
    {
      title: l.trans({ en: "Config Hell Ends", ko: "config 파일 지옥은 그만" }),
      description: l.trans({
        en: "Configure everything in akan.config.ts. Even when you configure nothing, defaults keep the product moving.",
        ko: "akan.config.ts 하나로 모든 것을 설정합니다. 하물며 설정하지 않아도 제품은 계속 굴러갑니다.",
      }),
    },
    {
      title: l.trans({ en: "Strict Rules, Unified Style", ko: "엄격한 규칙, 통일된 스타일" }),
      description: l.trans({
        en: "File paths, names, structures, and declarations stay consistent. Code reads like one person wrote it.",
        ko: "파일 위치, 이름, 구조, 선언 방식까지 통일됩니다. 누가 짰든 한 사람이 쓴 것처럼 읽힙니다.",
      }),
    },
    {
      title: l.trans({ en: "Rules Agents Can't Route Around", ko: "에이전트가 우회할 수 없는 규칙" }),
      description: l.trans({
        en: "Every workspace ships a plan-then-apply workflow MCP and akan code, so an agent edits through the rules, not around them.",
        ko: "모든 워크스페이스에 계획 후 적용하는 워크플로 MCP와 akan code가 들어 있어 에이전트는 규칙을 우회하지 않고 규칙을 따라 고칩니다.",
      }),
    },
    {
      title: l.trans({ en: "Agentic Full-Stack, Redefined", ko: "에이전틱 풀스택의 재정의" }),
      description: l.trans({
        en: "Fixed blocks for upload, login, admin, chat, boards, and alerts let agents produce consistent code.",
        ko: "업로드, 로그인, 관리자, 채팅, 게시판, 알림 같은 고정 블록 위에서 에이전트는 일관된 코드만 생산합니다.",
      }),
    },
  ];
  const proofItems = [
    { value: "26MB → 8.1MB", label: l.trans({ en: "Client build output in v3", ko: "v3 클라이언트 빌드 결과물" }) },
    {
      value: "3.5ms → 0.9ms",
      label: l.trans({ en: "Hydrating 1,000 rows on the client", ko: "클라이언트 1,000행 하이드레이션" }),
    },
    { value: "−33%", label: l.trans({ en: "Time for a 50-row list query", ko: "50행 목록 쿼리 시간" }) },
  ];
  const showcasePreviews = [
    {
      name: "akanjs.com",
      motif: "docs" as const,
      tone: "primary" as const,
      isSample: false,
      badge: l.trans({ en: "Built by the Akan team", ko: "Akan 팀 제작" }),
      description: l.trans({
        en: "This site: docs, blog, full-text docs search and an in-page docs agent from one Akan.js app.",
        ko: "지금 보고 계신 이 사이트입니다. 문서, 블로그, 문서 전문 검색, 인페이지 문서 에이전트가 하나의 Akan.js 앱에서 나옵니다.",
      }),
    },
    {
      name: "Frontline Rooms",
      motif: "arena" as const,
      tone: "primary" as const,
      isSample: true,
      badge: l.trans({ en: "Sample", ko: "샘플" }),
      description: l.trans({
        en: "A match server streaming 20 Hz state frames to each room over binary pubsub.",
        ko: "초당 20번 상태 프레임을 바이너리 pubsub으로 룸마다 흘려보내는 게임 서버입니다.",
      }),
    },
    {
      name: "Ledgerline",
      motif: "agent" as const,
      tone: "success" as const,
      isSample: true,
      badge: l.trans({ en: "Sample", ko: "샘플" }),
      description: l.trans({
        en: "A finance console where an in-page agent fills the expense form and a person approves every change.",
        ko: "인페이지 에이전트가 경비 폼을 채우고 모든 변경은 사람이 승인하는 재무 콘솔입니다.",
      }),
    },
  ];
  const deploySteps = [
    {
      command: "akan login",
      description: l.trans({
        en: "Sign in to Akan Cloud from your machine.",
        ko: "이 컴퓨터에서 Akan Cloud에 로그인합니다.",
      }),
    },
    {
      command: "akan tunnel <app>",
      description: l.trans({
        en: "Share the app you are running on a public URL before you ship.",
        ko: "배포 전에 실행 중인 앱을 공개 URL로 공유합니다.",
      }),
    },
    {
      command: "akan build <app>",
      description: l.trans({
        en: "Build the production artifact Akan Cloud runs.",
        ko: "Akan Cloud가 돌릴 프로덕션 결과물을 빌드합니다.",
      }),
    },
  ];

  return (
    <main className="relative min-h-screen overflow-x-clip break-keep text-foreground">
      <div className="relative">
        <section className="relative flex min-h-[100svh] flex-col justify-center pt-[var(--akanjs-header-offset)] pb-12">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div className="intro-rise mx-auto w-52 sm:w-72 lg:w-full lg:max-w-120">
              <StudioStar className="w-full" priority />
            </div>
            <div className="flex flex-col items-center lg:items-start">
              <p
                aria-hidden="true"
                className="intro-rise font-black text-[clamp(4.25rem,15vw,11.5rem)] leading-[0.82] tracking-[-0.065em] [--intro-delay:80ms]"
              >
                Akan.js
              </p>
              <div className="mt-5 flex flex-col items-center gap-1.5 lg:ml-2 lg:flex-row lg:gap-3">
                <p className="intro-rise text-center font-bold text-base text-foreground/55 [--intro-delay:160ms] sm:text-lg lg:text-left">
                  {tagline}
                </p>
                <p className="intro-rise text-center font-medium text-foreground/40 text-sm [--intro-delay:200ms] sm:text-base lg:text-left">
                  {l.trans({ en: "Powered by Bun", ko: "Bun으로 구동" })}
                </p>
              </div>
              <JellyCast
                className="intro-rise mt-8 [--intro-delay:240ms] lg:ml-2"
                friendClassName="size-14 sm:size-18 lg:size-22"
              />
            </div>
          </div>
        </section>

        <section className="relative pt-16 pb-20">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
            <div className="reveal-rise flex flex-col items-start">
              <Link
                href="/blog/v3release"
                className="jelly-glass tint-accent inline-flex items-center gap-2.5 rounded-full px-4 py-2 font-bold text-sm transition hover:scale-[1.02]"
              >
                <span className="jelly tint-accent size-2.5 rounded-full" />
                {l.trans({
                  en: "New · Akan.js v3 — agents join the full stack",
                  ko: "New · Akan.js v3 — 풀스택에 에이전트까지",
                })}
                <BsArrowRight />
              </Link>
              <h1 className="mt-7 font-black text-[2.5rem] leading-[1.04] sm:text-6xl">
                <span className="block">{l.trans({ en: "Build a screen.", ko: "화면을 만들면," })}</span>
                <span className="block text-primary">
                  {l.trans({ en: "Agents can use it.", ko: "에이전트가 씁니다." })}
                </span>
                <span className="mt-3 block">{l.trans({ en: "Build a server.", ko: "서버를 만들면," })}</span>
                <span className="block text-primary">
                  {l.trans({ en: "Any AI can run it.", ko: "AI가 다룹니다." })}
                  <span className="seed-caret ml-2" />
                </span>
              </h1>
              <p className="mt-7 max-w-xl text-foreground/65 text-lg leading-8">
                {l.trans({
                  en: "No tool schemas, no MCP server to write, no second permission model. The app you build for people is already the one AI can use — on the model you choose.",
                  ko: "툴 스키마도, 따로 쓰는 MCP 서버도, 에이전트용 권한 모델도 없습니다. 사람을 위해 만든 앱이 그대로 AI가 쓰는 앱이 됩니다. 모델은 원하는 것을 고르면 됩니다.",
                })}
              </p>
              <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <Link href="/docs/intro/quickstart" className={jellyButtonRecipe({ size: "lg" })}>
                  {l.trans({ en: "Get started", ko: "시작하기" })} <BsArrowRight />
                </Link>
                <InstallCommand />
              </div>
              <a
                href="#how"
                className="group mt-9 flex flex-wrap items-center gap-x-2 gap-y-2 font-bold text-foreground/55 text-xs transition hover:text-foreground"
              >
                {dimensions.map((dimension, idx) => (
                  <span className="flex items-center gap-2" key={dimension}>
                    {idx > 0 ? <span className="text-foreground/30">×</span> : null}
                    <span className="jelly-glass rounded-full px-3 py-1">{dimension}</span>
                  </span>
                ))}
                <BsArrowDown className="ml-1 transition group-hover:translate-y-0.5" />
              </a>
            </div>
            <div className="reveal-rise flex flex-col items-center gap-6">
              <Duet.Remote />
              <Duet.Stage className="lg:[zoom:0.88] lg:short:[zoom:0.8]" />
            </div>
          </div>
        </section>

        <section className="relative px-6 py-24 lg:px-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <JellyKicker friend="moon">{l.trans({ en: "The usual way", ko: "보통은" })}</JellyKicker>
            <h2 className="mt-6 text-balance font-black text-4xl sm:text-6xl">
              {l.trans({ en: "Your next user doesn't click.", ko: "다음 사용자는 클릭하지 않습니다." })}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-foreground/65 text-lg leading-8">
              {l.trans({
                en: "Agents already read screens and call APIs for the people they work for. Getting an app ready for them is usually a second project — stacked on the first one you already wire by hand.",
                ko: "에이전트는 이미 사람을 대신해 화면을 읽고 API를 부릅니다. 앱을 여기에 맞추려면 보통 두 번째 프로젝트가 필요하고, 그 프로젝트는 이미 손으로 배선하고 있는 첫 번째 프로젝트 위에 또 쌓입니다.",
              })}
            </p>
          </div>
          <div className="reveal-cascade mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-2">
            <Duet.Layers />
            <Duet.Files
              footer={l.trans({
                en: "…for one app. Then kept in step with the first, by hand.",
                ko: "…앱 하나에 이만큼. 그리고 첫 번째 프로젝트와 손으로 맞춰야 합니다.",
              })}
            />
          </div>
        </section>

        <Duet.ScreenStory
          header={
            <>
              <JellyKicker friend="comet">{l.trans({ en: "Screen → agent", ko: "화면 → 에이전트" })}</JellyKicker>
              <h2 className="mt-5 text-balance font-black text-3xl sm:text-5xl">
                {l.trans({
                  en: "The screen you build is the agent's interface.",
                  ko: "당신이 만든 화면이 곧 에이전트의 인터페이스입니다.",
                })}
              </h2>
            </>
          }
          steps={screenSteps}
        />
        <div className="mx-auto max-w-2xl px-6 pb-16 lg:hidden">
          <Code.Snippet
            className="w-full"
            title="IcecreamOrder.Zone.tsx"
            language="tsx"
            code={screenCode}
            showLineNumbers={false}
          />
        </div>
        <Duet.ServerStory
          header={
            <>
              <JellyKicker friend="moon">{l.trans({ en: "Server → AI", ko: "서버 → AI" })}</JellyKicker>
              <h2 className="mt-5 text-balance font-black text-3xl sm:text-5xl">
                {l.trans({ en: "Your server is already an MCP server.", ko: "당신의 서버는 이미 MCP 서버입니다." })}
              </h2>
            </>
          }
          steps={serverSteps}
        />
        <div className="mx-auto max-w-2xl px-6 pb-16 lg:hidden">
          <Code.Snippet className="w-full" title="icecreamOrder.signal.ts" code={serverCode} showLineNumbers={false} />
        </div>
        <Duet.Dock />
      </div>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-28 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-16">
          <div>
            <JellyKicker>{l.trans({ en: "Guard → everyone", ko: "가드 → 모두" })}</JellyKicker>
            <h2 className="mt-6 text-balance font-black text-4xl sm:text-6xl">
              {l.trans({ en: "One rule. Three kinds of users.", ko: "규칙은 하나, 사용자는 셋." })}
            </h2>
            <p className="mt-6 max-w-xl text-foreground/65 text-lg leading-8">
              {l.trans({
                en: "You write a guard once per endpoint. It decides for a person on the screen, for the agent in their tab, and for an AI calling over MCP.",
                ko: "가드는 엔드포인트마다 한 번 씁니다. 화면 앞의 사람, 그 사람 탭 안의 에이전트, MCP로 부르는 AI 모두를 같은 가드가 판단합니다.",
              })}
            </p>
          </div>
          <div>
            <Duet.Matrix className="reveal-rise" />
            <p className="mt-4 font-mono text-[11px] text-foreground/45 leading-5">
              {l.trans({
                en: "asks first — the in-page tool waits on an approval card · not on the shelf — the endpoint never reaches MCP",
                ko: "먼저 묻기 — 인페이지 툴이 승인 카드에서 기다립니다 · 목록에 없음 — 엔드포인트가 MCP에 올라가지 않습니다",
              })}
            </p>
          </div>
        </div>
        <ul className="reveal-cascade mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(({ title, body }, idx) => (
            <li key={title} className={panelRecipe({ tone: "jelly", radius: "3xl" }, factTints[idx])}>
              <span className={cn("jelly block size-3 rounded-full", factTints[idx])} />
              <p className="mt-4 font-bold">{title}</p>
              <p className="mt-2 text-foreground/60 text-sm leading-6">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how"
        className="relative flex min-h-[100svh] scroll-mt-[var(--akanjs-header-offset)] flex-col items-center justify-center px-6 py-28 text-center"
      >
        <JellyKicker>{l.trans({ en: "How it works", ko: "작동 원리" })}</JellyKicker>
        <h2 className="mt-6 text-balance font-black text-4xl sm:text-6xl">
          {l.trans({ en: "All of it is one line.", ko: "이 모든 게 한 줄입니다." })}
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-foreground/65 text-lg leading-8">
          {l.trans({
            en: "The screen an agent drives, the server any AI calls, the guard that judges them all — none of it is a second project. It all grows from a line like this.",
            ko: "에이전트가 다루는 화면, AI가 부르는 서버, 모두를 판단하는 가드. 어느 것도 두 번째 프로젝트가 아닙니다. 모두 이런 한 줄에서 자랍니다.",
          })}
        </p>
        <p className="jelly-glass mt-16 whitespace-nowrap rounded-full px-7 py-4 font-mono text-xl sm:px-10 sm:py-6 sm:text-4xl lg:text-5xl">
          <span className="mr-4 select-none text-foreground/20 sm:mr-6">1</span>
          <span className="duet-agent:hidden">
            <span className="seed-scrub [--seed-chars:19]">
              <span className="text-foreground">name</span>
              <span className="text-foreground/40">: </span>
              <span className="text-primary">field</span>
              <span className="text-foreground/40">(</span>
              <span className="text-foreground/80">String</span>
              <span className="text-foreground/40">)</span>
            </span>
          </span>
          <span className="duet-agent:inline hidden max-sm:text-[0.72em]">
            <span className="seed-scrub [--seed-chars:26]">
              <span className="text-foreground">{'"name"'}</span>
              <span className="text-foreground/40">{": {"}</span>
              <span className="text-primary">{'"type"'}</span>
              <span className="text-foreground/40">{": "}</span>
              <span className="text-foreground/80">{'"string"'}</span>
              <span className="text-foreground/40">{"}"}</span>
            </span>
          </span>
          <span className="seed-caret ml-1" />
        </p>
        <p className="mt-16 flex items-center gap-2 font-bold text-foreground/45 text-sm">
          {l.trans({ en: "Scroll and watch it grow", ko: "스크롤하면 한 줄이 자랍니다" })} <BsArrowDown />
        </p>
      </section>

      <SkyBuild chapters={chapters} />

      <section className="relative flex flex-col items-center px-6 pt-20 pb-28 text-center lg:px-8">
        <Orrery className="w-[min(78vw,40rem)]" />
        <p className="reveal-rise mt-4 text-balance font-bold text-primary text-sm uppercase tracking-[0.16em]">
          {l.trans({
            en: "1 line × 8 layers × 6 platforms × people & agents",
            ko: "한 줄 × 8 레이어 × 6 플랫폼 × 사람과 에이전트",
          })}
        </p>
        <h2 className="reveal-rise mt-4 text-balance font-black text-4xl sm:text-6xl lg:text-7xl">
          {l.trans({ en: "One star. The whole sky.", ko: "별 하나로, 하늘 전체를." })}
        </h2>
        <p className="reveal-rise mx-auto mt-5 max-w-2xl text-balance text-foreground/65 text-lg leading-8">
          {l.trans({
            en: "One line runs through every layer, lands on every platform and reaches everyone who uses it — people and agents. Type-safe from the database to the screen, and all you wrote was the line.",
            ko: "한 줄이 모든 레이어를 지나 모든 플랫폼에 닿고, 쓰는 모두에게 이릅니다. 사람에게도, 에이전트에게도요. DB부터 화면까지 타입 안전하고, 당신이 쓴 건 그 한 줄뿐입니다.",
          })}
        </p>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="reveal-rise">
            <JellyKicker friend="rocket">
              {l.trans({ en: "Agents build it, too", ko: "만드는 일도 에이전트가" })}
            </JellyKicker>
            <h2 className="mt-6 font-black text-3xl md:text-5xl">
              {l.trans({
                en: "AI coding turns to spaghetti past a certain size.",
                ko: "AI 코딩은 일정 규모를 넘으면 스파게티가 됩니다.",
              })}
            </h2>
            <p className="mt-5 text-foreground/65 leading-7">
              {l.trans({
                en: "The faster an agent writes code, the more file paths, names, structures, and declaration styles drift apart — until review and maintenance fall over. Akan stops this at the source with strict rules.",
                ko: "에이전트가 코드를 빨리 뽑을수록 파일 위치, 이름, 구조, 선언 방식이 제각각이 되어 리뷰와 유지보수가 무너집니다. Akan은 엄격한 규칙으로 이 문제를 원천 차단합니다.",
              })}
            </p>
          </div>
          <ol className="reveal-cascade grid grid-cols-1 gap-3 sm:grid-cols-2">
            {qualityItems.map((item, idx) => (
              <li key={item.title} className={panelRecipe({ tone: "jelly", radius: "3xl" }, "flex gap-4")}>
                <Friend className="size-12 shrink-0" name={qualityFriends[idx] ?? "planet"} />
                <div>
                  <p className="font-bold text-lg">{item.title}</p>
                  <p className="mt-1 text-foreground/60 text-sm leading-6">{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="reveal-rise jelly tint-primary mt-10 rounded-4xl p-8 text-primary-foreground sm:p-10">
          <h3 className="font-black text-2xl sm:text-3xl">
            {l.trans({
              en: "This is what we mean by agentic full-stack.",
              ko: "이것이 우리가 말하는 에이전틱 풀스택입니다.",
            })}
          </h3>
          <p className="mt-3 max-w-3xl text-primary-foreground/85 leading-7">
            {l.trans({
              en: "It runs in both directions. Agents use the app through the same guards people pass. And agents build it on strict rules and fixed blocks — upload, login, admin, chat, boards, alerts — so they produce nothing but consistent code. Not an abstract idea, but quality that rules make.",
              ko: "에이전틱 풀스택은 양방향입니다. 에이전트는 사람과 같은 가드를 거쳐 앱을 씁니다. 그리고 엄격한 규칙과 업로드, 로그인, 관리자, 채팅, 게시판, 알림 같은 정해진 블록 위에서 앱을 만들기에 일관된 코드만 생산합니다. 추상적인 개념이 아니라, 규칙이 만든 품질입니다.",
            })}
          </p>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <JellyKicker friend="planet">{l.trans({ en: "This site", ko: "이 사이트" })}</JellyKicker>
        <h2 className="mt-6 text-balance font-black text-4xl sm:text-5xl">
          {l.trans({ en: "These docs run on it, too.", ko: "이 문서도 같은 방식으로 돕니다." })}
        </h2>
        <div className="reveal-cascade mt-12 grid gap-6 lg:grid-cols-2">
          <div className={panelRecipe({ tone: "jelly", radius: "4xl", padding: "lg" }, "relative flex flex-col")}>
            <Friend className="absolute -top-8 right-8 size-20" name="comet" />
            <p className="font-black text-2xl">{l.trans({ en: "Ask the docs", ko: "문서에게 물어보기" })}</p>
            <p className="mt-3 text-foreground/65 leading-7">
              {l.trans({
                en: "Every docs page carries the in-page agent. Ask about a topic; it searches the docs and opens the page for you.",
                ko: "모든 문서 페이지에 인페이지 에이전트가 있습니다. 주제를 물으면 문서를 검색해 해당 페이지를 열어 줍니다.",
              })}
            </p>
            <Link href="/docs/intro/quickstart" className={jellyButtonRecipe({ tone: "ink" }, "mt-8 w-fit self-start")}>
              {l.trans({ en: "Open the docs", ko: "문서 열기" })}
              <BsArrowRight />
            </Link>
          </div>
          <div className={panelRecipe({ tone: "jelly", radius: "4xl", padding: "lg" }, "relative flex flex-col")}>
            <Friend className="absolute -top-8 right-8 size-20" name="moon" />
            <p className="font-black text-2xl">{l.trans({ en: "Connect your AI", ko: "내 AI 연결하기" })}</p>
            <p className="mt-3 text-foreground/65 leading-7">
              {l.trans({
                en: "akanjs.com answers MCP. Point Claude Code or Cursor at it, and your AI reads these docs while it writes your code.",
                ko: "akanjs.com은 MCP에 응답합니다. Claude Code나 Cursor에 연결하면 AI가 코드를 쓰면서 이 문서를 읽습니다.",
              })}
            </p>
            <div className="mt-8 inline-flex w-fit max-w-full items-center gap-3 rounded-full bg-foreground/6 py-1.5 pr-1.5 pl-5 font-mono text-sm">
              <span className="select-none font-bold text-primary">MCP</span>
              <span className="truncate text-foreground/80">{mcpUrl}</span>
              <Clipboard className="relative shrink-0" text={mcpUrl} />
            </div>
            <p className="mt-4 duet-agent:hidden font-mono text-[11px] text-foreground/45">
              listDocPages · searchDocPages · readDocPage
            </p>
            <pre className="mt-4 duet-agent:block hidden overflow-x-auto rounded-2xl bg-primary/5 p-3 font-mono text-[10px] text-primary leading-5">
              {
                '{"tools":[\n  {"name":"listDocPages","title":"Documentation Index"},\n  {"name":"readDocPage","title":"Read Documentation Page"},\n  {"name":"searchDocPages","title":"Search Documentation"}\n]}'
              }
            </pre>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <header className="reveal-rise flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <JellyKicker>{l.trans({ en: "Shipped", ko: "출시" })}</JellyKicker>
            <h2 className="mt-6 font-black text-3xl md:text-5xl">
              {l.trans({ en: "Built with Akan.js", ko: "Akan.js로 만든 것들" })}
            </h2>
          </div>
          <Link href="/showcase" className="flex items-center gap-2 font-bold text-primary hover:underline">
            {l.trans({ en: "See all projects", ko: "모든 프로젝트 보기" })} <BsArrowRight />
          </Link>
        </header>
        <div className="reveal-cascade mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {showcasePreviews.map((item) => (
            <Link
              key={item.name}
              href="/showcase"
              className={panelRecipe({ tone: "jelly", radius: "3xl" }, "group squish block")}
            >
              <ShowcaseThumbnail className="rounded-2xl" motif={item.motif} tone={item.tone} />
              <div className="mt-4 flex items-center justify-between gap-3">
                <h3 className="font-black text-lg group-hover:text-primary">{item.name}</h3>
                <span
                  className={badgeRecipe(
                    { size: "sm" },
                    item.isSample
                      ? "rounded-full border-foreground/20 border-dashed bg-transparent text-foreground/50"
                      : "rounded-full border-transparent bg-primary/10 text-primary",
                  )}
                >
                  {item.badge}
                </span>
              </div>
              <p className="mt-2 text-foreground/60 text-sm leading-6">{item.description}</p>
            </Link>
          ))}
        </div>
        <div className="reveal-rise mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {proofItems.map((item) => (
            <div key={item.value} className={panelRecipe({ tone: "jelly", radius: "3xl" })}>
              <p className="font-black font-mono text-2xl text-primary">{item.value}</p>
              <p className="mt-1 text-foreground/60 text-sm">{item.label}</p>
            </div>
          ))}
          <Link
            href="/blog/v3release#v3-performance"
            className={panelRecipe({ tone: "jelly", radius: "3xl" }, "group squish flex flex-col justify-center")}
          >
            <p className="flex items-center gap-2 font-bold group-hover:text-primary">
              {l.trans({ en: "v3 benchmark", ko: "v3 벤치마크" })} <BsArrowRight />
            </p>
            <p className="mt-1 text-foreground/60 text-sm">
              {l.trans({ en: "Startup 2× faster, a third less memory", ko: "시작 2배 빠르게, 메모리 3분의 1 절감" })}
            </p>
          </Link>
        </div>
        <div className="reveal-rise relative mt-20 grid grid-cols-1 gap-8 rounded-4xl bg-secondary p-8 text-secondary-foreground sm:p-10 lg:grid-cols-2 lg:items-center">
          <Friend className="absolute -top-12 right-6 size-24" name="cloud" />
          <div>
            <h3 className="font-black text-3xl md:text-4xl">
              {l.trans({ en: "From build to a live URL", ko: "빌드에서 라이브 URL까지" })}
            </h3>
            <p className="mt-4 text-secondary-foreground/65 leading-7">
              {l.trans({
                en: "Akan Cloud is the deploy platform built for Akan apps. Sign in from the CLI, share a preview, build, and ship it live.",
                ko: "Akan Cloud는 Akan 앱을 위해 만든 배포 플랫폼입니다. CLI에서 로그인하고, 미리보기를 공유하고, 빌드해서 라이브로 내보내세요.",
              })}
            </p>
            <Link href="https://cloud.akanjs.com" target="_blank" className={jellyButtonRecipe({ size: "lg" }, "mt-7")}>
              {l.trans({ en: "Open Akan Cloud", ko: "Akan Cloud 열기" })} <BsArrowUpRight />
            </Link>
          </div>
          <ol className="grid grid-cols-1 gap-2 font-mono text-sm">
            {deploySteps.map((step, idx) => (
              <li key={step.command} className="flex gap-4 rounded-2xl bg-secondary-foreground/6 px-5 py-4">
                <span className="text-secondary-foreground/30">{String(idx + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-jelly">$ {step.command}</p>
                  <p className="mt-1 font-sans text-secondary-foreground/60 text-xs leading-5">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 pt-16 pb-28 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div className="reveal-rise">
          <p className="font-bold text-primary text-sm uppercase tracking-[0.16em]">{tagline}</p>
          <h2 className="mt-5 text-balance font-black text-4xl sm:text-7xl">
            <span className="block">{l.trans({ en: "Start with one line.", ko: "한 줄로 시작하세요." })}</span>
            <span className="block text-primary">
              {l.trans({ en: "Agents included.", ko: "에이전트는 기본 포함." })}
            </span>
          </h2>
          <p className="mt-6 max-w-xl text-foreground/65 text-lg leading-8">
            {l.trans({
              en: "One command sets up the workspace. The next line you write ships to web, iOS, Android, desktop, your server and database — and to every agent your users talk to.",
              ko: "명령어 한 줄이면 워크스페이스가 준비됩니다. 그다음 당신이 쓰는 한 줄이 웹, iOS, Android, 데스크톱, 서버와 DB, 그리고 사용자가 쓰는 모든 에이전트에게 닿습니다.",
            })}
          </p>
          <div className="jelly-glass mt-9 inline-flex max-w-full items-center gap-3 rounded-full py-2 pr-2 pl-6 font-mono text-sm sm:text-lg">
            <span className="select-none text-primary">$</span>
            <span className="seed-scrub text-foreground/90 [--seed-chars:33]">{installCommand}</span>
            <Clipboard className="relative shrink-0" text={installCommand} />
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link href="/docs/intro/quickstart" className={jellyButtonRecipe({ size: "lg" })}>
              {l.trans({ en: "Get started", ko: "시작하기" })} <BsArrowRight />
            </Link>
            <Link
              href="/cheatsheet/interface/agent-chat"
              className="flex items-center gap-2 font-bold text-foreground/70 text-sm hover:text-foreground"
            >
              {l.trans({ en: "In-page agent", ko: "인페이지 에이전트" })} <BsArrowRight />
            </Link>
            <Link
              href="/cheatsheet/interface/mcp"
              className="flex items-center gap-2 font-bold text-foreground/70 text-sm hover:text-foreground"
            >
              MCP <BsArrowRight />
            </Link>
            <Link
              href="/showcase"
              className="flex items-center gap-2 font-bold text-foreground/70 text-sm hover:text-foreground"
            >
              {l.trans({ en: "Showcase", ko: "쇼케이스" })} <BsArrowRight />
            </Link>
          </div>
          <p className="mt-12 font-bold text-foreground/70">
            {l.trans({ en: "Read for humans.", ko: "읽는 건 사람이," })}{" "}
            <span className="text-primary">{l.trans({ en: "Write for agents.", ko: "쓰는 건 에이전트가." })}</span>
          </p>
        </div>
        <div className="reveal-rise overflow-hidden rounded-4xl shadow-2xl shadow-black/10">
          <video
            autoPlay
            className="aspect-3/2 w-full object-cover motion-reduce:hidden"
            loop
            muted
            playsInline
            poster="/jelly/cosmos-poster.webp"
            src="/jelly/cosmos-loop.mp4"
          />
          <Image
            alt=""
            className="hidden aspect-3/2 w-full object-cover motion-reduce:block"
            height={853}
            src="/jelly/cosmos-poster.webp"
            width={1280}
          />
        </div>
      </section>
    </main>
  );
});
