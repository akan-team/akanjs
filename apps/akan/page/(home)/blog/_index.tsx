import { usePage } from "@apps/akan/client";
import { Friend, type FriendProps, JellyKicker, panelRecipe, StudioStar } from "@apps/akan/ui";
import { cn, page } from "akanjs/client";
import { badgeRecipe, Link } from "akanjs/ui";

interface BlogPost {
  href: string;
  friend: FriendProps["name"];
  eyebrow: { en: string; ko: string };
  title: { en: string; ko: string };
  desc: { en: string; ko: string };
  meta: { en: string; ko: string };
  date: { en: string; ko: string };
  image: string;
  imageClassName: string;
}

const posts: BlogPost[] = [
  {
    href: "/blog/v3release",
    friend: "comet",
    eyebrow: { en: "Release Note", ko: "Release Note" },
    title: {
      en: "Akan.js v3: agents join the full stack",
      ko: "Akan.js v3: 풀스택에 에이전트까지",
    },
    desc: {
      en: "Every app becomes an MCP server, an in-page agent works the screen, pages become prompts, the UI is rebuilt on native tokens and recipes — and it all runs faster, lighter and starts twice as fast.",
      ko: "모든 앱이 MCP 서버가 되고, 인페이지 에이전트가 화면을 다루고, 페이지가 프롬프트가 되며, UI는 네이티브 토큰과 레시피로 새로 지었습니다. 그러면서도 더 빠르고, 가볍고, 두 배 빨리 시작합니다.",
    },
    meta: { en: "Product", ko: "제품" },
    date: { en: "Sep 25, 2026", ko: "2026년 9월 25일" },
    image: "/akanjsImage/diagrams/agent-runtime.png",
    imageClassName: "object-cover mix-blend-multiply dark:mix-blend-screen dark:hue-rotate-180 dark:invert",
  },
  {
    href: "/blog/production-stability",
    friend: "moon",
    eyebrow: { en: "Production Stability", ko: "Production Stability" },
    title: {
      en: "Akan.js is production‑grade stable",
      ko: "Akan.js는 프로덕션급 안정성을 가집니다",
    },
    desc: {
      en: "A 30‑minute soak across six frameworks shows Akan.js matches Bun‑native throughput while staying restart‑free and memory‑safe.",
      ko: "6개 프레임워크 대상 30분 soak 결과, Akan.js는 재시작 없이 메모리 안전하게 Bun 네이티브 처리량과 동등함을 보여줍니다.",
    },
    meta: { en: "Benchmark", ko: "벤치마크" },
    date: { en: "Jun 13, 2026", ko: "2026년 6월 13일" },
    image: "/akanjsImage/diagrams/blog-production-stability.png",
    imageClassName: "object-cover mix-blend-multiply dark:mix-blend-screen dark:hue-rotate-180 dark:invert",
  },
  {
    href: "/blog/benchmark",
    friend: "rocket",
    eyebrow: { en: "Benchmark", ko: "Benchmark" },
    title: {
      en: "Akan.js benchmark results",
      ko: "Akan.js 벤치마크 결과",
    },
    desc: {
      en: "A practical look at Akan.js 2.0.6 HTTP, Signal API, and document DB performance on a MacBook M4 Pro.",
      ko: "MacBook M4 Pro에서 측정한 Akan.js 2.0.6의 HTTP, Signal API, document DB 성능을 정리합니다.",
    },
    meta: { en: "Performance", ko: "성능" },
    date: { en: "May 30, 2026", ko: "2026년 5월 30일" },
    image: "/akanjsImage/diagrams/blog-benchmark.png",
    imageClassName: "object-cover mix-blend-multiply dark:mix-blend-screen dark:hue-rotate-180 dark:invert",
  },
  {
    href: "/blog/v2release",
    friend: "cloud",
    eyebrow: { en: "Release Note", ko: "Release Note" },
    title: {
      en: "Akan.js v2 is here",
      ko: "Akan.js v2가 나왔습니다",
    },
    desc: {
      en: "Version 2 moves Akan into a Bun-first full-stack runtime with fewer moving parts and a clearer execution path.",
      ko: "버전 2는 Akan을 Bun-first 풀스택 런타임으로 전환해 움직이는 부품을 줄이고 실행 경로를 단순하게 만듭니다.",
    },
    meta: { en: "Product", ko: "제품" },
    date: { en: "May 21, 2026", ko: "2026년 5월 21일" },
    image: "/akanjsImage/bun.svg",
    imageClassName: "object-contain p-4",
  },
  {
    href: "/blog/manifesto",
    friend: "planet",
    eyebrow: { en: "Manifesto", ko: "Manifesto" },
    title: {
      en: "Developers should spend their lives on work that matters",
      ko: "개발자는 중요한 일에 인생을 써야 한다",
    },
    desc: {
      en: "Why Akan.js exists, what it tries to protect, and how convention becomes leverage for people and agents.",
      ko: "Akan.js가 왜 존재하는지, 무엇을 지키려 하는지, 컨벤션이 사람과 에이전트에게 어떻게 레버리지가 되는지 이야기합니다.",
    },
    meta: { en: "Essay", ko: "에세이" },
    date: { en: "May 14, 2026", ko: "2026년 5월 14일" },
    image: "/akanjsImage/diagrams/blog-manifesto.png",
    imageClassName: "object-cover mix-blend-multiply dark:mix-blend-screen dark:hue-rotate-180 dark:invert",
  },
];

export default page().render(() => {
  const { l } = usePage();
  const [...listPosts] = posts;

  return (
    <main className="min-h-screen text-foreground">
      <section className="relative mx-auto max-w-5xl px-6 pt-16 pb-6 lg:px-8">
        <StudioStar className="pointer-events-none absolute top-8 right-8 hidden size-36 md:block" priority />
        <JellyKicker>{l.trans({ en: "Blog", ko: "블로그" })}</JellyKicker>
        <h1 className="mt-5 font-black text-4xl leading-none md:text-6xl">
          {l.trans({ en: "Akan.js Blog", ko: "Akan.js Blog" })}
        </h1>
        <p className="mt-6 max-w-2xl text-foreground/60 text-lg leading-8">
          {l.trans({
            en: "Field notes on full-stack conventions, Bun-first runtime design, performance, and the small decisions that keep product work focused.",
            ko: "풀스택 컨벤션, Bun-first 런타임 설계, 성능, 그리고 제품 개발을 집중하게 만드는 작은 결정들에 관한 기록입니다.",
          })}
        </p>
      </section>

      <section className="mx-auto flex max-w-5xl flex-col gap-5 px-6 pt-6 pb-16 lg:px-8">
        {listPosts.map((post) => (
          <Link
            key={post.href}
            href={post.href}
            className={panelRecipe(
              { tone: "jelly", radius: "4xl", padding: "none" },
              "group squish hover:tint-primary relative block p-5 transition-shadow md:p-6",
            )}
          >
            <span className="absolute -top-5 right-6 block md:hidden">
              <Friend name={post.friend} className="size-12" />
            </span>
            <article className="grid gap-6 md:grid-cols-[1fr_220px] md:items-center">
              <div>
                <span className={badgeRecipe({ size: "sm" }, "border-transparent bg-foreground/6 text-foreground/60")}>
                  {l.trans(post.eyebrow)}
                </span>
                <h2 className="mt-3 font-black text-2xl leading-tight group-hover:text-primary md:text-[1.75rem]">
                  {l.trans(post.title)}
                </h2>
                <p className="mt-3 text-foreground/60 text-sm leading-7">{l.trans(post.desc)}</p>
                <p className="mt-4 font-semibold text-foreground/40 text-xs">
                  {l.trans(post.meta)} · {l.trans(post.date)}
                </p>
              </div>
              <div className="relative hidden h-36 md:block">
                <div className="size-full overflow-hidden rounded-3xl bg-background/70">
                  <img
                    src={post.image}
                    alt={l.trans(post.title)}
                    className={cn("size-full transition duration-500 group-hover:scale-105", post.imageClassName)}
                  />
                </div>
                <span className="group-hover:jelly-wobble absolute -top-7 -right-4 block">
                  <Friend name={post.friend} className="size-16" />
                </span>
              </div>
            </article>
          </Link>
        ))}
      </section>
    </main>
  );
});
