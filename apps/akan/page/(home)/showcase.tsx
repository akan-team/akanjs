import { usePage } from "@apps/akan/client";
import { ShowcaseThumbnail } from "@apps/akan/ui";
import { cn, page } from "akanjs/client";
import { badgeRecipe, buttonRecipe, Link } from "akanjs/ui";
import { BsArrowUpRight, BsDiscord, BsGithub, BsInfoCircle, BsStars } from "react-icons/bs";

const discussionsUrl = "https://github.com/akan-team/akanjs/discussions";
const discordUrl = "https://discord.gg/pc228BhWmM";

const categoryKeys = ["game", "web", "mobile", "agent", "realtime", "internal", "commerce"] as const;
type CategoryKey = (typeof categoryKeys)[number];

const categoryLabel: { [key in CategoryKey]: { en: string; ko: string } } = {
  game: { en: "Game server", ko: "게임 서버" },
  web: { en: "Web service", ko: "웹 서비스" },
  mobile: { en: "Mobile app", ko: "모바일 앱" },
  agent: { en: "AI agent", ko: "AI 에이전트" },
  realtime: { en: "Realtime & IoT", ko: "실시간 · IoT" },
  internal: { en: "Internal tool", ko: "사내 도구" },
  commerce: { en: "Commerce", ko: "커머스" },
} as const;

const featuredProject = {
  name: "akanjs.com",
  categories: ["web", "agent"],
  motif: "docs",
  tone: "primary",
  desc: {
    en: "The site you are reading right now. Docs, blog, full-text docs search and an in-page docs agent all ship from one Akan.js app.",
    ko: "지금 보고 계신 이 사이트입니다. 문서, 블로그, 문서 전문 검색, 인페이지 문서 에이전트가 모두 하나의 Akan.js 앱에서 나옵니다.",
  },
  highlights: [
    {
      en: "Docs and blog pages render on the server, in English and Korean",
      ko: "문서와 블로그 페이지를 서버에서 렌더링하고, 영어와 한국어로 제공합니다",
    },
    { en: "Full-text search across every docs page", ko: "모든 문서 페이지를 가로지르는 전문 검색" },
    {
      en: "An in-page agent that answers from the page you are reading",
      ko: "읽고 있는 페이지를 바탕으로 답하는 인페이지 에이전트",
    },
  ],
  tags: ["SSR", "Full-text search", "In-page agent", "i18n"],
} as const;

const sampleProjects = [
  {
    name: "Frontline Rooms",
    categories: ["game", "realtime"],
    motif: "arena",
    tone: "primary",
    desc: {
      en: "An authoritative match server that streams 20 Hz state frames to each room over binary pubsub, with lobbies and matchmaking declared as ordinary signals.",
      ko: "매치마다 룸을 열고 초당 20번 상태 프레임을 바이너리 pubsub으로 흘려보내는 게임 서버입니다. 로비와 매치메이킹도 평범한 시그널로 선언했습니다.",
    },
    tags: ["Binary pubsub", "WebSocket rooms", "SQLite"],
  },
  {
    name: "Guildboard",
    categories: ["game", "mobile"],
    motif: "board",
    tone: "accent",
    desc: {
      en: "A companion app for a mobile RPG: season leaderboards, guild pages and match history as SEO pages on the web, and the same screens on iOS and Android.",
      ko: "모바일 RPG의 컴패니언 앱입니다. 시즌 랭킹, 길드 페이지, 전적을 웹에서는 SEO 페이지로, iOS와 Android에서는 같은 화면으로 보여줍니다.",
    },
    tags: ["SSR", "iOS", "Android", "Push"],
  },
  {
    name: "Hanok Market",
    categories: ["commerce", "web"],
    motif: "market",
    tone: "warning",
    desc: {
      en: "A marketplace for handmade goods. Product pages render on the server for search engines, and full-text search covers titles, tags and seller notes.",
      ko: "수공예품 마켓플레이스입니다. 상품 페이지는 검색엔진을 위해 서버에서 렌더링하고, 제목·태그·판매자 메모를 전문 검색으로 찾습니다.",
    },
    tags: ["SSR", "Full-text search", "File upload"],
  },
  {
    name: "Studio Slot",
    categories: ["mobile", "commerce"],
    motif: "booking",
    tone: "info",
    desc: {
      en: "Class booking for yoga and pilates studios, with waitlists, reminder pushes and deep links that open straight into the class a push was about.",
      ko: "요가·필라테스 스튜디오의 수업 예약 앱입니다. 대기 순번, 리마인더 푸시, 그리고 알림을 누르면 해당 수업으로 바로 들어가는 딥링크를 갖췄습니다.",
    },
    tags: ["iOS", "Android", "Push", "Deep links"],
  },
  {
    name: "Ledgerline",
    categories: ["internal", "agent"],
    motif: "agent",
    tone: "success",
    desc: {
      en: "A finance ops console where an in-page agent reads the open receipt and fills the expense form. Every change still waits for a person to approve it.",
      ko: "재무팀 운영 콘솔입니다. 인페이지 에이전트가 열린 영수증을 읽고 경비 폼을 채우지만, 모든 변경은 사람의 승인을 기다립니다.",
    },
    tags: ["In-page agent", "Guards", "Admin"],
  },
  {
    name: "FleetPulse",
    categories: ["realtime", "internal"],
    motif: "telemetry",
    tone: "info",
    desc: {
      en: "Live telemetry for a fleet of delivery robots. Battery, position and fault gauges move the moment a device reports, with no polling.",
      ko: "배송 로봇 플릿의 실시간 텔레메트리 대시보드입니다. 배터리, 위치, 장애 지표가 기기가 보고하는 즉시 폴링 없이 갱신됩니다.",
    },
    tags: ["Live sync", "Binary pubsub", "Cron"],
  },
  {
    name: "Margin",
    categories: ["agent", "web"],
    motif: "docs",
    tone: "secondary",
    desc: {
      en: "A notes SaaS whose endpoints double as an MCP server. Users connect Claude or Cursor over OAuth and let it search and file their notes.",
      ko: "엔드포인트가 그대로 MCP 서버가 되는 노트 SaaS입니다. 사용자는 OAuth로 Claude나 Cursor를 연결해 노트 검색과 정리를 맡깁니다.",
    },
    tags: ["MCP", "OAuth", "Full-text search"],
  },
  {
    name: "Nextup",
    categories: ["internal", "realtime"],
    motif: "queue",
    tone: "success",
    desc: {
      en: "A clinic reception kiosk and a waiting-room display sharing one live queue. The screen changes the moment a nurse calls the next number.",
      ko: "병원 접수 키오스크와 대기실 화면이 하나의 실시간 대기열을 공유합니다. 간호사가 다음 번호를 부르는 순간 화면이 바뀝니다.",
    },
    tags: ["Live sync", "Kiosk", "SQLite"],
  },
  {
    name: "TutorLoop",
    categories: ["agent", "web"],
    motif: "agent",
    tone: "accent",
    desc: {
      en: "An AI tutoring platform whose lesson pages double as MCP prompts, so a student's own assistant opens a lesson with the exercises and progress the page shows.",
      ko: "레슨 페이지가 그대로 MCP 프롬프트가 되는 AI 튜터링 플랫폼입니다. 학생의 어시스턴트가 페이지와 같은 문제와 진도로 레슨을 시작합니다.",
    },
    tags: ["Page prompts", "MCP", "SSR"],
  },
  {
    name: "Gatepass",
    categories: ["mobile", "commerce"],
    motif: "queue",
    tone: "warning",
    desc: {
      en: "Event ticketing with QR check-in at the door. Staff scan with a phone, and the attendee count on the organizer dashboard climbs live.",
      ko: "QR 입장 체크인을 갖춘 이벤트 티켓 앱입니다. 스태프가 휴대폰으로 스캔하면 주최자 대시보드의 입장 인원이 실시간으로 올라갑니다.",
    },
    tags: ["iOS", "Android", "QR check-in", "Live sync"],
  },
  {
    name: "Relay API",
    categories: ["web"],
    motif: "telemetry",
    tone: "primary",
    desc: {
      en: "A metered public API with OpenAPI docs, per-key usage limits and usage dashboards, all derived from the same signal declarations the product runs on.",
      ko: "OpenAPI 문서, 키별 사용량 제한, 사용량 대시보드를 갖춘 공개 API 플랫폼입니다. 모두 제품이 돌아가는 같은 시그널 선언에서 나옵니다.",
    },
    tags: ["OpenAPI", "Usage limits", "Guards"],
  },
] as const;

export default page()
  .search("category", String)
  .render(({ category }) => {
    const { l } = usePage();
    const activeKey = categoryKeys.find((key) => key === category);
    const allProjects = [featuredProject, ...sampleProjects];
    const isVisible = (keys: readonly CategoryKey[]) => !activeKey || keys.includes(activeKey);
    const visibleSamples = sampleProjects.filter((project) => isVisible(project.categories));
    const chips = [
      { key: undefined, href: "/showcase", label: l.trans({ en: "All", ko: "전체" }), count: allProjects.length },
      ...categoryKeys.map((key) => ({
        key,
        href: `/showcase?category=${key}`,
        label: l.trans(categoryLabel[key]),
        count: allProjects.filter((project) => (project.categories as readonly CategoryKey[]).includes(key)).length,
      })),
    ];

    return (
      <main className="relative min-h-screen overflow-hidden break-keep bg-background text-foreground">
        <div className="absolute inset-x-0 top-20 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />

        <section className="relative mx-auto w-full max-w-7xl px-6 pt-32 pb-12 lg:px-8">
          <div className={badgeRecipe(undefined, "mb-6 border-primary/20 bg-primary/10 px-4 py-2 text-primary")}>
            <BsStars />
            {l.trans({ en: "Showcase", ko: "쇼케이스" })}
          </div>
          <h1 className="max-w-4xl font-black text-5xl tracking-tight lg:text-6xl">
            {l.trans({ en: "Built with Akan.js", ko: "Akan.js로 만든 것들" })}
          </h1>
          <p className="mt-6 max-w-3xl text-foreground/70 text-lg leading-8">
            {l.trans({
              en: "One codebase ships the web, the app, the server, the database and the agent surface together. Here is what that looks like as a product.",
              ko: "하나의 코드베이스가 웹, 앱, 서버, DB, 에이전트 표현까지 함께 배포합니다. 그게 제품이 되면 어떤 모습인지 모았습니다.",
            })}
          </p>
          <div className="mt-8 flex max-w-4xl flex-col gap-4 rounded-3xl border border-foreground/15 border-dashed bg-foreground/4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex gap-3 text-foreground/65 text-sm leading-6">
              <BsInfoCircle className="mt-1 shrink-0 text-accent" />
              {l.trans({
                en: "We are just getting started. Apart from akanjs.com, every entry below is a sample that shows the kind of product Akan.js fits, and real projects will replace them as they come in.",
                ko: "이제 막 모으기 시작했습니다. akanjs.com을 제외한 아래 항목은 Akan.js가 어울리는 제품을 보여주는 샘플이며, 실제 프로젝트가 들어오는 대로 교체됩니다.",
              })}
            </p>
            <Link
              href={discussionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonRecipe(undefined, "shrink-0 rounded-full")}
            >
              {l.trans({ en: "Submit your project", ko: "프로젝트 제출하기" })}
              <BsArrowUpRight />
            </Link>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-6 pb-24 lg:px-8">
          <nav aria-label={l.trans({ en: "Categories", ko: "카테고리" })} className="mb-10 flex flex-wrap gap-2">
            {chips.map((chip) => {
              const isActive = chip.key === activeKey;
              return (
                <Link
                  key={chip.href}
                  href={chip.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 font-medium text-sm transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-foreground/10 bg-foreground/4 text-foreground/70 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {chip.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs",
                      isActive ? "bg-primary-foreground/20" : "bg-foreground/10 text-foreground/50",
                    )}
                  >
                    {chip.count}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-black text-2xl tracking-tight md:text-3xl">
              {l.trans({ en: "Sample projects", ko: "샘플 프로젝트" })}
            </h2>
            <p className="text-foreground/50 text-sm">
              {l.trans({
                en: "Illustrative entries, not real customers.",
                ko: "예시로 만든 항목이며, 실제 고객 사례가 아닙니다.",
              })}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSamples.map((project) => (
              <article
                key={project.name}
                className="flex flex-col rounded-3xl border border-foreground/10 bg-foreground/4 p-3 transition hover:border-foreground/20"
              >
                <ShowcaseThumbnail motif={project.motif} tone={project.tone} />
                <div className="flex flex-1 flex-col p-3 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-foreground/45 text-xs uppercase tracking-[0.16em]">
                      {project.categories.map((key) => l.trans(categoryLabel[key])).join(" · ")}
                    </p>
                    <span
                      className={badgeRecipe(
                        { variant: "outline", size: "xs" },
                        "shrink-0 border-foreground/25 border-dashed text-foreground/50 uppercase tracking-wider",
                      )}
                    >
                      {l.trans({ en: "Sample", ko: "샘플" })}
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold text-xl">{project.name}</h3>
                  <p className="mt-2 flex-1 text-foreground/60 text-sm leading-6">{l.trans(project.desc)}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <span key={tag} className={badgeRecipe({ size: "sm" }, "bg-foreground/8 text-foreground/70")}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-6 pb-24 lg:px-8">
          <div className="relative overflow-hidden rounded-4xl border border-primary/20 bg-primary/5 p-8 text-center md:p-12">
            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
            <h2 className="font-black text-3xl tracking-tight md:text-5xl">
              {l.trans({ en: "Built something with Akan.js?", ko: "Akan.js로 무언가 만드셨나요?" })}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-foreground/65 leading-7">
              {l.trans({
                en: "Share it in GitHub Discussions and it can take a sample's place on this page. Or come say hello on Discord first.",
                ko: "GitHub Discussions에 공유해 주시면 이 페이지의 샘플 자리를 채울 수 있습니다. 먼저 Discord에서 인사 나눠도 좋습니다.",
              })}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href={discussionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonRecipe({ size: "lg" }, "rounded-full")}
              >
                <BsGithub />
                {l.trans({ en: "Share on GitHub Discussions", ko: "GitHub Discussions에 공유하기" })}
              </Link>
              <Link
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonRecipe({ variant: "outline", size: "lg" }, "rounded-full")}
              >
                <BsDiscord />
                {l.trans({ en: "Join the Discord", ko: "Discord 참여하기" })}
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  });
