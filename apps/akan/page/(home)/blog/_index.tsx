import { usePage } from "@apps/akan/client";
import { Link } from "akanjs/ui";

const posts = [
  {
    href: "/blog/production-stability",
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
    image: "/akanjsImage/stability.webp",
    imageClassName: "object-cover",
  },
  {
    href: "/blog/benchmark",
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
    image: "/akanjsImage/akan_benchmark.webp",
    imageClassName: "object-cover",
  },
  {
    href: "/blog/v2release",
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
    image: "/akanjsImage/beach.webp",
    imageClassName: "object-cover",
  },
];

export default function Page() {
  const { l } = usePage();
  const [...listPosts] = posts;

  return (
    <main className="min-h-screen bg-base-100 font-mono text-base-content">
      <section className="border-base-300 border-b">
        <div className="mx-auto max-w-5xl px-6 pt-16 pb-8 lg:px-8">
          <h1 className="font-bold text-2xl text-primary leading-none tracking-tight md:text-4xl">
            {l.trans({ en: "Akan.js Blog", ko: "Akan.js Blog" })}
          </h1>
          <p className="mt-6 text-base-content/65 text-sm leading-8">
            {l.trans({
              en: "Field notes on full-stack conventions, Bun-first runtime design, performance, and the small decisions that keep product work focused.",
              ko: "풀스택 컨벤션, Bun-first 런타임 설계, 성능, 그리고 제품 개발을 집중하게 만드는 작은 결정들에 관한 기록입니다.",
            })}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12 lg:px-8">
        {listPosts.map((post) => (
          <Link
            key={post.href}
            href={post.href}
            className="group my-4 block rounded-2xl border border-base-300 p-5 transition hover:border-primary/30 hover:shadow-[0_18px_45px_rgba(var(--color-primary),0.18)]"
          >
            <article className="grid gap-6 md:grid-cols-[1fr_180px] md:items-center">
              <div>
                <p className="font-semibold text-base-content/45 text-sm">{l.trans(post.eyebrow)}</p>
                <h2 className="mt-2 text-2xl leading-tight tracking-tight group-hover:text-primary">
                  {l.trans(post.title)}
                </h2>
                <p className="mt-3 text-base-content/65 text-sm leading-7">{l.trans(post.desc)}</p>
                <p className="mt-4 text-base-content/40 text-xs">
                  {l.trans(post.meta)} · {l.trans(post.date)}
                </p>
              </div>
              <div className="hidden h-28 overflow-hidden rounded-sm bg-base-200 md:block">
                <img
                  src={post.image}
                  alt={l.trans(post.title)}
                  className={`size-full transition group-hover:scale-105 ${post.imageClassName}`}
                />
              </div>
            </article>
          </Link>
        ))}
      </section>
    </main>
  );
}
