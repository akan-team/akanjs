import { usePage } from "@apps/akan/client";
import { Duet, Friend, JellyKicker, JellyLoader, jellyButtonRecipe, panelRecipe, SkyBuild, Start } from "@apps/akan/ui";
import { page } from "akanjs/client";
import { Image, Link } from "akanjs/ui";
import { BsArrowRight, BsArrowUpRight } from "react-icons/bs";
import { FaAndroid, FaApple, FaGlobe, FaLinux, FaWindows } from "react-icons/fa";

export default page()
  .head(
    <>
      <link rel="canonical" href="https://akanjs.com" />
      <meta property="og:url" content="https://akanjs.com" />
    </>,
  )
  .loading(() => <JellyLoader className="min-h-[100svh]" />)
  .render(() => {
    const { l } = usePage();
    const tagline = l.trans({
      en: "The TypeScript framework, agents included",
      ko: "에이전틱 TypeScript 프레임워크",
    });
    const chapters = [
      {
        numeral: "1",
        tag: l.trans({ en: "1 line", ko: "한 줄" }),
        title: l.trans({ en: "From one declared line,", ko: "선언된 한 줄로" }),
        body: l.trans({
          en: "Whether a person types it or an agent does, adding a field is one declaration — a name and a type. The database, API, screens and agent tools all come from that line, so it is the only line to review.",
          ko: "사람이 쓰든 에이전트가 쓰든, 필드를 더하는 일은 이름과 타입, 선언 한 줄입니다. DB, API, 화면, 에이전트 도구까지 모두 이 한 줄에서 나오니 확인할 것도 이 한 줄뿐입니다.",
        }),
      },
      {
        numeral: "×8",
        tag: l.trans({ en: "8 layers", ko: "8 레이어" }),
        title: l.trans({
          en: "Implementation layers change with it",
          ko: "구현 레이어가 함께 반영되고,",
        }),
        body: l.trans({
          en: "That one line reaches the schema, query, service, API, fetch, client type, state and UI prop — eight places that usually get edited one by one, now changing together. Nothing to chase, nothing to miss.",
          ko: "그 한 줄이 스키마, 쿼리, 서비스, API, fetch, 클라이언트 타입, 상태, UI prop까지 이어집니다. 보통은 하나씩 고쳐야 하는 8곳이 함께 바뀌니, 따라 고칠 곳도 빠뜨릴 곳도 없습니다.",
        }),
      },
      {
        numeral: "×6",
        tag: l.trans({ en: "6 platforms", ko: "6 플랫폼" }),
        title: l.trans({ en: "Onto every platform", ko: "모든 플랫폼에 닿고," }),
        body: l.trans({
          en: "The same code ships as SEO-ready web, iOS and Android apps, and macOS, Windows and Linux desktop apps — with native-level screen transitions, not a wrapped website. One implementation to maintain, not six to keep in step.",
          ko: "같은 코드가 SEO 웹, iOS·Android 앱, macOS·Windows·Linux 데스크톱 앱으로 배포됩니다. 감싼 웹사이트가 아니라 네이티브 수준의 화면 전환까지 갖춘 채로요. 보조를 맞출 코드베이스 여섯 개가 아니라 관리할 구현 하나뿐입니다.",
        }),
      },
      {
        numeral: "×2",
        tag: l.trans({ en: "people & agents", ko: "사람과 에이전트" }),
        title: l.trans({ en: "For people and agents alike", ko: "사람과 에이전트 모두에게" }),
        body: l.trans({
          en: "Every guarded endpoint becomes an MCP tool and every control on screen an in-page agent tool, behind the same guards people pass. The screens and servers you saw above all start from that same line.",
          ko: "가드를 통과한 엔드포인트는 MCP 도구가, 화면의 컨트롤은 인페이지 에이전트 도구가 됩니다. 사람과 같은 가드를 거쳐서요. 앞에서 본 화면과 서버도 모두 그 한 줄에서 시작합니다.",
        }),
      },
    ];
    const qualityItems = [
      {
        title: l.trans({ en: "Maintainable", ko: "유지보수성" }),
        description: l.trans({
          en: "Conventions are lint rules, not a style guide. Every file lands where the rules say, so the codebase reads like one author wrote it — and a wrong turn fails the build before it reaches your review.",
          ko: "컨벤션은 문서가 아니라 lint 규칙입니다. 모든 파일이 규칙대로 자리 잡아 한 사람이 쓴 코드처럼 읽히고, 잘못 간 코드는 리뷰에 닿기 전에 빌드에서 막힙니다.",
        }),
      },
      {
        title: l.trans({ en: "Observable", ko: "관측성" }),
        description: l.trans({
          en: "Every log line carries its request's trace, and a dev session writes one plain log file. The agent reads it, follows the trace and finds the cause — no logs to copy and paste for it.",
          ko: "모든 로그에 요청의 trace가 붙고, 개발 세션은 로그를 파일 하나에 그대로 남깁니다. 에이전트가 직접 읽고 trace를 따라가 원인을 찾으니, 로그를 복사해 붙여 줄 필요가 없습니다.",
        }),
      },
      {
        title: l.trans({ en: "Fast", ko: "신속성" }),
        description: l.trans({
          en: "A new field is one declaration, not eight edits, and a workflow MCP lets the agent plan, apply and validate a change on its own. You review the business change, not the wiring.",
          ko: "필드 하나는 8곳 수정이 아니라 선언 한 줄이고, 워크플로 MCP로 에이전트가 변경을 계획하고 적용하고 검증까지 스스로 합니다. 사람은 배선이 아니라 비즈니스 변경만 봅니다.",
        }),
      },
    ];
    const platforms = [
      { name: "iOS", Icon: FaApple },
      { name: "Android", Icon: FaAndroid },
      { name: "Web (SSR)", Icon: FaGlobe },
      { name: "macOS", Icon: FaApple },
      { name: "Windows", Icon: FaWindows },
      { name: "Linux", Icon: FaLinux },
    ];
    const platformCues = [
      {
        start: 0,
        end: 1.6,
        text: l.trans({ en: "Driven from Android; the rest follow", ko: "Android에서 조작하면 나머지가 따라옵니다" }),
      },
      { start: 1.6, end: 3.6, text: l.trans({ en: "Stack transition", ko: "스택 전환" }) },
      { start: 3.6, end: 6.2, text: l.trans({ en: "Bottom sheet", ko: "바텀 시트" }) },
      {
        start: 6.2,
        end: 9.4,
        text: l.trans({ en: "Back, on every screen at once", ko: "뒤로 가기도 모든 화면이 함께" }),
      },
      { start: 11.2, end: 14.6, text: l.trans({ en: "Fade transition", ko: "페이드 전환" }) },
      { start: 17.1, end: 20.2, text: l.trans({ en: "Scale-out transition", ko: "스케일 아웃 전환" }) },
      { start: 23.1, end: 26.4, text: l.trans({ en: "Stack transition", ko: "스택 전환" }) },
      { start: 30.7, end: 33.8, text: l.trans({ en: "A note, typed on Android…", ko: "Android에서 메모를 쓰면…" }) },
      {
        start: 33.8,
        end: 37.4,
        text: l.trans({
          en: "…saved to the database, live on every screen",
          ko: "…DB에 저장되고 모든 화면에 실시간으로",
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
          <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 pt-[var(--akanjs-header-offset)] pb-12 text-center lg:px-8">
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-[15%] -bottom-12 h-24 rounded-full bg-primary/20 blur-3xl" />
              <p className="relative whitespace-nowrap font-mono text-2xl sm:text-4xl lg:text-5xl">
                <span className="mr-4 select-none text-foreground/20 sm:mr-6">1</span>
                <span className="relative inline-block">
                  <span className="seed-type [--seed-chars:19] [--seed-delay:0.25s]">
                    <span className="text-foreground">name</span>
                    <span className="text-foreground/40">: </span>
                    <span className="text-primary">field</span>
                    <span className="text-foreground/40">(</span>
                    <span className="text-foreground/80">String</span>
                    <span className="text-foreground/40">)</span>
                  </span>
                  <span className="absolute inset-x-0 -bottom-2 h-0.5 bg-primary" />
                </span>
                <span className="seed-caret ml-1" />
              </p>
            </div>
            <p className="intro-rise mt-14 font-bold text-primary text-xs uppercase tracking-[0.12em] [--intro-delay:0.9s] sm:text-sm sm:tracking-[0.18em]">
              {tagline}
            </p>
            <h1 className="intro-rise mt-4 max-w-5xl font-black text-[34px]/[1.1] tracking-tight [--intro-delay:1s] sm:text-6xl lg:text-7xl">
              <span className="inline-block">{l.trans({ en: "Write one line.", ko: "한 줄 쓰고," })}</span>{" "}
              <span className="inline-block">{l.trans({ en: "Deploy everywhere.", ko: "어디에나 배포." })}</span>{" "}
              <span className="inline-block text-primary">{l.trans({ en: "Literally.", ko: "말 그대로" })}</span>
            </h1>
            <p className="intro-rise mt-6 max-w-xl text-balance text-foreground/65 text-lg leading-8 [--intro-delay:1.15s]">
              {l.trans({
                en: "Web, iOS, Android, macOS, Windows and Linux. Your server and database. And the AI agents your users already talk to.",
                ko: "웹, iOS, Android, macOS, Windows, Linux. 서버와 데이터베이스. 그리고 사용자가 이미 쓰고 있는 AI 에이전트까지.",
              })}
            </p>
            <div className="intro-rise mt-9 flex w-full flex-col gap-3 [--intro-delay:1.3s] sm:w-auto sm:flex-row sm:items-center">
              <Link href="/docs/intro/quickstart" className={jellyButtonRecipe({ size: "lg" })}>
                {l.trans({ en: "Get started", ko: "시작하기" })} <BsArrowRight />
              </Link>
              <Start.Copy />
            </div>
          </section>

          <section
            id="screen"
            className="relative mx-auto w-full max-w-[100rem] scroll-mt-[var(--akanjs-header-offset)] px-4 py-24 sm:px-6 lg:px-8"
          >
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <JellyKicker friend="comet">{l.trans({ en: "Screen → agent", ko: "화면 → 에이전트" })}</JellyKicker>
              <h2 className="mt-5 text-balance font-black text-3xl sm:text-5xl">
                {l.trans({
                  en: "The screen you build is the agent's interface.",
                  ko: "구현한 화면이 곧 에이전트 인터페이스",
                })}
              </h2>
              <p className="mt-5 text-balance text-foreground/65 text-lg leading-8">
                {l.trans({
                  en: "Ask in plain words, and the agent works the same screen, in the user's own session.",
                  ko: "평범한 말로 부탁하면, 에이전트가 같은 화면을 사용자의 세션 그대로 다룹니다.",
                })}
              </p>
            </div>
            <Duet.Recording
              className="reveal-rise mt-12"
              src={l.trans({ en: "/in-page-agent-demo-en.mp4", ko: "/in-page-agent-demo-ko.mp4" })}
            />
          </section>
          <section
            id="server"
            className="relative mx-auto w-full max-w-[100rem] scroll-mt-[var(--akanjs-header-offset)] px-4 py-24 sm:px-6 lg:px-8"
          >
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <JellyKicker friend="moon">{l.trans({ en: "Server → AI", ko: "서버 → AI" })}</JellyKicker>
              <h2 className="mt-5 text-balance font-black text-3xl sm:text-5xl">
                {l.trans({ en: "Your server is already an MCP server.", ko: "구현한 서버가 곧 MCP 서버" })}
              </h2>
              <p className="mt-5 text-balance text-foreground/65 text-lg leading-8">
                {l.trans({
                  en: "Point any MCP client at your app, and it calls your endpoints through the same guards.",
                  ko: "MCP 클라이언트에 앱 주소만 넣으면, 같은 가드를 지나 엔드포인트를 부릅니다.",
                })}
              </p>
            </div>
            <Duet.Recording
              className="reveal-rise mt-12"
              src={l.trans({ en: "/mcp-demo-en.mp4", ko: "/mcp-demo-ko.mp4" })}
            />
          </section>
          <section
            id="platforms"
            className="relative mx-auto w-full max-w-[100rem] scroll-mt-[var(--akanjs-header-offset)] px-4 py-24 sm:px-6 lg:px-8"
          >
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <JellyKicker friend="planet">
                {l.trans({ en: "One code → every platform", ko: "코드 하나 → 모든 플랫폼" })}
              </JellyKicker>
              <h2 className="mt-5 text-balance font-black text-3xl sm:text-5xl">
                {l.trans({ en: "Every platform, running at once.", ko: "모든 플랫폼을 한 번에" })}
              </h2>
              <p className="mt-5 text-balance text-foreground/65 text-lg leading-8">
                {l.trans({
                  en: "The same app runs on iOS, Android, macOS and the web — save a file and every screen updates. Web pages render on the server, so SEO takes care of itself.",
                  ko: "같은 앱이 iOS·Android·macOS 앱과 웹으로 동시에 돌고, 코드를 저장하면 모든 화면이 함께 바뀝니다. 웹은 SSR이라 SEO도 신경 쓰지 않아도 알아서 됩니다.",
                })}
              </p>
            </div>
            <Duet.Recording
              className="reveal-rise mt-12"
              src="/multi-platform-demo.mp4"
              isRealtime={false}
              cues={platformCues}
            />
            <ul className="mt-8 flex flex-wrap justify-center gap-2 font-bold text-sm">
              {platforms.map(({ name, Icon }) => (
                <li key={name} className="jelly-glass flex items-center gap-2 rounded-full px-4 py-1.5">
                  <Icon className="text-primary" />
                  {name}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-center font-mono text-foreground/45 text-xs leading-6">
              akan start · akan start-ios · akan start-android · akan start-desktop
            </p>
          </section>
          <section
            id="scale"
            className="relative mx-auto w-full max-w-[100rem] scroll-mt-[var(--akanjs-header-offset)] px-4 py-24 sm:px-6 lg:px-8"
          >
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <JellyKicker friend="rocket">
                {l.trans({ en: "All-in-one → scale-up", ko: "올인원 → 스케일업" })}
              </JellyKicker>
              <h2 className="mt-5 text-balance font-black text-3xl sm:text-5xl">
                <span className="sm:inline-block">
                  {l.trans({ en: "Server and database included,", ko: "서버와 DB까지 한 번에," })}
                </span>{" "}
                <span className="sm:inline-block">
                  {l.trans({ en: "from prototype to IPO.", ko: "프로토타입부터 IPO까지" })}
                </span>
              </h2>
              <p className="mt-5 text-balance text-foreground/65 text-lg leading-8">
                {l.trans({
                  en: "Most prototypes get rewritten once they have to scale. With Akan, the code you wrote on your laptop is the code serving at IPO — only the deployment grows.",
                  ko: "보통은 규모가 커지면 프로토타입을 다시 짭니다. Akan에서는 노트북에서 쓴 코드가 IPO 때도 그대로 돌고, 커지는 건 배포뿐입니다.",
                })}
              </p>
            </div>
            <Duet.Growth className="reveal-rise mt-12" />
            <Duet.Benchmark className="reveal-rise mt-6" />
          </section>
        </div>

        <section
          id="how"
          className="relative flex min-h-[100svh] scroll-mt-[var(--akanjs-header-offset)] flex-col items-center justify-center px-6 py-28 text-center"
        >
          <JellyKicker>{l.trans({ en: "How it works", ko: "작동 원리" })}</JellyKicker>
          <h2 className="mt-6 text-balance font-black text-4xl sm:text-6xl">Single source of business</h2>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-foreground/65 text-lg leading-8">
            {l.trans({
              en: "The screen an agent drives, the server any AI calls, the app on every platform — none of it is written twice. Everything is derived from one declaration like this, so nothing drifts out of step.",
              ko: "에이전트가 다루는 화면, AI가 부르는 서버, 모든 플랫폼의 앱. 어느 것도 두 번 쓰지 않습니다. 전부 이런 선언 한 줄에서 파생되니, 서로 어긋날 곳이 없습니다.",
            })}
          </p>
          <p className="jelly-glass mt-16 whitespace-nowrap rounded-full px-7 py-4 font-mono text-xl sm:px-10 sm:py-6 sm:text-4xl lg:text-5xl">
            <span className="mr-4 select-none text-foreground/20 sm:mr-6">1</span>
            <span className="seed-scrub [--seed-chars:19]">
              <span className="text-foreground">name</span>
              <span className="text-foreground/40">: </span>
              <span className="text-primary">field</span>
              <span className="text-foreground/40">(</span>
              <span className="text-foreground/80">String</span>
              <span className="text-foreground/40">)</span>
            </span>
            <span className="seed-caret ml-1" />
          </p>
        </section>

        <SkyBuild chapters={chapters} />

        <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
          <div className="reveal-rise max-w-3xl">
            <JellyKicker friend="rocket">
              {l.trans({ en: "Agents build it, too", ko: "만드는 일도 에이전트가" })}
            </JellyKicker>
            <h2 className="mt-6 font-black text-3xl md:text-5xl">
              {l.trans({ en: "Maintainable, observable, and fast", ko: "유지보수성, 관측성, 신속성" })}
            </h2>
            <p className="mt-4 font-bold text-primary text-xl md:text-2xl">
              {l.trans({
                en: "With as little human in the loop as possible.",
                ko: "Human in the loop 최소화",
              })}
            </p>
            <p className="mt-5 text-foreground/65 leading-7">
              {l.trans({
                en: "AI already writes good code. What slows it down is the person in the loop — answering its questions, checking the structure, reading the logs, prompting again. Akan settles those answers in rules and tooling, so the agent checks its own work and you only sign off on the result.",
                ko: "AI는 이미 코드를 잘 씁니다. 느려지는 건 사람이 끼어드는 순간입니다. 질문에 답하고, 구조를 확인하고, 로그를 읽어 주고, 다시 지시하는 일. Akan은 그 답을 규칙과 도구에 정해 두어 에이전트가 스스로 검증하고, 사람은 결과만 승인하면 되게 합니다.",
              })}
            </p>
          </div>
          <ol className="reveal-cascade mt-10 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {qualityItems.map((item, idx) => (
              <li key={item.title} className={panelRecipe({ tone: "jelly", radius: "3xl", padding: "lg" })}>
                <p className="font-mono text-primary text-sm">0{idx + 1}</p>
                <p className="mt-3 font-black text-2xl">{item.title}</p>
                <p className="mt-3 text-foreground/60 text-sm leading-6">{item.description}</p>
              </li>
            ))}
          </ol>
          <div className={panelRecipe({ tone: "jelly", radius: "4xl", padding: "xl" }, "reveal-rise mt-10")}>
            <h3 className="font-black text-2xl sm:text-3xl">
              {l.trans({
                en: "This is what we mean by agentic full-stack.",
                ko: "우리가 말하는 에이전틱 풀스택",
              })}
            </h3>
            <p className="mt-4 text-foreground/65 leading-7 sm:text-lg sm:leading-8 lg:text-base xl:text-lg">
              <span className="block">
                {l.trans({
                  en: "Code is how people and machines talk. Better AI doesn't mean you stop reading it; it means code must get easier to read.",
                  ko: "코드는 사람과 기계가 대화하는 언어입니다. AI가 발전해도 코드를 안 보게 되는 게 아니라, 점점 더 보기 편해져야만 합니다.",
                })}
              </span>
              <span className="block">
                {l.trans({
                  en: "Agents do the writing. Akan keeps it short and consistent enough to take in at a glance.",
                  ko: "쓰는 일은 에이전트가 맡고, Akan은 그 코드를 한눈에 읽힐 만큼 짧고 일관되게 만듭니다.",
                })}
              </span>
            </p>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
          <div className="reveal-rise relative mt-12 grid grid-cols-1 gap-8 rounded-4xl bg-secondary p-8 text-secondary-foreground sm:p-10 lg:grid-cols-2 lg:items-center">
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
              <Link
                href="https://cloud.akanjs.com"
                target="_blank"
                className={jellyButtonRecipe({ size: "lg" }, "mt-7")}
              >
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

        <section
          id="start"
          className="relative mx-auto grid w-full max-w-7xl scroll-mt-[var(--akanjs-header-offset)] grid-cols-1 items-center gap-12 px-6 pt-16 pb-28 lg:grid-cols-[1.05fr_0.95fr] lg:px-8"
        >
          <div className="reveal-rise">
            <p className="font-bold text-primary text-sm uppercase tracking-[0.16em]">{tagline}</p>
            <h2 className="mt-5 text-balance font-black text-4xl sm:text-7xl">
              <span className="block">{l.trans({ en: "Read for humans.", ko: "읽는 건 사람이," })}</span>
              <span className="block text-primary">
                {l.trans({ en: "Write for agents.", ko: "쓰는 건 에이전트가" })}
              </span>
            </h2>
            <Start.Tabs className="mt-9" />
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
                href="/cases"
                className="flex items-center gap-2 font-bold text-foreground/70 text-sm hover:text-foreground"
              >
                {l.trans({ en: "Case Studies", ko: "적용사례" })} <BsArrowRight />
              </Link>
            </div>
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
