import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "_index.tsx",
    content: `import { jellyButtonRecipe } from "@apps/${dict.appName}/ui";
import { getEnv } from "akanjs/base";
import { cn, page, usePage } from "akanjs/client";
import { Image, Link, System } from "akanjs/ui";

const friendFloat = {
  planet: "[--float-delay:-0.4s] [--float-duration:6.2s]",
  rocket: "[--float-delay:-2.2s] [--float-duration:5.2s] [--float-tilt:7deg]",
  moon: "[--float-delay:-3.6s] [--float-duration:7s] [--float-tilt:-5deg]",
  cloud: "[--float-delay:-1.4s] [--float-duration:8s] [--float-rise:0.6rem]",
  comet: "[--float-delay:-4.8s] [--float-duration:4.6s] [--float-tilt:9deg]",
} as const;

const numeralTiles = [
  "tint-planet text-white",
  "tint-rocket text-black/70",
  "tint-moon text-black/70",
  "tint-comet text-white",
] as const;

export default page().render(() => {
  const appName = getEnv().appName;
  const { l } = usePage();
  const friends = [
    { name: "planet", role: l.trans({ en: "Web", ko: "웹" }) },
    { name: "rocket", role: l.trans({ en: "App", ko: "앱" }) },
    { name: "moon", role: l.trans({ en: "Server · DB", ko: "서버 · DB" }) },
    { name: "cloud", role: l.trans({ en: "Infra", ko: "인프라" }) },
    { name: "comet", role: l.trans({ en: "Agent", ko: "에이전트" }) },
  ] as const;
  const chapters = [
    {
      numeral: "1",
      title: l.trans({ en: "The line you write.", ko: "당신이 쓰는 한 줄." }),
      body: l.trans({
        en: "A field is one declaration — a name and a type. The database, API, screens and agent tools all come from it.",
        ko: "필드는 이름과 타입, 선언 한 줄입니다. DB, API, 화면, 에이전트 도구가 모두 이 한 줄에서 나옵니다.",
      }),
    },
    {
      numeral: "×8",
      title: l.trans({ en: "Through every layer.", ko: "모든 레이어를 관통하고," }),
      body: l.trans({
        en: "Schema, query, service, API, fetch, client type, state and UI change together. Nothing to chase, nothing to miss.",
        ko: "스키마, 쿼리, 서비스, API, fetch, 클라이언트 타입, 상태, UI가 함께 바뀝니다. 따라 고칠 곳도 빠뜨릴 곳도 없습니다.",
      }),
    },
    {
      numeral: "×6",
      title: l.trans({ en: "Onto every platform.", ko: "모든 플랫폼에 닿고," }),
      body: l.trans({
        en: "The same code ships as SEO-ready web, iOS and Android apps, and macOS, Windows and Linux desktop apps.",
        ko: "같은 코드가 SEO 웹, iOS·Android 앱, macOS·Windows·Linux 데스크톱 앱으로 배포됩니다.",
      }),
    },
    {
      numeral: "×2",
      title: l.trans({ en: "For people and agents alike.", ko: "사람과 에이전트 모두에게." }),
      body: l.trans({
        en: "Guarded endpoints become MCP tools and on-screen controls become in-page agent tools, behind the same guards people pass.",
        ko: "가드를 거친 엔드포인트는 MCP 도구가, 화면의 컨트롤은 인페이지 에이전트 도구가 됩니다. 사람과 같은 가드를 거쳐서요.",
      }),
    },
  ];
  const steps = [
    {
      title: l.trans({ en: "Make this page yours", ko: "이 페이지를 바꿔 보세요" }),
      body: l.trans({
        en: "This welcome screen is an ordinary page. Replace it with the first screen of your product.",
        ko: "이 환영 화면은 평범한 페이지입니다. 제품의 첫 화면으로 바꿔 보세요.",
      }),
      code: "page/_index.tsx",
    },
    {
      title: l.trans({ en: "Restyle the theme", ko: "테마를 바꿔 보세요" }),
      body: l.trans({
        en: "Swap the palette tokens, and every surface and button follows.",
        ko: "팔레트 토큰을 바꾸면 모든 표면과 버튼이 따라옵니다.",
      }),
      code: "page/styles.css",
    },
    {
      title: l.trans({ en: "Add a feature", ko: "기능을 추가해 보세요" }),
      body: l.trans({
        en: "One command scaffolds a domain module — model, service, API, store and UI.",
        ko: "명령 하나로 도메인 모듈(모델, 서비스, API, 스토어, UI)을 만듭니다.",
      }),
      code: "akan create-module <name>",
    },
    {
      title: l.trans({ en: "Read the sample module", ko: "샘플 모듈을 읽어 보세요" }),
      body: l.trans({
        en: "The task module walks one feature end to end — the model, its guarded API, the store and the pages.",
        ko: "task 모듈이 모델부터 가드가 걸린 API, 스토어, 페이지까지 기능 하나를 처음부터 끝까지 보여 줍니다.",
      }),
      code: "lib/task",
      href: "/task",
    },
    {
      title: l.trans({ en: "Connect an agent", ko: "에이전트를 연결해 보세요" }),
      body: l.trans({
        en: "Every guarded endpoint is already published as an MCP tool.",
        ko: "가드가 걸린 엔드포인트는 이미 MCP 도구로 공개되어 있습니다.",
      }),
      code: "POST /mcp",
      href: "https://akanjs.com/docs/arch/agentic",
    },
  ];
  return (
    <main className="relative min-h-screen overflow-x-clip break-keep text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6 lg:px-8">
        <nav className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              alt={l.trans({ en: "Logo", ko: "로고" })}
              className="jelly-breathe size-10"
              height={80}
              priority
              src="/logo.png"
              width={80}
            />
            <div>
              <p className="font-black text-lg leading-auto">{appName}</p>
              <p className="text-foreground/50 text-xs leading-auto">
                {l.trans({ en: "Built with Akan.js", ko: "Akan.js로 만든 앱" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <System.ThemeToggle themes={["light", "dark"]} />
            <System.SelectLanguage languages={["en", "ko"]} />
            <Link
              className={jellyButtonRecipe({ variant: "default", size: "sm" }, "max-sm:hidden")}
              href="https://akanjs.com"
              target="_blank"
            >
              {l.trans({ en: "Official Site", ko: "공식 사이트" })} ↗
            </Link>
          </div>
        </nav>

        <section className="grid min-h-[calc(100svh-5rem)] items-center gap-6 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
          <div className="intro-rise group relative mx-auto aspect-square w-48 sm:w-64 lg:w-full lg:max-w-md">
            <div className="absolute inset-x-[16%] bottom-[3%] h-[7%] rounded-full bg-black/25 blur-xl dark:bg-black/60" />
            <div className="jelly-breathe group-hover:jelly-wobble size-full">
              <Image
                alt=""
                className="pointer-events-none size-full select-none object-contain"
                draggable={false}
                height={640}
                priority
                src="/jelly/star.webp"
                width={640}
              />
            </div>
          </div>

          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <p className="intro-rise jelly-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-bold text-foreground/75 text-sm leading-auto [--intro-delay:40ms]">
              <span className="size-2 rounded-full bg-success ring-4 ring-success/20" />
              {l.trans({ en: "Your app is running", ko: "앱이 실행 중입니다" })}
            </p>
            <h1 className="intro-rise wrap-anywhere mt-6 max-w-full font-black text-6xl leading-auto [--intro-delay:80ms] sm:text-7xl md:text-8xl xl:text-9xl">
              {appName}
            </h1>
            <p className="intro-rise mt-6 max-w-xl font-bold text-foreground/60 text-lg [--intro-delay:160ms]">
              {l.trans({
                en: "Built on Akan.js — the TypeScript framework, agents included.",
                ko: "에이전트까지 들어 있는 TypeScript 프레임워크, Akan.js로 만들었습니다.",
              })}
            </p>
            <ul className="intro-rise mt-8 flex items-end gap-2 [--intro-delay:240ms] sm:gap-4">
              {friends.map((friend) => (
                <li className="group flex flex-col items-center gap-2" key={friend.name}>
                  <span className={cn("jelly-float block", friendFloat[friend.name])}>
                    <span className="group-hover:jelly-wobble block">
                      <Image
                        alt=""
                        className="pointer-events-none size-14 select-none sm:size-18"
                        draggable={false}
                        height={200}
                        src={\`/jelly/\${friend.name}.webp\`}
                        width={200}
                      />
                    </span>
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-foreground/6 px-2.5 py-0.5 font-bold text-foreground/60 text-xs leading-auto">
                    {friend.role}
                  </span>
                </li>
              ))}
            </ul>
            <div className="intro-rise mt-10 flex flex-wrap justify-center gap-3 [--intro-delay:320ms] lg:justify-start">
              <Link
                className={jellyButtonRecipe({ size: "lg" })}
                href="https://akanjs.com/docs/intro/quickstart"
                target="_blank"
              >
                {l.trans({ en: "Read Quick Start", ko: "빠른 시작 읽기" })}
              </Link>
              <Link className={jellyButtonRecipe({ variant: "default", size: "lg" })} href="/task">
                {l.trans({ en: "Open the Sample", ko: "샘플 열어 보기" })}
              </Link>
            </div>
          </div>
        </section>

        <section className="py-12">
          <p className="font-bold text-primary text-sm">{l.trans({ en: "How it works", ko: "작동 방식" })}</p>
          <h2 className="mt-2 font-black text-3xl sm:text-4xl">
            {l.trans({ en: "One line reaches the whole product.", ko: "한 줄이 제품 전체에 닿습니다." })}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {chapters.map((chapter, idx) => (
              <article className="jelly-glass rounded-box p-6" key={chapter.numeral}>
                <span
                  className={cn(
                    "jelly flex size-12 items-center justify-center rounded-2xl font-black text-xl",
                    numeralTiles[idx],
                  )}
                >
                  {chapter.numeral}
                </span>
                <h3 className="mt-5 font-bold text-lg">{chapter.title}</h3>
                <p className="mt-2 text-foreground/60 text-sm">{chapter.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-12">
          <p className="font-bold text-primary text-sm">{l.trans({ en: "Next steps", ko: "다음 단계" })}</p>
          <h2 className="mt-2 font-black text-3xl sm:text-4xl">
            {l.trans({ en: "Start here.", ko: "여기서 시작하세요." })}
          </h2>
          <ol className="jelly-glass mt-8 divide-y divide-foreground/8 rounded-box">
            {steps.map((step, idx) => (
              <li className="flex items-start gap-4 p-5 sm:p-6" key={step.code}>
                <span className="jelly tint-primary flex size-9 shrink-0 items-center justify-center rounded-full font-black text-primary-foreground text-sm">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">{step.title}</h3>
                  <p className="mt-1 text-foreground/60 text-sm">{step.body}</p>
                  <code className="mt-2 inline-block rounded-full bg-foreground/6 px-3 py-1 font-mono text-foreground/75 text-xs">
                    {step.code}
                  </code>
                </div>
                {step.href ? (
                  <Link
                    aria-label={step.title}
                    className={jellyButtonRecipe({ variant: "ghost", size: "icon" }, "shrink-0 self-center")}
                    href={step.href}
                    target={step.href.startsWith("http") ? "_blank" : undefined}
                  >
                    →
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <footer className="py-10 text-center text-foreground/45 text-sm">
          {l.trans({ en: "Made with Akan.js · Powered by Bun", ko: "Akan.js로 만들고 Bun으로 구동합니다" })}
        </footer>
      </div>
    </main>
  );
});
`,
  };
}
