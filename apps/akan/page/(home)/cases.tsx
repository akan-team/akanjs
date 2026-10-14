import { usePage } from "@apps/akan/client";
import { Friend, JellyKicker, JellyLoader, jellyButtonRecipe, panelRecipe } from "@apps/akan/ui";
import { cn, page } from "akanjs/client";
import { badgeRecipe, Image, Link } from "akanjs/ui";

const discussionsUrl = "https://github.com/akan-team/akanjs/discussions";
const discordUrl = "https://discord.gg/pc228BhWmM";

const categoryKeys = ["game", "web", "mobile", "agent", "realtime", "internal", "commerce"] as const;
type CategoryKey = (typeof categoryKeys)[number];

const categoryLabel: { [key in CategoryKey]: { en: string; ko: string } } = {
  game: { en: "Game server", ko: "게임 서버" },
  web: { en: "Web service", ko: "웹 서비스" },
  mobile: { en: "Mobile app", ko: "모바일 앱" },
  agent: { en: "AI", ko: "AI" },
  realtime: { en: "Realtime & IoT", ko: "실시간 · IoT" },
  internal: { en: "Internal tool", ko: "사내 도구" },
  commerce: { en: "Commerce", ko: "커머스" },
} as const;

const stats = [
  {
    value: { en: "700,000+", ko: "70만+" },
    label: { en: "People using products built with Akan.js", ko: "Akan.js로 만든 제품의 누적 사용자" },
  },
  {
    value: { en: "1,600+", ko: "1,600+" },
    label: { en: "Servers deployed with Akan.js", ko: "Akan.js로 배포된 서버" },
  },
  {
    value: { en: "30+", ko: "30+" },
    label: { en: "Organizations building with Akan.js", ko: "Akan.js를 사용하는 조직" },
  },
] as const;

const partners = [
  { slug: "samsung-cnt", name: "Samsung C&T" },
  { slug: "lg-hnh", name: "LG H&H" },
  { slug: "sk-ec", name: "SK E&C" },
  { slug: "krafton", name: "KRAFTON" },
  { slug: "kt", name: "KT" },
  { slug: "yonsei", name: "Yonsei University", hasInnerDetail: true },
  { slug: "gangwon", name: "Gangwon State" },
  { slug: "xi-snd", name: "Xi S&D" },
  { slug: "inbody", name: "InBody" },
  { slug: "mossland", name: "Mossland" },
  { slug: "awair", name: "AWAIR" },
  { slug: "kocom", name: "KOCOM" },
  { slug: "commax", name: "COMMAX" },
  { slug: "cvnet", name: "CVnet" },
  { slug: "ht", name: "HT" },
] as const;

const confidentialFields = [
  { en: "Military", ko: "군사" },
  { en: "Construction", ko: "건설" },
  { en: "Security", ko: "보안" },
  { en: "Internal management", ko: "사내 관리" },
  { en: "Public sector", ko: "공공" },
  { en: "Manufacturing", ko: "제조" },
  { en: "Adult", ko: "성인" },
] as const;

const projects = [
  {
    name: "Puffin Place Enterprise",
    categories: ["realtime", "internal"],
    desc: {
      en: "The operations center behind Puffin Place's AI ventilation service. Operators watch temperature, humidity, CO2, VOC and PM2.5 for every household in service, and wallpad-linked ventilation runs on what the sensors measure.",
      ko: "퍼핀플레이스 AI 환기 서비스의 관제 센터입니다. 운영자는 서비스 중인 모든 세대의 온도·습도·CO2·VOC·PM2.5를 실시간으로 보고, 월패드와 연동된 환기는 센서가 측정한 값에 따라 움직입니다.",
    },
    tags: ["IoT", "Live dashboard", "Operator console"],
    href: "https://enterprise.puffinplace.com",
  },
  {
    name: "Puffin Place",
    categories: ["web"],
    desc: {
      en: "The service site for an AI air-care service that puts a controller on a home's ceiling vent and decides whether to ventilate more than 500 times a day, from sensors for temperature, humidity, CO2, chemicals and fine dust.",
      ko: "가정의 천장 환기구에 AI 컨트롤러를 달아 하루 평균 500회 이상 환기 여부를 판단하는 퍼핀플레이스의 서비스 사이트입니다. 온도·습도·이산화탄소·화학물질·미세먼지를 센서로 측정합니다.",
    },
    tags: ["SSR", "Service site"],
    href: "https://www.puffinplace.com",
  },
  {
    name: "Ascend to ZERO",
    categories: ["game", "web"],
    desc: {
      en: "The official site for a time-bending action roguelike by Flyway Games, out on Steam and Xbox Game Pass. The whole page runs on the game's 30-second clock, and pressing Space stops time.",
      ko: "Flyway Games의 시간 조작 액션 로그라이크 Ascend to ZERO의 공식 사이트입니다. 스팀과 Xbox Game Pass에 출시됐고, 페이지 전체가 게임 속 30초 시계로 움직이며 스페이스바로 시간을 멈출 수 있습니다.",
    },
    tags: ["SSR", "Interactive landing", "Steam"],
    href: "https://atoz-main-showcase-mn0pvz.try.akanjs.com",
  },
  {
    name: "Tactical GCS Simulator",
    categories: ["game", "web"],
    desc: {
      en: "A drone ground control station you play in the browser. Send recon drones into the fog, point strike squadrons at the factories they find and launch interceptors at incoming raids, across scenarios from the Dnipro to the Strait of Hormuz.",
      ko: "브라우저에서 플레이하는 드론 지상 관제(GCS) 시뮬레이터입니다. 정찰 드론으로 안개를 걷고, 찾아낸 공장에 타격 편대를 보내고, 다가오는 공습에 요격기를 띄웁니다. 드니프로 강부터 호르무즈 해협까지 시나리오를 고를 수 있습니다.",
    },
    tags: ["Browser game", "Scenarios", "i18n"],
    href: "https://gcs-main-showcase-mn0pvz.try.akanjs.com",
  },
  {
    name: "Sceny",
    categories: ["agent", "web"],
    desc: {
      en: "An AI studio that turns one product photo into a 30-second ad ready for social. Start from a recipe such as a product unboxing, an interview cut or a mood film, and keep your projects under your account.",
      ko: "제품 사진 한 장을 SNS에 바로 올릴 30초 광고로 만들어 주는 AI 스튜디오입니다. 제품 언박싱, 인터뷰 컷, 무드 필름 같은 레시피에서 시작하고, 프로젝트는 계정에 보관됩니다.",
    },
    tags: ["AI video", "Recipes"],
    href: "https://sceny.ai",
  },
  {
    name: "SYRS AI Lab",
    categories: ["agent", "internal"],
    desc: {
      en: "A one-on-one consultation tool for a skincare brand. A consultant takes a microscope photo of the skin, the customer answers a short survey, and an AI writes a skin report with matching care. An after-care photo later produces a new report by email.",
      ko: "스킨케어 브랜드의 1:1 상담 도구입니다. 상담사가 피부 현미경 사진을 찍고 고객이 설문에 답하면 AI가 피부 리포트와 맞춤 케어를 작성하고, 관리 후 사진을 비교해 새 리포트를 이메일로 보냅니다.",
    },
    tags: ["AI report", "Consultant console", "Email"],
    href: "https://syrs-main-showcase-mn0pvz.try.akanjs.com",
  },
  {
    name: "LU",
    categories: ["mobile"],
    desc: {
      en: "A social app for meeting friends nearby, with metaverse-style conversations, recommendations by style and personality, stories and random calls. Live on iOS and Android.",
      ko: "동네 친구를 만나는 소셜 앱입니다. 메타버스 대화, 스타일·성격 기반 추천, 스토리, 랜덤 통화를 갖췄고 iOS와 Android에 출시돼 있습니다.",
    },
    tags: ["iOS", "Android", "Social"],
    href: "https://apps.apple.com/us/app/%EC%97%98%EC%9C%A0/id1564885330",
  },
  {
    name: "UMED",
    categories: ["web"],
    desc: {
      en: "The corporate site of a urology medical device company, presenting UroRinse Light, the first automated bladder irrigation device, and the UroAll drug-infusion catheter alongside its clinical trials, papers and press.",
      ko: "비뇨의학 의료기기 기업 유메드의 홈페이지입니다. 세계 최초 자동화 방광 세정 기기 UroRinse Light와 약물 주입용 카테터 UroAll을 임상 시험, 논문, 보도자료와 함께 소개합니다.",
    },
    tags: ["SSR", "Corporate site", "Product pages"],
    href: "https://www.umedglobal.com",
  },
  {
    name: "AKAMIR",
    categories: ["web"],
    desc: {
      en: "A global, community-run content platform built around a 10,000-piece NFT collection, with a gallery, the Skyland world, a community board and a personal keybox.",
      ko: "1만 개 NFT 컬렉션을 중심으로 커뮤니티가 함께 운영하는 글로벌 콘텐츠 플랫폼입니다. 갤러리, 스카이랜드, 커뮤니티, 개인 키박스를 갖췄습니다.",
    },
    tags: ["NFT", "Community", "i18n"],
    href: "https://www.akamir.com",
  },
  {
    name: "Olympia",
    categories: ["web"],
    desc: {
      en: "Commemorative cards for visitors of the Olympic parks in Pyeongchang and Gangneung. Each region deals out its own artwork as a limited NFT card, and a card can be passed on to a friend.",
      ko: "평창·강릉 올림픽 공원 방문객에게 주는 기념 카드입니다. 지역마다 고유한 작품을 NFT 카드로 한정 발급하고, 받은 카드는 친구에게 전달할 수 있습니다.",
    },
    tags: ["NFT", "Card transfer", "i18n"],
    href: "https://olympia-main-showcase-mn0pvz.try.akanjs.com",
  },
  {
    name: "IBYU Animal Hospital",
    categories: ["web"],
    desc: {
      en: "The website of a veterinary clinic in Geomdan, Incheon, specializing in dermatology and internal medicine. Hours, directions and appointment-only visits come first, and pages render on the server for local search.",
      ko: "인천 검단의 피부·내과 특화 동물병원 홈페이지입니다. 진료 시간, 오시는 길, 예약제 안내를 앞세웠고, 지역 검색을 위해 페이지를 서버에서 렌더링합니다.",
    },
    tags: ["SSR", "SEO", "Local business"],
    href: "https://www.ibyuah.com",
  },
  {
    name: "KAION",
    categories: ["web"],
    desc: {
      en: "A science learning service that maps physics and chemistry topics from kindergarten to high school onto a roadmap, with webtoon lessons and a learner ranking.",
      ko: "유치원부터 고등학교까지의 물리·화학 개념을 로드맵으로 잇는 과학 학습 서비스입니다. 웹툰 학습과 학습자 랭킹을 갖췄습니다.",
    },
    tags: ["Learning roadmap", "Webtoon", "Ranking"],
    href: "https://kaion-main-showcase-mn0pvz.try.akanjs.com",
  },
  {
    name: "The Hackathon",
    categories: ["web"],
    desc: {
      en: "An AI competition platform run by Urban Data Lab. Competitions come with datasets, prize money and certificates, alongside a community for team recruiting, code sharing and rankings.",
      ko: "어반데이터랩이 운영하는 AI 경진대회 플랫폼입니다. 데이터셋과 상금·인증서가 걸린 대회에, 팀원 모집, 코드 공유, 랭킹 커뮤니티가 함께 있습니다.",
    },
    tags: ["Competitions", "Leaderboard", "Community"],
    href: "https://thehackathon-epochxy-main-showcase-mn0pvz.try.akanjs.com",
  },
  {
    name: "Korean AI Competition",
    categories: ["web"],
    desc: {
      en: "The site for the 2023 Korean AI Competition, run by the Software Education Innovation Center. Teams register for tracks such as diabetes prediction and Korean speech recognition and follow notices through the run.",
      ko: "(사)소프트웨어교육혁신센터가 운영한 2023 한국어 AI 경진대회 사이트입니다. 당뇨병 예측, 한국어 음성 인식 같은 트랙에 팀 단위로 참가 접수하고 공지를 확인합니다.",
    },
    tags: ["Competition tracks", "Team registration"],
    href: "https://koai-epochxy-main-showcase-mn0pvz.try.akanjs.com",
  },
  {
    name: "Akan Office",
    categories: ["internal"],
    desc: {
      en: "An office workspace behind a sign-in. Sign in and your desk opens.",
      ko: "로그인 뒤에 있는 오피스 워크스페이스입니다. 로그인하면 내 데스크가 열립니다.",
    },
    tags: ["PWA", "Sign-in"],
    href: "https://office.akanjs.com",
  },
] as const;

export default page()
  .search("category", String)
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "적용사례 | Akan.js" : "Cases | Akan.js";
    const description =
      lang === "ko"
        ? "Akan.js로 서비스하는 팀들과, 코드베이스 하나로 만들어 낸 것들."
        : "Teams shipping on Akan.js, and what one codebase let them build.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .loading(() => <JellyLoader className="min-h-[100svh]" />)
  .render(({ category }) => {
    const { l } = usePage();
    const activeKey = categoryKeys.find((key) => key === category);
    const isVisible = (keys: readonly CategoryKey[]) => !activeKey || keys.includes(activeKey);
    const visibleProjects = projects.filter((project) => isVisible(project.categories));
    const chips = [
      { key: undefined, href: "/cases", label: l.trans({ en: "All", ko: "전체" }), count: projects.length },
      ...categoryKeys
        .map((key) => ({
          key,
          href: `/cases?category=${key}`,
          label: l.trans(categoryLabel[key]),
          count: projects.filter((project) => (project.categories as readonly CategoryKey[]).includes(key)).length,
        }))
        .filter((chip) => chip.count > 0),
    ];

    return (
      <main className="min-h-screen text-foreground">
        <section className="mx-auto max-w-5xl px-6 pt-40 pb-6 lg:px-8 lg:pt-32">
          <JellyKicker friend="planet">{l.trans({ en: "Case Studies", ko: "적용사례" })}</JellyKicker>
          <h1 className="mt-5 font-black text-4xl leading-none md:text-6xl">
            {l.trans({ en: "Built with Akan.js", ko: "Akan.js로 만든 것들" })}
          </h1>
          <p className="mt-6 max-w-3xl text-foreground/60 text-lg leading-8">
            {l.trans({
              en: "One codebase ships the web, the app, the server, the database and the agent surface together. Here is what that looks like as a product.",
              ko: "하나의 코드베이스가 웹, 앱, 서버, DB, 에이전트 표현까지 함께 배포합니다. 그게 제품이 되면 어떤 모습인지 모았습니다.",
            })}
          </p>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.value.en} className={panelRecipe({ tone: "jelly", radius: "3xl" })}>
                <p className="font-black font-mono text-3xl text-primary md:text-4xl">{l.trans(stat.value)}</p>
                <p className="mt-1 text-foreground/60 text-sm">{l.trans(stat.label)}</p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <p className="font-bold text-foreground/50 text-xs uppercase tracking-[0.16em]">
              {l.trans({ en: "Trusted by", ko: "함께한 조직" })}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-x-3 sm:grid-cols-5">
              {partners.map((partner) => (
                <Image
                  key={partner.slug}
                  src={`/partners/${partner.slug}.svg`}
                  width={258}
                  height={150}
                  alt={partner.name}
                  className={cn(
                    "h-auto w-full opacity-50",
                    "hasInnerDetail" in partner ? "invert dark:invert-0" : "brightness-0 dark:invert",
                  )}
                />
              ))}
            </div>
          </div>
          <p className="mt-8 max-w-3xl text-foreground/50 text-sm leading-7">
            {l.trans({
              en: "Every entry below is a live product running on Akan.js today. Built one too?",
              ko: "아래 항목은 모두 지금 Akan.js 위에서 운영 중인 제품입니다. 직접 만든 것이 있나요?",
            })}{" "}
            <Link
              href={discussionsUrl}
              target="_blank"
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              {l.trans({ en: "Submit your project", ko: "프로젝트 제출하기" })}
            </Link>
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
          <nav aria-label={l.trans({ en: "Categories", ko: "카테고리" })} className="flex flex-wrap gap-2 text-sm">
            {chips.map((chip) => {
              const isActive = chip.key === activeKey;
              return (
                <Link
                  key={chip.href}
                  href={chip.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "squish inline-flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4 font-bold",
                    isActive
                      ? "jelly tint-primary text-primary-foreground"
                      : "jelly-glass text-foreground/70 hover:text-foreground",
                  )}
                >
                  {chip.label}
                  <span
                    className={cn(
                      "inline-flex min-w-6 justify-center rounded-full px-1.5 py-0.5 text-xs",
                      isActive ? "bg-primary-foreground/20" : "bg-foreground/6 text-foreground/50",
                    )}
                  >
                    {chip.count}
                  </span>
                </Link>
              );
            })}
          </nav>

          <h2 className="mt-12 font-black text-3xl">{l.trans({ en: "Projects", ko: "프로젝트" })}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {visibleProjects.map((project) => (
              <article
                key={project.name}
                className={panelRecipe({ tone: "jelly", radius: "4xl", padding: "md" }, "group flex flex-col")}
              >
                <div className="flex flex-wrap gap-1.5 px-1 pt-1">
                  {project.categories.map((key) => (
                    <span
                      key={key}
                      className={badgeRecipe({ size: "sm" }, "border-transparent bg-foreground/6 text-foreground/60")}
                    >
                      {l.trans(categoryLabel[key])}
                    </span>
                  ))}
                </div>
                <h3 className="mt-3 px-1 font-black text-xl tracking-tight">
                  <Link
                    href={project.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {project.name}
                  </Link>
                </h3>
                <p className="mt-2 flex-1 px-1 text-foreground/60 text-sm leading-7">{l.trans(project.desc)}</p>
                <p className="mt-4 px-1 pb-1 font-semibold text-foreground/40 text-xs">{project.tags.join(" · ")}</p>
              </article>
            ))}
            <article
              className={panelRecipe(
                { tone: "glass", radius: "4xl", padding: "lg" },
                "border-foreground/15 border-dashed md:col-span-2",
              )}
            >
              <div className="flex flex-wrap gap-1.5">
                {confidentialFields.map((field) => (
                  <span
                    key={field.en}
                    className={badgeRecipe({ size: "sm" }, "border-transparent bg-foreground/6 text-foreground/60")}
                  >
                    {l.trans(field)}
                  </span>
                ))}
              </div>
              <h3 className="mt-3 font-black text-xl tracking-tight">
                {l.trans({ en: "…and many confidential projects", ko: "…그리고 공개할 수 없는 더 많은 프로젝트" })}
              </h3>
              <p className="mt-2 max-w-3xl text-foreground/60 text-sm leading-7">
                {l.trans({
                  en: "Much of what runs on Akan.js can't be named here. It has been deployed across military, construction, security, internal management and more, in projects whose confidentiality agreements keep them off this page.",
                  ko: "Akan.js 위에서 돌아가는 상당수는 이곳에 이름을 밝힐 수 없습니다. 군사, 건설, 보안, 사내 관리 등 여러 분야의 프로젝트에 적용되었지만, 보안 협약 때문에 이 페이지에는 싣지 않았습니다.",
                })}
              </p>
            </article>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pt-6 pb-16 lg:px-8">
          <div
            className={panelRecipe(
              { tone: "jelly", radius: "4xl", padding: "lg" },
              "tint-cloud relative overflow-visible md:p-10",
            )}
          >
            <span className="jelly-float pointer-events-none absolute -top-10 right-6 hidden md:block">
              <Friend name="rocket" className="size-24" />
            </span>
            <h2 className="font-black text-3xl md:text-4xl">
              {l.trans({ en: "Built something with Akan.js?", ko: "Akan.js로 무언가 만드셨나요?" })}
            </h2>
            <p className="mt-4 max-w-2xl text-foreground/60 leading-8">
              {l.trans({
                en: "Share it in GitHub Discussions and it can join this page. Or come say hello on Discord first.",
                ko: "GitHub Discussions에 공유해 주시면 이 페이지에 함께 올릴 수 있습니다. 먼저 Discord에서 인사 나눠도 좋습니다.",
              })}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={discussionsUrl} target="_blank" className={jellyButtonRecipe()}>
                {l.trans({ en: "Share on GitHub Discussions", ko: "GitHub Discussions에 공유하기" })}
              </Link>
              <Link href={discordUrl} target="_blank" className={jellyButtonRecipe({ tone: "ink" })}>
                {l.trans({ en: "Join the Discord", ko: "Discord 참여하기" })}
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  });
